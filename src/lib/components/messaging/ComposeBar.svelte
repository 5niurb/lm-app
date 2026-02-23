<script>
	import { Send, Paperclip, X } from '@lucide/svelte';
	import EmojiPicker from './EmojiPicker.svelte';
	import TagInsert from './TagInsert.svelte';
	import TemplateInsert from './TemplateInsert.svelte';
	import SchedulePopover from './SchedulePopover.svelte';

	const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
	const ACCEPTED_TYPES = 'image/jpeg,image/png,image/gif,image/webp';

	/**
	 * @type {{
	 *   onSend: (body: string, file?: File) => Promise<void>,
	 *   onSchedule?: (body: string, scheduledAt: string) => Promise<void>,
	 *   onError?: (msg: string) => void,
	 *   disabled?: boolean,
	 *   placeholder?: string
	 * }}
	 */
	let {
		onSend,
		onSchedule,
		onError,
		disabled = false,
		placeholder = 'Type a message...'
	} = $props();

	let body = $state('');
	let sending = $state(false);

	/** @type {HTMLTextAreaElement|null} */
	let textareaRef = $state(null);

	/** @type {File|null} */
	let attachment = $state(null);

	/** @type {string|null} */
	let attachmentPreview = $state(null);

	/** @type {HTMLInputElement|null} */
	let fileInputRef = $state(null);

	/** Handle file selection from the native picker */
	function handleFileSelect(e) {
		const file = e.target?.files?.[0];
		if (!file) return;

		if (file.size > MAX_FILE_SIZE) {
			onError?.('Image must be under 5MB');
			e.target.value = '';
			return;
		}

		attachment = file;
		attachmentPreview = URL.createObjectURL(file);
		e.target.value = ''; // reset so same file can be re-selected
	}

	/** Remove the current attachment */
	function removeAttachment() {
		if (attachmentPreview) URL.revokeObjectURL(attachmentPreview);
		attachment = null;
		attachmentPreview = null;
	}

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
		if ((!trimmed && !attachment) || sending || disabled) return;
		sending = true;
		try {
			await onSend(trimmed, attachment ?? undefined);
			body = '';
			removeAttachment();
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
		<button
			type="button"
			class="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-hover hover:text-text-secondary transition-colors"
			title="Attach image"
			onclick={() => fileInputRef?.click()}
		>
			<Paperclip class="h-4 w-4" />
		</button>
		<input
			bind:this={fileInputRef}
			type="file"
			accept={ACCEPTED_TYPES}
			class="hidden"
			onchange={handleFileSelect}
		/>
		{#if onSchedule}
			<SchedulePopover onSchedule={(at) => handleSchedule(at)} />
		{/if}
	</div>

	<!-- Attachment preview -->
	{#if attachmentPreview}
		<div class="px-3 pb-1">
			<div class="relative inline-block">
				<img
					src={attachmentPreview}
					alt="Attachment preview"
					class="h-16 w-auto max-w-[120px] rounded-md object-cover border border-border-subtle"
				/>
				<button
					type="button"
					class="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-vivid-rose text-white hover:bg-vivid-rose/80 transition-colors"
					title="Remove attachment"
					onclick={removeAttachment}
				>
					<X class="h-3 w-3" />
				</button>
			</div>
		</div>
	{/if}

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
			disabled={(!body.trim() && !attachment) || sending || disabled}
			onclick={handleSend}
			title="Send message"
		>
			<Send class="h-4 w-4" />
		</button>
	</div>
</div>
