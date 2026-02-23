<script>
	import { onMount } from 'svelte';

	/**
	 * @type {{
	 *   reactions: string[],
	 *   onReact: (emoji: string) => void,
	 *   onDismiss: () => void,
	 *   anchorRect: DOMRect,
	 *   direction: 'inbound' | 'outbound'
	 * }}
	 */
	let { reactions, onReact, onDismiss, anchorRect, direction } = $props();

	/** @type {HTMLDivElement|undefined} */
	let barEl = $state();
	let barWidth = $state(0);
	let barHeight = $state(0);
	let visible = $state(false);

	const left = $derived(() => {
		if (!barWidth) return anchorRect.left;
		if (direction === 'outbound') {
			return Math.max(8, anchorRect.right - barWidth);
		}
		return Math.min(anchorRect.left, window.innerWidth - barWidth - 8);
	});

	const top = $derived(() => {
		const gap = 8;
		const above = anchorRect.top - gap - barHeight;
		if (above >= 8) return above;
		return anchorRect.bottom + gap;
	});

	onMount(() => {
		if (barEl) {
			const rect = barEl.getBoundingClientRect();
			barWidth = rect.width;
			barHeight = rect.height;
		}
		requestAnimationFrame(() => {
			visible = true;
		});

		function handleClickOutside(e) {
			if (barEl && !barEl.contains(e.target)) {
				onDismiss();
			}
		}

		function handleEscape(e) {
			if (e.key === 'Escape') onDismiss();
		}

		document.addEventListener('pointerdown', handleClickOutside, true);
		document.addEventListener('keydown', handleEscape);
		return () => {
			document.removeEventListener('pointerdown', handleClickOutside, true);
			document.removeEventListener('keydown', handleEscape);
		};
	});
</script>

<div
	bind:this={barEl}
	class="fixed z-50 flex items-center gap-0.5 rounded-full px-2 py-1.5 shadow-xl border border-border
		bg-surface-raised/95 backdrop-blur-sm transition-all duration-150
		{visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}"
	style="left: {left()}px; top: {top()}px;"
	role="toolbar"
	aria-label="Message reactions"
>
	{#each reactions as emoji (emoji)}
		<button
			class="flex items-center justify-center h-8 w-8 rounded-full text-lg
				hover:bg-surface-hover hover:scale-125 active:scale-95 transition-all duration-100"
			onclick={() => onReact(emoji)}
			title="React with {emoji}"
		>
			{emoji}
		</button>
	{/each}
</div>
