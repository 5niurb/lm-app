<script>
	import { Send } from '@lucide/svelte';
	import EmojiPicker from './EmojiPicker.svelte';
	import TagInsert from './TagInsert.svelte';
	import TemplateInsert from './TemplateInsert.svelte';
	import SchedulePopover from './SchedulePopover.svelte';

	/**
	 * @type {{
	 *   onSend: (body: string) => Promise<void>,
	 *   onSchedule?: (body: string, scheduledAt: string) => Promise<void>,
	 *   disabled?: boolean,
	 *   placeholder?: string
	 * }}
	 */
	let { onSend, onSchedule, disabled = false, placeholder = 'Type a message...' } = $props();

	let body = $state('');
	let sending = $state(false);

	/** @type {HTMLTextAreaElement|null} */
	let textareaRef = $state(null);

	/**
	 * Insert text at the current cursor position, keeping focus.
	 * @param {string} text
	 */
	function insertAtCursor(text) {
		if (!textareaRef) {
			body += text;
			return;
		}
		const start = textareaRef.selectionStart;
		const end = textareaRef.selectionEnd;
		body = body.slice(0, start) + text + body.slice(end);
		// Restore cursor after Svelte updates the DOM
		const newPos = start + text.length;
		requestAnimationFrame(() => {
			textareaRef?.setSelectionRange(newPos, newPos);
			textareaRef?.focus();
		});
	}

	async function handleSend() {
		const trimmed = body.trim();
		if (!trimmed || sending || disabled) return;
		sending = true;
		try {
			await onSend(trimmed);
			body = '';
			// Reset textarea height
			if (textareaRef) textareaRef.style.height = 'auto';
		} finally {
			sending = false;
		}
	}

	/**
	 * @param {string} scheduledAt
	 */
	async function handleSchedule(scheduledAt) {
		const trimmed = body.trim();
		if (!trimmed || !onSchedule) return;
		sending = true;
		try {
			await onSchedule(trimmed, scheduledAt);
			body = '';
			if (textareaRef) textareaRef.style.height = 'auto';
		} finally {
			sending = false;
		}
	}

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	/** Auto-resize the textarea */
	function handleInput() {
		if (!textareaRef) return;
		textareaRef.style.height = 'auto';
		textareaRef.style.height = Math.min(textareaRef.scrollHeight, 120) + 'px';
	}
</script>

<div class="border-t border-border bg-card">
	<!-- Toolbar -->
	<div class="flex items-center gap-0.5 px-3 pt-2 pb-1">
		<EmojiPicker onSelect={(emoji) => insertAtCursor(emoji)} />
		<TagInsert onInsert={(tag) => insertAtCursor(tag)} />
		<TemplateInsert
			onInsert={(tmplBody) => {
				body = tmplBody;
			}}
		/>
		{#if onSchedule}
			<SchedulePopover onSchedule={(at) => handleSchedule(at)} />
		{/if}
	</div>

	<!-- Compose area -->
	<div class="flex items-end gap-2 px-3 pb-3">
		<textarea
			bind:this={textareaRef}
			bind:value={body}
			{placeholder}
			disabled={disabled || sending}
			rows="1"
			class="flex-1 resize-none rounded-lg border border-border-subtle bg-surface-subtle px-3 py-2 text-sm text-text-primary placeholder:text-text-ghost focus:border-gold focus:outline-none disabled:opacity-50 transition-colors"
			style="min-height: 40px; max-height: 120px;"
			onkeydown={handleKeydown}
			oninput={handleInput}
		></textarea>
		<button
			type="button"
			class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold text-primary-foreground hover:bg-gold/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
			disabled={!body.trim() || sending || disabled}
			onclick={handleSend}
			title="Send message"
		>
			<Send class="h-4 w-4" />
		</button>
	</div>
</div>
