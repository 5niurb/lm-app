<script>
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import { Phone, Search, PhoneIncoming, PhoneOutgoing, ChevronLeft, ChevronRight } from '@lucide/svelte';
	import { api } from '$lib/api/client.js';
	import { formatPhone, formatDuration, formatDate } from '$lib/utils/formatters.js';

	let search = $state('');
	let calls = $state(null);
	let totalCount = $state(0);
	let page = $state(1);
	let pageSize = $state(25);
	let error = $state('');
	let filter = $state('all');

	$effect(() => {
		loadCalls();
	});

	async function loadCalls() {
		try {
			const params = new URLSearchParams({
				page: page.toString(),
				pageSize: pageSize.toString()
			});

			if (search) params.set('search', search);
			if (filter === 'missed') params.set('disposition', 'missed');
			if (filter === 'voicemail') params.set('disposition', 'voicemail');
			if (filter === 'answered') params.set('disposition', 'answered');

			const res = await api(`/api/calls?${params}`);
			calls = res.data;
			totalCount = res.count;
		} catch (e) {
			error = e.message;
			console.error('Failed to load calls:', e);
		}
	}

	function handleSearch() {
		page = 1;
		loadCalls();
	}

	function setFilter(f) {
		filter = f;
		page = 1;
		loadCalls();
	}

	function nextPage() {
		if (page * pageSize < totalCount) {
			page++;
			loadCalls();
		}
	}

	function prevPage() {
		if (page > 1) {
			page--;
			loadCalls();
		}
	}

	function dispositionColor(disposition) {
		switch (disposition) {
			case 'answered': return 'default';
			case 'missed': return 'destructive';
			case 'voicemail': return 'secondary';
			case 'abandoned': return 'outline';
			default: return 'outline';
		}
	}

	const totalPages = $derived(Math.ceil(totalCount / pageSize) || 1);
</script>

<div class="space-y-8">
	<div>
		<h1 class="text-2xl tracking-wide">Call Log</h1>
		<p class="text-sm text-muted-foreground mt-1">View and manage all call records.</p>
	</div>

	{#if error}
		<div class="rounded border border-red-500/30 bg-red-500/5 px-4 py-3">
			<p class="text-sm text-red-400">{error}</p>
		</div>
	{/if}

	<div class="rounded border border-[rgba(197,165,90,0.12)] overflow-hidden">
		<div class="px-5 py-4 border-b border-[rgba(197,165,90,0.08)]">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
				<form class="relative flex-1" onsubmit={(e) => { e.preventDefault(); handleSearch(); }}>
					<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Search by name or phone number..."
						class="pl-8"
						bind:value={search}
					/>
				</form>
				<div class="flex gap-1">
					<Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onclick={() => setFilter('all')}>All</Button>
					<Button variant={filter === 'answered' ? 'default' : 'outline'} size="sm" onclick={() => setFilter('answered')}>Answered</Button>
					<Button variant={filter === 'missed' ? 'default' : 'outline'} size="sm" onclick={() => setFilter('missed')}>Missed</Button>
					<Button variant={filter === 'voicemail' ? 'default' : 'outline'} size="sm" onclick={() => setFilter('voicemail')}>Voicemail</Button>
				</div>
			</div>
		</div>
		<div class="p-5">
			{#if calls === null}
				<div class="space-y-3">
					{#each Array(10) as _}
						<Skeleton class="h-14 w-full" />
					{/each}
				</div>
			{:else if calls.length === 0}
				<div class="flex h-48 items-center justify-center text-muted-foreground">
					<div class="text-center">
						<Phone class="mx-auto mb-3 h-8 w-8 text-[rgba(197,165,90,0.2)]" />
						<p class="text-sm text-[rgba(255,255,255,0.35)]">No call records found.</p>
						{#if search || filter !== 'all'}
							<p class="text-xs text-[rgba(255,255,255,0.2)] mt-1">Try adjusting your search or filter.</p>
						{:else}
							<p class="text-xs text-[rgba(255,255,255,0.2)] mt-1">Calls will appear here once Twilio webhooks are connected.</p>
						{/if}
					</div>
				</div>
			{:else}
				<div class="space-y-1">
					{#each calls as call}
						<div class="group flex items-center justify-between rounded p-3 transition-all duration-200 hover:bg-[rgba(197,165,90,0.04)] border border-transparent hover:border-[rgba(197,165,90,0.1)]">
							<div class="flex items-center gap-3">
								{#if call.direction === 'inbound'}
									<PhoneIncoming class="h-4 w-4 shrink-0 text-blue-400/70 group-hover:text-blue-400 transition-colors" />
								{:else}
									<PhoneOutgoing class="h-4 w-4 shrink-0 text-emerald-400/70 group-hover:text-emerald-400 transition-colors" />
								{/if}
								<div class="min-w-0">
									<p class="text-sm font-medium text-[rgba(255,255,255,0.85)] truncate">
										{#if call.caller_name}
											{call.caller_name}
										{:else}
											{formatPhone(call.direction === 'inbound' ? call.from_number : call.to_number)}
										{/if}
									</p>
									<p class="text-xs text-[rgba(255,255,255,0.35)]">
										{#if call.caller_name}
											{formatPhone(call.direction === 'inbound' ? call.from_number : call.to_number)} &middot;
										{/if}
										{formatDate(call.started_at)}
									</p>
								</div>
							</div>
							<div class="flex items-center gap-3">
								{#if call.duration > 0}
									<span class="text-xs text-[rgba(255,255,255,0.3)] hidden sm:inline">
										{formatDuration(call.duration)}
									</span>
								{/if}
								<Badge variant={dispositionColor(call.disposition)}>
									{call.disposition || call.status}
								</Badge>
							</div>
						</div>
					{/each}
				</div>

				{#if totalCount > pageSize}
					<div class="flex items-center justify-between pt-4">
						<p class="text-sm text-muted-foreground">
							Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount}
						</p>
						<div class="flex gap-1">
							<Button variant="outline" size="sm" onclick={prevPage} disabled={page <= 1}>
								<ChevronLeft class="h-4 w-4" />
							</Button>
							<span class="flex items-center px-2 text-sm text-muted-foreground">{page} / {totalPages}</span>
							<Button variant="outline" size="sm" onclick={nextPage} disabled={page >= totalPages}>
								<ChevronRight class="h-4 w-4" />
							</Button>
						</div>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>
