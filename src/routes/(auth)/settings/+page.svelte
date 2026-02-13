<script>
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Label } from '$lib/components/ui/label/index.ts';
	import { Separator } from '$lib/components/ui/separator/index.ts';
	import { isAdmin } from '$lib/stores/auth.js';
</script>

<div class="space-y-8">
	<div>
		<h1 class="text-2xl tracking-wide">Settings</h1>
		<p class="text-sm text-muted-foreground mt-1">Manage your application settings.</p>
	</div>

	{#if !$isAdmin}
		<div class="rounded border border-[rgba(197,165,90,0.12)] bg-[rgba(197,165,90,0.03)] p-5">
			<p class="text-[rgba(255,255,255,0.5)]">Only administrators can modify settings.</p>
		</div>
	{:else}
		<div class="rounded border border-[rgba(197,165,90,0.12)] overflow-hidden">
			<div class="px-5 py-4 border-b border-[rgba(197,165,90,0.08)]">
				<h2 class="text-base tracking-wide">Business Hours</h2>
				<p class="text-xs text-[rgba(255,255,255,0.35)] mt-0.5">Configure when the clinic is open for calls.</p>
			</div>
			<div class="p-5">
				<p class="text-sm text-[rgba(255,255,255,0.4)]">
					Business hours configuration will be available once the settings API is connected.
				</p>
			</div>
		</div>

		<div class="rounded border border-[rgba(197,165,90,0.12)] overflow-hidden">
			<div class="px-5 py-4 border-b border-[rgba(197,165,90,0.08)]">
				<h2 class="text-base tracking-wide">Phone System</h2>
				<p class="text-xs text-[rgba(255,255,255,0.35)] mt-0.5">Manage phone extensions and routing rules.</p>
			</div>
			<div class="p-5">
				<p class="text-sm text-[rgba(255,255,255,0.4)]">
					Phone configuration will be available once Twilio is connected.
				</p>
			</div>
		</div>

		<div class="rounded border border-[rgba(197,165,90,0.12)] overflow-hidden">
			<div class="px-5 py-4 border-b border-[rgba(197,165,90,0.08)]">
				<h2 class="text-base tracking-wide">Security</h2>
				<p class="text-xs text-[rgba(255,255,255,0.35)] mt-0.5">IP allowlist and MFA settings.</p>
			</div>
			<div class="p-5">
				<p class="text-sm text-[rgba(255,255,255,0.4)]">
					Security settings will be available in the next update.
				</p>
			</div>
		</div>
	{/if}
</div>
