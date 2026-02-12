<script>
	import { goto } from '$app/navigation';
	import { session, loading } from '$lib/stores/auth.js';
	import { onMount } from 'svelte';
	import { SidebarProvider, SidebarInset } from '$lib/components/ui/sidebar/index.ts';
	import AppSidebar from '$lib/components/AppSidebar.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';

	let { children } = $props();

	onMount(() => {
		const unsub = loading.subscribe((isLoading) => {
			if (isLoading) return;
			if (!$session) goto('/login');
		});
		return unsub;
	});
</script>

{#if $loading}
	<div class="flex h-screen items-center justify-center">
		<div class="animate-pulse text-muted-foreground">Loading...</div>
	</div>
{:else if $session}
	<SidebarProvider>
		<AppSidebar />
		<SidebarInset>
			<AppHeader />
			<main class="flex-1 p-6">
				{@render children()}
			</main>
		</SidebarInset>
	</SidebarProvider>
{/if}
