<script>
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import { Users, Search, Phone, Mail, ChevronLeft, ChevronRight, Tag, X, Plus } from '@lucide/svelte';
	import { api } from '$lib/api/client.js';
	import { formatPhone, formatRelativeDate } from '$lib/utils/formatters.js';

	let search = $state('');
	let contacts = $state(null);
	let stats = $state(null);
	let totalCount = $state(0);
	let page = $state(1);
	let pageSize = $state(50);
	let error = $state('');
	let tagFilter = $state('all');
	let expandedId = $state(null);
	let expandedContact = $state(null);
	let addingTag = $state(null); // contact id currently adding tag to
	let newTagInput = $state('');

	const tagConfig = {
		patient:  { label: 'Patient',  color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
		lead:     { label: 'Lead',     color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
		partner:  { label: 'Partner',  color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
		employee: { label: 'Employee', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
		unknown:  { label: 'Unknown',  color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
		vip:      { label: 'VIP',      color: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' },
		friendfam:{ label: 'FriendFam',color: 'bg-pink-500/15 text-pink-400 border-pink-500/30' },
		vendor:   { label: 'Vendor',   color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' }
	};

	const sourceLabels = {
		aesthetic_record: 'Aesthetic Record',
		gohighlevel: 'GoHighLevel',
		textmagic: 'TextMagic',
		google_sheet: 'Google Sheet',
		manual: 'Manual',
		inbound_call: 'Inbound Call'
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
			if (tagFilter !== 'all') params.set('tag', tagFilter);

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

	function setTag(t) {
		tagFilter = t;
		page = 1;
		loadContacts();
	}

	async function toggleExpand(id) {
		if (expandedId === id) {
			expandedId = null;
			expandedContact = null;
			addingTag = null;
			return;
		}
		expandedId = id;
		addingTag = null;
		try {
			const res = await api(`/api/contacts/${id}`);
			expandedContact = res.data;
		} catch (e) {
			console.error('Failed to load contact details:', e);
		}
	}

	async function removeTag(contactId, tag) {
		try {
			const res = await api(`/api/contacts/${contactId}/tags`, {
				method: 'DELETE',
				body: JSON.stringify({ tags: [tag] })
			});
			// Update expanded contact tags in place
			if (expandedContact && expandedContact.id === contactId) {
				expandedContact = { ...expandedContact, tags: res.data.tags };
			}
			// Update the contact in the list too
			if (contacts) {
				contacts = contacts.map(c =>
					c.id === contactId ? { ...c, tags: res.data.tags } : c
				);
			}
			loadStats(); // Refresh tag counts
		} catch (e) {
			console.error('Failed to remove tag:', e);
		}
	}

	async function addTag(contactId) {
		const tag = newTagInput.trim().toLowerCase();
		if (!tag) return;
		try {
			const res = await api(`/api/contacts/${contactId}/tags`, {
				method: 'POST',
				body: JSON.stringify({ tags: [tag] })
			});
			if (expandedContact && expandedContact.id === contactId) {
				expandedContact = { ...expandedContact, tags: res.data.tags };
			}
			if (contacts) {
				contacts = contacts.map(c =>
					c.id === contactId ? { ...c, tags: res.data.tags } : c
				);
			}
			newTagInput = '';
			addingTag = null;
			loadStats();
		} catch (e) {
			console.error('Failed to add tag:', e);
		}
	}

	function nextPage() {
		if (page * pageSize < totalCount) { page++; loadContacts(); }
	}
	function prevPage() {
		if (page > 1) { page--; loadContacts(); }
	}

	const totalPages = $derived(Math.ceil(totalCount / pageSize) || 1);

	function getTagClasses(tag) {
		return tagConfig[tag]?.color || 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30';
	}

	function getTagLabel(tag) {
		return tagConfig[tag]?.label || tag;
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Contacts</h1>
			<p class="text-muted-foreground">CRM directory — {stats?.total || '...'} contacts across all sources.</p>
		</div>
	</div>

	{#if error}
		<Card.Root>
			<Card.Content class="py-4">
				<p class="text-sm text-destructive">{error}</p>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Tag filter tabs -->
	{#if stats}
		<div class="flex flex-wrap gap-2">
			<button
				class="rounded-lg border px-4 py-2.5 text-left transition-colors hover:bg-muted/50 {tagFilter === 'all' ? 'border-primary bg-muted/30' : ''}"
				onclick={() => setTag('all')}
			>
				<span class="text-sm font-medium">All</span>
				<span class="ml-1.5 text-lg font-bold">{stats.total}</span>
			</button>
			{#each Object.entries(tagConfig) as [key, config]}
				{#if stats.byTag?.[key]}
					<button
						class="rounded-lg border px-4 py-2.5 text-left transition-colors hover:bg-muted/50 {tagFilter === key ? 'border-primary bg-muted/30' : ''}"
						onclick={() => setTag(key)}
					>
						<span class="inline-block w-2 h-2 rounded-full mr-1.5 {config.color.split(' ')[0]}">&nbsp;</span>
						<span class="text-sm font-medium">{config.label}</span>
						<span class="ml-1.5 text-lg font-bold">{stats.byTag[key]}</span>
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
						{#if search || tagFilter !== 'all'}
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
								<div class="flex items-center gap-1.5 shrink-0 ml-2 flex-wrap justify-end">
									{#if contact.tags && contact.tags.length > 0}
										{#each contact.tags as tag}
											<span class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium {getTagClasses(tag)}">
												{getTagLabel(tag)}
											</span>
										{/each}
									{/if}
								</div>
							</button>

							{#if expandedId === contact.id && expandedContact}
								<div class="border-t px-3 py-3 space-y-4">
									<!-- Tags section with edit -->
									<div>
										<p class="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
											<Tag class="h-3 w-3" /> Tags
										</p>
										<div class="flex flex-wrap items-center gap-1.5">
											{#each expandedContact.tags || [] as tag}
												<span class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium {getTagClasses(tag)}">
													{getTagLabel(tag)}
													<button
														class="ml-1 hover:opacity-70"
														onclick={(e) => { e.stopPropagation(); removeTag(contact.id, tag); }}
														title="Remove tag"
													>
														<X class="h-3 w-3" />
													</button>
												</span>
											{/each}
											{#if addingTag === contact.id}
												<form
													class="flex items-center gap-1"
													onsubmit={(e) => { e.preventDefault(); addTag(contact.id); }}
												>
													<input
														type="text"
														class="h-6 w-24 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
														placeholder="tag name"
														bind:value={newTagInput}
														autofocus
													/>
													<button type="submit" class="text-xs text-primary hover:underline">Add</button>
													<button type="button" class="text-xs text-muted-foreground hover:underline" onclick={() => { addingTag = null; newTagInput = ''; }}>Cancel</button>
												</form>
											{:else}
												<button
													class="inline-flex items-center gap-0.5 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
													onclick={(e) => { e.stopPropagation(); addingTag = contact.id; newTagInput = ''; }}
												>
													<Plus class="h-3 w-3" /> Add tag
												</button>
											{/if}
										</div>
									</div>

									<!-- Contact details grid -->
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
										{#if expandedContact.patient_status}
											<div>
												<p class="text-xs font-medium text-muted-foreground">Patient Status</p>
												<p class="text-sm capitalize">{expandedContact.patient_status}</p>
											</div>
										{/if}
										{#if expandedContact.source_id}
											<div>
												<p class="text-xs font-medium text-muted-foreground">Source ID</p>
												<p class="text-sm font-mono text-xs">{expandedContact.source_id}</p>
											</div>
										{/if}
										{#if expandedContact.lists && expandedContact.lists.length > 0}
											<div>
												<p class="text-xs font-medium text-muted-foreground">Lists</p>
												<div class="flex flex-wrap gap-1 mt-0.5">
													{#each expandedContact.lists as list}
														<span class="inline-flex items-center rounded-md border bg-muted/50 px-1.5 py-0.5 text-xs">{list}</span>
													{/each}
												</div>
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
										<details>
											<summary class="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
												Additional Info ({Object.keys(expandedContact.metadata).length} fields)
											</summary>
											<div class="grid gap-1 text-xs bg-muted/30 rounded-md p-2 mt-1">
												{#each Object.entries(expandedContact.metadata) as [key, val]}
													<div class="flex gap-2">
														<span class="font-medium capitalize whitespace-nowrap">{key.replace(/_/g, ' ')}:</span>
														<span class="text-muted-foreground break-all">{typeof val === 'object' ? JSON.stringify(val) : val}</span>
													</div>
												{/each}
											</div>
										</details>
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
