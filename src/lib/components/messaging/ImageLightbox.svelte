<script>
	import { X } from '@lucide/svelte';

	/**
	 * @type {{
	 *   src: string,
	 *   onClose: () => void
	 * }}
	 */
	let { src, onClose } = $props();
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') onClose();
	}}
/>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm"
	onclick={(e) => {
		if (e.target === e.currentTarget) onClose();
	}}
>
	<button
		class="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-surface-hover text-foreground hover:bg-surface-raised transition-colors z-10"
		onclick={onClose}
	>
		<X class="h-5 w-5" />
	</button>
	<img
		{src}
		alt="Full size photo"
		class="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
	/>
</div>
