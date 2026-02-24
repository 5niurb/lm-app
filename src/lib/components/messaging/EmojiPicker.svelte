<script>
	import { Smile } from '@lucide/svelte';

	/** @type {{ onSelect: (emoji: string) => void }} */
	let { onSelect } = $props();

	let open = $state(false);
	let searchQuery = $state('');

	/** @type {HTMLElement|null} */
	let pickerRef = $state(null);

	const categories = [
		{
			name: 'Smileys',
			emojis: [
				'😀',
				'😃',
				'😄',
				'😁',
				'😆',
				'😅',
				'🤣',
				'😂',
				'🙂',
				'😊',
				'😇',
				'🥰',
				'😍',
				'🤩',
				'😘',
				'😗',
				'😚',
				'😙',
				'🥲',
				'😋',
				'😛',
				'😜',
				'🤪',
				'😝',
				'🤗',
				'🤭',
				'🤫',
				'🤔',
				'😐',
				'😑',
				'😶',
				'🫡',
				'😏',
				'😒',
				'🙄',
				'😬',
				'😮‍💨',
				'🤥',
				'😌',
				'😔',
				'😪',
				'🤤',
				'😴',
				'😷',
				'🤒',
				'🤕',
				'🤢',
				'🤮',
				'🥴',
				'😵'
			]
		},
		{
			name: 'Gestures',
			emojis: [
				'👋',
				'🤚',
				'🖐️',
				'✋',
				'🖖',
				'👌',
				'🤌',
				'🤏',
				'✌️',
				'🤞',
				'🤟',
				'🤘',
				'🤙',
				'👈',
				'👉',
				'👆',
				'🖕',
				'👇',
				'☝️',
				'👍',
				'👎',
				'✊',
				'👊',
				'🤛',
				'🤜',
				'👏',
				'🙌',
				'👐',
				'🤲',
				'🙏',
				'💪',
				'🦵',
				'🦶',
				'💅',
				'🫶',
				'❤️',
				'🧡',
				'💛',
				'💚',
				'💙'
			]
		},
		{
			name: 'Celebration',
			emojis: [
				'🎉',
				'🎊',
				'🎈',
				'🎁',
				'🎀',
				'🎂',
				'🎄',
				'🎃',
				'🎗️',
				'🏆',
				'🥇',
				'🥈',
				'🥉',
				'⭐',
				'🌟',
				'✨',
				'💫',
				'🔥',
				'💥',
				'💯',
				'🎵',
				'🎶',
				'🎤',
				'🎧',
				'🎸',
				'🎹',
				'🎺',
				'🎻',
				'🪩',
				'🎭'
			]
		},
		{
			name: 'Health & Beauty',
			emojis: [
				'💆',
				'💆‍♀️',
				'💇',
				'💇‍♀️',
				'🧖',
				'🧖‍♀️',
				'💅',
				'💄',
				'💋',
				'👄',
				'🪷',
				'🌸',
				'🌺',
				'🌹',
				'🌻',
				'🌼',
				'💐',
				'🍃',
				'🌿',
				'☘️',
				'🧴',
				'🧼',
				'🪥',
				'🧘',
				'🧘‍♀️',
				'🏃‍♀️',
				'🚶‍♀️',
				'💊',
				'💉',
				'🩹'
			]
		},
		{
			name: 'Objects',
			emojis: [
				'📱',
				'💻',
				'📞',
				'☎️',
				'📧',
				'📬',
				'📅',
				'📆',
				'⏰',
				'🕐',
				'📍',
				'🗺️',
				'🏥',
				'🏢',
				'🏠',
				'🚗',
				'🚕',
				'✈️',
				'🛁',
				'🪞',
				'💰',
				'💳',
				'🔗',
				'📎',
				'📝',
				'📋',
				'📌',
				'🔔',
				'🔕',
				'✅'
			]
		}
	];

	let selectedCategory = $state(0);

	const filteredEmojis = $derived(() => {
		if (!searchQuery) return categories[selectedCategory].emojis;
		return categories.flatMap((c) => c.emojis);
	});

	function handleSelect(emoji) {
		onSelect(emoji);
		open = false;
		searchQuery = '';
	}

	function handleClickOutside(e) {
		if (pickerRef && !pickerRef.contains(e.target)) {
			open = false;
		}
	}

	$effect(() => {
		if (open) {
			document.addEventListener('mousedown', handleClickOutside);
			return () => document.removeEventListener('mousedown', handleClickOutside);
		}
	});
</script>

<div class="relative" bind:this={pickerRef}>
	<button
		type="button"
		class="inline-flex items-center justify-center h-8 w-8 rounded-md text-vivid-amber/70 hover:text-vivid-amber hover:bg-surface-subtle transition-colors"
		title="Insert emoji"
		onclick={() => {
			open = !open;
		}}
	>
		<Smile class="h-4 w-4" />
	</button>

	{#if open}
		<div
			class="absolute bottom-10 left-0 z-50 w-72 rounded-lg border border-border bg-card shadow-xl"
		>
			<!-- Search -->
			<div class="p-2 border-b border-border">
				<input
					type="text"
					placeholder="Search emoji..."
					class="w-full px-2 py-1.5 text-xs rounded bg-surface-subtle border border-border-subtle focus:border-gold focus:outline-none text-text-primary placeholder:text-text-ghost"
					bind:value={searchQuery}
				/>
			</div>

			<!-- Category tabs -->
			{#if !searchQuery}
				<div class="flex px-2 pt-1.5 gap-0.5 border-b border-border-subtle">
					{#each categories as cat, i (cat.name)}
						<button
							type="button"
							class="flex-1 text-[10px] px-1 py-1 rounded-t transition-colors truncate {selectedCategory ===
							i
								? 'text-gold border-b-2 border-gold bg-gold-glow'
								: 'text-text-tertiary hover:text-text-secondary'}"
							onclick={() => {
								selectedCategory = i;
							}}
						>
							{cat.name}
						</button>
					{/each}
				</div>
			{/if}

			<!-- Emoji grid -->
			<div class="p-2 max-h-48 overflow-y-auto grid grid-cols-8 gap-0.5">
				{#each filteredEmojis() as emoji (emoji)}
					<button
						type="button"
						class="h-8 w-8 flex items-center justify-center text-lg rounded hover:bg-surface-hover transition-colors"
						onclick={() => handleSelect(emoji)}
					>
						{emoji}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
