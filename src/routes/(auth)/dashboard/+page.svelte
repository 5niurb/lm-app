<script>
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Phone, PhoneMissed, Voicemail, Clock } from '@lucide/svelte';

	const stats = [
		{ label: 'Total Calls', value: '—', icon: Phone, change: '' },
		{ label: 'Missed Calls', value: '—', icon: PhoneMissed, change: '' },
		{ label: 'Voicemails', value: '—', icon: Voicemail, change: '' },
		{ label: 'Avg Duration', value: '—', icon: Clock, change: '' }
	];
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold tracking-tight">Dashboard</h1>
		<p class="text-muted-foreground">Overview of your call activity.</p>
	</div>

	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		{#each stats as stat}
			<Card.Root>
				<Card.Header class="flex flex-row items-center justify-between pb-2">
					<Card.Title class="text-sm font-medium">{stat.label}</Card.Title>
					<stat.icon class="h-4 w-4 text-muted-foreground" />
				</Card.Header>
				<Card.Content>
					<div class="text-2xl font-bold">{stat.value}</div>
					{#if stat.change}
						<p class="text-xs text-muted-foreground">{stat.change}</p>
					{/if}
				</Card.Content>
			</Card.Root>
		{/each}
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Recent Calls</Card.Title>
			<Card.Description>Your latest call activity will appear here.</Card.Description>
		</Card.Header>
		<Card.Content>
			<div class="flex h-32 items-center justify-center text-muted-foreground">
				No calls yet. Call data will appear once Twilio is connected.
			</div>
		</Card.Content>
	</Card.Root>
</div>
