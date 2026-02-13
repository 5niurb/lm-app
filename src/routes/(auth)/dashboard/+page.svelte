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

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold tracking-tight">Dashboard</h1>
		<p class="text-muted-foreground">Overview of your call activity — last 7 days.</p>
	</div>

	{#if error}
		<Card.Root>
			<Card.Content class="py-4">
				<p class="text-sm text-destructive">{error}</p>
				<p class="text-xs text-muted-foreground mt-1">Make sure the API server is running on port 3001.</p>
			</Card.Content>
		</Card.Root>
	{/if}

	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between pb-2">
				<Card.Title class="text-sm font-medium">Total Calls</Card.Title>
				<Phone class="h-4 w-4 text-muted-foreground" />
			</Card.Header>
			<Card.Content>
				{#if stats}
					<div class="text-2xl font-bold">{stats.totalCalls}</div>
				{:else}
					<Skeleton class="h-8 w-16" />
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between pb-2">
				<Card.Title class="text-sm font-medium">Missed Calls</Card.Title>
				<PhoneMissed class="h-4 w-4 text-muted-foreground" />
			</Card.Header>
			<Card.Content>
				{#if stats}
					<div class="text-2xl font-bold">{stats.missed}</div>
				{:else}
					<Skeleton class="h-8 w-16" />
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between pb-2">
				<Card.Title class="text-sm font-medium">Voicemails</Card.Title>
				<Voicemail class="h-4 w-4 text-muted-foreground" />
			</Card.Header>
			<Card.Content>
				{#if stats}
					<div class="text-2xl font-bold">{stats.unheardVoicemails}</div>
					<p class="text-xs text-muted-foreground">unheard</p>
				{:else}
					<Skeleton class="h-8 w-16" />
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="flex flex-row items-center justify-between pb-2">
				<Card.Title class="text-sm font-medium">Avg Duration</Card.Title>
				<Clock class="h-4 w-4 text-muted-foreground" />
			</Card.Header>
			<Card.Content>
				{#if stats}
					<div class="text-2xl font-bold">{formatDuration(stats.avgDuration)}</div>
				{:else}
					<Skeleton class="h-8 w-16" />
				{/if}
			</Card.Content>
		</Card.Root>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Recent Calls</Card.Title>
			<Card.Description>Latest call activity.</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if recentCalls === null}
				<div class="space-y-3">
					{#each Array(5) as _}
						<Skeleton class="h-12 w-full" />
					{/each}
				</div>
			{:else if recentCalls.length === 0}
				<div class="flex h-32 items-center justify-center text-muted-foreground">
					No calls yet. Call data will appear once Twilio is connected.
				</div>
			{:else}
				<div class="space-y-2">
					{#each recentCalls as call}
						<div class="flex items-center justify-between rounded-md border p-3">
							<div class="flex items-center gap-3">
								{#if call.direction === 'inbound'}
									<PhoneIncoming class="h-4 w-4 text-blue-500" />
								{:else}
									<PhoneOutgoing class="h-4 w-4 text-green-500" />
								{/if}
								<div>
									<p class="text-sm font-medium">
										{#if call.caller_name}
											{call.caller_name}
										{:else}
											{formatPhone(call.direction === 'inbound' ? call.from_number : call.to_number)}
										{/if}
									</p>
									<p class="text-xs text-muted-foreground">
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
		</Card.Content>
	</Card.Root>
</div>
