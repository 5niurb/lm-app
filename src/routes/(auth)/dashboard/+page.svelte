<script>
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import { Phone, PhoneMissed, Voicemail, Clock, PhoneIncoming, PhoneOutgoing } from '@lucide/svelte';
	import { api } from '$lib/api/client.js';
	import { formatPhone, formatDuration, formatRelativeDate } from '$lib/utils/formatters.js';

	let stats = $state(null);
	let recentCalls = $state(null);
	let error = $state('');

	$effect(() => {
		loadDashboard();
	});

	async function loadDashboard() {
		try {
			const [statsRes, callsRes] = await Promise.all([
				api('/api/calls/stats?days=7'),
				api('/api/calls?pageSize=10')
			]);
			stats = statsRes;
			recentCalls = callsRes.data;
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
</script>

<div class="space-y-8">
	<div>
		<h1 class="text-2xl tracking-wide">Dashboard</h1>
		<p class="text-sm text-muted-foreground mt-1">Overview of your call activity — last 7 days.</p>
	</div>

	{#if error}
		<div class="rounded border border-red-500/30 bg-red-500/5 px-4 py-3">
			<p class="text-sm text-red-400">{error}</p>
			<p class="text-xs text-red-400/60 mt-1">Make sure the API server is running on port 3001.</p>
		</div>
	{/if}

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

	<div class="rounded border border-[rgba(197,165,90,0.12)] overflow-hidden">
		<div class="px-5 py-4 border-b border-[rgba(197,165,90,0.08)]">
			<h2 class="text-base tracking-wide">Recent Calls</h2>
			<p class="text-xs text-muted-foreground mt-0.5">Latest call activity.</p>
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
									<p class="text-sm font-medium text-[rgba(255,255,255,0.85)]">
										{#if call.caller_name}
											{call.caller_name}
										{:else}
											{formatPhone(call.direction === 'inbound' ? call.from_number : call.to_number)}
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
