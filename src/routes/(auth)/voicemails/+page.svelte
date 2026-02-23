<script>
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	// Redirect to phone log (voicemails now shown inline)
	onMount(() => {
		goto(resolve('/calls?filter=voicemail'), { replaceState: true });
	});
</script>

<div class="flex h-48 items-center justify-center">
	<p class="text-sm text-text-secondary">Redirecting to Phone Log...</p>
</div>
