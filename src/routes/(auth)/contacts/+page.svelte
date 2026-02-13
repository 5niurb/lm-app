<script>
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import { Users, Search, Phone, Mail, ChevronLeft, ChevronRight, ExternalLink } from '@lucide/svelte';
	import { api } from '$lib/api/client.js';
	import { formatPhone, formatRelativeDate } from '$lib/utils/formatters.js';

	let search = $state('');
	let contacts = $state(null);
	let stats = $state(null);
	let totalCount = $state(0);
	let page = $state(1);
	let pageSize = $state(50);
	let error = $state('');
	let sourceFilter = $state('all');
	let expandedId = $state(null);
	let expandedContact = $state(null);

	const sourceLabels = {
		aesthetic_record: 'Aesthetic Record',
		gohighlevel: 'GoHighLevel',
		textmagic: 'TextMagic',
		google_sheet: 'Google Sheet',
		manual: 'Manual'
	};

	const sourceBadgeVariant = {
		aesthetic_record: 'default',
		gohighlevel: 'secondary',
		textmagic: 'outline',
		google_sheet: 'secondary',
		manual: 'outline'
	};

	$effect(() => {
		loadContacts();
		loadStats();
	});

	async function loadContacts() {
		try {
			const params = new URLSearchParams({
				page: page.toString(),
				pageSize: pageSize.toString()
			});

			if (search) params.set('search', search);
			if (sourceFilter !== 'all') params.set('source', sourceFilter);

			const res = await api(`/api/contacts?${params}`);
			contacts = res.data;
			totalCount = res.count;
		} catch (e) {
			error = e.message;
		}
	}

	async function loadStats() {
		try {
			stats = await api('/api/contacts/stats');
		} catch (e) {
			console.error('Failed to load contact stats:', e);
		}
	}

	function handleSearch() {
		page = 1;
		loadContacts();
	}

	function setSource(s) {
		sourceFilter = s;
		page = 1;
		loadContacts();
	}

	async function toggleExpand(id) {
		if (expandedId === id) {
			expandedId = null;
			expandedContact = null;
			return;
		}
		expandedId = id;
		try {
			const res = await api(`/api/contacts/${id}`);
			expandedContact = res.data;
		} catch (e) {
			console.error('Failed to load contact details:', e);
		}
	}

	function nextPage() {
		if (page * pageSize < totalCount) { page++; loadContacts(); }
	}
	function prevPage() {
		if (page > 1) { page--; loadContacts(); }
	}

	const totalPages = $derived(Math.ceil(totalCount / pageSize) || 1);
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Contacts</h1>
			<p class="text-muted-foreground">Patient and contact directory synced from all sources.</p>
		</div>
	</div>

	{#if error}
		<Card.Root>
			<Card.Content class="py-4">
				<p class="text-sm text-destructive">{error}</p>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Source filter tabs -->
	{#if stats}
		<div class="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
			<button
				class="rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 {sourceFilter === 'all' ? 'border-primary bg-muted/30' : ''}"
				onclick={() => setSource('all')}
			>
				<p class="text-sm font-medium">All</p>
				<p class="text-2xl font-bold">{stats.total}</p>
				<p class="text-xs text-muted-foreground">contacts</p>
			</button>
			{#each Object.entries(sourceLabels) as [key, label]}
				{#if stats.bySource[key]}
					<button
						class="rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 {sourceFilter === key ? 'border-primary bg-muted/30' : ''}"
						onclick={() => setSource(key)}
					>
						<p class="text-sm font-medium">{label}</p>
						<p class="text-2xl font-bold">{stats.bySource[key] || 0}</p>
						<p class="text-xs text-muted-foreground">contacts</p>
					</button>
				{/if}
			{/each}
		</div>
	{/if}

	<Card.Root>
		<Card.Header>
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
				<form class="relative flex-1" onsubmit={(e) => { e.preventDefault(); handleSearch(); }}>
					<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
					<Input placeholder="Search by name, phone, or email..." class="pl-8" bind:value={search} />
				</form>
			</div>
		</Card.Header>
		<Card.Content>
			{#if contacts === null}
				<div class="space-y-3">
					{#each Array(8) as _}
						<Skeleton class="h-14 w-full" />
					{/each}
				</div>
			{:else if contacts.length === 0}
				<div class="flex h-48 items-center justify-center text-muted-foreground">
					<div class="text-center">
						<Users class="mx-auto mb-3 h-10 w-10 opacity-50" />
						<p>No contacts found.</p>
						{#if search || sourceFilter !== 'all'}
							<p class="text-sm">Try adjusting your search or filters.</p>
						{:else}
							<p class="text-sm">Import contacts using the sync script or add them manually.</p>
						{/if}
					</div>
				</div>
			{:else}
				<div class="space-y-1">
					{#each contacts as contact}
						<div class="rounded-md border transition-colors hover:bg-muted/20">
							<button
								class="flex w-full items-center justify-between p-3 text-left"
								onclick={() => toggleExpand(contact.id)}
							>
								<div class="flex items-center gap-3 min-w-0 flex-1">
									<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
										{(contact.first_name?.[0] || contact.full_name?.[0] || '?').toUpperCase()}
									</div>
									<div class="min-w-0 flex-1">
										<p class="text-sm font-medium truncate">
											{contact.full_name || 'Unknown'}
										</p>
										<div class="flex items-center gap-3 text-xs text-muted-foreground">
											{#if contact.phone}
												<span class="flex items-center gap-1">
													<Phone class="h-3 w-3" />
													{formatPhone(contact.phone)}
												</span>
											{/if}
											{#if contact.email}
												<span class="flex items-center gap-1 truncate">
													<Mail class="h-3 w-3" />
													{contact.email}
												</span>
											{/if}
										</div>
									</div>
								</div>
								<div class="flex items-center gap-2 shrink-0 ml-2">
									<Badge variant={sourceBadgeVariant[contact.source] || 'outline'}>
										{sourceLabels[contact.source] || contact.source}
									</Badge>
									{#if contact.patient_status}
										<Badge variant="outline" class="capitalize">{contact.patient_status}</Badge>
									{/if}
								</div>
							</button>

							{#if expandedId === contact.id && expandedContact}
								<div class="border-t px-3 py-3 space-y-3">
									<div class="grid gap-3 sm:grid-cols-2">
										<div>
											<p class="text-xs font-medium text-muted-foreground">Full Name</p>
											<p class="text-sm">{expandedContact.full_name || '—'}</p>
										</div>
										<div>
											<p class="text-xs font-medium text-muted-foreground">Email</p>
											<p class="text-sm">{expandedContact.email || '—'}</p>
										</div>
										<div>
											<p class="text-xs font-medium text-muted-foreground">Phone</p>
											<p class="text-sm">{expandedContact.phone ? formatPhone(expandedContact.phone) : '—'}</p>
										</div>
										<div>
											<p class="text-xs font-medium text-muted-foreground">Source</p>
											<p class="text-sm">{sourceLabels[expandedContact.source] || expandedContact.source}</p>
										</div>
										{#if expandedContact.source_id}
											<div>
												<p class="text-xs font-medium text-muted-foreground">Source ID</p>
												<p class="text-sm">{expandedContact.source_id}</p>
											</div>
										{/if}
										<div>
											<p class="text-xs font-medium text-muted-foreground">Last Synced</p>
											<p class="text-sm">{expandedContact.last_synced_at ? formatRelativeDate(expandedContact.last_synced_at) : '—'}</p>
										</div>
									</div>

									<!-- Recent calls -->
									{#if expandedContact.recent_calls && expandedContact.recent_calls.length > 0}
										<div>
											<p class="text-xs font-medium text-muted-foreground mb-2">Recent Calls</p>
											<div class="space-y-1">
												{#each expandedContact.recent_calls.slice(0, 5) as call}
													<div class="flex items-center justify-between text-sm bg-muted/30 rounded-md px-2 py-1.5">
														<div class="flex items-center gap-2">
															<Badge variant="outline" class="text-xs">
																{call.direction === 'inbound' ? 'In' : 'Out'}
															</Badge>
															<span>{call.disposition || call.status}</span>
														</div>
														<span class="text-xs text-muted-foreground">
															{formatRelativeDate(call.started_at)}
														</span>
													</div>
												{/each}
											</div>
										</div>
									{:else}
										<p class="text-sm text-muted-foreground italic">No call history yet.</p>
									{/if}

									<!-- Metadata -->
									{#if expandedContact.metadata && Object.keys(expandedContact.metadata).length > 0}
										<div>
											<p class="text-xs font-medium text-muted-foreground mb-1">Additional Info</p>
											<div class="grid gap-1 text-xs bg-muted/30 rounded-md p-2">
												{#each Object.entries(expandedContact.metadata) as [key, val]}
													<div class="flex gap-2">
														<span class="font-medium capitalize">{key.replace(/_/g, ' ')}:</span>
														<span class="text-muted-foreground">{val}</span>
													</div>
												{/each}
											</div>
										</div>
									{/if}
								</div>
							{/if}
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
		</Card.Content>
	</Card.Root>
</div>
