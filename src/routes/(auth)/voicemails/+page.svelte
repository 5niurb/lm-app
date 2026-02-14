<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	// Redirect to combined phone log page with voicemails tab active
	onMount(() => {
		goto('/calls?view=voicemails', { replaceState: true });
	});
</script>

<div class="flex h-48 items-center justify-center">
	<p class="text-sm text-muted-foreground">Redirecting to Phone Log...</p>
</div>
