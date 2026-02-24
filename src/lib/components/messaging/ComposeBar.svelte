<script>
	import { Send, Paperclip, X, StickyNote, Sparkles, Mail } from '@lucide/svelte';
	import EmojiPicker from './EmojiPicker.svelte';
	import TemplateInsert from './TemplateInsert.svelte';
	import SchedulePopover from './SchedulePopover.svelte';
	import EmailCompose from './EmailCompose.svelte';

	const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
	const ACCEPTED_TYPES = 'image/jpeg,image/png,image/gif,image/webp';

	/**
	 * @type {{
	 *   onSend: (body: string, file?: File) => Promise<void>,
	 *   onSchedule?: (body: string, scheduledAt: string) => Promise<void>,
	 *   onNote?: (body: string) => Promise<void>,
	 *   onSendEmail?: (email: { to: string, cc?: string[], bcc?: string[], subject: string, body: string }) => Promise<void>,
	 *   onAiSuggest?: () => void,
	 *   setBody?: (text: string) => void,
	 *   onError?: (msg: string) => void,
	 *   contactEmail?: string,
	 *   contactName?: string,
	 *   disabled?: boolean,
	 *   placeholder?: string
	 * }}
	 */
	let {
		onSend,
		onSchedule,
		onNote,
		onSendEmail,
		onAiSuggest,
		onError,
		contactEmail = '',
		contactName = '',
		disabled = false,
		placeholder = 'Type a message...'
	} = $props();

	/** @type {'sms' | 'email' | 'note'} */
	let composeMode = $state('sms');
	let noteMode = $derived(composeMode === 'note');

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
		if (!trimmed || sending || disabled) return;

		// Route to note handler in note mode
		if (noteMode && onNote) {
			sending = true;
			try {
				await onNote(trimmed);
				body = '';
				if (textareaRef) textareaRef.style.height = 'auto';
				// Stay in note mode after submission
			} finally {
				sending = false;
			}
			return;
		}

		if (!trimmed && !attachment) return;
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

	/**
	 * Set the compose body from outside (e.g. AI suggestion insert).
	 * @param {string} text
	 */
	export function setBody(text) {
		body = text;
		requestAnimationFrame(() => {
			if (textareaRef) {
				textareaRef.style.height = 'auto';
				textareaRef.style.height = Math.min(textareaRef.scrollHeight, 120) + 'px';
				textareaRef.focus();
			}
		});
	}
</script>

<div class="border-t section-border-gold bg-card">
	{#if composeMode === 'email'}
		<!-- Email compose form -->
		<div class="px-3 pt-3 pb-3">
			<EmailCompose
				{contactEmail}
				{contactName}
				onSend={async (email) => {
					await onSendEmail?.(email);
					composeMode = 'sms';
				}}
				onCancel={() => {
					composeMode = 'sms';
				}}
				{onError}
				{disabled}
			/>
		</div>
	{:else}
		<!-- Toolbar -->
		<div class="flex items-center gap-0.5 px-3 pt-2 pb-1">
			<EmojiPicker onSelect={(emoji) => insertAtCursor(emoji)} />
			<TemplateInsert
				onInsert={(tmplBody) => {
					body = tmplBody;
				}}
			/>
			{#if !noteMode}
				<button
					type="button"
					class="flex h-8 w-8 items-center justify-center rounded-md text-vivid-emerald/70 hover:bg-surface-hover hover:text-vivid-emerald transition-colors"
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
				{#if onAiSuggest}
					<button
						type="button"
						class="flex h-8 w-8 items-center justify-center rounded-md text-vivid-violet/70 hover:bg-surface-hover hover:text-vivid-violet transition-colors"
						title="Generate with AI"
						onclick={() => onAiSuggest?.()}
					>
						<Sparkles class="h-4 w-4" />
					</button>
				{/if}
			{/if}
			<!-- Mode tabs -->
			<div class="ml-auto flex items-center gap-1">
				{#if onSendEmail}
					<button
						type="button"
						class="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors text-text-tertiary hover:bg-surface-hover hover:text-text-secondary"
						title="Compose email"
						onclick={() => {
							composeMode = 'email';
							removeAttachment();
						}}
					>
						<Mail class="h-3.5 w-3.5" />
						Email
					</button>
				{/if}
				{#if onNote}
					<button
						type="button"
						class="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors {composeMode ===
						'note'
							? 'bg-amber-400/15 text-amber-300 border border-amber-400/30'
							: 'text-text-tertiary hover:bg-surface-hover hover:text-text-secondary'}"
						title={noteMode ? 'Switch to SMS' : 'Switch to internal note'}
						onclick={() => {
							composeMode = composeMode === 'note' ? 'sms' : 'note';
							if (composeMode === 'note') removeAttachment();
						}}
					>
						<StickyNote class="h-3.5 w-3.5" />
						Note
					</button>
				{/if}
			</div>
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
				placeholder={noteMode ? 'Type your internal note' : placeholder}
				disabled={disabled || sending}
				rows="1"
				class="flex-1 resize-none rounded-lg border px-3 py-2 text-sm text-text-primary placeholder:text-text-ghost focus:outline-none disabled:opacity-50 transition-colors {noteMode
					? 'bg-[rgba(255,248,225,0.08)] border-[rgba(255,248,225,0.2)] focus:border-amber-400/50'
					: 'border-border-subtle bg-surface-subtle focus:border-gold'}"
				style="min-height: 40px; max-height: 120px;"
				onkeydown={handleKeydown}
				oninput={handleInput}
			></textarea>
			{#if noteMode}
				<button
					type="button"
					class="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-amber-400/20 px-3 text-sm font-medium text-amber-300 hover:bg-amber-400/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					disabled={!body.trim() || sending || disabled}
					onclick={handleSend}
					title="Add internal note"
				>
					<StickyNote class="h-4 w-4" />
					Add note
				</button>
			{:else}
				<button
					type="button"
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold text-primary-foreground hover:bg-gold/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					disabled={(!body.trim() && !attachment) || sending || disabled}
					onclick={handleSend}
					title="Send message"
				>
					<Send class="h-4 w-4" />
				</button>
			{/if}
		</div>
	{/if}
</div>
