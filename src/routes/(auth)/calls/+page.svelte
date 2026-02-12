<script>
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Phone, Search } from '@lucide/svelte';

	let search = $state('');
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Call Log</h1>
			<p class="text-muted-foreground">View and manage all call records.</p>
		</div>
	</div>

	<Card.Root>
		<Card.Header>
			<div class="flex items-center gap-2">
				<div class="relative flex-1">
					<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Search by phone number or name..."
						class="pl-8"
						bind:value={search}
					/>
				</div>
			</div>
		</Card.Header>
		<Card.Content>
			<div class="flex h-48 items-center justify-center text-muted-foreground">
				<div class="text-center">
					<Phone class="mx-auto mb-3 h-10 w-10 opacity-50" />
					<p>No call records yet.</p>
					<p class="text-sm">Calls will appear here once Twilio webhooks are connected.</p>
				</div>
			</div>
		</Card.Content>
	</Card.Root>
</div>
