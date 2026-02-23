<script>
	import { onMount } from 'svelte';
	import {
		X,
		Sparkles,
		Phone,
		MessageCircle,
		Heart,
		Calendar,
		Clock,
		Gift,
		Lightbulb
	} from '@lucide/svelte';
	import { api } from '$lib/api/client.js';

	const ICON_MAP = {
		phone: Phone,
		sparkles: Sparkles,
		'message-circle': MessageCircle,
		heart: Heart,
		calendar: Calendar,
		clock: Clock,
		gift: Gift,
		lightbulb: Lightbulb
	};

	/**
	 * @type {{
	 *   conversationId: string,
	 *   onInsert: (text: string) => void,
	 *   onClose: () => void,
	 *   onError: (msg: string) => void
	 * }}
	 */
	let { conversationId, onInsert, onClose, onError } = $props();

	let loading = $state(true);
	let error = $state('');
	let summary = $state('');

	/** @type {Array<{label: string, icon: string, text: string}>} */
	let suggestions = $state([]);

	async function fetchSuggestions() {
		loading = true;
		error = '';
		try {
			const res = await api('/api/messages/ai-suggest', {
				method: 'POST',
				body: JSON.stringify({ conversationId })
			});
			summary = res.data.summary;
			suggestions = res.data.suggestions;
		} catch (e) {
			error = e.message || 'Failed to generate suggestions';
		} finally {
			loading = false;
		}
	}

	function selectSuggestion(text) {
		onInsert(text);
		onClose();
	}

	function getIcon(name) {
		return ICON_MAP[name] || MessageCircle;
	}

	onMount(fetchSuggestions);
</script>

<div class="border-t border-border bg-surface-raised px-4 py-3">
	<div class="flex items-center justify-between mb-2">
		<span class="flex items-center gap-1.5 text-xs font-medium text-vivid-violet">
			<Sparkles class="h-3.5 w-3.5" />
			Generate with AI
		</span>
		<button
			type="button"
			class="flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-hover hover:text-text-secondary transition-colors"
			onclick={onClose}
			title="Close"
		>
			<X class="h-3.5 w-3.5" />
		</button>
	</div>

	{#if loading}
		<div class="space-y-2 animate-pulse">
			<div class="h-4 w-3/4 rounded bg-surface-hover"></div>
			<div class="h-4 w-1/2 rounded bg-surface-hover"></div>
			<div class="space-y-1.5 mt-3">
				{#each Array(3) as _, i (i)}
					<div class="h-12 rounded-lg bg-surface-hover"></div>
				{/each}
			</div>
		</div>
	{:else if error}
		<div class="text-center py-2">
			<p class="text-xs text-vivid-rose mb-2">{error}</p>
			<button
				type="button"
				class="text-xs text-gold hover:text-gold/80 font-medium transition-colors"
				onclick={fetchSuggestions}
			>
				Try again
			</button>
		</div>
	{:else}
		{#if summary}
			<p class="text-xs text-text-secondary mb-3">{summary}</p>
		{/if}
		<p class="text-[10px] text-text-tertiary uppercase tracking-wider mb-1.5">
			Click to generate a draft response:
		</p>
		<div class="space-y-1.5 max-h-48 overflow-y-auto">
			{#each suggestions as sug, i (i)}
				<button
					type="button"
					class="w-full text-left flex items-start gap-2.5 rounded-lg border border-border-subtle bg-surface-subtle px-3 py-2.5 hover:bg-surface-hover hover:border-border transition-colors"
					onclick={() => selectSuggestion(sug.text)}
				>
					<div class="icon-box grad-violet shrink-0 mt-0.5">
						<svelte:component this={getIcon(sug.icon)} class="h-3.5 w-3.5 text-white" />
					</div>
					<div class="min-w-0">
						<span class="text-xs font-semibold text-text-primary">{sug.label}</span>
						<p class="text-xs text-text-secondary mt-0.5 line-clamp-2">{sug.text}</p>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>
