<script>
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import {
		Megaphone,
		Plus,
		Trash2,
		Send,
		Eye,
		ChevronLeft,
		Users,
		CheckCircle,
		XCircle,
		Loader2
	} from '@lucide/svelte';
	import { api } from '$lib/api/client.js';
	import { formatRelativeDate } from '$lib/utils/formatters.js';

	/** @type {{ onError: (msg: string) => void }} */
	let { onError } = $props();

	/** @type {any[]|null} */
	let broadcasts = $state(null);

	// Compose form state
	let showCompose = $state(false);
	let composeName = $state('');
	let composeBody = $state('');
	let composeFromNumber = $state('');

	/** @type {string[]} */
	let selectedTags = $state([]);
	let availableTags = $state([]);

	// Preview state
	let previewCount = $state(0);
	/** @type {Array<{name: string, phone: string}>} */
	let previewSample = $state([]);
	let previewing = $state(false);

	// Detail/progress view
	/** @type {any} */
	let selectedBroadcast = $state(null);
	let sending = $state(false);

	// Progress polling
	/** @type {ReturnType<typeof setInterval>|null} */
	let progressInterval = $state(null);

	onMount(async () => {
		await loadBroadcasts();
		await loadAvailableTags();
	});

	async function loadBroadcasts() {
		try {
			const res = await api('/api/broadcasts');
			broadcasts = res.data || [];
		} catch (e) {
			onError(e.message);
		}
	}

	async function loadAvailableTags() {
		try {
			const res = await api('/api/contacts?pageSize=1000');
			const contacts = res.data || [];
			const tagSet = new Set();
			for (const c of contacts) {
				if (c.tags) c.tags.forEach((t) => tagSet.add(t));
			}
			availableTags = [...tagSet].sort();
		} catch {
			// Non-critical
		}
	}

	async function createBroadcast() {
		if (!composeName.trim() || !composeBody.trim()) return;

		try {
			const res = await api('/api/broadcasts', {
				method: 'POST',
				body: JSON.stringify({
					name: composeName.trim(),
					body: composeBody.trim(),
					recipientFilter: selectedTags.length > 0 ? { tags: selectedTags, tags_match: 'any' } : {},
					fromNumber: composeFromNumber || undefined
				})
			});

			// Reset form
			composeName = '';
			composeBody = '';
			selectedTags = [];
			showCompose = false;

			await loadBroadcasts();

			// Auto-select the new broadcast
			if (res.data) selectBroadcast(res.data);
		} catch (e) {
			onError(e.message ?? 'Failed to create broadcast');
		}
	}

	async function deleteBroadcast(id) {
		try {
			await api(`/api/broadcasts/${id}`, { method: 'DELETE' });
			if (selectedBroadcast?.id === id) selectedBroadcast = null;
			await loadBroadcasts();
		} catch (e) {
			onError(e.message);
		}
	}

	async function selectBroadcast(bc) {
		selectedBroadcast = bc;
		if (bc.status === 'draft') {
			await previewRecipients(bc.id);
		}
		if (bc.status === 'sending') {
			startProgressPolling(bc.id);
		}
	}

	async function previewRecipients(id) {
		previewing = true;
		try {
			const res = await api(`/api/broadcasts/${id}/preview`, { method: 'POST' });
			previewCount = res.count;
			previewSample = res.sample || [];
		} catch (e) {
			onError(e.message);
		} finally {
			previewing = false;
		}
	}

	async function sendBroadcast(id) {
		sending = true;
		try {
			await api(`/api/broadcasts/${id}/send`, { method: 'POST' });
			selectedBroadcast = { ...selectedBroadcast, status: 'sending' };
			startProgressPolling(id);
			await loadBroadcasts();
		} catch (e) {
			onError(e.message);
		} finally {
			sending = false;
		}
	}

	function startProgressPolling(id) {
		stopProgressPolling();
		progressInterval = setInterval(async () => {
			try {
				const res = await api(`/api/broadcasts/${id}/status`);
				if (selectedBroadcast?.id === id) {
					selectedBroadcast = { ...selectedBroadcast, ...res.data };
				}
				if (res.data.status === 'sent' || res.data.status === 'failed') {
					stopProgressPolling();
					await loadBroadcasts();
				}
			} catch {
				stopProgressPolling();
			}
		}, 3000);
	}

	function stopProgressPolling() {
		if (progressInterval) {
			clearInterval(progressInterval);
			progressInterval = null;
		}
	}

	function toggleTag(tag) {
		if (selectedTags.includes(tag)) {
			selectedTags = selectedTags.filter((t) => t !== tag);
		} else {
			selectedTags = [...selectedTags, tag];
		}
	}

	function statusColor(status) {
		switch (status) {
			case 'draft':
				return 'text-text-tertiary';
			case 'sending':
				return 'text-vivid-amber';
			case 'sent':
				return 'text-vivid-emerald';
			case 'failed':
				return 'text-vivid-rose';
			default:
				return 'text-text-tertiary';
		}
	}
</script>

<div class="flex h-full overflow-hidden bg-card">
	<!-- Broadcast list (left) -->
	<div
		class="w-full sm:w-80 lg:w-96 border-r border-border flex flex-col shrink-0 {selectedBroadcast
			? 'hidden sm:flex'
			: 'flex'}"
	>
		<div class="p-4 border-b border-border">
			<div class="flex items-center justify-between">
				<h3 class="text-sm font-medium text-text-primary" style="font-family: var(--font-display);">
					Broadcasts
				</h3>
				<Button
					size="sm"
					onclick={() => {
						showCompose = !showCompose;
					}}
				>
					<Plus class="h-3.5 w-3.5 mr-1" />
					New
				</Button>
			</div>

			{#if showCompose}
				<div class="mt-3 space-y-2.5">
					<Input placeholder="Broadcast name..." class="h-9 text-sm" bind:value={composeName} />
					<textarea
						bind:value={composeBody}
						placeholder="Message body (use {'{{first_name}}'} for merge tags)..."
						rows="3"
						class="w-full resize-none rounded-lg border border-border-subtle bg-surface-subtle px-3 py-2 text-sm text-text-primary placeholder:text-text-ghost focus:border-gold focus:outline-none"
					></textarea>

					{#if availableTags.length > 0}
						<div>
							<p class="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
								Filter by tags
							</p>
							<div class="flex flex-wrap gap-1">
								{#each availableTags as tag (tag)}
									<button
										class="px-2 py-0.5 rounded-full text-[11px] font-medium transition-all {selectedTags.includes(
											tag
										)
											? 'bg-gold text-primary-foreground'
											: 'bg-surface-subtle text-text-secondary hover:bg-surface-hover'}"
										onclick={() => toggleTag(tag)}
									>
										{tag}
									</button>
								{/each}
							</div>
						</div>
					{/if}

					<div class="flex gap-2">
						<Button
							size="sm"
							onclick={createBroadcast}
							disabled={!composeName.trim() || !composeBody.trim()}
						>
							Create Draft
						</Button>
						<Button
							size="sm"
							variant="outline"
							onclick={() => {
								showCompose = false;
							}}
						>
							Cancel
						</Button>
					</div>
				</div>
			{/if}
		</div>

		<div class="flex-1 overflow-y-auto">
			{#if broadcasts === null}
				<div class="p-4 space-y-3">
					{#each Array(4) as _, i (i)}
						<Skeleton class="h-16 w-full" />
					{/each}
				</div>
			{:else if broadcasts.length === 0}
				<div class="flex h-48 items-center justify-center">
					<div class="text-center">
						<div
							class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gold-glow border border-border"
						>
							<Megaphone class="h-5 w-5 empty-state-icon" />
						</div>
						<p
							class="text-sm font-light text-text-tertiary"
							style="font-family: var(--font-display);"
						>
							No broadcasts
						</p>
						<p class="text-xs text-text-ghost mt-1">
							Create a broadcast to send a message to multiple contacts.
						</p>
					</div>
				</div>
			{:else}
				{#each broadcasts as bc (bc.id)}
					<button
						class="w-full text-left px-4 py-3 border-b border-border-subtle hover:bg-surface-hover transition-colors {selectedBroadcast?.id ===
						bc.id
							? 'bg-gold-glow border-l-2 border-l-gold'
							: ''}"
						onclick={() => selectBroadcast(bc)}
					>
						<div class="flex items-center justify-between">
							<p class="text-sm font-medium text-text-primary truncate">{bc.name}</p>
							<span class="text-[10px] font-medium {statusColor(bc.status)}">{bc.status}</span>
						</div>
						<p class="text-xs text-text-tertiary truncate mt-0.5">{bc.body}</p>
						<div class="flex items-center gap-2 mt-1">
							<span class="text-[10px] text-text-ghost">
								{bc.recipient_count || 0} recipients
							</span>
							<span class="text-[10px] text-text-ghost">
								{formatRelativeDate(bc.created_at)}
							</span>
						</div>
					</button>
				{/each}
			{/if}
		</div>
	</div>

	<!-- Broadcast detail (right) -->
	<div class="flex-1 flex flex-col {selectedBroadcast ? 'flex' : 'hidden sm:flex'}">
		{#if selectedBroadcast}
			<div class="px-4 py-3 border-b border-border flex items-center gap-3">
				<button
					class="sm:hidden"
					onclick={() => {
						selectedBroadcast = null;
						stopProgressPolling();
					}}
				>
					<ChevronLeft class="h-5 w-5 text-text-secondary" />
				</button>
				<div class="min-w-0 flex-1">
					<p class="text-sm font-medium text-text-primary truncate">{selectedBroadcast.name}</p>
					<span class="text-[10px] font-medium {statusColor(selectedBroadcast.status)}">
						{selectedBroadcast.status}
					</span>
				</div>
				{#if selectedBroadcast.status === 'draft'}
					<button
						class="flex items-center gap-1 text-xs text-vivid-rose/60 hover:text-vivid-rose transition-colors"
						onclick={() => deleteBroadcast(selectedBroadcast.id)}
					>
						<Trash2 class="h-3.5 w-3.5" />
						Delete
					</button>
				{/if}
			</div>

			<div class="flex-1 overflow-y-auto p-4 space-y-4">
				<!-- Message preview -->
				<div class="rounded-lg border border-border-subtle bg-surface-subtle p-3">
					<p class="text-[10px] text-text-tertiary uppercase tracking-wider mb-1.5">Message</p>
					<p class="text-sm text-text-primary whitespace-pre-wrap">{selectedBroadcast.body}</p>
				</div>

				<!-- Recipients -->
				{#if selectedBroadcast.status === 'draft'}
					<div class="rounded-lg border border-border-subtle bg-surface-subtle p-3">
						<div class="flex items-center justify-between mb-2">
							<p class="text-[10px] text-text-tertiary uppercase tracking-wider">Recipients</p>
							<Button
								size="sm"
								variant="outline"
								onclick={() => previewRecipients(selectedBroadcast.id)}
								disabled={previewing}
							>
								<Eye class="h-3 w-3 mr-1" />
								{previewing ? 'Loading...' : 'Preview'}
							</Button>
						</div>
						<p
							class="text-2xl font-semibold text-text-primary"
							style="font-family: var(--font-display);"
						>
							{previewCount}
						</p>
						{#if previewSample.length > 0}
							<div class="mt-2 space-y-1">
								{#each previewSample as contact, i (i)}
									<div class="flex items-center gap-2 text-xs text-text-secondary">
										<Users class="h-3 w-3 text-text-tertiary" />
										<span>{contact.name || 'Unknown'}</span>
										<span class="text-text-ghost font-mono">{contact.phone}</span>
									</div>
								{/each}
								{#if previewCount > 5}
									<p class="text-[10px] text-text-ghost">
										and {previewCount - 5} more...
									</p>
								{/if}
							</div>
						{/if}
					</div>

					<Button
						class="w-full"
						disabled={previewCount === 0 || sending}
						onclick={() => sendBroadcast(selectedBroadcast.id)}
					>
						<Send class="h-4 w-4 mr-1.5" />
						{sending ? 'Starting...' : `Send to ${previewCount} contacts`}
					</Button>
				{/if}

				<!-- Progress (sending/sent/failed) -->
				{#if selectedBroadcast.status === 'sending' || selectedBroadcast.status === 'sent' || selectedBroadcast.status === 'failed'}
					{@const total = selectedBroadcast.recipient_count || 1}
					{@const sent = selectedBroadcast.sent_count || 0}
					{@const failed = selectedBroadcast.failed_count || 0}
					{@const progress = Math.round(((sent + failed) / total) * 100)}
					<div class="rounded-lg border border-border-subtle bg-surface-subtle p-4">
						{#if selectedBroadcast.status === 'sending'}
							<div class="flex items-center gap-2 mb-3">
								<Loader2 class="h-4 w-4 text-vivid-amber animate-spin" />
								<span class="text-sm text-vivid-amber font-medium">Sending...</span>
							</div>
						{/if}

						<div class="w-full h-2 rounded-full bg-surface-hover mb-3">
							<div
								class="h-2 rounded-full bg-vivid-emerald transition-all duration-500"
								style="width: {progress}%"
							></div>
						</div>

						<div class="grid grid-cols-3 gap-3 text-center">
							<div>
								<p class="text-lg font-semibold text-vivid-emerald">{sent}</p>
								<p class="text-[10px] text-text-tertiary flex items-center justify-center gap-1">
									<CheckCircle class="h-3 w-3" />
									Sent
								</p>
							</div>
							<div>
								<p class="text-lg font-semibold text-vivid-rose">{failed}</p>
								<p class="text-[10px] text-text-tertiary flex items-center justify-center gap-1">
									<XCircle class="h-3 w-3" />
									Failed
								</p>
							</div>
							<div>
								<p class="text-lg font-semibold text-text-primary">{total}</p>
								<p class="text-[10px] text-text-tertiary flex items-center justify-center gap-1">
									<Users class="h-3 w-3" />
									Total
								</p>
							</div>
						</div>

						{#if selectedBroadcast.status === 'sent' && total > 0}
							<p class="text-center text-sm text-vivid-emerald mt-3 font-medium">
								{Math.round((sent / total) * 100)}% delivered
							</p>
						{/if}
					</div>
				{/if}
			</div>
		{:else}
			<div class="flex-1 flex items-center justify-center">
				<div class="text-center">
					<div
						class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-glow border border-border"
					>
						<Megaphone class="h-8 w-8 text-gold-dim" />
					</div>
					<p
						class="text-base font-light text-text-tertiary mb-1"
						style="font-family: var(--font-display);"
					>
						Select a broadcast
					</p>
					<p class="text-xs text-text-ghost">
						Choose a broadcast from the left, or create a new one.
					</p>
				</div>
			</div>
		{/if}
	</div>
</div>
