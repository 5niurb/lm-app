<script>
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { session, loading } from '$lib/stores/auth.js';
	import { onMount } from 'svelte';
	import { SidebarProvider, SidebarInset } from '$lib/components/ui/sidebar/index.ts';
	import AppSidebar from '$lib/components/AppSidebar.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import { connectDevice, disconnectDevice } from '$lib/stores/softphone.js';
	import IncomingCallOverlay from '$lib/components/IncomingCallOverlay.svelte';

	/** @type {import('$lib/components/CommandPalette.svelte').default|null} */
	let commandPalette = $state(null);

	let { children } = $props();

	onMount(() => {
		const unsub = loading.subscribe((isLoading) => {
			if (isLoading) return;
			if (!$session) goto(resolve('/login'));
		});

		// Initialize global softphone — stays connected across all pages
		connectDevice();

		return () => {
			unsub();
			disconnectDevice();
		};
	});
</script>

{#if $loading}
	<div class="flex h-screen items-center justify-center">
		<div class="animate-pulse text-text-secondary">Loading...</div>
	</div>
{:else if $session}
	<SidebarProvider>
		<AppSidebar />
		<SidebarInset>
			<AppHeader onOpenCommandPalette={() => commandPalette?.show()} />
			<main class="flex-1 p-6 page-enter relative">
				{@render children()}
			</main>
		</SidebarInset>
	</SidebarProvider>
	<CommandPalette bind:this={commandPalette} />
	<IncomingCallOverlay />
{/if}
