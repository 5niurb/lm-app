<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	// Redirect to phone log (voicemails now shown inline)
	onMount(() => {
		goto('/calls?filter=voicemail', { replaceState: true });
	});
</script>

<div class="flex h-48 items-center justify-center">
	<p class="text-sm text-muted-foreground">Redirecting to Phone Log...</p>
</div>
