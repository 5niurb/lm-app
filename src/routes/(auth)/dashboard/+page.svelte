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
		PhoneCall
	} from '@lucide/svelte';
	import { api } from '$lib/api/client.js';
	import { formatPhone, formatDuration, formatRelativeDate } from '$lib/utils/formatters.js';

	let stats = $state(null);
	let recentCalls = $state(null);
	let dailyStats = $state(null);
	let businessHours = $state(null);
	let messageStats = $state(null);
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

			// Try to get unread messages count
			try {
				const msgRes = await api('/api/messages/stats');
				messageStats = msgRes;
			} catch {
				messageStats = null;
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

	// Business hours helpers
	function isClinicOpen() {
		if (!businessHours) return null;
		const now = new Date();
		const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
		const dayKey = dayNames[now.getDay()];
		const hours = businessHours[dayKey];
		if (!hours) return false; // closed today

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

	// Chart helpers
	function chartMax() {
		if (!dailyStats || dailyStats.length === 0) return 1;
		return Math.max(1, ...dailyStats.map((d) => d.total));
	}

	function dayLabel(dateStr) {
		const d = new Date(dateStr + 'T12:00:00');
		return d.toLocaleDateString('en-US', { weekday: 'short' });
	}

	let clinicOpen = $derived(isClinicOpen());

	// Sparkline helpers
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

<div class="space-y-8">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl tracking-wide">Dashboard</h1>
			<p class="text-sm text-muted-foreground mt-1">
				Overview of your call activity — last 7 days.
			</p>
		</div>
		{#if businessHours}
			<div
				class="flex items-center gap-2 px-3 py-1.5 rounded-full border {clinicOpen
					? 'border-green-500/20 bg-green-500/5'
					: 'border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)]'}"
			>
				<div
					class="w-2 h-2 rounded-full {clinicOpen
						? 'bg-green-400 animate-pulse'
						: 'bg-[rgba(255,255,255,0.2)]'}"
				></div>
				<span class="text-xs {clinicOpen ? 'text-green-400' : 'text-[rgba(255,255,255,0.35)]'}">
					{clinicOpen ? 'Clinic Open' : 'Closed'}
					{#if clinicOpen === false}
						<span class="text-[rgba(255,255,255,0.2)]"> · Opens {getNextOpen()}</span>
					{/if}
				</span>
			</div>
		{/if}
	</div>

	{#if error}
		<div class="rounded border border-red-500/30 bg-red-500/5 px-4 py-3">
			<p class="text-sm text-red-400">{error}</p>
			<p class="text-xs text-red-400/60 mt-1">Make sure the API server is running on port 3001.</p>
		</div>
	{/if}

	<!-- Stat Cards -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<div
			class="group card-elevated rounded border p-5 transition-all duration-200 relative overflow-hidden"
		>
			<div class="flex items-center justify-between mb-3">
				<span class="text-xs uppercase tracking-[0.15em] text-[rgba(255,255,255,0.4)]"
					>Total Calls</span
				>
				<Phone
					class="h-4 w-4 text-[#C5A55A] opacity-50 group-hover:opacity-100 transition-opacity"
				/>
			</div>
			{#if stats}
				<div
					class="text-3xl font-light text-[rgba(255,255,255,0.9)]"
					style="font-family: 'Playfair Display', serif;"
				>
					{stats.totalCalls}
				</div>
				<!-- Sparkline: daily totals -->
				{#if dailyStats && dailyStats.length > 0}
					<svg
						class="w-full h-8 mt-2 opacity-40 group-hover:opacity-70 transition-opacity"
						viewBox="0 0 {dailyStats.length * 20} 30"
						preserveAspectRatio="none"
					>
						<defs
							><linearGradient id="spark-gold" x1="0" y1="0" x2="0" y2="1"
								><stop offset="0%" stop-color="#C5A55A" stop-opacity="0.3" /><stop
									offset="100%"
									stop-color="#C5A55A"
									stop-opacity="0"
								/></linearGradient
							></defs
						>
						<polyline
							fill="none"
							stroke="#C5A55A"
							stroke-width="1.5"
							stroke-linejoin="round"
							points={sparkPoints(dailyStats, 'total', sparkTotalMax)}
						/>
						<polygon
							fill="url(#spark-gold)"
							points={sparkFill(dailyStats, 'total', sparkTotalMax)}
						/>
					</svg>
				{/if}
			{:else}
				<Skeleton class="h-9 w-16" />
			{/if}
		</div>

		<div
			class="group card-elevated rounded border p-5 transition-all duration-200 relative overflow-hidden"
		>
			<div class="flex items-center justify-between mb-3">
				<span class="text-xs uppercase tracking-[0.15em] text-[rgba(255,255,255,0.4)]"
					>Missed Calls</span
				>
				<PhoneMissed
					class="h-4 w-4 text-red-400 opacity-50 group-hover:opacity-100 transition-opacity"
				/>
			</div>
			{#if stats}
				<div
					class="text-3xl font-light text-[rgba(255,255,255,0.9)]"
					style="font-family: 'Playfair Display', serif;"
				>
					{stats.missed}
				</div>
				<!-- Sparkline: daily missed -->
				{#if dailyStats && dailyStats.length > 0}
					<svg
						class="w-full h-8 mt-2 opacity-40 group-hover:opacity-70 transition-opacity"
						viewBox="0 0 {dailyStats.length * 20} 30"
						preserveAspectRatio="none"
					>
						<defs
							><linearGradient id="spark-red" x1="0" y1="0" x2="0" y2="1"
								><stop offset="0%" stop-color="#f87171" stop-opacity="0.3" /><stop
									offset="100%"
									stop-color="#f87171"
									stop-opacity="0"
								/></linearGradient
							></defs
						>
						<polyline
							fill="none"
							stroke="#f87171"
							stroke-width="1.5"
							stroke-linejoin="round"
							points={sparkPoints(dailyStats, 'missed', sparkMissedMax)}
						/>
						<polygon
							fill="url(#spark-red)"
							points={sparkFill(dailyStats, 'missed', sparkMissedMax)}
						/>
					</svg>
				{/if}
			{:else}
				<Skeleton class="h-9 w-16" />
			{/if}
		</div>

		<div
			class="group card-elevated rounded border p-5 transition-all duration-200 relative overflow-hidden"
		>
			<div class="flex items-center justify-between mb-3">
				<span class="text-xs uppercase tracking-[0.15em] text-[rgba(255,255,255,0.4)]"
					>Voicemails</span
				>
				<Voicemail
					class="h-4 w-4 text-[#C5A55A] opacity-50 group-hover:opacity-100 transition-opacity"
				/>
			</div>
			{#if stats}
				<div
					class="text-3xl font-light text-[rgba(255,255,255,0.9)]"
					style="font-family: 'Playfair Display', serif;"
				>
					{stats.unheardVoicemails}
				</div>
				<p class="text-[10px] uppercase tracking-[0.12em] text-[rgba(197,165,90,0.4)] mt-1">
					unheard
				</p>
			{:else}
				<Skeleton class="h-9 w-16" />
			{/if}
		</div>

		<div
			class="group card-elevated rounded border p-5 transition-all duration-200 relative overflow-hidden"
		>
			<div class="flex items-center justify-between mb-3">
				<span class="text-xs uppercase tracking-[0.15em] text-[rgba(255,255,255,0.4)]"
					>Avg Duration</span
				>
				<Clock
					class="h-4 w-4 text-[#C5A55A] opacity-50 group-hover:opacity-100 transition-opacity"
				/>
			</div>
			{#if stats}
				<div
					class="text-3xl font-light text-[rgba(255,255,255,0.9)]"
					style="font-family: 'Playfair Display', serif;"
				>
					{formatDuration(stats.avgDuration)}
				</div>
			{:else}
				<Skeleton class="h-9 w-16" />
			{/if}
		</div>
	</div>

	<!-- Call Volume Chart + Quick Links -->
	<div class="grid gap-4 lg:grid-cols-3">
		<!-- Daily call volume chart -->
		<div class="lg:col-span-2 rounded border border-[rgba(197,165,90,0.12)] overflow-hidden">
			<div class="px-5 py-4 border-b border-[rgba(197,165,90,0.08)]">
				<h2 class="text-base tracking-wide">Call Volume</h2>
				<p class="text-xs text-muted-foreground mt-0.5">Daily calls over the past week.</p>
			</div>
			<div class="p-5">
				{#if dailyStats && dailyStats.length > 0}
					<div class="flex items-end gap-2 h-48">
						{#each dailyStats as day}
							{@const max = chartMax()}
							{@const pct = Math.max(4, (day.total / max) * 100)}
							<div class="flex-1 flex flex-col items-center gap-1">
								<div class="w-full flex flex-col items-center relative group">
									<!-- Tooltip on hover -->
									<div
										class="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-[rgba(0,0,0,0.9)] border border-[rgba(197,165,90,0.2)] rounded px-2 py-1 text-xs whitespace-nowrap z-10"
									>
										{day.total} calls
										{#if day.answered > 0}<span class="text-green-400">
												· {day.answered} ans</span
											>{/if}
										{#if day.missed > 0}<span class="text-red-400"> · {day.missed} miss</span>{/if}
									</div>
									<!-- Stacked bar -->
									<div
										class="w-full max-w-10 rounded-t transition-all duration-500 relative overflow-hidden"
										style="height: {pct}%; min-height: 4px;"
									>
										{#if day.total === 0}
											<div class="absolute inset-0 bg-[rgba(255,255,255,0.03)] rounded-t"></div>
										{:else}
											{@const answeredPct = (day.answered / day.total) * 100}
											{@const missedPct = (day.missed / day.total) * 100}
											<div class="absolute inset-0 flex flex-col-reverse">
												<div class="bg-[#c5a55a]" style="height: {answeredPct}%;"></div>
												<div class="bg-red-400/70" style="height: {missedPct}%;"></div>
												<div
													class="bg-[rgba(197,165,90,0.3)]"
													style="height: {100 - answeredPct - missedPct}%;"
												></div>
											</div>
										{/if}
									</div>
								</div>
								<span class="text-[10px] text-[rgba(255,255,255,0.3)] mt-1"
									>{dayLabel(day.date)}</span
								>
							</div>
						{/each}
					</div>
					<!-- Legend -->
					<div class="flex gap-4 mt-4 justify-center">
						<div class="flex items-center gap-1.5">
							<div class="w-2.5 h-2.5 rounded-sm bg-[#c5a55a]"></div>
							<span class="text-[10px] text-[rgba(255,255,255,0.35)]">Answered</span>
						</div>
						<div class="flex items-center gap-1.5">
							<div class="w-2.5 h-2.5 rounded-sm bg-red-400/70"></div>
							<span class="text-[10px] text-[rgba(255,255,255,0.35)]">Missed</span>
						</div>
						<div class="flex items-center gap-1.5">
							<div class="w-2.5 h-2.5 rounded-sm bg-[rgba(197,165,90,0.3)]"></div>
							<span class="text-[10px] text-[rgba(255,255,255,0.35)]">Voicemail</span>
						</div>
					</div>
				{:else}
					<div class="flex h-48 items-center justify-center">
						<div class="text-center">
							<div
								class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[rgba(197,165,90,0.05)] border border-[rgba(197,165,90,0.08)]"
							>
								<Phone class="h-5 w-5 empty-state-icon" />
							</div>
							<p class="text-sm text-[rgba(255,255,255,0.3)]">No call data yet</p>
							<p class="text-xs text-[rgba(255,255,255,0.15)] mt-1">
								Charts will populate once calls are logged.
							</p>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Quick Links panel -->
		<div class="rounded border border-[rgba(197,165,90,0.12)] overflow-hidden">
			<div class="px-5 py-4 border-b border-[rgba(197,165,90,0.08)]">
				<h2 class="text-base tracking-wide">Quick Access</h2>
			</div>
			<div class="p-3 space-y-1">
				<a
					href="/calls?filter=voicemail"
					class="flex items-center justify-between px-3 py-3 rounded transition-colors hover:bg-[rgba(197,165,90,0.04)] group"
				>
					<div class="flex items-center gap-3">
						<Voicemail
							class="h-4 w-4 text-[rgba(255,255,255,0.3)] group-hover:text-[#c5a55a] transition-colors"
						/>
						<span
							class="text-sm text-[rgba(255,255,255,0.6)] group-hover:text-white transition-colors"
							>Voicemails</span
						>
					</div>
					<div class="flex items-center gap-2">
						{#if stats?.unheardVoicemails > 0}
							<span
								class="px-1.5 py-0.5 rounded-full text-[10px] bg-[#c5a55a] text-black font-medium"
								>{stats.unheardVoicemails}</span
							>
						{/if}
						<ArrowRight
							class="h-3.5 w-3.5 text-[rgba(255,255,255,0.15)] group-hover:text-[rgba(255,255,255,0.4)] transition-colors"
						/>
					</div>
				</a>

				<a
					href="/messages"
					class="flex items-center justify-between px-3 py-3 rounded transition-colors hover:bg-[rgba(197,165,90,0.04)] group"
				>
					<div class="flex items-center gap-3">
						<MessageSquare
							class="h-4 w-4 text-[rgba(255,255,255,0.3)] group-hover:text-[#c5a55a] transition-colors"
						/>
						<span
							class="text-sm text-[rgba(255,255,255,0.6)] group-hover:text-white transition-colors"
							>Messages</span
						>
					</div>
					<div class="flex items-center gap-2">
						{#if messageStats?.unread > 0}
							<span
								class="px-1.5 py-0.5 rounded-full text-[10px] bg-[#c5a55a] text-black font-medium"
								>{messageStats.unread}</span
							>
						{/if}
						<ArrowRight
							class="h-3.5 w-3.5 text-[rgba(255,255,255,0.15)] group-hover:text-[rgba(255,255,255,0.4)] transition-colors"
						/>
					</div>
				</a>

				<a
					href="/calls"
					class="flex items-center justify-between px-3 py-3 rounded transition-colors hover:bg-[rgba(197,165,90,0.04)] group"
				>
					<div class="flex items-center gap-3">
						<Phone
							class="h-4 w-4 text-[rgba(255,255,255,0.3)] group-hover:text-[#c5a55a] transition-colors"
						/>
						<span
							class="text-sm text-[rgba(255,255,255,0.6)] group-hover:text-white transition-colors"
							>Call Log</span
						>
					</div>
					<ArrowRight
						class="h-3.5 w-3.5 text-[rgba(255,255,255,0.15)] group-hover:text-[rgba(255,255,255,0.4)] transition-colors"
					/>
				</a>

				<a
					href="/softphone"
					class="flex items-center justify-between px-3 py-3 rounded transition-colors hover:bg-[rgba(197,165,90,0.04)] group"
				>
					<div class="flex items-center gap-3">
						<PhoneOutgoing
							class="h-4 w-4 text-[rgba(255,255,255,0.3)] group-hover:text-[#c5a55a] transition-colors"
						/>
						<span
							class="text-sm text-[rgba(255,255,255,0.6)] group-hover:text-white transition-colors"
							>Softphone</span
						>
					</div>
					<ArrowRight
						class="h-3.5 w-3.5 text-[rgba(255,255,255,0.15)] group-hover:text-[rgba(255,255,255,0.4)] transition-colors"
					/>
				</a>

				<a
					href="/settings"
					class="flex items-center justify-between px-3 py-3 rounded transition-colors hover:bg-[rgba(197,165,90,0.04)] group"
				>
					<div class="flex items-center gap-3">
						<svg
							class="h-4 w-4 text-[rgba(255,255,255,0.3)] group-hover:text-[#c5a55a] transition-colors"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							><path
								d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
							/><circle cx="12" cy="12" r="3" /></svg
						>
						<span
							class="text-sm text-[rgba(255,255,255,0.6)] group-hover:text-white transition-colors"
							>Settings</span
						>
					</div>
					<ArrowRight
						class="h-3.5 w-3.5 text-[rgba(255,255,255,0.15)] group-hover:text-[rgba(255,255,255,0.4)] transition-colors"
					/>
				</a>
			</div>
		</div>
	</div>

	<!-- Recent Calls -->
	<div class="rounded border border-[rgba(197,165,90,0.12)] overflow-hidden">
		<div
			class="px-5 py-4 border-b border-[rgba(197,165,90,0.08)] flex items-center justify-between"
		>
			<div>
				<h2 class="text-base tracking-wide">Recent Calls</h2>
				<p class="text-xs text-muted-foreground mt-0.5">Latest call activity.</p>
			</div>
			<a href="/calls" class="text-xs text-[#c5a55a] hover:text-[#d4af37] transition-colors"
				>View all →</a
			>
		</div>
		<div class="p-5">
			{#if recentCalls === null}
				<div class="space-y-3">
					{#each Array(5) as _}
						<Skeleton class="h-12 w-full" />
					{/each}
				</div>
			{:else if recentCalls.length === 0}
				<div class="flex h-40 items-center justify-center">
					<div class="text-center">
						<div
							class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(197,165,90,0.05)] border border-[rgba(197,165,90,0.08)]"
						>
							<Phone class="h-6 w-6 empty-state-icon" />
						</div>
						<p
							class="text-sm font-light text-[rgba(255,255,255,0.35)]"
							style="font-family: 'Playfair Display', serif;"
						>
							No calls yet
						</p>
						<p class="text-xs text-[rgba(255,255,255,0.2)] mt-1">
							Call data will appear once Twilio is connected.
						</p>
					</div>
				</div>
			{:else}
				<div class="space-y-0.5">
					{#each recentCalls as call}
						{@const summary = getActionSummary(call)}
						{@const callPhone = call.direction === 'inbound' ? call.from_number : call.to_number}
						<div
							class="group flex items-start gap-3 rounded-md px-3 py-2.5 transition-all duration-200 hover:bg-[rgba(197,165,90,0.04)] border border-transparent hover:border-[rgba(197,165,90,0.1)]"
						>
							<div class="mt-0.5 shrink-0">
								{#if call.disposition === 'missed' || call.disposition === 'abandoned'}
									<PhoneMissed class="h-4 w-4 text-red-400/70" />
								{:else if call.direction === 'inbound'}
									<PhoneIncoming
										class="h-4 w-4 text-blue-400/70 group-hover:text-blue-400 transition-colors"
									/>
								{:else}
									<PhoneOutgoing
										class="h-4 w-4 text-emerald-400/70 group-hover:text-emerald-400 transition-colors"
									/>
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<div class="flex items-center justify-between gap-2">
									<div class="flex items-center gap-1.5 min-w-0">
										<p class="text-sm font-medium truncate flex items-center gap-1.5">
											{#if call.contact_id && call.caller_name}
												<span class="text-[#C5A55A] text-[10px] shrink-0" title="Contact"
													>&#9670;</span
												>
												<span class="text-[rgba(255,255,255,0.9)]">{call.caller_name}</span>
											{:else if call.caller_name}
												<span class="text-[rgba(255,255,255,0.7)]">{call.caller_name}</span>
											{:else}
												<span class="text-[rgba(255,255,255,0.85)]">{formatPhone(callPhone)}</span>
											{/if}
										</p>
										<!-- Quick actions — right next to name -->
										{#if callPhone}
											<div
												class="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
											>
												<a
													href="/softphone?call={encodeURIComponent(callPhone)}"
													class="inline-flex items-center justify-center h-7 w-7 rounded-md border border-emerald-500/30 text-emerald-400/50 hover:bg-emerald-500/15 hover:text-emerald-400 hover:border-emerald-400 transition-all"
													title="Call back"
												>
													<PhoneOutgoing class="h-3.5 w-3.5" />
												</a>
												<a
													href="/messages?phone={encodeURIComponent(callPhone)}{call.caller_name
														? '&name=' + encodeURIComponent(call.caller_name)
														: ''}&new=true"
													class="inline-flex items-center justify-center h-7 w-7 rounded-md border border-blue-500/30 text-blue-400/50 hover:bg-blue-500/15 hover:text-blue-400 hover:border-blue-400 transition-all"
													title="Send message"
												>
													<MessageSquare class="h-3.5 w-3.5" />
												</a>
											</div>
										{/if}
									</div>
									<span class="text-xs text-[rgba(255,255,255,0.3)] shrink-0"
										>{formatRelativeDate(call.started_at)}</span
									>
								</div>
								<div class="mt-0.5">
									{#if summary.type === 'voicemail'}
										<span
											class="text-xs text-[rgba(255,255,255,0.4)] italic flex items-center gap-1.5"
										>
											<Voicemail class="h-3 w-3 shrink-0 text-[#C5A55A]/60" />{summary.text}
										</span>
									{:else if summary.type === 'answered'}
										<span class="text-xs text-emerald-400/60">{summary.text}</span>
									{:else if summary.type === 'missed'}
										<span class="text-xs text-red-400/70">{summary.text}</span>
									{:else if summary.type === 'abandoned'}
										<span class="text-xs text-[rgba(255,255,255,0.3)]">{summary.text}</span>
									{:else}
										<span class="text-xs text-[rgba(255,255,255,0.3)]">{summary.text}</span>
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
