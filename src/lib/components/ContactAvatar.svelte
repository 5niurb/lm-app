<script>
	import { Phone, MessageSquare, Globe, User } from '@lucide/svelte';

	/**
	 * @type {{
	 *   name?: string|null,
	 *   phone?: string|null,
	 *   source?: string|null,
	 *   channel?: 'call'|'sms'|'web'|null,
	 *   imageUrl?: string|null,
	 *   size?: 'sm'|'md'|'lg',
	 *   class?: string
	 * }}
	 */
	let {
		name = null,
		phone = null,
		source = null,
		channel = null,
		imageUrl = null,
		size = 'md',
		class: className = ''
	} = $props();

	const VIVID_COLORS = [
		{ bg: 'bg-vivid-indigo/20', text: 'text-vivid-indigo', border: 'border-vivid-indigo/30' },
		{ bg: 'bg-vivid-blue/20', text: 'text-vivid-blue', border: 'border-vivid-blue/30' },
		{ bg: 'bg-vivid-violet/20', text: 'text-vivid-violet', border: 'border-vivid-violet/30' },
		{ bg: 'bg-vivid-emerald/20', text: 'text-vivid-emerald', border: 'border-vivid-emerald/30' },
		{ bg: 'bg-vivid-cyan/20', text: 'text-vivid-cyan', border: 'border-vivid-cyan/30' },
		{ bg: 'bg-vivid-amber/20', text: 'text-vivid-amber', border: 'border-vivid-amber/30' },
		{ bg: 'bg-vivid-orange/20', text: 'text-vivid-orange', border: 'border-vivid-orange/30' },
		{ bg: 'bg-vivid-rose/20', text: 'text-vivid-rose', border: 'border-vivid-rose/30' },
		{ bg: 'bg-vivid-pink/20', text: 'text-vivid-pink', border: 'border-vivid-pink/30' }
	];

	/** Deterministic hash from a string to pick a color index */
	function hashColor(str) {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
		}
		return Math.abs(hash) % VIVID_COLORS.length;
	}

	// Determine what to show
	let initial = $derived.by(() => {
		if (name) {
			const trimmed = name.trim();
			if (trimmed.length > 0) return trimmed[0].toUpperCase();
		}
		return null;
	});

	let colorIdx = $derived(hashColor(name || phone || 'unknown'));
	let color = $derived(VIVID_COLORS[colorIdx]);

	/** Which icon to show for unknown contacts */
	let unknownIcon = $derived.by(() => {
		// Explicit channel hint takes priority
		if (channel === 'call') return 'phone';
		if (channel === 'sms') return 'message';
		if (channel === 'web') return 'globe';
		// Fall back to source field
		if (source === 'inbound_call') return 'phone';
		if (source === 'website_form') return 'globe';
		if (source === 'textmagic') return 'message';
		// If we only have a phone number and no name, default to phone
		if (!name && phone) return 'phone';
		return 'user';
	});

	// Size classes
	let sizeClasses = $derived.by(() => {
		if (size === 'sm') return { container: 'h-7 w-7', text: 'text-xs', icon: 'h-3 w-3' };
		if (size === 'lg') return { container: 'h-14 w-14', text: 'text-xl', icon: 'h-6 w-6' };
		return { container: 'h-9 w-9', text: 'text-sm', icon: 'h-4 w-4' };
	});
</script>

{#if imageUrl}
	<div
		class="shrink-0 rounded-full overflow-hidden border {color.border} {sizeClasses.container} {className}"
	>
		<img src={imageUrl} alt={name || 'Contact'} class="h-full w-full object-cover" />
	</div>
{:else if initial}
	<div
		class="flex shrink-0 items-center justify-center rounded-full border font-medium {color.bg} {color.text} {color.border} {sizeClasses.container} {sizeClasses.text} {className}"
		style="font-family: var(--font-display);"
	>
		{initial}
	</div>
{:else}
	<!-- Unknown: contextual icon -->
	<div
		class="flex shrink-0 items-center justify-center rounded-full border {color.bg} {color.text} {color.border} {sizeClasses.container} {className}"
	>
		{#if unknownIcon === 'phone'}
			<Phone class={sizeClasses.icon} />
		{:else if unknownIcon === 'globe'}
			<Globe class={sizeClasses.icon} />
		{:else if unknownIcon === 'message'}
			<MessageSquare class={sizeClasses.icon} />
		{:else}
			<User class={sizeClasses.icon} />
		{/if}
	</div>
{/if}
