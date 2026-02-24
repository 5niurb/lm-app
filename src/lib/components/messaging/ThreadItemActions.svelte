<script>
	import { Star, CircleCheck } from '@lucide/svelte';
	import { api } from '$lib/api/client.js';

	/**
	 * @type {{
	 *   itemType: 'message' | 'call' | 'voicemail' | 'email',
	 *   itemId: string,
	 *   isStarred: boolean,
	 *   isResolved: boolean,
	 *   onToggle: (field: 'is_starred' | 'is_resolved', value: boolean) => void
	 * }}
	 */
	let { itemType, itemId, isStarred = false, isResolved = false, onToggle } = $props();

	async function toggleStar() {
		const newVal = !isStarred;
		onToggle('is_starred', newVal);
		try {
			await api(`/api/messages/timeline/${itemType}/${itemId}/star`, { method: 'POST' });
		} catch (e) {
			// Revert on failure
			onToggle('is_starred', !newVal);
			console.error('Failed to toggle star:', e);
		}
	}

	async function toggleResolve() {
		const newVal = !isResolved;
		onToggle('is_resolved', newVal);
		try {
			await api(`/api/messages/timeline/${itemType}/${itemId}/resolve`, { method: 'POST' });
		} catch (e) {
			onToggle('is_resolved', !newVal);
			console.error('Failed to toggle resolve:', e);
		}
	}
</script>

<div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
	<button
		type="button"
		class="flex h-6 w-6 items-center justify-center rounded-md transition-colors {isStarred
			? 'text-gold bg-gold/10'
			: 'text-text-ghost hover:text-gold hover:bg-gold/10'}"
		title={isStarred ? 'Unstar' : 'Star for follow-up'}
		onclick={toggleStar}
	>
		<Star class="h-3 w-3" fill={isStarred ? 'currentColor' : 'none'} />
	</button>
	<button
		type="button"
		class="flex h-6 w-6 items-center justify-center rounded-md transition-colors {isResolved
			? 'text-vivid-emerald bg-vivid-emerald/10'
			: 'text-text-ghost hover:text-vivid-emerald hover:bg-vivid-emerald/10'}"
		title={isResolved ? 'Mark unresolved' : 'Mark resolved'}
		onclick={toggleResolve}
	>
		<CircleCheck class="h-3 w-3" fill={isResolved ? 'currentColor' : 'none'} />
	</button>
</div>
