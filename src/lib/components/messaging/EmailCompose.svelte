<script>
	import { Send, ChevronUp } from '@lucide/svelte';

	/**
	 * @type {{
	 *   contactEmail?: string,
	 *   contactName?: string,
	 *   onSend: (email: { to: string, cc?: string[], bcc?: string[], subject: string, body: string }) => Promise<void>,
	 *   onCancel: () => void,
	 *   onError?: (msg: string) => void,
	 *   disabled?: boolean
	 * }}
	 */
	let {
		contactEmail = '',
		contactName = '',
		onSend,
		onCancel,
		onError,
		disabled = false
	} = $props();

	let to = $state(contactEmail);
	let subject = $state('');
	let body = $state('');
	let showCcBcc = $state(false);
	let ccText = $state('');
	let bccText = $state('');
	let sending = $state(false);

	async function handleSend() {
		if (!to.trim() || !subject.trim() || !body.trim() || sending || disabled) return;

		// Basic validation
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) {
			onError?.('Invalid email address');
			return;
		}

		sending = true;
		try {
			const cc = ccText
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
			const bcc = bccText
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);

			await onSend({
				to: to.trim(),
				...(cc.length && { cc }),
				...(bcc.length && { bcc }),
				subject: subject.trim(),
				body: body.trim()
			});

			// Reset form
			subject = '';
			body = '';
			ccText = '';
			bccText = '';
		} catch (e) {
			// Error handled by parent
		} finally {
			sending = false;
		}
	}

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			handleSend();
		}
	}
</script>

<div class="space-y-2">
	<!-- From -->
	<div class="flex items-center gap-2 text-xs">
		<span class="text-text-tertiary w-12 shrink-0">From:</span>
		<span class="text-text-secondary">Le Med Spa</span>
		<span class="text-text-ghost text-[10px]">&lt;noreply@updates.lemedspa.com&gt;</span>
	</div>

	<!-- To -->
	<div class="flex items-center gap-2">
		<span class="text-xs text-text-tertiary w-12 shrink-0">To:</span>
		<input
			type="email"
			bind:value={to}
			placeholder={contactName ? `${contactName}'s email` : 'recipient@email.com'}
			class="flex-1 rounded border border-border-subtle bg-surface-subtle px-2 py-1 text-xs text-text-primary placeholder:text-text-ghost focus:border-gold focus:outline-none"
			disabled={disabled || sending}
		/>
		<button
			type="button"
			class="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
			onclick={() => {
				showCcBcc = !showCcBcc;
			}}
		>
			{#if showCcBcc}
				<ChevronUp class="h-3 w-3" />
			{:else}
				CC/BCC
			{/if}
		</button>
	</div>

	<!-- CC/BCC -->
	{#if showCcBcc}
		<div class="flex items-center gap-2">
			<span class="text-xs text-text-tertiary w-12 shrink-0">CC:</span>
			<input
				type="text"
				bind:value={ccText}
				placeholder="Comma separated..."
				class="flex-1 rounded border border-border-subtle bg-surface-subtle px-2 py-1 text-xs text-text-primary placeholder:text-text-ghost focus:border-gold focus:outline-none"
			/>
		</div>
		<div class="flex items-center gap-2">
			<span class="text-xs text-text-tertiary w-12 shrink-0">BCC:</span>
			<input
				type="text"
				bind:value={bccText}
				placeholder="Comma separated..."
				class="flex-1 rounded border border-border-subtle bg-surface-subtle px-2 py-1 text-xs text-text-primary placeholder:text-text-ghost focus:border-gold focus:outline-none"
			/>
		</div>
	{/if}

	<!-- Subject -->
	<div class="flex items-center gap-2">
		<span class="text-xs text-text-tertiary w-12 shrink-0">Subj:</span>
		<input
			type="text"
			bind:value={subject}
			placeholder="Subject line..."
			class="flex-1 rounded border border-border-subtle bg-surface-subtle px-2 py-1 text-xs text-text-primary placeholder:text-text-ghost focus:border-gold focus:outline-none"
			disabled={disabled || sending}
		/>
	</div>

	<!-- Body -->
	<textarea
		bind:value={body}
		placeholder="Type your email..."
		rows="4"
		class="w-full resize-none rounded-lg border border-border-subtle bg-surface-subtle px-3 py-2 text-sm text-text-primary placeholder:text-text-ghost focus:border-gold focus:outline-none"
		style="min-height: 80px; max-height: 200px;"
		disabled={disabled || sending}
		onkeydown={handleKeydown}
	></textarea>

	<!-- Actions -->
	<div class="flex items-center justify-between">
		<button
			type="button"
			class="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
			onclick={onCancel}
		>
			Cancel
		</button>
		<div class="flex items-center gap-2">
			<span class="text-[10px] text-text-ghost">
				{body.length > 0 ? `${body.split(/\s+/).filter(Boolean).length} words` : ''}
			</span>
			<button
				type="button"
				class="flex items-center gap-1.5 rounded-lg bg-vivid-indigo px-3 py-1.5 text-xs font-medium text-white hover:bg-vivid-indigo/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				disabled={!to.trim() || !subject.trim() || !body.trim() || sending || disabled}
				onclick={handleSend}
			>
				<Send class="h-3.5 w-3.5" />
				{sending ? 'Sending...' : 'Send Email'}
			</button>
		</div>
	</div>
</div>
