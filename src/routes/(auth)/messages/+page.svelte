<script>
	import { Tabs, TabsList, TabsTrigger, TabsContent } from '$lib/components/ui/tabs/index.ts';
	import { api } from '$lib/api/client.js';
	import ChatsTab from '$lib/components/messaging/ChatsTab.svelte';
	import TemplatesTab from '$lib/components/messaging/TemplatesTab.svelte';
	import ScheduledTab from '$lib/components/messaging/ScheduledTab.svelte';

	// ─── Shared state ───
	/** @type {Array<{sid: string, phoneNumber: string, friendlyName: string}>} */
	let twilioNumbers = $state([]);
	let selectedNumber = $state('');
	let error = $state('');

	// Scheduled message badge count
	let scheduledPending = $state(0);

	// Load Twilio numbers on mount
	$effect(() => {
		loadTwilioNumbers();
		loadScheduledStats();
	});

	async function loadTwilioNumbers() {
		try {
			const res = await api('/api/twilio-history/numbers');
			twilioNumbers = res.data || [];
		} catch (e) {
			console.error('Failed to load Twilio numbers:', e);
		}
	}

	async function loadScheduledStats() {
		try {
			const res = await api('/api/scheduled-messages/stats');
			scheduledPending = res.data?.pending || 0;
		} catch (e) {
			// Non-critical — badge just won't show
			console.error('Failed to load scheduled stats:', e);
		}
	}

	/** @param {string} num */
	function handleNumberChange(num) {
		selectedNumber = num;
	}

	/** @param {string} msg */
	function handleError(msg) {
		error = msg;
	}
</script>

<svelte:head>
	<title>Messages — Le Med Spa</title>
</svelte:head>

<div class="h-[calc(100vh-4rem)] -m-6 flex flex-col bg-card">
	<Tabs value="chats" class="flex flex-col h-full">
		<div class="border-b border-border px-4">
			<TabsList class="bg-transparent h-auto gap-0 p-0">
				<TabsTrigger
					value="chats"
					class="rounded-none border-b-2 border-transparent data-[state=active]:border-gold data-[state=active]:text-gold data-[state=active]:bg-transparent px-4 py-2.5 text-sm"
				>
					Chats
				</TabsTrigger>
				<TabsTrigger
					value="templates"
					class="rounded-none border-b-2 border-transparent data-[state=active]:border-gold data-[state=active]:text-gold data-[state=active]:bg-transparent px-4 py-2.5 text-sm"
				>
					Templates
				</TabsTrigger>
				<TabsTrigger
					value="scheduled"
					class="rounded-none border-b-2 border-transparent data-[state=active]:border-gold data-[state=active]:text-gold data-[state=active]:bg-transparent px-4 py-2.5 text-sm"
				>
					Scheduled
					{#if scheduledPending > 0}
						<span
							class="ml-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-[10px] font-bold text-primary-foreground"
						>
							{scheduledPending}
						</span>
					{/if}
				</TabsTrigger>
			</TabsList>
		</div>

		<TabsContent value="chats" class="flex-1 overflow-hidden mt-0">
			<ChatsTab
				{twilioNumbers}
				{selectedNumber}
				onNumberChange={handleNumberChange}
				onError={handleError}
			/>
		</TabsContent>

		<TabsContent value="templates" class="flex-1 overflow-hidden mt-0">
			<TemplatesTab onError={handleError} />
		</TabsContent>

		<TabsContent value="scheduled" class="flex-1 overflow-hidden mt-0">
			<ScheduledTab
				onStatsChange={(pending) => {
					scheduledPending = pending;
				}}
				onError={handleError}
			/>
		</TabsContent>
	</Tabs>

	{#if error}
		<div
			class="fixed bottom-4 right-4 rounded border border-red-500/30 bg-red-500/10 px-4 py-2 backdrop-blur z-50"
		>
			<p class="text-sm text-red-400">{error}</p>
			<button
				class="text-xs text-red-400/60 hover:text-red-400 mt-1"
				onclick={() => {
					error = '';
				}}>Dismiss</button
			>
		</div>
	{/if}
</div>
