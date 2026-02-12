<script>
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Label } from '$lib/components/ui/label/index.ts';
	import { Separator } from '$lib/components/ui/separator/index.ts';
	import { isAdmin } from '$lib/stores/auth.js';
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold tracking-tight">Settings</h1>
		<p class="text-muted-foreground">Manage your application settings.</p>
	</div>

	{#if !$isAdmin}
		<Card.Root>
			<Card.Content class="pt-6">
				<p class="text-muted-foreground">Only administrators can modify settings.</p>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title>Business Hours</Card.Title>
				<Card.Description>Configure when the clinic is open for calls.</Card.Description>
			</Card.Header>
			<Card.Content>
				<p class="text-sm text-muted-foreground">
					Business hours configuration will be available once the settings API is connected.
				</p>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Phone System</Card.Title>
				<Card.Description>Manage phone extensions and routing rules.</Card.Description>
			</Card.Header>
			<Card.Content>
				<p class="text-sm text-muted-foreground">
					Phone configuration will be available once Twilio is connected.
				</p>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Security</Card.Title>
				<Card.Description>IP allowlist and MFA settings.</Card.Description>
			</Card.Header>
			<Card.Content>
				<p class="text-sm text-muted-foreground">
					Security settings will be available in the next update.
				</p>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
