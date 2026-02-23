<script>
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import {
		MessageSquare,
		Search,
		ArrowLeft,
		Phone,
		PhoneOutgoing,
		RefreshCw,
		ArrowDownLeft,
		ArrowUpRight,
		Check,
		CheckCheck,
		Clock,
		X,
		AlertTriangle
	} from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import { get } from 'svelte/store';
	import { session } from '$lib/stores/auth.js';
	import { PUBLIC_API_URL } from '$env/static/public';
	import { api } from '$lib/api/client.js';
	import { formatPhone, formatRelativeDate } from '$lib/utils/formatters.js';
	import ComposeBar from './ComposeBar.svelte';
	import MessageReactions from './MessageReactions.svelte';
	import ImageLightbox from './ImageLightbox.svelte';

	/**
	 * @type {{
	 *   twilioNumbers: Array<{sid: string, phoneNumber: string, friendlyName: string}>,
	 *   selectedNumber: string,
	 *   onNumberChange: (num: string) => void,
	 *   onError: (msg: string) => void
	 * }}
	 */
	let { twilioNumbers, selectedNumber, onNumberChange, onError } = $props();

	let conversations = $state(null);
	let search = $state('');

	/** @type {any} */
	let selectedConvo = $state(null);
	/** @type {any[]} */
	let messages = $state([]);
	let loadingMessages = $state(false);

	let newConvoPhone = $state('');
	let showNewConvo = $state(false);
	let newConvoDisplayName = $state('');

	let isRefreshing = false;

	// Sync state
	let syncing = $state(false);
	let syncResult = $state(null);

	// Direction filter
	/** @type {'all' | 'inbound' | 'outbound'} */
	let directionFilter = $state('all');
	/** @type {any[]|null} */
	let logMessages = $state(null);
	let loadingLog = $state(false);

	// Scheduled messages shown inline in thread
	/** @type {any[]} */
	let scheduledMsgs = $state([]);

	// Schedule success banner
	let scheduleBanner = $state('');

	// Lightbox
	/** @type {string|null} */
	let lightboxSrc = $state(null);

	// Media image cache — avoids re-fetching on re-render
	const API_BASE = PUBLIC_API_URL || 'http://localhost:3001';
	/** @type {Map<string, Promise<string>>} */
	const mediaCache = new Map();

	/**
	 * Check if a media URL is publicly accessible (Supabase Storage signed URL).
	 * Twilio URLs require auth and must go through the proxy.
	 * @param {string} url
	 * @returns {boolean}
	 */
	function isPublicMediaUrl(url) {
		return url.startsWith('https://') && url.includes('supabase.co/storage');
	}

	/**
	 * Get a renderable image URL for a message's media attachment.
	 * Public URLs (Supabase Storage) are returned directly.
	 * Twilio URLs are fetched via the proxy endpoint with auth, returning a cached blob URL.
	 * @param {string} msgId
	 * @param {number} index
	 * @param {string} url
	 * @returns {Promise<string>}
	 */
	function getMediaBlobUrl(msgId, index, url) {
		if (isPublicMediaUrl(url)) {
			return Promise.resolve(url);
		}
		const key = `${msgId}-${index}`;
		if (!mediaCache.has(key)) {
			const promise = (async () => {
				const token = get(session)?.access_token;
				const res = await fetch(`${API_BASE}/api/messages/${msgId}/media/${index}`, {
					headers: token ? { Authorization: `Bearer ${token}` } : {}
				});
				if (!res.ok) throw new Error('Failed to load media');
				const blob = await res.blob();
				return URL.createObjectURL(blob);
			})();
			mediaCache.set(key, promise);
		}
		return /** @type {Promise<string>} */ (mediaCache.get(key));
	}

	// Reactions
	const REACTION_EMOJIS = ['👍', '❤️', '😂', '❗', '❓', '💯', '🙏', '🔥', '😍'];
	/** @type {{ msgId: string, element: DOMRect, direction: string, body: string, isLast: boolean } | null} */
	let reactionTarget = $state(null);
	/** @type {ReturnType<typeof setTimeout> | null} */
	let longPressTimer = null;

	// Check URL params for ?phone=xxx from contacts page
	onMount(async () => {
		const params = new URLSearchParams(window.location.search);
		const phoneParam = params.get('phone');
		const nameParam = params.get('name');

		if (phoneParam) {
			const url = new URL(window.location.href);
			url.searchParams.delete('phone');
			url.searchParams.delete('new');
			url.searchParams.delete('name');
			window.history.replaceState({}, '', url.pathname);

			try {
				const lookup = await api(`/api/messages/lookup?phone=${encodeURIComponent(phoneParam)}`);
				if (lookup.conversation) {
					await loadConversations();
					const convo = conversations?.find((c) => c.id === lookup.conversation.id);
					if (convo) {
						selectConversation(convo);
						return;
					}
					selectConversation(lookup.conversation);
					return;
				}
				showNewConvo = true;
				newConvoPhone = phoneParam;
				if (lookup.contact?.full_name) {
					newConvoDisplayName = lookup.contact.full_name;
				} else if (nameParam) {
					newConvoDisplayName = decodeURIComponent(nameParam);
				}
			} catch (e) {
				console.error('Lookup failed:', e);
				showNewConvo = true;
				newConvoPhone = phoneParam;
				if (nameParam) newConvoDisplayName = decodeURIComponent(nameParam);
			}
		}
	});

	// Reload data when selectedNumber or directionFilter changes, manage polling
	$effect(() => {
		const _num = selectedNumber;
		const _dir = directionFilter;
		if (directionFilter === 'all') {
			loadConversations();
		} else {
			loadLog();
		}
		const id = setInterval(refreshAll, 5000);
		return () => clearInterval(id);
	});

	async function loadConversations() {
		try {
			const params = new URLSearchParams();
			if (search) params.set('search', search);
			if (selectedNumber) params.set('twilioNumber', selectedNumber);
			const res = await api(`/api/messages/conversations?${params}`);
			conversations = res.data;
			if (selectedConvo) {
				const updated = conversations?.find((c) => c.id === selectedConvo.id);
				if (updated) selectedConvo = updated;
			}
		} catch (e) {
			onError(e.message);
		}
	}

	async function loadLog() {
		loadingLog = true;
		try {
			const params = new URLSearchParams();
			params.set('direction', directionFilter);
			if (search) params.set('search', search);
			if (selectedNumber) params.set('twilioNumber', selectedNumber);
			params.set('limit', '100');
			const res = await api(`/api/messages/log?${params}`);
			logMessages = res.data;
		} catch (e) {
			onError(e.message);
		} finally {
			loadingLog = false;
		}
	}

	async function refreshAll() {
		if (isRefreshing) return;
		// Pause polling when tab is not visible
		if (document.hidden) return;
		isRefreshing = true;
		try {
			if (directionFilter === 'all') {
				await loadConversations();
			}
			if (selectedConvo) {
				const prevCount = messages.length;
				await Promise.all([
					loadMessages(selectedConvo.id),
					loadScheduledForConvo(selectedConvo.id)
				]);
				if (messages.length > prevCount) {
					setTimeout(scrollToBottom, 100);
				}
			}
		} finally {
			isRefreshing = false;
		}
	}

	function handleSearch() {
		if (directionFilter === 'all') {
			loadConversations();
		} else {
			loadLog();
		}
	}

	/** Revoke cached blob URLs to free memory */
	function clearMediaCache() {
		for (const promise of mediaCache.values()) {
			promise
				.then((url) => {
					if (url.startsWith('blob:')) URL.revokeObjectURL(url);
				})
				.catch(() => {});
		}
		mediaCache.clear();
	}

	async function selectConversation(convo) {
		clearMediaCache();
		selectedConvo = convo;
		loadingMessages = true;
		try {
			const res = await api(`/api/messages/conversations/${convo.id}`);
			messages = res.data;
			convo.unread_count = 0;
		} catch (e) {
			console.error('Failed to load messages:', e);
		} finally {
			loadingMessages = false;
		}
		loadScheduledForConvo(convo.id);
		setTimeout(scrollToBottom, 100);
	}

	/** Open conversation from a log row click */
	async function openConvoFromLog(msg) {
		// Look up conversation by phone number
		const phone = msg.direction === 'inbound' ? msg.from_number : msg.to_number;
		try {
			const lookup = await api(`/api/messages/lookup?phone=${encodeURIComponent(phone)}`);
			if (lookup.conversation) {
				directionFilter = 'all';
				await loadConversations();
				const convo = conversations?.find((c) => c.id === lookup.conversation.id);
				if (convo) selectConversation(convo);
				else selectConversation(lookup.conversation);
			}
		} catch (e) {
			console.error('Conversation lookup failed:', e);
		}
	}

	async function loadMessages(convId) {
		try {
			const res = await api(`/api/messages/conversations/${convId}`);
			messages = res.data;
		} catch (e) {
			console.error('Failed to refresh messages:', e);
		}
	}

	/**
	 * @param {string} body
	 * @param {File} [file]
	 */
	async function sendMessage(body, file) {
		try {
			const to = selectedConvo?.phone_number || newConvoPhone.trim();
			const conversationId = selectedConvo?.id || undefined;
			const from = selectedNumber || undefined;

			/** @type {RequestInit} */
			let fetchOpts;

			if (file) {
				const formData = new FormData();
				formData.append('to', to);
				if (body) formData.append('body', body);
				if (conversationId) formData.append('conversationId', conversationId);
				if (from) formData.append('from', from);
				formData.append('image', file);
				fetchOpts = { method: 'POST', body: formData };
			} else {
				fetchOpts = {
					method: 'POST',
					body: JSON.stringify({ to, body, conversationId, from })
				};
			}

			const res = await api('/api/messages/send', fetchOpts);

			if (selectedConvo) {
				await loadMessages(selectedConvo.id);
			}
			await loadConversations();

			if (!selectedConvo && res.data?.conversation_id) {
				const convo = conversations?.find((c) => c.id === res.data.conversation_id);
				if (convo) selectConversation(convo);
			}

			if (showNewConvo) {
				showNewConvo = false;
				newConvoPhone = '';
			}

			setTimeout(scrollToBottom, 100);
		} catch (e) {
			onError(e.message ?? 'Failed to send message');
			throw e; // rethrow so ComposeBar doesn't clear input
		}
	}

	/**
	 * Schedule a message for future delivery.
	 * @param {string} body
	 * @param {string} scheduledAt - ISO 8601 timestamp
	 */
	async function scheduleMessage(body, scheduledAt) {
		try {
			const to = selectedConvo?.phone_number || newConvoPhone.trim();
			const from = selectedNumber || undefined;
			const conversationId = selectedConvo?.id || undefined;

			await api('/api/scheduled-messages', {
				method: 'POST',
				body: JSON.stringify({ to, body, scheduledAt, from, conversationId })
			});

			if (selectedConvo) {
				loadScheduledForConvo(selectedConvo.id);
			}

			const dt = new Date(scheduledAt);
			const timeStr = dt.toLocaleString('en-US', {
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit'
			});
			scheduleBanner = `Message scheduled for ${timeStr}`;
			setTimeout(() => {
				scheduleBanner = '';
			}, 4000);
		} catch (e) {
			onError(e.message ?? 'Failed to schedule message');
			throw e;
		}
	}

	async function syncHistory() {
		syncing = true;
		syncResult = null;
		try {
			const payload = selectedNumber ? { phoneNumber: selectedNumber } : {};
			const res = await api('/api/twilio-history/sync', {
				method: 'POST',
				body: JSON.stringify(payload)
			});
			syncResult = res;
			await loadConversations();
		} catch (e) {
			onError(e.message);
		} finally {
			syncing = false;
		}
	}

	function scrollToBottom() {
		const container = document.getElementById('message-scroll');
		if (container) container.scrollTop = container.scrollHeight;
	}

	function goBack() {
		selectedConvo = null;
		messages = [];
		scheduledMsgs = [];
	}

	/**
	 * @param {Date} date
	 * @returns {string}
	 */
	function formatDayLabel(date) {
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		const diffDays = Math.round((today - msgDay) / 86400000);

		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Yesterday';

		const opts = { weekday: 'short', month: 'short', day: 'numeric' };
		if (date.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
		return date.toLocaleDateString('en-US', opts);
	}

	/**
	 * @param {any} msg
	 * @returns {string|null}
	 */
	function getSenderName(msg) {
		if (msg.direction !== 'outbound') return null;
		if (msg.sender?.full_name) return msg.sender.full_name;
		if (msg.sender?.email) return msg.sender.email.split('@')[0];
		if (msg.sent_by) return 'Staff';
		if (msg.metadata?.source === 'ivr') return 'IVR Auto-reply';
		return null;
	}

	/**
	 * Open the reaction bar on a message bubble.
	 * @param {MouseEvent | TouchEvent} e
	 * @param {any} msg
	 * @param {number} idx
	 */
	function openReactionBar(e, msg, idx) {
		e.preventDefault();
		const el = /** @type {HTMLElement} */ (e.currentTarget);
		const rect = el.getBoundingClientRect();
		reactionTarget = {
			msgId: msg.id,
			element: rect,
			direction: msg.direction,
			body: msg.body || '',
			isLast: idx === messages.length - 1
		};
	}

	/** @param {TouchEvent} e */
	function startLongPress(e, msg, idx) {
		longPressTimer = setTimeout(() => {
			openReactionBar(e, msg, idx);
		}, 500);
	}

	function cancelLongPress() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	// Merge real messages + pending scheduled into one timeline
	let combinedThread = $derived.by(() => {
		const real = messages.map((m) => ({ ...m, __scheduled: false }));
		const sched = scheduledMsgs.map((s) => ({
			...s,
			__scheduled: true,
			id: `sched-${s.id}`,
			_realId: s.id,
			direction: 'outbound',
			body: s.body,
			created_at: s.scheduled_at
		}));
		return [...real, ...sched];
	});

	async function loadScheduledForConvo(convId) {
		try {
			const res = await api(`/api/scheduled-messages?conversationId=${convId}&status=pending`);
			scheduledMsgs = res.data || [];
		} catch (e) {
			console.error('Failed to load scheduled messages:', e);
			scheduledMsgs = [];
		}
	}

	async function cancelScheduled(id) {
		try {
			await api(`/api/scheduled-messages/${id}`, { method: 'DELETE' });
			scheduledMsgs = scheduledMsgs.filter((s) => s.id !== id);
		} catch (e) {
			onError('Failed to cancel scheduled message');
		}
	}

	/** @param {string} emoji */
	async function handleReaction(emoji) {
		if (!reactionTarget) return;
		const { msgId } = reactionTarget;
		reactionTarget = null;

		// Optimistic update
		messages = messages.map((m) => {
			if (m.id === msgId) {
				const reactions = Array.isArray(m.reactions) ? [...m.reactions] : [];
				reactions.push({ emoji, reacted_by: 'self', created_at: new Date().toISOString() });
				return { ...m, reactions };
			}
			return m;
		});

		try {
			await api(`/api/messages/${msgId}/react`, {
				method: 'POST',
				body: JSON.stringify({ emoji })
			});
		} catch (e) {
			console.error('Failed to save reaction:', e);
			onError('Failed to send reaction');
		}
	}
</script>

<div class="flex h-full overflow-hidden bg-card">
	<!-- Conversation List / Log (left panel) -->
	<div
		class="w-full sm:w-80 lg:w-96 border-r border-border flex flex-col shrink-0 {selectedConvo
			? 'hidden sm:flex'
			: 'flex'}"
	>
		<div class="p-4 border-b border-border space-y-3">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-1.5">
					<Button
						size="sm"
						variant="outline"
						onclick={syncHistory}
						disabled={syncing}
						title="Sync message history (Twilio + TextMagic)"
					>
						<RefreshCw class="h-3.5 w-3.5 {syncing ? 'animate-spin' : ''}" />
					</Button>
					<Button
						size="sm"
						onclick={() => {
							showNewConvo = !showNewConvo;
						}}
					>
						New
					</Button>
				</div>
			</div>

			<!-- Twilio Number Selector -->
			{#if twilioNumbers.length > 1}
				<div class="flex flex-wrap gap-1">
					<button
						class="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200 {selectedNumber ===
						''
							? 'bg-gold text-primary-foreground'
							: 'bg-surface-subtle text-text-secondary hover:bg-surface-hover'}"
						onclick={() => onNumberChange('')}
					>
						All Lines
					</button>
					{#each twilioNumbers as num (num.sid)}
						<button
							class="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200 {selectedNumber ===
							num.phoneNumber
								? 'bg-gold text-primary-foreground'
								: 'bg-surface-subtle text-text-secondary hover:bg-surface-hover'}"
							onclick={() => onNumberChange(num.phoneNumber)}
							title={num.friendlyName || num.phoneNumber}
						>
							{num.friendlyName || formatPhone(num.phoneNumber)}
						</button>
					{/each}
				</div>
			{:else if twilioNumbers.length === 1}
				<p class="text-[10px] text-text-tertiary uppercase tracking-wider">
					{twilioNumbers[0].friendlyName || formatPhone(twilioNumbers[0].phoneNumber)}
				</p>
			{/if}

			<!-- Direction filter pills -->
			<div class="flex gap-1">
				{#each ['all', 'inbound', 'outbound'] as dir (dir)}
					<button
						class="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200 {directionFilter ===
						dir
							? 'bg-gold text-primary-foreground'
							: 'bg-surface-subtle text-text-secondary hover:bg-surface-hover'}"
						onclick={() => {
							directionFilter = dir;
						}}
					>
						{#if dir === 'all'}All{:else if dir === 'inbound'}↓ Inbound{:else}↑ Outbound{/if}
					</button>
				{/each}
			</div>

			{#if syncResult}
				<div class="rounded bg-gold-glow border border-border px-3 py-2">
					<p class="text-[11px] text-text-secondary">
						Synced: {syncResult.newMessages} new messages{syncResult.tmNewMessages
							? ` (${syncResult.tmNewMessages} from TextMagic)`
							: ''}, {syncResult.newCalls} new calls
					</p>
					<button
						class="text-[10px] text-text-tertiary hover:text-text-secondary mt-0.5"
						onclick={() => {
							syncResult = null;
						}}>Dismiss</button
					>
				</div>
			{/if}

			<form
				class="relative"
				onsubmit={(e) => {
					e.preventDefault();
					handleSearch();
				}}
			>
				<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
				<Input placeholder="Search conversations..." class="pl-8 h-9 text-sm" bind:value={search} />
			</form>
			{#if showNewConvo}
				<div class="flex gap-2">
					<Input
						placeholder="Phone number..."
						class="h-9 text-sm font-mono"
						bind:value={newConvoPhone}
					/>
				</div>
			{/if}
		</div>

		<div class="flex-1 overflow-y-auto">
			{#if directionFilter === 'all'}
				<!-- Conversations view -->
				{#if conversations === null}
					<div class="p-4 space-y-3">
						{#each Array(6) as _, i (i)}
							<Skeleton class="h-16 w-full" />
						{/each}
					</div>
				{:else if conversations.length === 0}
					<div class="flex h-48 items-center justify-center">
						<div class="text-center">
							<div
								class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gold-glow border border-border"
							>
								<MessageSquare class="h-5 w-5 empty-state-icon" />
							</div>
							<p
								class="text-sm font-light text-text-tertiary"
								style="font-family: 'Playfair Display', serif;"
							>
								No conversations
							</p>
							<p class="text-xs text-text-ghost mt-1">
								{#if twilioNumbers.length > 0}
									Click the sync button to import history from Twilio & TextMagic.
								{:else}
									Incoming texts and auto-replies will appear here.
								{/if}
							</p>
						</div>
					</div>
				{:else}
					{#each conversations as convo (convo.id)}
						<div
							class="group border-b border-border-subtle transition-all duration-200 hover:bg-gold-glow {selectedConvo?.id ===
							convo.id
								? 'bg-gold-glow border-l-2 border-l-gold'
								: ''}"
						>
							<button class="w-full text-left px-4 py-3" onclick={() => selectConversation(convo)}>
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-1.5">
											<p class="text-sm font-medium truncate flex items-center gap-1.5">
												{#if convo.contact_id && convo.display_name}
													<span class="text-gold text-[10px] shrink-0" title="Contact">&#9670;</span
													>
													<span class="text-text-primary truncate">{convo.display_name}</span>
												{:else if convo.display_name}
													<span class="text-text-secondary truncate">{convo.display_name}</span>
												{:else}
													<span class="text-text-primary">{formatPhone(convo.phone_number)}</span>
												{/if}
											</p>
											{#if convo.phone_number}
												<a
													href={resolve(
														`/softphone?call=${encodeURIComponent(convo.phone_number)}`
													)}
													class="shrink-0 opacity-0 group-hover:opacity-100 inline-flex items-center justify-center h-6 w-6 rounded-md border border-emerald-500/30 text-emerald-400/50 hover:bg-emerald-500/15 hover:text-emerald-400 hover:border-emerald-400 transition-all"
													title="Call {convo.display_name || formatPhone(convo.phone_number)}"
													onclick={(e) => e.stopPropagation()}
												>
													<PhoneOutgoing class="h-3 w-3" />
												</a>
											{/if}
										</div>
										{#if convo.display_name}
											<p class="text-xs text-text-tertiary">
												{formatPhone(convo.phone_number)}
											</p>
										{/if}
										<p class="text-xs text-text-tertiary truncate mt-0.5">
											{convo.last_message || 'No messages'}
										</p>
									</div>
									<div class="flex flex-col items-end gap-1 shrink-0">
										<span class="text-[10px] text-text-tertiary">
											{formatRelativeDate(convo.last_at)}
										</span>
										{#if convo.twilio_number && twilioNumbers.length > 1 && !selectedNumber}
											<span class="text-[9px] text-gold-dim font-mono">
												{formatPhone(convo.twilio_number)}
											</span>
										{/if}
										{#if convo.unread_count > 0}
											<span
												class="flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-[10px] font-bold text-primary-foreground"
											>
												{convo.unread_count}
											</span>
										{/if}
									</div>
								</div>
							</button>
						</div>
					{/each}
				{/if}
			{:else}
				<!-- Direction log view (inbound/outbound) -->
				{#if loadingLog}
					<div class="p-4 space-y-3">
						{#each Array(6) as _, i (i)}
							<Skeleton class="h-12 w-full" />
						{/each}
					</div>
				{:else if !logMessages || logMessages.length === 0}
					<div class="flex h-48 items-center justify-center">
						<div class="text-center">
							<div
								class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gold-glow border border-border"
							>
								{#if directionFilter === 'inbound'}
									<ArrowDownLeft class="h-5 w-5 empty-state-icon" />
								{:else}
									<ArrowUpRight class="h-5 w-5 empty-state-icon" />
								{/if}
							</div>
							<p
								class="text-sm font-light text-text-tertiary"
								style="font-family: 'Playfair Display', serif;"
							>
								No {directionFilter} messages
							</p>
						</div>
					</div>
				{:else}
					{#each logMessages as msg (msg.id)}
						<button
							class="w-full text-left px-4 py-2.5 border-b border-border-subtle hover:bg-gold-glow transition-colors"
							onclick={() => openConvoFromLog(msg)}
						>
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-1.5">
										{#if msg.direction === 'inbound'}
											<ArrowDownLeft class="h-3 w-3 text-emerald-400 shrink-0" />
										{:else}
											<ArrowUpRight class="h-3 w-3 text-blue-400 shrink-0" />
										{/if}
										{#if msg.conversation?.contact_id && msg.conversation?.display_name}
											<span class="text-gold text-[10px] shrink-0" title="Contact">&#9670;</span>
											<span class="text-sm font-medium text-text-primary truncate"
												>{msg.conversation.display_name}</span
											>
										{:else if msg.conversation?.display_name}
											<span class="text-sm font-medium text-text-secondary truncate"
												>{msg.conversation.display_name}</span
											>
										{:else}
											<span class="text-sm font-medium text-text-primary truncate">
												{formatPhone(msg.direction === 'inbound' ? msg.from_number : msg.to_number)}
											</span>
										{/if}
									</div>
									{#if msg.conversation?.display_name}
										<p class="text-[10px] text-text-tertiary font-mono truncate mt-0.5">
											{formatPhone(msg.direction === 'inbound' ? msg.from_number : msg.to_number)}
										</p>
									{/if}
									<p class="text-xs text-text-tertiary truncate mt-0.5">
										{msg.body || '(no content)'}
									</p>
								</div>
								<span class="text-[10px] text-text-tertiary shrink-0">
									{formatRelativeDate(msg.created_at)}
								</span>
							</div>
						</button>
					{/each}
				{/if}
			{/if}
		</div>
	</div>

	<!-- Message Thread (right panel) -->
	<div class="flex-1 flex flex-col {selectedConvo || showNewConvo ? 'flex' : 'hidden sm:flex'}">
		{#if selectedConvo}
			<!-- Thread header -->
			<div class="px-4 py-3 border-b border-border flex items-center gap-3">
				<button class="sm:hidden" onclick={goBack}>
					<ArrowLeft class="h-5 w-5 text-text-secondary" />
				</button>
				<div class="min-w-0">
					<p class="text-sm font-medium truncate flex items-center gap-1.5">
						{#if selectedConvo.contact_id && selectedConvo.display_name}
							<span class="text-gold text-[10px] shrink-0" title="Contact">&#9670;</span>
							<span class="text-text-primary truncate">{selectedConvo.display_name}</span>
						{:else if selectedConvo.display_name}
							<span class="text-text-secondary truncate">{selectedConvo.display_name}</span>
						{:else}
							<span class="text-text-primary">{formatPhone(selectedConvo.phone_number)}</span>
						{/if}
					</p>
					{#if selectedConvo.display_name}
						<p class="text-xs text-text-tertiary">
							{formatPhone(selectedConvo.phone_number)}
						</p>
					{/if}
					{#if selectedConvo.twilio_number}
						<p class="text-[10px] text-gold-dim">
							via {formatPhone(selectedConvo.twilio_number)}
						</p>
					{/if}
				</div>
				<div class="flex items-center gap-1.5 shrink-0 ml-auto">
					<a
						href={resolve(`/softphone?call=${encodeURIComponent(selectedConvo.phone_number)}`)}
						class="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-emerald-500/30 text-emerald-400/50 hover:bg-emerald-500/15 hover:text-emerald-400 hover:border-emerald-400 transition-all"
						title="Call {selectedConvo.display_name || formatPhone(selectedConvo.phone_number)}"
					>
						<PhoneOutgoing class="h-4 w-4" />
					</a>
					<a
						href={resolve(`/calls?search=${encodeURIComponent(selectedConvo.phone_number)}`)}
						class="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border-default text-text-tertiary hover:bg-surface-subtle hover:text-text-secondary hover:border-border-default transition-all"
						title="View call history"
					>
						<Phone class="h-4 w-4" />
					</a>
				</div>
			</div>

			<!-- Messages -->
			<div id="message-scroll" class="flex-1 overflow-y-auto p-4 space-y-3">
				{#if loadingMessages}
					<div class="space-y-3">
						{#each Array(5) as _, i (i)}
							<Skeleton class="h-10 w-3/4" />
						{/each}
					</div>
				{:else if messages.length === 0}
					<div class="flex h-full items-center justify-center">
						<p class="text-sm text-text-tertiary">No messages in this conversation yet.</p>
					</div>
				{:else}
					{#each messages as msg, i (msg.id)}
						{@const senderName = getSenderName(msg)}
						{@const msgDate = new Date(msg.created_at)}
						{@const prevDate = i > 0 ? new Date(messages[i - 1].created_at) : null}
						{@const showDaySep = !prevDate || msgDate.toDateString() !== prevDate.toDateString()}
						{#if showDaySep}
							<div class="flex items-center gap-3 py-1">
								<div class="flex-1 h-px bg-border"></div>
								<span
									class="text-[10px] text-text-tertiary font-medium uppercase tracking-wider shrink-0"
								>
									{formatDayLabel(msgDate)}
								</span>
								<div class="flex-1 h-px bg-border"></div>
							</div>
						{/if}
						<div class="flex {msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}">
							<div class="relative group">
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="max-w-full rounded-2xl px-4 py-2.5 select-none {msg.direction ===
									'outbound'
										? 'bg-gold text-primary-foreground rounded-br-md'
										: 'bg-surface-raised border border-border text-text-primary rounded-bl-md'}"
									oncontextmenu={(e) => openReactionBar(e, msg, i)}
									ontouchstart={(e) => startLongPress(e, msg, i)}
									ontouchend={cancelLongPress}
									ontouchmove={cancelLongPress}
								>
									{#if senderName}
										<p
											class="text-[10px] font-medium mb-0.5 {msg.direction === 'outbound'
												? 'text-primary-foreground/60'
												: 'text-gold-dim'}"
										>
											{senderName}
										</p>
									{/if}
									{#if msg.body}
										<p class="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
									{/if}
									{#if msg.media_urls?.length > 0}
										<div class="flex flex-wrap gap-1.5 {msg.body ? 'mt-1.5' : ''}">
											{#each msg.media_urls as mediaUrl, idx}
												{#await getMediaBlobUrl(msg.id, idx, mediaUrl)}
													<div
														class="w-[240px] h-[160px] rounded-lg bg-surface-subtle animate-pulse"
													></div>
												{:then blobUrl}
													<button
														class="block"
														onclick={() => {
															lightboxSrc = blobUrl;
														}}
													>
														<img
															src={blobUrl}
															alt="Attached photo"
															class="max-w-[240px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
														/>
													</button>
												{:catch}
													<div
														class="w-[240px] h-[100px] rounded-lg bg-surface-subtle border border-border flex items-center justify-center"
													>
														<span class="text-xs text-text-tertiary">Image unavailable</span>
													</div>
												{/await}
											{/each}
										</div>
									{/if}
									<p
										class="text-[10px] mt-1 flex items-center gap-1 {msg.direction === 'outbound'
											? 'text-primary-foreground/50'
											: 'text-text-ghost'}"
									>
										<span>
											{new Date(msg.created_at).toLocaleTimeString('en-US', {
												hour: 'numeric',
												minute: '2-digit'
											})}
										</span>
										{#if msg.direction === 'outbound'}
											{#if msg.status === 'queued' || msg.status === 'accepted'}
												<Clock class="h-3 w-3 text-white/60" />
											{:else if msg.status === 'sending' || msg.status === 'sent'}
												<Check class="h-3 w-3 text-white/80" />
											{:else if msg.status === 'delivered' || msg.status === 'read'}
												<CheckCheck class="h-3 w-3 text-emerald-300" />
											{:else if msg.status === 'failed'}
												<X class="h-3 w-3 text-red-300" />
											{:else if msg.status === 'undelivered'}
												<AlertTriangle class="h-3 w-3 text-orange-300" />
											{/if}
										{/if}
										{#if msg.metadata?.source === 'auto_reply'}
											<span
												class="inline-flex items-center rounded-full px-1.5 py-px text-[9px] font-medium bg-white/15 text-primary-foreground/60"
											>
												Auto
											</span>
										{/if}
									</p>
								</div>
								{#if msg.reactions?.length > 0}
									<div
										class="flex gap-0.5 mt-[-6px] {msg.direction === 'outbound'
											? 'justify-end pr-2'
											: 'justify-start pl-2'}"
									>
										{#each [...new Set(msg.reactions.map((r) => r.emoji))] as emoji (emoji)}
											{@const count = msg.reactions.filter((r) => r.emoji === emoji).length}
											<span
												class="inline-flex items-center gap-0.5 rounded-full bg-surface-raised border border-border px-1.5 py-0.5 text-xs shadow-sm"
											>
												{emoji}{#if count > 1}<span class="text-[9px] text-text-tertiary"
														>{count}</span
													>{/if}
											</span>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					{/each}
				{/if}
			</div>

			<!-- Schedule success banner -->
			{#if scheduleBanner}
				<div
					class="px-4 py-2 bg-emerald-500/10 border-t border-emerald-500/20 text-emerald-400 text-xs text-center"
				>
					{scheduleBanner}
				</div>
			{/if}

			<!-- Compose -->
			<ComposeBar
				onSend={sendMessage}
				onSchedule={scheduleMessage}
				{onError}
				placeholder="Type a message..."
			/>
		{:else if showNewConvo}
			<!-- New conversation compose view -->
			<div class="flex-1 flex flex-col">
				<div class="flex-1 flex flex-col items-center justify-center p-8">
					<MessageSquare class="h-12 w-12 text-gold-dim mb-4" />
					{#if newConvoDisplayName}
						<p
							class="text-base font-medium text-text-primary mb-1"
							style="font-family: 'Playfair Display', serif;"
						>
							{newConvoDisplayName}
						</p>
						<p class="text-xs text-text-tertiary mb-6">{formatPhone(newConvoPhone)}</p>
					{:else}
						<p class="text-sm text-text-secondary mb-6">
							Enter a phone number and message to start a new conversation.
						</p>
					{/if}
					<div class="w-full max-w-md space-y-3">
						{#if !newConvoDisplayName}
							<Input
								placeholder="Phone number (e.g. 8184633772)..."
								class="text-center font-mono"
								bind:value={newConvoPhone}
							/>
						{/if}
						{#if twilioNumbers.length > 1 && !selectedNumber}
							<div class="flex items-center justify-center gap-1.5">
								<span class="text-[10px] text-text-tertiary uppercase tracking-wider"
									>Send from:</span
								>
								{#each twilioNumbers as num (num.sid)}
									<button
										class="px-2 py-0.5 rounded text-[10px] font-mono transition-all {selectedNumber ===
										num.phoneNumber
											? 'bg-gold text-primary-foreground'
											: 'bg-surface-subtle text-text-tertiary hover:bg-surface-hover'}"
										onclick={() => onNumberChange(num.phoneNumber)}
									>
										{formatPhone(num.phoneNumber)}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>
				<ComposeBar
					onSend={sendMessage}
					onSchedule={scheduleMessage}
					{onError}
					placeholder="Type a message..."
					disabled={!newConvoPhone.trim()}
				/>
			</div>
		{:else}
			<!-- Empty state -->
			<div class="flex-1 flex items-center justify-center relative">
				<div
					class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--gold-glow)_0%,_transparent_60%)]"
				></div>
				<div class="text-center relative z-10">
					<div
						class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-glow border border-border"
					>
						<MessageSquare class="h-8 w-8 text-gold-dim" />
					</div>
					<p
						class="text-base font-light text-text-tertiary mb-1"
						style="font-family: 'Playfair Display', serif;"
					>
						No conversation selected
					</p>
					<p class="text-xs text-text-ghost">
						Choose a conversation from the left, or start a new one.
					</p>
					<button
						class="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-gold border border-border hover:bg-gold-glow transition-colors"
						onclick={() => {
							showNewConvo = true;
						}}
					>
						<MessageSquare class="h-3.5 w-3.5" />
						New conversation
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>

{#if reactionTarget}
	<MessageReactions
		reactions={REACTION_EMOJIS}
		anchorRect={reactionTarget.element}
		direction={reactionTarget.direction}
		onReact={handleReaction}
		onDismiss={() => {
			reactionTarget = null;
		}}
	/>
{/if}

{#if lightboxSrc}
	<ImageLightbox
		src={lightboxSrc}
		onClose={() => {
			lightboxSrc = null;
		}}
	/>
{/if}
