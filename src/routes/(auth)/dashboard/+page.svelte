<script>
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import { Phone, PhoneMissed, Voicemail, Clock, PhoneIncoming, PhoneOutgoing, MessageSquare, ArrowRight } from '@lucide/svelte';
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
			} catch { messageStats = null; }
		} catch (e) {
			error = e.message;
			console.error('Dashboard load failed:', e);
		}
	}

	function dispositionColor(disposition) {
		switch (disposition) {
			case 'answered': return 'default';
			case 'missed': return 'destructive';
			case 'voicemail': return 'secondary';
			default: return 'outline';
		}
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
				const dayLabel = i === 1 ? 'Tomorrow' : dayNames[futureDay.getDay()].charAt(0).toUpperCase() + dayNames[futureDay.getDay()].slice(1);
				return `${dayLabel} at ${hours.open}`;
			}
		}
		return '';
	}

	// Chart helpers
	function chartMax() {
		if (!dailyStats || dailyStats.length === 0) return 1;
		return Math.max(1, ...dailyStats.map(d => d.total));
	}

	function dayLabel(dateStr) {
		const d = new Date(dateStr + 'T12:00:00');
		return d.toLocaleDateString('en-US', { weekday: 'short' });
	}

	let clinicOpen = $derived(isClinicOpen());
</script>

<div class="space-y-8">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl tracking-wide">Dashboard</h1>
			<p class="text-sm text-muted-foreground mt-1">Overview of your call activity — last 7 days.</p>
		</div>
		{#if businessHours}
			<div class="flex items-center gap-2 px-3 py-1.5 rounded-full border {clinicOpen ? 'border-green-500/20 bg-green-500/5' : 'border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)]'}">
				<div class="w-2 h-2 rounded-full {clinicOpen ? 'bg-green-400 animate-pulse' : 'bg-[rgba(255,255,255,0.2)]'}"></div>
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
		<div class="group rounded border border-[rgba(197,165,90,0.12)] bg-[rgba(197,165,90,0.03)] p-5 transition-all duration-200 hover:border-[rgba(197,165,90,0.3)] hover:bg-[rgba(197,165,90,0.06)] hover:-translate-y-0.5">
			<div class="flex items-center justify-between mb-3">
				<span class="text-xs uppercase tracking-[0.15em] text-[rgba(255,255,255,0.4)]">Total Calls</span>
				<Phone class="h-4 w-4 text-[#C5A55A] opacity-50 group-hover:opacity-100 transition-opacity" />
			</div>
			{#if stats}
				<div class="text-3xl font-light text-[rgba(255,255,255,0.9)]" style="font-family: 'Playfair Display', serif;">{stats.totalCalls}</div>
			{:else}
				<Skeleton class="h-9 w-16" />
			{/if}
		</div>

		<div class="group rounded border border-[rgba(197,165,90,0.12)] bg-[rgba(197,165,90,0.03)] p-5 transition-all duration-200 hover:border-[rgba(197,165,90,0.3)] hover:bg-[rgba(197,165,90,0.06)] hover:-translate-y-0.5">
			<div class="flex items-center justify-between mb-3">
				<span class="text-xs uppercase tracking-[0.15em] text-[rgba(255,255,255,0.4)]">Missed Calls</span>
				<PhoneMissed class="h-4 w-4 text-red-400 opacity-50 group-hover:opacity-100 transition-opacity" />
			</div>
			{#if stats}
				<div class="text-3xl font-light text-[rgba(255,255,255,0.9)]" style="font-family: 'Playfair Display', serif;">{stats.missed}</div>
			{:else}
				<Skeleton class="h-9 w-16" />
			{/if}
		</div>

		<div class="group rounded border border-[rgba(197,165,90,0.12)] bg-[rgba(197,165,90,0.03)] p-5 transition-all duration-200 hover:border-[rgba(197,165,90,0.3)] hover:bg-[rgba(197,165,90,0.06)] hover:-translate-y-0.5">
			<div class="flex items-center justify-between mb-3">
				<span class="text-xs uppercase tracking-[0.15em] text-[rgba(255,255,255,0.4)]">Voicemails</span>
				<Voicemail class="h-4 w-4 text-[#C5A55A] opacity-50 group-hover:opacity-100 transition-opacity" />
			</div>
			{#if stats}
				<div class="text-3xl font-light text-[rgba(255,255,255,0.9)]" style="font-family: 'Playfair Display', serif;">{stats.unheardVoicemails}</div>
				<p class="text-[10px] uppercase tracking-[0.12em] text-[rgba(197,165,90,0.4)] mt-1">unheard</p>
			{:else}
				<Skeleton class="h-9 w-16" />
			{/if}
		</div>

		<div class="group rounded border border-[rgba(197,165,90,0.12)] bg-[rgba(197,165,90,0.03)] p-5 transition-all duration-200 hover:border-[rgba(197,165,90,0.3)] hover:bg-[rgba(197,165,90,0.06)] hover:-translate-y-0.5">
			<div class="flex items-center justify-between mb-3">
				<span class="text-xs uppercase tracking-[0.15em] text-[rgba(255,255,255,0.4)]">Avg Duration</span>
				<Clock class="h-4 w-4 text-[#C5A55A] opacity-50 group-hover:opacity-100 transition-opacity" />
			</div>
			{#if stats}
				<div class="text-3xl font-light text-[rgba(255,255,255,0.9)]" style="font-family: 'Playfair Display', serif;">{formatDuration(stats.avgDuration)}</div>
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
					<div class="flex items-end gap-2 h-36">
						{#each dailyStats as day}
							{@const max = chartMax()}
							{@const pct = Math.max(4, (day.total / max) * 100)}
							<div class="flex-1 flex flex-col items-center gap-1">
								<div class="w-full flex flex-col items-center relative group">
									<!-- Tooltip on hover -->
									<div class="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-[rgba(0,0,0,0.9)] border border-[rgba(197,165,90,0.2)] rounded px-2 py-1 text-xs whitespace-nowrap z-10">
										{day.total} calls
										{#if day.answered > 0}<span class="text-green-400"> · {day.answered} ans</span>{/if}
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
												<div class="bg-[rgba(197,165,90,0.3)]" style="height: {100 - answeredPct - missedPct}%;"></div>
											</div>
										{/if}
									</div>
								</div>
								<span class="text-[10px] text-[rgba(255,255,255,0.3)] mt-1">{dayLabel(day.date)}</span>
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
					<div class="flex h-36 items-center justify-center">
						<p class="text-sm text-[rgba(255,255,255,0.25)]">No call data yet.</p>
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
				<a href="/calls?filter=voicemail" class="flex items-center justify-between px-3 py-3 rounded transition-colors hover:bg-[rgba(197,165,90,0.04)] group">
					<div class="flex items-center gap-3">
						<Voicemail class="h-4 w-4 text-[rgba(255,255,255,0.3)] group-hover:text-[#c5a55a] transition-colors" />
						<span class="text-sm text-[rgba(255,255,255,0.6)] group-hover:text-white transition-colors">Voicemails</span>
					</div>
					<div class="flex items-center gap-2">
						{#if stats?.unheardVoicemails > 0}
							<span class="px-1.5 py-0.5 rounded-full text-[10px] bg-[#c5a55a] text-black font-medium">{stats.unheardVoicemails}</span>
						{/if}
						<ArrowRight class="h-3.5 w-3.5 text-[rgba(255,255,255,0.15)] group-hover:text-[rgba(255,255,255,0.4)] transition-colors" />
					</div>
				</a>

				<a href="/messages" class="flex items-center justify-between px-3 py-3 rounded transition-colors hover:bg-[rgba(197,165,90,0.04)] group">
					<div class="flex items-center gap-3">
						<MessageSquare class="h-4 w-4 text-[rgba(255,255,255,0.3)] group-hover:text-[#c5a55a] transition-colors" />
						<span class="text-sm text-[rgba(255,255,255,0.6)] group-hover:text-white transition-colors">Messages</span>
					</div>
					<div class="flex items-center gap-2">
						{#if messageStats?.unread > 0}
							<span class="px-1.5 py-0.5 rounded-full text-[10px] bg-[#c5a55a] text-black font-medium">{messageStats.unread}</span>
						{/if}
						<ArrowRight class="h-3.5 w-3.5 text-[rgba(255,255,255,0.15)] group-hover:text-[rgba(255,255,255,0.4)] transition-colors" />
					</div>
				</a>

				<a href="/calls" class="flex items-center justify-between px-3 py-3 rounded transition-colors hover:bg-[rgba(197,165,90,0.04)] group">
					<div class="flex items-center gap-3">
						<Phone class="h-4 w-4 text-[rgba(255,255,255,0.3)] group-hover:text-[#c5a55a] transition-colors" />
						<span class="text-sm text-[rgba(255,255,255,0.6)] group-hover:text-white transition-colors">Call Log</span>
					</div>
					<ArrowRight class="h-3.5 w-3.5 text-[rgba(255,255,255,0.15)] group-hover:text-[rgba(255,255,255,0.4)] transition-colors" />
				</a>

				<a href="/softphone" class="flex items-center justify-between px-3 py-3 rounded transition-colors hover:bg-[rgba(197,165,90,0.04)] group">
					<div class="flex items-center gap-3">
						<PhoneOutgoing class="h-4 w-4 text-[rgba(255,255,255,0.3)] group-hover:text-[#c5a55a] transition-colors" />
						<span class="text-sm text-[rgba(255,255,255,0.6)] group-hover:text-white transition-colors">Softphone</span>
					</div>
					<ArrowRight class="h-3.5 w-3.5 text-[rgba(255,255,255,0.15)] group-hover:text-[rgba(255,255,255,0.4)] transition-colors" />
				</a>

				<a href="/settings" class="flex items-center justify-between px-3 py-3 rounded transition-colors hover:bg-[rgba(197,165,90,0.04)] group">
					<div class="flex items-center gap-3">
						<svg class="h-4 w-4 text-[rgba(255,255,255,0.3)] group-hover:text-[#c5a55a] transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
						<span class="text-sm text-[rgba(255,255,255,0.6)] group-hover:text-white transition-colors">Settings</span>
					</div>
					<ArrowRight class="h-3.5 w-3.5 text-[rgba(255,255,255,0.15)] group-hover:text-[rgba(255,255,255,0.4)] transition-colors" />
				</a>
			</div>
		</div>
	</div>

	<!-- Recent Calls -->
	<div class="rounded border border-[rgba(197,165,90,0.12)] overflow-hidden">
		<div class="px-5 py-4 border-b border-[rgba(197,165,90,0.08)] flex items-center justify-between">
			<div>
				<h2 class="text-base tracking-wide">Recent Calls</h2>
				<p class="text-xs text-muted-foreground mt-0.5">Latest call activity.</p>
			</div>
			<a href="/calls" class="text-xs text-[#c5a55a] hover:text-[#d4af37] transition-colors">View all →</a>
		</div>
		<div class="p-5">
			{#if recentCalls === null}
				<div class="space-y-3">
					{#each Array(5) as _}
						<Skeleton class="h-12 w-full" />
					{/each}
				</div>
			{:else if recentCalls.length === 0}
				<div class="flex h-32 items-center justify-center text-muted-foreground">
					<div class="text-center">
						<Phone class="mx-auto mb-3 h-8 w-8 text-[rgba(197,165,90,0.2)]" />
						<p class="text-sm text-[rgba(255,255,255,0.35)]">No calls yet.</p>
						<p class="text-xs text-[rgba(255,255,255,0.2)] mt-1">Call data will appear once Twilio is connected.</p>
					</div>
				</div>
			{:else}
				<div class="space-y-1">
					{#each recentCalls as call}
						<div class="group flex items-center justify-between rounded p-3 transition-all duration-200 hover:bg-[rgba(197,165,90,0.04)] border border-transparent hover:border-[rgba(197,165,90,0.1)]">
							<div class="flex items-center gap-3">
								{#if call.direction === 'inbound'}
									<PhoneIncoming class="h-4 w-4 text-blue-400/70 group-hover:text-blue-400 transition-colors" />
								{:else}
									<PhoneOutgoing class="h-4 w-4 text-emerald-400/70 group-hover:text-emerald-400 transition-colors" />
								{/if}
								<div>
									<p class="text-sm font-medium flex items-center gap-1.5">
										{#if call.contact_id && call.caller_name}
											<span class="text-[#C5A55A] text-[10px]" title="Contact">◆</span>
											<span class="text-[rgba(255,255,255,0.9)]">{call.caller_name}</span>
										{:else if call.caller_name}
											<span class="text-[rgba(255,255,255,0.7)]">{call.caller_name}</span>
											<span class="text-[9px] uppercase tracking-wider px-1 py-px rounded bg-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.3)] leading-none">CID</span>
										{:else}
											<span class="text-[rgba(255,255,255,0.85)]">{formatPhone(call.direction === 'inbound' ? call.from_number : call.to_number)}</span>
										{/if}
									</p>
									<p class="text-xs text-[rgba(255,255,255,0.35)]">
										{#if call.caller_name}
											{formatPhone(call.direction === 'inbound' ? call.from_number : call.to_number)} &middot;
										{/if}
										{formatRelativeDate(call.started_at)}
										{#if call.duration > 0}
											&middot; {formatDuration(call.duration)}
										{/if}
									</p>
								</div>
							</div>
							<Badge variant={dispositionColor(call.disposition)}>
								{call.disposition || call.status}
							</Badge>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
