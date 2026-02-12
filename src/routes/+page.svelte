<script>
	import { goto } from '$app/navigation';
	import { session, loading } from '$lib/stores/auth.js';
	import { onMount } from 'svelte';

	onMount(() => {
		const unsub = loading.subscribe((isLoading) => {
			if (isLoading) return;
			if ($session) {
				goto('/dashboard');
			} else {
				goto('/login');
			}
		});
		return unsub;
	});
</script>

<div class="flex h-screen items-center justify-center">
	<div class="animate-pulse text-muted-foreground">Loading...</div>
</div>
