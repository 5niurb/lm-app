<script>
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import { MessageSquare, Search, Send, ArrowLeft, Phone, PhoneOutgoing } from '@lucide/svelte';
	import { api } from '$lib/api/client.js';
	import { formatPhone, formatRelativeDate } from '$lib/utils/formatters.js';

	let conversations = $state(null);
	let search = $state('');
	let error = $state('');

	/** @type {any} Currently selected conversation */
	let selectedConvo = $state(null);
	/** @type {any[]} Messages for selected conversation */
	let messages = $state([]);
	let loadingMessages = $state(false);

	/** @type {string} New message text */
	let newMessage = $state('');
	let sending = $state(false);

	/** @type {string} New conversation phone number */
	let newConvoPhone = $state('');
	let showNewConvo = $state(false);

	/** @type {string} Display name for new conversation (from contact lookup) */
	let newConvoDisplayName = $state('');

	/** @type {number|null} Auto-refresh interval */
	let refreshInterval = null;

	// Check URL params for ?phone=xxx&new=true (from contacts page quick action)
	onMount(async () => {
		const params = new URLSearchParams(window.location.search);
		const phoneParam = params.get('phone');
		const nameParam = params.get('name');

		if (phoneParam) {
			// Clean URL params
			const url = new URL(window.location.href);
			url.searchParams.delete('phone');
			url.searchParams.delete('new');
			url.searchParams.delete('name');
			window.history.replaceState({}, '', url.pathname);

			try {
				// Look up existing conversation or contact
				const lookup = await api(`/api/messages/lookup?phone=${encodeURIComponent(phoneParam)}`);

				if (lookup.conversation) {
					// Existing conversation found — load conversations first, then select it
					await loadConversations();
					const convo = conversations?.find((c) => c.id === lookup.conversation.id);
					if (convo) {
						selectConversation(convo);
						return;
					}
					// If not in the loaded list (e.g. archived), select from lookup directly
					selectConversation(lookup.conversation);
					return;
				}

				// No existing conversation — open new compose
				showNewConvo = true;
				newConvoPhone = phoneParam;

				// Use contact name from lookup, URL param, or leave blank
				if (lookup.contact?.full_name) {
					newConvoDisplayName = lookup.contact.full_name;
				} else if (nameParam) {
					newConvoDisplayName = decodeURIComponent(nameParam);
				}
			} catch (e) {
				// Fallback: just open new compose with the phone number
				console.error('Lookup failed:', e);
				showNewConvo = true;
				newConvoPhone = phoneParam;
				if (nameParam) newConvoDisplayName = decodeURIComponent(nameParam);
			}
		}
	});

	$effect(() => {
		loadConversations();
		// Poll for new messages every 5 seconds
		refreshInterval = setInterval(refreshAll, 5000);
		return () => { if (refreshInterval) clearInterval(refreshInterval); };
	});

	async function refreshAll() {
		await loadConversations();
		// If viewing a thread, refresh messages too
		if (selectedConvo) {
			const prevCount = messages.length;
			await loadMessages(selectedConvo.id);
			// Auto-scroll if new messages arrived
			if (messages.length > prevCount) {
				setTimeout(scrollToBottom, 100);
			}
		}
	}

	async function loadConversations() {
		try {
			const params = new URLSearchParams();
			if (search) params.set('search', search);
			const res = await api(`/api/messages/conversations?${params}`);
			conversations = res.data;
			// Keep selectedConvo in sync with refreshed data
			if (selectedConvo) {
				const updated = conversations?.find(c => c.id === selectedConvo.id);
				if (updated) selectedConvo = updated;
			}
		} catch (e) {
			error = e.message;
		}
	}

	function handleSearch() {
		loadConversations();
	}

	async function selectConversation(convo) {
		selectedConvo = convo;
		loadingMessages = true;
		try {
			const res = await api(`/api/messages/conversations/${convo.id}`);
			messages = res.data;
			// Mark as read locally
			convo.unread_count = 0;
		} catch (e) {
			console.error('Failed to load messages:', e);
		} finally {
			loadingMessages = false;
		}
		// Scroll to bottom
		setTimeout(scrollToBottom, 100);
	}

	async function loadMessages(convId) {
		try {
			const res = await api(`/api/messages/conversations/${convId}`);
			messages = res.data;
		} catch (e) {
			console.error('Failed to refresh messages:', e);
		}
	}

	async function sendMessage() {
		if (!newMessage.trim()) return;
		if (!selectedConvo && !newConvoPhone.trim()) return;

		sending = true;
		try {
			const payload = {
				body: newMessage.trim(),
				to: selectedConvo?.phone_number || newConvoPhone.trim(),
				conversationId: selectedConvo?.id || undefined
			};

			const res = await api('/api/messages/send', {
				method: 'POST',
				body: JSON.stringify(payload)
			});

			newMessage = '';

			// Reload messages and conversations
			if (selectedConvo) {
				await loadMessages(selectedConvo.id);
			}
			await loadConversations();

			// If this was a new conversation, select it
			if (!selectedConvo && res.data?.conversation_id) {
				const convo = conversations?.find(c => c.id === res.data.conversation_id);
				if (convo) selectConversation(convo);
			}

			if (showNewConvo) {
				showNewConvo = false;
				newConvoPhone = '';
			}

			setTimeout(scrollToBottom, 100);
		} catch (e) {
			error = e.message;
		} finally {
			sending = false;
		}
	}

	function scrollToBottom() {
		const container = document.getElementById('message-scroll');
		if (container) container.scrollTop = container.scrollHeight;
	}

	function goBack() {
		selectedConvo = null;
		messages = [];
	}
</script>

<svelte:head>
	<title>Messages — Le Med Spa</title>
</svelte:head>

<div class="flex h-[calc(100vh-4rem)] overflow-hidden -m-6">
	<!-- Conversation List (left panel) -->
	<div class="w-full sm:w-80 lg:w-96 border-r border-[rgba(197,165,90,0.12)] flex flex-col shrink-0 {selectedConvo ? 'hidden sm:flex' : 'flex'}">
		<div class="p-4 border-b border-[rgba(197,165,90,0.08)] space-y-3">
			<div class="flex items-center justify-between">
				<h1 class="text-xl tracking-wide">Messages</h1>
				<Button size="sm" onclick={() => { showNewConvo = !showNewConvo; }}>
					New
				</Button>
			</div>
			<form class="relative" onsubmit={(e) => { e.preventDefault(); handleSearch(); }}>
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
			{#if conversations === null}
				<div class="p-4 space-y-3">
					{#each Array(6) as _}
						<Skeleton class="h-16 w-full" />
					{/each}
				</div>
			{:else if conversations.length === 0}
				<div class="flex h-48 items-center justify-center">
					<div class="text-center">
						<div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[rgba(197,165,90,0.05)] border border-[rgba(197,165,90,0.08)]">
							<MessageSquare class="h-5 w-5 empty-state-icon" />
						</div>
						<p class="text-sm font-light text-[rgba(255,255,255,0.4)]" style="font-family: 'Playfair Display', serif;">No conversations</p>
						<p class="text-xs text-[rgba(255,255,255,0.2)] mt-1">Incoming texts and auto-replies will appear here.</p>
					</div>
				</div>
			{:else}
				{#each conversations as convo}
					<div class="group border-b border-[rgba(197,165,90,0.06)] transition-all duration-200 hover:bg-[rgba(197,165,90,0.06)] {selectedConvo?.id === convo.id ? 'bg-[rgba(197,165,90,0.1)] border-l-2 border-l-[#C5A55A]' : ''}">
						<button
							class="w-full text-left px-4 py-3"
							onclick={() => selectConversation(convo)}
						>
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-1.5">
										<p class="text-sm font-medium truncate flex items-center gap-1.5">
											{#if convo.contact_id && convo.display_name}
												<span class="text-[#C5A55A] text-[10px] shrink-0" title="Contact">◆</span>
												<span class="text-[rgba(255,255,255,0.9)] truncate">{convo.display_name}</span>
											{:else if convo.display_name}
												<span class="text-[rgba(255,255,255,0.7)] truncate">{convo.display_name}</span>
											{:else}
												<span class="text-[rgba(255,255,255,0.85)]">{formatPhone(convo.phone_number)}</span>
											{/if}
										</p>
										<!-- Quick call action — right next to name, visible on hover -->
										{#if convo.phone_number}
											<a
												href="/softphone?call={encodeURIComponent(convo.phone_number)}"
												class="shrink-0 opacity-0 group-hover:opacity-100 inline-flex items-center justify-center h-6 w-6 rounded-md border border-emerald-500/30 text-emerald-400/50 hover:bg-emerald-500/15 hover:text-emerald-400 hover:border-emerald-400 transition-all"
												title="Call {convo.display_name || formatPhone(convo.phone_number)}"
												onclick={(e) => e.stopPropagation()}
											>
												<PhoneOutgoing class="h-3 w-3" />
											</a>
										{/if}
									</div>
									{#if convo.display_name}
										<p class="text-xs text-[rgba(255,255,255,0.35)]">{formatPhone(convo.phone_number)}</p>
									{/if}
									<p class="text-xs text-[rgba(255,255,255,0.4)] truncate mt-0.5">
										{convo.last_message || 'No messages'}
									</p>
								</div>
								<div class="flex flex-col items-end gap-1 shrink-0">
									<span class="text-[10px] text-[rgba(255,255,255,0.3)]">
										{formatRelativeDate(convo.last_at)}
									</span>
									{#if convo.unread_count > 0}
										<span class="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C5A55A] px-1.5 text-[10px] font-bold text-[#1A1A1A]">
											{convo.unread_count}
										</span>
									{/if}
								</div>
							</div>
						</button>
					</div>
				{/each}
			{/if}
		</div>
	</div>

	<!-- Message Thread (right panel) -->
	<div class="flex-1 flex flex-col {selectedConvo || showNewConvo ? 'flex' : 'hidden sm:flex'}">
		{#if selectedConvo}
			<!-- Thread header -->
			<div class="px-4 py-3 border-b border-[rgba(197,165,90,0.12)] flex items-center gap-3">
				<button class="sm:hidden" onclick={goBack}>
					<ArrowLeft class="h-5 w-5 text-[rgba(255,255,255,0.6)]" />
				</button>
				<div class="min-w-0">
					<p class="text-sm font-medium truncate flex items-center gap-1.5">
						{#if selectedConvo.contact_id && selectedConvo.display_name}
							<span class="text-[#C5A55A] text-[10px] shrink-0" title="Contact">◆</span>
							<span class="text-[rgba(255,255,255,0.9)] truncate">{selectedConvo.display_name}</span>
						{:else if selectedConvo.display_name}
							<span class="text-[rgba(255,255,255,0.7)] truncate">{selectedConvo.display_name}</span>
						{:else}
							<span class="text-[rgba(255,255,255,0.85)]">{formatPhone(selectedConvo.phone_number)}</span>
						{/if}
					</p>
					{#if selectedConvo.display_name}
						<p class="text-xs text-[rgba(255,255,255,0.35)]">{formatPhone(selectedConvo.phone_number)}</p>
					{/if}
				</div>
				<div class="flex items-center gap-1.5 shrink-0">
					<a
						href="/softphone?call={encodeURIComponent(selectedConvo.phone_number)}"
						class="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-emerald-500/30 text-emerald-400/50 hover:bg-emerald-500/15 hover:text-emerald-400 hover:border-emerald-400 transition-all"
						title="Call {selectedConvo.display_name || formatPhone(selectedConvo.phone_number)}"
					>
						<PhoneOutgoing class="h-4 w-4" />
					</a>
					<a
						href="/calls?search={encodeURIComponent(selectedConvo.phone_number)}"
						class="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.35)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[rgba(255,255,255,0.6)] hover:border-[rgba(255,255,255,0.2)] transition-all"
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
						{#each Array(5) as _}
							<Skeleton class="h-10 w-3/4" />
						{/each}
					</div>
				{:else if messages.length === 0}
					<div class="flex h-full items-center justify-center">
						<p class="text-sm text-[rgba(255,255,255,0.3)]">No messages in this conversation yet.</p>
					</div>
				{:else}
					{#each messages as msg}
						<div class="flex {msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}">
							<div class="max-w-[75%] rounded-2xl px-4 py-2.5 {msg.direction === 'outbound'
								? 'bg-[#C5A55A] text-[#1A1A1A] rounded-br-md'
								: 'bg-[rgba(255,255,255,0.08)] border border-[rgba(197,165,90,0.12)] text-[rgba(255,255,255,0.85)] rounded-bl-md'
							}">
								<p class="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
								<p class="text-[10px] mt-1 {msg.direction === 'outbound' ? 'text-[rgba(26,26,26,0.5)]' : 'text-[rgba(255,255,255,0.25)]'}">
									{new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
									{#if msg.status === 'delivered'}
										&middot; Delivered
									{:else if msg.status === 'failed'}
										&middot; <span class="text-red-400">Failed</span>
									{/if}
								</p>
							</div>
						</div>
					{/each}
				{/if}
			</div>

			<!-- Compose -->
			<div class="p-3 border-t border-[rgba(197,165,90,0.12)]">
				<form class="flex gap-2" onsubmit={(e) => { e.preventDefault(); sendMessage(); }}>
					<Input
						placeholder="Type a message..."
						class="flex-1"
						bind:value={newMessage}
						disabled={sending}
					/>
					<Button
						type="submit"
						disabled={!newMessage.trim() || sending}
						class="bg-[#C5A55A] hover:bg-[#b8943e] text-[#1A1A1A]"
					>
						<Send class="h-4 w-4" />
					</Button>
				</form>
			</div>
		{:else if showNewConvo}
			<!-- New conversation compose view -->
			<div class="flex-1 flex flex-col items-center justify-center p-8">
				<MessageSquare class="h-12 w-12 text-[rgba(197,165,90,0.3)] mb-4" />
				{#if newConvoDisplayName}
					<p class="text-base font-medium text-[rgba(255,255,255,0.85)] mb-1" style="font-family: 'Playfair Display', serif;">{newConvoDisplayName}</p>
					<p class="text-xs text-[rgba(255,255,255,0.4)] mb-6">{formatPhone(newConvoPhone)}</p>
				{:else}
					<p class="text-sm text-[rgba(255,255,255,0.5)] mb-6">Enter a phone number and message to start a new conversation.</p>
				{/if}
				<div class="w-full max-w-md space-y-3">
					{#if !newConvoDisplayName}
						<Input
							placeholder="Phone number (e.g. 8184633772)..."
							class="text-center font-mono"
							bind:value={newConvoPhone}
						/>
					{/if}
					<form class="flex gap-2" onsubmit={(e) => { e.preventDefault(); sendMessage(); }}>
						<Input
							placeholder="Type a message..."
							class="flex-1"
							bind:value={newMessage}
							disabled={sending}
						/>
						<Button
							type="submit"
							disabled={!newMessage.trim() || !newConvoPhone.trim() || sending}
							class="bg-[#C5A55A] hover:bg-[#b8943e] text-[#1A1A1A]"
						>
							<Send class="h-4 w-4" />
						</Button>
					</form>
				</div>
			</div>
		{:else}
			<!-- Empty state -->
			<div class="flex-1 flex items-center justify-center relative">
				<!-- Subtle radial glow -->
				<div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(197,165,90,0.03)_0%,_transparent_60%)]"></div>
				<div class="text-center relative z-10">
					<div class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[rgba(197,165,90,0.06)] border border-[rgba(197,165,90,0.1)]">
						<MessageSquare class="h-8 w-8 text-[rgba(197,165,90,0.25)]" />
					</div>
					<p class="text-base font-light text-[rgba(255,255,255,0.4)] mb-1" style="font-family: 'Playfair Display', serif;">No conversation selected</p>
					<p class="text-xs text-[rgba(255,255,255,0.2)]">Choose a conversation from the left, or start a new one.</p>
					<button
						class="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-[#C5A55A] border border-[rgba(197,165,90,0.2)] hover:bg-[rgba(197,165,90,0.06)] transition-colors"
						onclick={() => { showNewConvo = true; }}
					>
						<MessageSquare class="h-3.5 w-3.5" />
						New conversation
					</button>
				</div>
			</div>
		{/if}
	</div>

	{#if error}
		<div class="fixed bottom-4 right-4 rounded border border-red-500/30 bg-red-500/10 px-4 py-2 backdrop-blur">
			<p class="text-sm text-red-400">{error}</p>
			<button class="text-xs text-red-400/60 hover:text-red-400 mt-1" onclick={() => { error = ''; }}>Dismiss</button>
		</div>
	{/if}
</div>
