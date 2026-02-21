<script>
	import { Clock } from '@lucide/svelte';

	/** @type {{ onSchedule: (scheduledAt: string) => void }} */
	let { onSchedule } = $props();

	let open = $state(false);
	let dateTime = $state('');
	/** @type {HTMLElement|null} */
	let menuRef = $state(null);

	function handleClickOutside(e) {
		if (menuRef && !menuRef.contains(e.target)) {
			open = false;
		}
	}

	$effect(() => {
		if (open) {
			// Default to 1 hour from now
			const d = new Date(Date.now() + 3600000);
			d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
			dateTime = d.toISOString().slice(0, 16);
			document.addEventListener('mousedown', handleClickOutside);
			return () => document.removeEventListener('mousedown', handleClickOutside);
		}
	});

	function handleSchedule() {
		if (!dateTime) return;
		const scheduled = new Date(dateTime);
		if (scheduled <= new Date()) return;
		onSchedule(scheduled.toISOString());
		open = false;
		dateTime = '';
	}

	/** @returns {string} */
	function getMinDateTime() {
		return new Date().toISOString().slice(0, 16);
	}
</script>

<div class="relative" bind:this={menuRef}>
	<button
		type="button"
		class="inline-flex items-center justify-center h-8 w-8 rounded-md text-text-tertiary hover:text-text-secondary hover:bg-surface-subtle transition-colors"
		title="Schedule message"
		onclick={() => {
			open = !open;
		}}
	>
		<Clock class="h-4 w-4" />
	</button>

	{#if open}
		<div
			class="absolute bottom-10 right-0 z-50 w-64 rounded-lg border border-border bg-card shadow-xl p-3 space-y-3"
		>
			<p class="text-xs font-medium text-text-secondary">Schedule Message</p>
			<input
				type="datetime-local"
				class="w-full px-2.5 py-1.5 text-sm rounded bg-surface-subtle border border-border-subtle focus:border-gold focus:outline-none text-text-primary"
				bind:value={dateTime}
				min={getMinDateTime()}
			/>
			<div class="flex gap-2">
				<button
					type="button"
					class="flex-1 px-3 py-1.5 text-xs rounded border border-border text-text-secondary hover:bg-surface-subtle transition-colors"
					onclick={() => {
						open = false;
					}}
				>
					Cancel
				</button>
				<button
					type="button"
					class="flex-1 px-3 py-1.5 text-xs rounded bg-gold text-primary-foreground hover:bg-gold/80 transition-colors font-medium"
					onclick={handleSchedule}
					disabled={!dateTime}
				>
					Schedule
				</button>
			</div>
		</div>
	{/if}
</div>
