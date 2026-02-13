<script>
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import { MessageSquare, Search, Send, ArrowLeft, Phone } from '@lucide/svelte';
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

	/** @type {number|null} Auto-refresh interval */
	let refreshInterval = null;

	$effect(() => {
		loadConversations();
		// Poll for new messages every 10 seconds
		refreshInterval = setInterval(() => {
			loadConversations();
			if (selectedConvo) loadMessages(selectedConvo.id);
		}, 10000);
		return () => { if (refreshInterval) clearInterval(refreshInterval); };
	});

	async function loadConversations() {
		try {
			const params = new URLSearchParams();
			if (search) params.set('search', search);
			const res = await api(`/api/messages/conversations?${params}`);
			conversations = res.data;
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
						<MessageSquare class="mx-auto mb-3 h-8 w-8 text-[rgba(197,165,90,0.2)]" />
						<p class="text-sm text-[rgba(255,255,255,0.35)]">No conversations yet.</p>
						<p class="text-xs text-[rgba(255,255,255,0.2)] mt-1">Incoming texts and auto-replies will appear here.</p>
					</div>
				</div>
			{:else}
				{#each conversations as convo}
					<button
						class="w-full text-left px-4 py-3 border-b border-[rgba(197,165,90,0.06)] transition-all duration-200 hover:bg-[rgba(197,165,90,0.06)] {selectedConvo?.id === convo.id ? 'bg-[rgba(197,165,90,0.1)] border-l-2 border-l-[#C5A55A]' : ''}"
						onclick={() => selectConversation(convo)}
					>
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0 flex-1">
								<p class="text-sm font-medium text-[rgba(255,255,255,0.85)] truncate">
									{convo.display_name || formatPhone(convo.phone_number)}
								</p>
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
				<div class="flex-1 min-w-0">
					<p class="text-sm font-medium text-[rgba(255,255,255,0.85)] truncate">
						{selectedConvo.display_name || formatPhone(selectedConvo.phone_number)}
					</p>
					{#if selectedConvo.display_name}
						<p class="text-xs text-[rgba(255,255,255,0.35)]">{formatPhone(selectedConvo.phone_number)}</p>
					{/if}
				</div>
				<a href="/calls?search={encodeURIComponent(selectedConvo.phone_number)}" class="text-[rgba(255,255,255,0.4)] hover:text-[#C5A55A] transition-colors">
					<Phone class="h-4 w-4" />
				</a>
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
				<p class="text-sm text-[rgba(255,255,255,0.5)] mb-6">Enter a phone number and message to start a new conversation.</p>
				<div class="w-full max-w-md space-y-3">
					<Input
						placeholder="Phone number (e.g. 8184633772)..."
						class="text-center font-mono"
						bind:value={newConvoPhone}
					/>
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
			<div class="flex-1 flex items-center justify-center">
				<div class="text-center">
					<MessageSquare class="mx-auto mb-3 h-10 w-10 text-[rgba(197,165,90,0.15)]" />
					<p class="text-sm text-[rgba(255,255,255,0.35)]">Select a conversation to view messages.</p>
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
