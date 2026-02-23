<script>
	import { Clock, ChevronLeft, ChevronRight, Pencil, X } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import {
		Sheet,
		SheetContent,
		SheetHeader,
		SheetTitle,
		SheetFooter
	} from '$lib/components/ui/sheet/index.ts';
	import { api } from '$lib/api/client.js';
	import { formatPhone, formatRelativeDate } from '$lib/utils/formatters.js';

	/**
	 * @type {{
	 *   onStatsChange: (pending: number) => void,
	 *   onError: (msg: string) => void
	 * }}
	 */
	let { onStatsChange, onError } = $props();

	/** @type {any[]} */
	let messages = $state([]);
	let loading = $state(true);
	let statusFilter = $state('pending');
	let currentPage = $state(1);
	let pageSize = 25;
	let totalCount = $state(0);

	// Edit sheet
	let sheetOpen = $state(false);
	/** @type {any|null} */
	let editingMsg = $state(null);
	let editBody = $state('');
	let editScheduledAt = $state('');
	let saving = $state(false);

	const statuses = ['pending', 'sent', 'failed', 'cancelled', 'all'];

	// Load messages when status filter changes (also fires on mount)
	$effect(() => {
		const _s = statusFilter;
		currentPage = 1;
		loadMessages();
	});

	async function loadMessages() {
		loading = true;
		try {
			const params = new URLSearchParams();
			if (statusFilter !== 'all') params.set('status', statusFilter);
			params.set('page', currentPage.toString());
			params.set('pageSize', pageSize.toString());
			const res = await api(`/api/scheduled-messages?${params}`);
			messages = res.data || [];
			totalCount = res.count || 0;
		} catch (e) {
			onError(e.message);
		} finally {
			loading = false;
		}
		// Refresh stats for badge
		loadStats();
	}

	async function loadStats() {
		try {
			const res = await api('/api/scheduled-messages/stats');
			onStatsChange(res.data?.pending || 0);
		} catch (e) {
			// Non-critical
		}
	}

	function prevPage() {
		if (currentPage > 1) {
			currentPage--;
			loadMessages();
		}
	}

	function nextPage() {
		if (currentPage * pageSize < totalCount) {
			currentPage++;
			loadMessages();
		}
	}

	function openEdit(msg) {
		editingMsg = msg;
		editBody = msg.body;
		editScheduledAt = new Date(msg.scheduled_at).toISOString().slice(0, 16);
		sheetOpen = true;
	}

	async function handleSave() {
		if (!editBody.trim() || !editScheduledAt || !editingMsg) return;
		saving = true;
		try {
			await api(`/api/scheduled-messages/${editingMsg.id}`, {
				method: 'PUT',
				body: JSON.stringify({
					body: editBody.trim(),
					scheduled_at: new Date(editScheduledAt).toISOString()
				})
			});
			sheetOpen = false;
			await loadMessages();
		} catch (e) {
			onError(e.message);
		} finally {
			saving = false;
		}
	}

	async function handleCancel(msg) {
		if (!window.confirm('Cancel this scheduled message?')) return;
		try {
			await api(`/api/scheduled-messages/${msg.id}`, { method: 'DELETE' });
			await loadMessages();
		} catch (e) {
			onError(e.message);
		}
	}

	function getStatusColor(status) {
		const colors = {
			pending: 'text-amber-400 bg-amber-400/10',
			sent: 'text-emerald-400 bg-emerald-400/10',
			failed: 'text-red-400 bg-red-400/10',
			cancelled: 'text-text-tertiary bg-surface-subtle'
		};
		return colors[status] || colors.pending;
	}

	// Auto-refresh every 30 seconds
	$effect(() => {
		const interval = setInterval(() => {
			loadMessages();
		}, 30_000);
		return () => clearInterval(interval);
	});

	const totalPages = $derived(Math.ceil(totalCount / pageSize) || 1);
</script>

<div class="h-full flex flex-col overflow-hidden">
	<!-- Header -->
	<div class="p-4 border-b border-border space-y-3">
		<p class="text-sm font-medium text-text-secondary">{totalCount} scheduled messages</p>

		<!-- Status filter pills -->
		<div class="flex flex-wrap gap-1">
			{#each statuses as status (status)}
				<button
					class="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200 capitalize {statusFilter ===
					status
						? 'bg-gold text-primary-foreground'
						: 'bg-surface-subtle text-text-secondary hover:bg-surface-hover'}"
					onclick={() => {
						statusFilter = status;
					}}
				>
					{status === 'all' ? 'All' : status}
				</button>
			{/each}
		</div>
	</div>

	<!-- List -->
	<div class="flex-1 overflow-y-auto">
		{#if loading}
			<div class="p-4 space-y-3">
				{#each Array(4) as _, i (i)}
					<Skeleton class="h-16 w-full" />
				{/each}
			</div>
		{:else if messages.length === 0}
			<div class="flex h-48 items-center justify-center">
				<div class="text-center">
					<div
						class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gold-glow border border-border"
					>
						<Clock class="h-5 w-5 empty-state-icon" />
					</div>
					<p
						class="text-sm font-light text-text-tertiary"
						style="font-family: var(--font-display);"
					>
						No scheduled messages
					</p>
					<p class="text-xs text-text-ghost mt-1">
						Schedule messages from the compose bar in the Chats tab.
					</p>
				</div>
			</div>
		{:else}
			{#each messages as msg (msg.id)}
				<div
					class="border-b border-border-subtle px-4 py-3 hover:bg-gold-glow transition-colors group"
				>
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2 mb-1">
								<span class="text-sm font-medium text-text-primary">
									{formatPhone(msg.to_number)}
								</span>
								<span
									class="text-[9px] px-1.5 py-0.5 rounded-full font-medium capitalize {getStatusColor(
										msg.status
									)}"
								>
									{msg.status}
								</span>
							</div>
							<p class="text-xs text-text-tertiary line-clamp-2 mb-1">{msg.body}</p>
							{#if msg.status === 'sent' && msg.sent_at}
								<p class="text-[10px] text-emerald-400 mb-1">
									Sent {new Date(msg.sent_at).toLocaleDateString('en-US', {
										month: 'short',
										day: 'numeric'
									})}, {new Date(msg.sent_at).toLocaleTimeString('en-US', {
										hour: 'numeric',
										minute: '2-digit'
									})}
								</p>
							{/if}
							{#if msg.status === 'failed' && msg.error_message}
								<p class="text-[10px] text-red-400 mb-1">
									{msg.error_message}
								</p>
							{/if}
							{#if msg.status === 'failed' && msg.retry_count}
								<p class="text-[10px] text-red-400/70 mb-1">
									Failed after {msg.retry_count} attempt{msg.retry_count === 1 ? '' : 's'}
								</p>
							{/if}
							<div class="flex items-center gap-2 text-[10px] text-text-ghost">
								<span>
									{new Date(msg.scheduled_at).toLocaleDateString('en-US', {
										month: 'short',
										day: 'numeric',
										hour: 'numeric',
										minute: '2-digit'
									})}
								</span>
								<span>·</span>
								<span>{formatRelativeDate(msg.scheduled_at)}</span>
								{#if msg.from_number}
									<span>·</span>
									<span class="font-mono">{formatPhone(msg.from_number)}</span>
								{/if}
							</div>
						</div>
						{#if msg.status === 'pending'}
							<div
								class="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
							>
								<button
									class="h-7 w-7 inline-flex items-center justify-center rounded-md text-text-tertiary hover:text-text-secondary hover:bg-surface-subtle transition-colors"
									title="Edit"
									onclick={() => openEdit(msg)}
								>
									<Pencil class="h-3.5 w-3.5" />
								</button>
								<button
									class="h-7 w-7 inline-flex items-center justify-center rounded-md text-text-tertiary hover:text-red-400 hover:bg-red-400/10 transition-colors"
									title="Cancel"
									onclick={() => handleCancel(msg)}
								>
									<X class="h-3.5 w-3.5" />
								</button>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		{/if}
	</div>

	<!-- Pagination -->
	{#if totalCount > pageSize}
		<div class="flex items-center justify-between px-4 py-2 border-t border-border">
			<p class="text-xs text-text-tertiary">
				Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalCount)} of {totalCount}
			</p>
			<div class="flex items-center gap-1">
				<Button size="sm" variant="outline" onclick={prevPage} disabled={currentPage <= 1}>
					<ChevronLeft class="h-4 w-4" />
				</Button>
				<span class="text-xs text-text-tertiary px-2">
					{currentPage} / {totalPages}
				</span>
				<Button size="sm" variant="outline" onclick={nextPage} disabled={currentPage >= totalPages}>
					<ChevronRight class="h-4 w-4" />
				</Button>
			</div>
		</div>
	{/if}
</div>

<!-- Edit Sheet -->
<Sheet bind:open={sheetOpen}>
	<SheetContent side="right" class="w-full sm:max-w-lg overflow-y-auto">
		<SheetHeader>
			<SheetTitle>Edit Scheduled Message</SheetTitle>
		</SheetHeader>

		{#if editingMsg}
			<div class="space-y-4 py-4">
				<div>
					<label class="text-xs font-medium text-text-secondary block mb-1.5">Recipient</label>
					<p class="text-sm text-text-primary">{formatPhone(editingMsg.to_number)}</p>
				</div>

				<div>
					<label class="text-xs font-medium text-text-secondary block mb-1.5">Send At</label>
					<input
						type="datetime-local"
						class="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:border-gold focus:outline-none"
						bind:value={editScheduledAt}
						min={new Date().toISOString().slice(0, 16)}
					/>
				</div>

				<div>
					<label class="text-xs font-medium text-text-secondary block mb-1.5">Message</label>
					<textarea
						bind:value={editBody}
						rows="5"
						class="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-gold focus:outline-none resize-none"
					></textarea>
				</div>
			</div>
		{/if}

		<SheetFooter>
			<Button
				variant="outline"
				onclick={() => {
					sheetOpen = false;
				}}>Cancel</Button
			>
			<Button
				onclick={handleSave}
				disabled={!editBody.trim() || !editScheduledAt || saving}
				class="bg-gold hover:bg-gold/80 text-primary-foreground"
			>
				{saving ? 'Saving...' : 'Update'}
			</Button>
		</SheetFooter>
	</SheetContent>
</Sheet>
