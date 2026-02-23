<script>
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { session, loading } from '$lib/stores/auth.js';
	import { onMount } from 'svelte';

	onMount(() => {
		const unsub = loading.subscribe((isLoading) => {
			if (isLoading) return;
			if ($session) {
				goto(resolve('/dashboard'));
			} else {
				goto(resolve('/login'));
			}
		});
		return unsub;
	});
</script>

<div class="flex h-screen items-center justify-center">
	<div class="animate-pulse text-text-secondary">Loading...</div>
</div>
