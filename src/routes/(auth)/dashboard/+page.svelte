<script>
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import {
		Phone,
		PhoneMissed,
		Voicemail,
		Clock,
		PhoneIncoming,
		PhoneOutgoing,
		MessageSquare,
		ArrowRight,
		CalendarDays,
		TrendingUp,
		TrendingDown
	} from '@lucide/svelte';
	import { api } from '$lib/api/client.js';
	import { resolve } from '$app/paths';
	import { formatPhone, formatDuration, formatRelativeDate } from '$lib/utils/formatters.js';

	let stats = $state(null);
	let recentCalls = $state(null);
	let dailyStats = $state(null);
	let businessHours = $state(null);
	let messageStats = $state(null);
	let upcomingAppointments = $state(null);
	let appointmentCount = $state(0);
	let error = $state('');

	$effect(() => {
		loadDashboard();
	});

	async function loadDashboard() {
		try {
			const [statsRes, callsRes, dailyRes, settingsRes] = await Promise.all([
				api('/api/calls/stats?days=7'),
				api('/api/calls?pageSize=10'),
				api('/api/calls/stats/daily?days=7').catch(() => ({ data: [] })),
				api('/api/settings').catch(() => ({ data: {} }))
			]);
			stats = statsRes;
			recentCalls = callsRes.data;
			dailyStats = dailyRes.data || [];
			businessHours = settingsRes.data?.business_hours || {};

			try {
				const msgRes = await api('/api/messages/stats');
				messageStats = msgRes;
			} catch {
				messageStats = null;
			}

			try {
				const apptRes = await api('/api/appointments/today');
				const now = new Date();
				appointmentCount = apptRes.count || 0;
				upcomingAppointments = (apptRes.data || [])
					.filter((a) => new Date(a.start) > now)
					.slice(0, 5);
			} catch {
				upcomingAppointments = null;
			}
		} catch (e) {
			error = e.message;
			console.error('Dashboard load failed:', e);
		}
	}

	function getActionSummary(call) {
		const vm = call.voicemails?.[0];
		if (call.disposition === 'voicemail' && vm?.transcription) {
			const preview =
				vm.transcription.length > 60
					? vm.transcription.slice(0, 60).trim() + '...'
					: vm.transcription;
			return { text: preview, type: 'voicemail' };
		}
		if (call.disposition === 'voicemail') return { text: 'Voicemail left', type: 'voicemail' };
		if (call.disposition === 'answered') {
			return {
				text: call.duration > 0 ? `Answered \u00b7 ${formatDuration(call.duration)}` : 'Answered',
				type: 'answered'
			};
		}
		if (call.disposition === 'missed') return { text: 'Missed call', type: 'missed' };
		if (call.disposition === 'abandoned') return { text: 'Caller hung up', type: 'abandoned' };
		if (call.status === 'busy') return { text: 'Line busy', type: 'missed' };
		if (call.status === 'no-answer') return { text: 'No answer', type: 'missed' };
		if (call.status === 'failed') return { text: 'Call failed', type: 'failed' };
		return { text: call.status || '', type: 'default' };
	}

	function isClinicOpen() {
		if (!businessHours) return null;
		const now = new Date();
		const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
		const dayKey = dayNames[now.getDay()];
		const hours = businessHours[dayKey];
		if (!hours) return false;

		const nowMinutes = now.getHours() * 60 + now.getMinutes();
		const [openH, openM] = hours.open.split(':').map(Number);
		const [closeH, closeM] = hours.close.split(':').map(Number);
		const openMin = openH * 60 + openM;
		const closeMin = closeH * 60 + closeM;

		return nowMinutes >= openMin && nowMinutes < closeMin;
	}

	function getNextOpen() {
		if (!businessHours) return '';
		const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
		const now = new Date();

		for (let i = 1; i <= 7; i++) {
			const futureDay = new Date(now);
			futureDay.setDate(now.getDate() + i);
			const dayKey = dayNames[futureDay.getDay()];
			const hours = businessHours[dayKey];
			if (hours) {
				const dayLabel =
					i === 1
						? 'Tomorrow'
						: dayNames[futureDay.getDay()].charAt(0).toUpperCase() +
							dayNames[futureDay.getDay()].slice(1);
				return `${dayLabel} at ${hours.open}`;
			}
		}
		return '';
	}

	function chartMax() {
		if (!dailyStats || dailyStats.length === 0) return 1;
		return Math.max(1, ...dailyStats.map((d) => d.total));
	}

	function dayLabel(dateStr) {
		const d = new Date(dateStr + 'T12:00:00');
		return d.toLocaleDateString('en-US', { weekday: 'short' });
	}

	let clinicOpen = $derived(isClinicOpen());

	let sparkTotalMax = $derived(
		dailyStats && dailyStats.length > 0 ? Math.max(1, ...dailyStats.map((d) => d.total)) : 1
	);
	let sparkMissedMax = $derived(
		dailyStats && dailyStats.length > 0 ? Math.max(1, ...dailyStats.map((d) => d.missed)) : 1
	);
	function sparkPoints(data, key, max) {
		return data.map((d, i) => `${i * 20 + 10},${30 - (d[key] / max) * 26}`).join(' ');
	}
	function sparkFill(data, key, max) {
		const line = data.map((d, i) => `${i * 20 + 10},${30 - (d[key] / max) * 26}`).join(' ');
		return `${line} ${(data.length - 1) * 20 + 10},30 10,30`;
	}
</script>

<div class="space-y-6">
	<!-- Page Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl">Dashboard</h1>
			<p class="text-sm text-text-secondary mt-0.5">Your clinic at a glance — last 7 days</p>
		</div>
		{#if businessHours}
			<div
				class="flex items-center gap-2 px-3 py-1.5 rounded-full border {clinicOpen
					? 'border-vivid-emerald/20 bg-vivid-emerald/5'
					: 'border-border bg-surface-subtle'}"
			>
				<div
					class="w-2 h-2 rounded-full {clinicOpen
						? 'bg-vivid-emerald animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.4)]'
						: 'bg-text-ghost'}"
				></div>
				<span class="text-xs {clinicOpen ? 'text-vivid-emerald' : 'text-text-tertiary'}">
					{clinicOpen ? 'Clinic Open' : 'Closed'}
					{#if clinicOpen === false}
						<span class="text-text-ghost"> · Opens {getNextOpen()}</span>
					{/if}
				</span>
			</div>
		{/if}
	</div>

	{#if error}
		<div class="rounded-lg border border-vivid-rose/20 bg-vivid-rose/5 px-4 py-3">
			<p class="text-sm text-vivid-rose">{error}</p>
			<p class="text-xs text-vivid-rose/60 mt-1">
				Make sure the API server is running on port 3001.
			</p>
		</div>
	{/if}

	<!-- Stat Cards — each with unique color -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<!-- Total Calls -->
		<div class="group card-gradient p-5">
			<div class="flex items-center justify-between mb-3">
				<span class="text-xs font-medium text-text-tertiary">Total Calls</span>
				<div class="icon-box grad-blue">
					<Phone class="h-3.5 w-3.5 text-white" />
				</div>
			</div>
			{#if stats}
				<div class="text-3xl font-bold text-text-primary">{stats.totalCalls}</div>
				{#if dailyStats && dailyStats.length > 0}
					<svg
						class="w-full h-8 mt-2 opacity-50 group-hover:opacity-80 transition-opacity"
						viewBox="0 0 {dailyStats.length * 20} 30"
						preserveAspectRatio="none"
					>
						<defs>
							<linearGradient id="spark-blue-total" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stop-color="#60a5fa" stop-opacity="0.3" />
								<stop offset="100%" stop-color="#60a5fa" stop-opacity="0" />
							</linearGradient>
						</defs>
						<polyline
							fill="none"
							stroke="#60a5fa"
							stroke-width="1.5"
							stroke-linejoin="round"
							points={sparkPoints(dailyStats, 'total', sparkTotalMax)}
						/>
						<polygon
							fill="url(#spark-blue-total)"
							points={sparkFill(dailyStats, 'total', sparkTotalMax)}
						/>
					</svg>
				{/if}
			{:else}
				<Skeleton class="h-9 w-16" />
			{/if}
		</div>

		<!-- Missed Calls -->
		<div class="group card-gradient p-5">
			<div class="flex items-center justify-between mb-3">
				<span class="text-xs font-medium text-text-tertiary">Missed Calls</span>
				<div class="icon-box grad-rose">
					<PhoneMissed class="h-3.5 w-3.5 text-white" />
				</div>
			</div>
			{#if stats}
				<div class="text-3xl font-bold text-text-primary">{stats.missed}</div>
				{#if dailyStats && dailyStats.length > 0}
					<svg
						class="w-full h-8 mt-2 opacity-50 group-hover:opacity-80 transition-opacity"
						viewBox="0 0 {dailyStats.length * 20} 30"
						preserveAspectRatio="none"
					>
						<defs>
							<linearGradient id="spark-rose-missed" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stop-color="#fb7185" stop-opacity="0.3" />
								<stop offset="100%" stop-color="#fb7185" stop-opacity="0" />
							</linearGradient>
						</defs>
						<polyline
							fill="none"
							stroke="#fb7185"
							stroke-width="1.5"
							stroke-linejoin="round"
							points={sparkPoints(dailyStats, 'missed', sparkMissedMax)}
						/>
						<polygon
							fill="url(#spark-rose-missed)"
							points={sparkFill(dailyStats, 'missed', sparkMissedMax)}
						/>
					</svg>
				{/if}
			{:else}
				<Skeleton class="h-9 w-16" />
			{/if}
		</div>

		<!-- Voicemails -->
		<div class="group card-gradient p-5">
			<div class="flex items-center justify-between mb-3">
				<span class="text-xs font-medium text-text-tertiary">Voicemails</span>
				<div class="icon-box grad-violet">
					<Voicemail class="h-3.5 w-3.5 text-white" />
				</div>
			</div>
			{#if stats}
				<div class="text-3xl font-bold text-text-primary">{stats.unheardVoicemails}</div>
				<p class="text-xs text-gold mt-1 font-medium">unheard</p>
			{:else}
				<Skeleton class="h-9 w-16" />
			{/if}
		</div>

		<!-- Avg Duration -->
		<div class="group card-gradient p-5">
			<div class="flex items-center justify-between mb-3">
				<span class="text-xs font-medium text-text-tertiary">Avg Duration</span>
				<div class="icon-box grad-amber">
					<Clock class="h-3.5 w-3.5 text-white" />
				</div>
			</div>
			{#if stats}
				<div class="text-3xl font-bold text-text-primary">{formatDuration(stats.avgDuration)}</div>
			{:else}
				<Skeleton class="h-9 w-16" />
			{/if}
		</div>
	</div>

	<!-- Call Volume Chart + Quick Links -->
	<div class="grid gap-4 lg:grid-cols-3">
		<!-- Daily call volume chart -->
		<div class="lg:col-span-2 rounded-lg border border-border-subtle overflow-hidden bg-card">
			<div class="px-5 py-4 border-b border-border-subtle">
				<h2 class="text-base">Call Volume</h2>
				<p class="text-xs text-text-secondary mt-0.5">Daily calls over the past week</p>
			</div>
			<div class="p-5">
				{#if dailyStats && dailyStats.length > 0}
					<div class="flex items-end gap-2 h-48">
						{#each dailyStats as day (day.date)}
							{@const max = chartMax()}
							{@const pct = Math.max(4, (day.total / max) * 100)}
							<div class="flex-1 flex flex-col items-center gap-1">
								<div class="w-full flex flex-col items-center relative group">
									<!-- Tooltip on hover -->
									<div
										class="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-popover border border-border rounded-md px-2 py-1 text-xs whitespace-nowrap z-10"
									>
										{day.total} calls
										{#if day.answered > 0}<span class="text-vivid-emerald">
												· {day.answered} ans</span
											>{/if}
										{#if day.missed > 0}<span class="text-vivid-rose">
												· {day.missed} miss</span
											>{/if}
									</div>
									<!-- Stacked bar with gradient -->
									<div
										class="w-full max-w-10 rounded-t-md transition-all duration-500 relative overflow-hidden"
										style="height: {pct}%; min-height: 4px;"
									>
										{#if day.total === 0}
											<div class="absolute inset-0 bg-surface-subtle rounded-t-md"></div>
										{:else}
											{@const answeredPct = (day.answered / day.total) * 100}
											{@const missedPct = (day.missed / day.total) * 100}
											<div class="absolute inset-0 flex flex-col-reverse">
												<div
													style="height: {answeredPct}%; background: linear-gradient(180deg, #60a5fa, #818cf8);"
												></div>
												<div class="bg-vivid-rose/70" style="height: {missedPct}%;"></div>
												<div
													style="height: {100 -
														answeredPct -
														missedPct}%; background: rgba(129,140,248,0.3);"
												></div>
											</div>
										{/if}
									</div>
								</div>
								<span class="text-[10px] text-text-tertiary mt-1">{dayLabel(day.date)}</span>
							</div>
						{/each}
					</div>
					<!-- Legend -->
					<div class="flex gap-4 mt-4 justify-center">
						<div class="flex items-center gap-1.5">
							<div
								class="w-2.5 h-2.5 rounded-sm"
								style="background: linear-gradient(135deg, #60a5fa, #818cf8);"
							></div>
							<span class="text-[10px] text-text-tertiary">Answered</span>
						</div>
						<div class="flex items-center gap-1.5">
							<div class="w-2.5 h-2.5 rounded-sm bg-vivid-rose/70"></div>
							<span class="text-[10px] text-text-tertiary">Missed</span>
						</div>
						<div class="flex items-center gap-1.5">
							<div class="w-2.5 h-2.5 rounded-sm" style="background: rgba(129,140,248,0.3);"></div>
							<span class="text-[10px] text-text-tertiary">Voicemail</span>
						</div>
					</div>
				{:else}
					<div class="flex h-48 items-center justify-center">
						<div class="text-center">
							<div class="mx-auto mb-3 icon-box-xl grad-blue">
								<Phone class="h-5 w-5 text-white" />
							</div>
							<p class="text-sm text-text-tertiary">No call data yet</p>
							<p class="text-xs text-text-ghost mt-1">
								Charts will populate once calls are logged.
							</p>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Quick Links panel -->
		<div class="rounded-lg border border-border-subtle overflow-hidden bg-card">
			<div class="px-5 py-4 border-b border-border-subtle">
				<h2 class="text-base">Quick Access</h2>
			</div>
			<div class="p-2 space-y-0.5">
				<a
					href={resolve('/calls?filter=voicemail')}
					class="flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors hover:bg-surface-hover group"
				>
					<div class="flex items-center gap-3">
						<span class="icon-box grad-violet">
							<Voicemail class="h-3.5 w-3.5 text-white" />
						</span>
						<span class="text-sm text-text-secondary group-hover:text-foreground transition-colors"
							>Voicemails</span
						>
					</div>
					<div class="flex items-center gap-2">
						{#if stats?.unheardVoicemails > 0}
							<span class="px-2 py-0.5 rounded-full text-[10px] font-bold glow-violet"
								>{stats.unheardVoicemails}</span
							>
						{/if}
						<ArrowRight
							class="h-3.5 w-3.5 text-text-ghost group-hover:text-text-tertiary transition-colors"
						/>
					</div>
				</a>

				<a
					href={resolve('/messages')}
					class="flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors hover:bg-surface-hover group"
				>
					<div class="flex items-center gap-3">
						<span class="icon-box grad-emerald">
							<MessageSquare class="h-3.5 w-3.5 text-white" />
						</span>
						<span class="text-sm text-text-secondary group-hover:text-foreground transition-colors"
							>Messages</span
						>
					</div>
					<div class="flex items-center gap-2">
						{#if messageStats?.unread > 0}
							<span class="px-2 py-0.5 rounded-full text-[10px] font-bold glow-emerald"
								>{messageStats.unread}</span
							>
						{/if}
						<ArrowRight
							class="h-3.5 w-3.5 text-text-ghost group-hover:text-text-tertiary transition-colors"
						/>
					</div>
				</a>

				<a
					href={resolve('/calls')}
					class="flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors hover:bg-surface-hover group"
				>
					<div class="flex items-center gap-3">
						<span class="icon-box grad-blue">
							<Phone class="h-3.5 w-3.5 text-white" />
						</span>
						<span class="text-sm text-text-secondary group-hover:text-foreground transition-colors"
							>Call Log</span
						>
					</div>
					<ArrowRight
						class="h-3.5 w-3.5 text-text-ghost group-hover:text-text-tertiary transition-colors"
					/>
				</a>

				<a
					href={resolve('/softphone')}
					class="flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors hover:bg-surface-hover group"
				>
					<div class="flex items-center gap-3">
						<span class="icon-box grad-cyan">
							<PhoneOutgoing class="h-3.5 w-3.5 text-white" />
						</span>
						<span class="text-sm text-text-secondary group-hover:text-foreground transition-colors"
							>Softphone</span
						>
					</div>
					<ArrowRight
						class="h-3.5 w-3.5 text-text-ghost group-hover:text-text-tertiary transition-colors"
					/>
				</a>

				<a
					href={resolve('/settings')}
					class="flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors hover:bg-surface-hover group"
				>
					<div class="flex items-center gap-3">
						<span class="icon-box grad-slate">
							<svg
								class="h-3.5 w-3.5 text-white"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								><path
									d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
								/><circle cx="12" cy="12" r="3" /></svg
							>
						</span>
						<span class="text-sm text-text-secondary group-hover:text-foreground transition-colors"
							>Settings</span
						>
					</div>
					<ArrowRight
						class="h-3.5 w-3.5 text-text-ghost group-hover:text-text-tertiary transition-colors"
					/>
				</a>
			</div>
		</div>
	</div>

	<!-- Today's Schedule -->
	{#if upcomingAppointments !== null}
		<div class="rounded-lg border border-border-subtle overflow-hidden bg-card">
			<div class="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
				<div>
					<h2 class="text-base">Today's Schedule</h2>
					<p class="text-xs text-text-secondary mt-0.5">
						{appointmentCount} appointment{appointmentCount !== 1 ? 's' : ''} today
					</p>
				</div>
				<a
					href={resolve('/appointments')}
					class="text-xs text-gold hover:text-gold/80 transition-colors flex items-center gap-1 font-medium"
				>
					View all <ArrowRight class="h-3 w-3" />
				</a>
			</div>
			<div class="divide-y divide-border-subtle">
				{#if upcomingAppointments.length > 0}
					{#each upcomingAppointments as appt (appt.id)}
						<div class="px-5 py-3 flex items-center gap-4">
							<div class="text-right min-w-[50px]">
								<span class="text-sm text-gold font-semibold">
									{new Date(appt.start).toLocaleTimeString('en-US', {
										hour: 'numeric',
										minute: '2-digit',
										hour12: true
									})}
								</span>
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-sm text-text-primary truncate">
									{appt.patient_name || appt.title}
								</p>
								{#if appt.service}
									<p class="text-xs text-text-tertiary truncate">{appt.service}</p>
								{/if}
							</div>
						</div>
					{/each}
				{:else}
					<div class="px-5 py-6 text-center">
						<div class="mx-auto mb-3 icon-box-lg grad-amber">
							<CalendarDays class="h-4 w-4 text-white" />
						</div>
						<p class="text-sm text-text-tertiary">No more appointments today</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Recent Calls -->
	<div class="rounded-lg border border-border-subtle overflow-hidden bg-card">
		<div class="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
			<div>
				<h2 class="text-base">Recent Calls</h2>
				<p class="text-xs text-text-secondary mt-0.5">Latest call activity</p>
			</div>
			<a
				href={resolve('/calls')}
				class="text-xs text-gold hover:text-gold/80 transition-colors font-medium">View all →</a
			>
		</div>
		<div class="p-5">
			{#if recentCalls === null}
				<div class="space-y-3">
					{#each Array(5) as _, i (i)}
						<Skeleton class="h-12 w-full" />
					{/each}
				</div>
			{:else if recentCalls.length === 0}
				<div class="flex h-40 items-center justify-center">
					<div class="text-center">
						<div class="mx-auto mb-4 icon-box-xl grad-blue">
							<Phone class="h-6 w-6 text-white" />
						</div>
						<p class="text-sm text-text-tertiary">No calls yet</p>
						<p class="text-xs text-text-ghost mt-1">
							Call data will appear once Twilio is connected.
						</p>
					</div>
				</div>
			{:else}
				<div>
					{#each recentCalls as call, i (call.id)}
						{@const summary = getActionSummary(call)}
						{@const callPhone = call.direction === 'inbound' ? call.from_number : call.to_number}
						<div
							class="group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 hover:bg-surface-hover border border-transparent hover:border-border-subtle {i >
							0
								? 'border-t border-t-border-subtle'
								: ''}"
						>
							<div class="mt-0.5 shrink-0">
								{#if call.disposition === 'missed' || call.disposition === 'abandoned'}
									<PhoneMissed class="h-4 w-4 text-vivid-rose" />
								{:else if call.direction === 'inbound'}
									<PhoneIncoming
										class="h-4 w-4 text-vivid-blue group-hover:text-vivid-blue transition-colors"
									/>
								{:else}
									<PhoneOutgoing
										class="h-4 w-4 text-vivid-emerald group-hover:text-vivid-emerald transition-colors"
									/>
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<div class="flex items-center justify-between gap-2">
									<div class="flex items-center gap-1.5 min-w-0">
										<p class="text-sm font-medium truncate flex items-center gap-1.5">
											{#if call.contact_id && call.caller_name}
												<span class="text-gold text-[10px] shrink-0" title="Contact">&#9670;</span>
												<span class="text-text-primary">{call.caller_name}</span>
											{:else if call.caller_name}
												<span class="text-text-secondary">{call.caller_name}</span>
											{:else}
												<span class="text-text-primary">{formatPhone(callPhone)}</span>
											{/if}
										</p>
										{#if callPhone}
											<div
												class="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
											>
												<a
													href={resolve(`/softphone?call=${encodeURIComponent(callPhone)}`)}
													class="inline-flex items-center justify-center h-7 w-7 rounded-md border border-vivid-emerald/30 text-vivid-emerald/50 hover:bg-vivid-emerald/10 hover:text-vivid-emerald hover:border-vivid-emerald transition-all"
													title="Call back"
												>
													<PhoneOutgoing class="h-3.5 w-3.5" />
												</a>
												<a
													href={resolve(
														`/messages?phone=${encodeURIComponent(callPhone)}${call.caller_name ? '&name=' + encodeURIComponent(call.caller_name) : ''}&new=true`
													)}
													class="inline-flex items-center justify-center h-7 w-7 rounded-md border border-vivid-blue/30 text-vivid-blue/50 hover:bg-vivid-blue/10 hover:text-vivid-blue hover:border-vivid-blue transition-all"
													title="Send message"
												>
													<MessageSquare class="h-3.5 w-3.5" />
												</a>
											</div>
										{/if}
									</div>
									<span class="text-xs text-text-tertiary shrink-0"
										>{formatRelativeDate(call.started_at)}</span
									>
								</div>
								<div class="mt-0.5">
									{#if summary.type === 'voicemail'}
										<span class="text-xs text-text-tertiary italic flex items-center gap-1.5">
											<Voicemail class="h-3 w-3 shrink-0 text-gold" />{summary.text}
										</span>
									{:else if summary.type === 'answered'}
										<span class="text-xs text-vivid-emerald/70">{summary.text}</span>
									{:else if summary.type === 'missed'}
										<span class="text-xs text-vivid-rose/70">{summary.text}</span>
									{:else if summary.type === 'abandoned'}
										<span class="text-xs text-text-tertiary">{summary.text}</span>
									{:else}
										<span class="text-xs text-text-tertiary">{summary.text}</span>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
