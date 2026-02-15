<script>
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import {
		Users,
		Search,
		Phone,
		Mail,
		ChevronLeft,
		ChevronRight,
		Tag,
		X,
		Plus,
		MessageSquare,
		PhoneOutgoing,
		FileText
	} from '@lucide/svelte';
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
	let drawerOpen = $state(false);

	const tagConfig = {
		patient: {
			label: 'Patient',
			color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
		},
		lead: { label: 'Lead', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
		partner: { label: 'Partner', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
		employee: { label: 'Employee', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
		unknown: { label: 'Unknown', color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
		vip: { label: 'VIP', color: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' },
		friendfam: { label: 'FriendFam', color: 'bg-pink-500/15 text-pink-400 border-pink-500/30' },
		vendor: { label: 'Vendor', color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' }
	};

	const sourceLabels = {
		aesthetic_record: 'Aesthetic Record',
		gohighlevel: 'GoHighLevel',
		textmagic: 'TextMagic',
		google_sheet: 'Google Sheet',
		manual: 'Manual',
		inbound_call: 'Inbound Call',
		website_form: 'Website Form'
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
		if (expandedId === id && drawerOpen) {
			// Already showing this contact — close the drawer
			closeDrawer();
			return;
		}
		expandedId = id;
		expandedContact = null;
		addingTag = null;
		drawerOpen = true;
		try {
			const res = await api(`/api/contacts/${id}`);
			expandedContact = res.data;
		} catch (e) {
			console.error('Failed to load contact details:', e);
		}
	}

	function closeDrawer() {
		drawerOpen = false;
		// Delay clearing data so the slide-out animation can play
		setTimeout(() => {
			if (!drawerOpen) {
				expandedId = null;
				expandedContact = null;
				addingTag = null;
			}
		}, 220);
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
				contacts = contacts.map((c) => (c.id === contactId ? { ...c, tags: res.data.tags } : c));
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
				contacts = contacts.map((c) => (c.id === contactId ? { ...c, tags: res.data.tags } : c));
			}
			newTagInput = '';
			addingTag = null;
			loadStats();
		} catch (e) {
			console.error('Failed to add tag:', e);
		}
	}

	function nextPage() {
		if (page * pageSize < totalCount) {
			page++;
			loadContacts();
		}
	}
	function prevPage() {
		if (page > 1) {
			page--;
			loadContacts();
		}
	}

	const totalPages = $derived(Math.ceil(totalCount / pageSize) || 1);

	function getTagClasses(tag) {
		return tagConfig[tag]?.color || 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30';
	}

	function getTagLabel(tag) {
		return tagConfig[tag]?.label || tag;
	}
</script>

<div class="space-y-8">
	<div>
		<h1 class="text-2xl tracking-wide">Contacts</h1>
		<p class="text-sm text-muted-foreground mt-1">
			CRM directory — {stats?.total || '...'} contacts across all sources.
		</p>
	</div>

	{#if error}
		<div class="rounded border border-red-500/30 bg-red-500/5 px-4 py-3">
			<p class="text-sm text-red-400">{error}</p>
		</div>
	{/if}

	<!-- Tag filter tabs -->
	{#if stats}
		<div class="flex flex-wrap gap-2">
			<button
				class="group rounded border px-4 py-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 {tagFilter ===
				'all'
					? 'border-[rgba(197,165,90,0.4)] bg-[rgba(197,165,90,0.08)]'
					: 'border-[rgba(197,165,90,0.12)] bg-[rgba(197,165,90,0.03)] hover:border-[rgba(197,165,90,0.25)] hover:bg-[rgba(197,165,90,0.06)]'}"
				onclick={() => setTag('all')}
			>
				<span
					class="text-xs uppercase tracking-[0.15em] {tagFilter === 'all'
						? 'text-[#C5A55A]'
						: 'text-[rgba(255,255,255,0.4)]'}">All</span
				>
				<span
					class="ml-2 text-xl font-light text-[rgba(255,255,255,0.9)]"
					style="font-family: 'Playfair Display', serif;">{stats.total}</span
				>
			</button>
			{#each Object.entries(tagConfig) as [key, config]}
				{#if stats.byTag?.[key]}
					<button
						class="group rounded border px-4 py-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 {tagFilter ===
						key
							? 'border-[rgba(197,165,90,0.4)] bg-[rgba(197,165,90,0.08)]'
							: 'border-[rgba(197,165,90,0.12)] bg-[rgba(197,165,90,0.03)] hover:border-[rgba(197,165,90,0.25)] hover:bg-[rgba(197,165,90,0.06)]'}"
						onclick={() => setTag(key)}
					>
						<span class="inline-block w-2 h-2 rounded-full mr-1.5 {config.color.split(' ')[0]}"
							>&nbsp;</span
						>
						<span
							class="text-xs uppercase tracking-[0.15em] {tagFilter === key
								? 'text-[#C5A55A]'
								: 'text-[rgba(255,255,255,0.4)]'}">{config.label}</span
						>
						<span
							class="ml-2 text-xl font-light text-[rgba(255,255,255,0.9)]"
							style="font-family: 'Playfair Display', serif;">{stats.byTag[key]}</span
						>
					</button>
				{/if}
			{/each}
		</div>
	{/if}

	<div class="rounded border border-[rgba(197,165,90,0.12)] overflow-hidden">
		<div class="px-5 py-4 border-b border-[rgba(197,165,90,0.08)]">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
				<form
					class="relative flex-1"
					onsubmit={(e) => {
						e.preventDefault();
						handleSearch();
					}}
				>
					<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Search by name, phone, or email..."
						class="pl-8"
						bind:value={search}
					/>
				</form>
			</div>
		</div>
		<div class="p-5">
			{#if contacts === null}
				<div class="space-y-3">
					{#each Array(8) as _}
						<Skeleton class="h-14 w-full" />
					{/each}
				</div>
			{:else if contacts.length === 0}
				<div class="flex h-56 items-center justify-center">
					<div class="text-center">
						<div
							class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(197,165,90,0.05)] border border-[rgba(197,165,90,0.08)]"
						>
							<Users class="h-6 w-6 empty-state-icon" />
						</div>
						<p
							class="text-sm font-light text-[rgba(255,255,255,0.4)] mb-1"
							style="font-family: 'Playfair Display', serif;"
						>
							No contacts found
						</p>
						{#if search || tagFilter !== 'all'}
							<p class="text-xs text-[rgba(255,255,255,0.2)]">
								Try adjusting your search or filters.
							</p>
						{:else}
							<p class="text-xs text-[rgba(255,255,255,0.2)]">
								Import contacts using the sync script or add them manually.
							</p>
						{/if}
					</div>
				</div>
			{:else}
				<div class="list-enter">
					{#each contacts as contact, i}
						<div
							class="group rounded-md border transition-all duration-200 hover:bg-[rgba(197,165,90,0.04)] hover:border-[rgba(197,165,90,0.1)] {expandedId ===
								contact.id && drawerOpen
								? 'border-[rgba(197,165,90,0.2)] bg-[rgba(197,165,90,0.04)]'
								: 'border-transparent'} {i > 0 ? 'border-t border-t-[rgba(255,255,255,0.06)]' : ''}"
						>
							<button
								class="flex w-full items-center justify-between p-3 text-left"
								onclick={() => toggleExpand(contact.id)}
							>
								<div class="flex items-center gap-3 min-w-0 flex-1">
									<div
										class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(197,165,90,0.1)] text-sm font-medium text-[#C5A55A]"
										style="font-family: 'Playfair Display', serif;"
									>
										{(
											contact.first_name?.[0] ||
											contact.full_name?.[0] ||
											(contact.phone ? '#' : '?')
										).toUpperCase()}
									</div>
									<p
										class="font-medium text-[rgba(255,255,255,0.85)] truncate text-sm group-hover:text-base group-hover:tracking-wide transition-all duration-200"
										style="font-family: 'Playfair Display', serif;"
									>
										{contact.full_name || (contact.phone ? formatPhone(contact.phone) : 'Unknown')}
									</p>
									<!-- Quick actions — visible on hover -->
									{#if contact.phone}
										<div
											class="flex items-center gap-1.5 shrink-0 transition-opacity duration-200 opacity-0 group-hover:opacity-100"
										>
											<a
												href="/softphone?call={encodeURIComponent(contact.phone)}"
												class="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-emerald-500/40 text-emerald-400/60 hover:bg-emerald-500/15 hover:text-emerald-400 hover:border-emerald-400 transition-all"
												title="Call {contact.full_name || 'contact'}"
												onclick={(e) => e.stopPropagation()}
											>
												<PhoneOutgoing class="h-4 w-4" />
											</a>
											<a
												href="/messages?phone={encodeURIComponent(contact.phone)}{contact.full_name
													? '&name=' + encodeURIComponent(contact.full_name)
													: ''}&new=true"
												class="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-blue-500/40 text-blue-400/60 hover:bg-blue-500/15 hover:text-blue-400 hover:border-blue-400 transition-all"
												title="Message {contact.full_name || 'contact'}"
												onclick={(e) => e.stopPropagation()}
											>
												<MessageSquare class="h-4 w-4" />
											</a>
										</div>
									{/if}
								</div>
								<div class="flex items-center gap-1.5 shrink-0 ml-auto flex-wrap justify-end">
									{#if contact.tags && contact.tags.length > 0}
										{#each contact.tags as tag}
											<span
												class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium {getTagClasses(
													tag
												)}"
											>
												{getTagLabel(tag)}
											</span>
										{/each}
									{/if}
								</div>
							</button>
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
							<span class="flex items-center px-2 text-sm text-muted-foreground"
								>{page} / {totalPages}</span
							>
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

<!-- Contact Detail Slide-over Drawer -->
{#if expandedId !== null}
	<!-- Backdrop -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-40 transition-opacity duration-200 {drawerOpen
			? 'bg-black/60 opacity-100'
			: 'opacity-0 pointer-events-none'}"
		onclick={closeDrawer}
	></div>

	<!-- Panel -->
	<div
		class="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-[rgba(197,165,90,0.15)] bg-[#0e0e10] shadow-2xl transform transition-transform duration-200 ease-out overflow-y-auto {drawerOpen
			? 'translate-x-0'
			: 'translate-x-full'}"
	>
		<!-- Drawer header -->
		<div class="sticky top-0 z-10 bg-[#0e0e10] border-b border-[rgba(197,165,90,0.1)] px-5 py-4">
			<div class="flex items-start justify-between gap-3">
				<div class="flex items-center gap-4 min-w-0">
					<!-- Large avatar -->
					<div
						class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[rgba(197,165,90,0.12)] text-xl font-medium text-[#C5A55A] border border-[rgba(197,165,90,0.2)]"
						style="font-family: 'Playfair Display', serif;"
					>
						{#if expandedContact}
							{(
								expandedContact.first_name?.[0] ||
								expandedContact.full_name?.[0] ||
								(expandedContact.phone ? '#' : '?')
							).toUpperCase()}
						{:else}
							&middot;
						{/if}
					</div>
					<div class="min-w-0">
						<h2
							class="text-xl font-medium text-[rgba(255,255,255,0.9)] truncate tracking-wide"
							style="font-family: 'Playfair Display', serif;"
						>
							{#if expandedContact}
								{expandedContact.full_name ||
									(expandedContact.phone ? formatPhone(expandedContact.phone) : 'Unknown')}
							{:else}
								Loading...
							{/if}
						</h2>
						{#if expandedContact?.email}
							<p class="text-sm text-[rgba(255,255,255,0.4)] truncate">{expandedContact.email}</p>
						{/if}
					</div>
				</div>
				<button
					class="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg border border-[rgba(197,165,90,0.15)] text-[rgba(255,255,255,0.4)] hover:text-[rgba(255,255,255,0.8)] hover:border-[rgba(197,165,90,0.3)] hover:bg-[rgba(197,165,90,0.06)] transition-all"
					onclick={closeDrawer}
					title="Close"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Quick action buttons -->
			{#if expandedContact?.phone}
				<div class="flex items-center gap-2 mt-3">
					<a
						href="/softphone?call={encodeURIComponent(expandedContact.phone)}"
						class="flex-1 inline-flex items-center justify-center gap-2 h-9 rounded-lg border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/15 hover:border-emerald-400 transition-all text-sm font-medium"
					>
						<PhoneOutgoing class="h-4 w-4" />
						Call
					</a>
					<a
						href="/messages?phone={encodeURIComponent(
							expandedContact.phone
						)}{expandedContact.full_name
							? '&name=' + encodeURIComponent(expandedContact.full_name)
							: ''}&new=true"
						class="flex-1 inline-flex items-center justify-center gap-2 h-9 rounded-lg border border-blue-500/40 text-blue-400 hover:bg-blue-500/15 hover:border-blue-400 transition-all text-sm font-medium"
					>
						<MessageSquare class="h-4 w-4" />
						Message
					</a>
				</div>
			{/if}
		</div>

		<!-- Drawer body -->
		{#if expandedContact}
			<div class="px-5 py-5 space-y-5">
				<!-- Tags section -->
				<div class="card-elevated rounded-lg p-4">
					<p
						class="section-label text-xs font-medium text-[rgba(255,255,255,0.4)] mb-2.5 flex items-center gap-1.5 uppercase tracking-[0.1em]"
					>
						<Tag class="h-3.5 w-3.5" /> Tags
					</p>
					<div class="flex flex-wrap items-center gap-1.5">
						{#each expandedContact.tags || [] as tag}
							<span
								class="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium {getTagClasses(
									tag
								)}"
							>
								{getTagLabel(tag)}
								<button
									class="ml-1.5 hover:opacity-70 transition-opacity"
									onclick={() => removeTag(expandedContact.id, tag)}
									title="Remove tag"
								>
									<X class="h-3 w-3" />
								</button>
							</span>
						{/each}
						{#if addingTag === expandedContact.id}
							<form
								class="flex items-center gap-1"
								onsubmit={(e) => {
									e.preventDefault();
									addTag(expandedContact.id);
								}}
							>
								<input
									type="text"
									class="h-7 w-28 rounded-md border border-[rgba(197,165,90,0.2)] bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#C5A55A]"
									placeholder="tag name"
									bind:value={newTagInput}
									autofocus
								/>
								<button type="submit" class="text-xs text-[#C5A55A] hover:underline">Add</button>
								<button
									type="button"
									class="text-xs text-muted-foreground hover:underline"
									onclick={() => {
										addingTag = null;
										newTagInput = '';
									}}>Cancel</button
								>
							</form>
						{:else}
							<button
								class="inline-flex items-center gap-0.5 rounded-full border border-dashed border-[rgba(197,165,90,0.2)] px-2.5 py-1 text-xs text-[rgba(255,255,255,0.4)] hover:text-[#C5A55A] hover:border-[rgba(197,165,90,0.4)] transition-colors"
								onclick={() => {
									addingTag = expandedContact.id;
									newTagInput = '';
								}}
							>
								<Plus class="h-3 w-3" /> Add tag
							</button>
						{/if}
					</div>
				</div>

				<!-- Contact details -->
				<div class="card-elevated rounded-lg p-4">
					<p
						class="section-label text-xs font-medium text-[rgba(255,255,255,0.4)] mb-3 uppercase tracking-[0.1em]"
					>
						Contact Details
					</p>
					<div class="grid gap-3 grid-cols-2">
						<div>
							<p class="text-xs text-[rgba(255,255,255,0.35)] mb-0.5">Full Name</p>
							<p class="text-sm text-[rgba(255,255,255,0.85)]">
								{expandedContact.full_name || '—'}
							</p>
						</div>
						<div>
							<p class="text-xs text-[rgba(255,255,255,0.35)] mb-0.5">Phone</p>
							<p class="text-sm text-[rgba(255,255,255,0.85)]">
								{expandedContact.phone ? formatPhone(expandedContact.phone) : '—'}
							</p>
						</div>
						<div class="col-span-2">
							<p class="text-xs text-[rgba(255,255,255,0.35)] mb-0.5">Email</p>
							<p class="text-sm text-[rgba(255,255,255,0.85)] break-all">
								{expandedContact.email || '—'}
							</p>
						</div>
						<div>
							<p class="text-xs text-[rgba(255,255,255,0.35)] mb-0.5">City</p>
							<p class="text-sm text-[rgba(255,255,255,0.85)]">
								{expandedContact.metadata?.city || '—'}
							</p>
						</div>
						<div>
							<p class="text-xs text-[rgba(255,255,255,0.35)] mb-0.5">State</p>
							<p class="text-sm text-[rgba(255,255,255,0.85)]">
								{expandedContact.metadata?.state || '—'}
							</p>
						</div>
					</div>
				</div>

				<!-- Patient / Business Info -->
				<div class="card-elevated rounded-lg p-4">
					<p
						class="section-label text-xs font-medium text-[rgba(255,255,255,0.4)] mb-3 uppercase tracking-[0.1em]"
					>
						Patient Info
					</p>
					<div class="grid gap-3 grid-cols-2">
						<div>
							<p class="text-xs text-[rgba(255,255,255,0.35)] mb-0.5">AR ID</p>
							<p class="text-sm font-mono text-[rgba(255,255,255,0.7)]">
								{expandedContact.metadata?.ar_id || expandedContact.source_id || '—'}
							</p>
						</div>
						<div>
							<p class="text-xs text-[rgba(255,255,255,0.35)] mb-0.5">Last Visited</p>
							<p class="text-sm text-[rgba(255,255,255,0.85)]">
								{expandedContact.metadata?.last_visited || '—'}
							</p>
						</div>
						<div>
							<p class="text-xs text-[rgba(255,255,255,0.35)] mb-0.5">Total Sales</p>
							<p class="text-sm text-[rgba(255,255,255,0.85)]">
								{expandedContact.metadata?.total_sales
									? `$${expandedContact.metadata.total_sales}`
									: '—'}
							</p>
						</div>
						<div>
							<p class="text-xs text-[rgba(255,255,255,0.35)] mb-0.5">Source</p>
							<p class="text-sm text-[rgba(255,255,255,0.85)]">
								{sourceLabels[expandedContact.source] || expandedContact.source}
							</p>
						</div>
						<div>
							<p class="text-xs text-[rgba(255,255,255,0.35)] mb-0.5">Last Synced</p>
							<p class="text-sm text-[rgba(255,255,255,0.85)]">
								{expandedContact.last_synced_at
									? formatRelativeDate(expandedContact.last_synced_at)
									: '—'}
							</p>
						</div>
					</div>
				</div>

				<!-- Recent calls -->
				<div class="card-elevated rounded-lg p-4">
					<p
						class="section-label text-xs font-medium text-[rgba(255,255,255,0.4)] mb-2.5 flex items-center gap-1.5 uppercase tracking-[0.1em]"
					>
						<Phone class="h-3.5 w-3.5" /> Recent Calls
					</p>
					{#if expandedContact.recent_calls && expandedContact.recent_calls.length > 0}
						<div class="space-y-1.5">
							{#each expandedContact.recent_calls.slice(0, 5) as call}
								<div
									class="flex items-center justify-between text-sm bg-[rgba(197,165,90,0.04)] rounded-md px-3 py-2 border border-[rgba(197,165,90,0.08)]"
								>
									<div class="flex items-center gap-2">
										<Badge variant="outline" class="text-xs">
											{call.direction === 'inbound' ? 'In' : 'Out'}
										</Badge>
										<span class="text-[rgba(255,255,255,0.7)]"
											>{call.disposition || call.status}</span
										>
									</div>
									<span class="text-xs text-[rgba(255,255,255,0.35)]">
										{formatRelativeDate(call.started_at)}
									</span>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-sm text-[rgba(255,255,255,0.3)] italic">No call history yet.</p>
					{/if}
				</div>

				<!-- Form submissions -->
				{#if expandedContact.form_submissions && expandedContact.form_submissions.length > 0}
					<div class="card-elevated rounded-lg p-4">
						<p
							class="section-label text-xs font-medium text-[rgba(255,255,255,0.4)] mb-2.5 flex items-center gap-1.5 uppercase tracking-[0.1em]"
						>
							<FileText class="h-3.5 w-3.5" /> Website Inquiries
						</p>
						<div class="space-y-2">
							{#each expandedContact.form_submissions as sub}
								<div
									class="bg-[rgba(197,165,90,0.04)] rounded-md px-3 py-2.5 border border-[rgba(197,165,90,0.08)]"
								>
									<div class="flex items-center justify-between mb-1">
										<div class="flex items-center gap-2">
											{#if sub.interested_in}
												<Badge variant="outline" class="text-xs">{sub.interested_in}</Badge>
											{/if}
											<Badge
												variant={sub.status === 'new' ? 'default' : 'secondary'}
												class="text-xs">{sub.status}</Badge
											>
										</div>
										<span class="text-xs text-[rgba(255,255,255,0.35)]"
											>{formatRelativeDate(sub.created_at)}</span
										>
									</div>
									{#if sub.message}
										<p class="text-sm text-[rgba(255,255,255,0.7)] leading-relaxed mt-1">
											{sub.message}
										</p>
									{/if}
									{#if sub.preferred_contact || sub.referral_source}
										<div class="flex gap-3 mt-1 text-xs text-[rgba(255,255,255,0.35)]">
											{#if sub.preferred_contact}
												<span>Prefers: {sub.preferred_contact}</span>
											{/if}
											{#if sub.referral_source}
												<span>Found via: {sub.referral_source}</span>
											{/if}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Metadata -->
				{#if expandedContact.metadata && Object.keys(expandedContact.metadata).length > 0}
					<div class="card-elevated rounded-lg p-4">
						<details>
							<summary
								class="text-xs font-medium text-[rgba(255,255,255,0.4)] cursor-pointer hover:text-[#C5A55A] transition-colors uppercase tracking-[0.1em]"
							>
								Additional Info ({Object.keys(expandedContact.metadata).length} fields)
							</summary>
							<div
								class="grid gap-1.5 text-xs bg-[rgba(197,165,90,0.04)] rounded-md p-3 mt-2 border border-[rgba(197,165,90,0.08)]"
							>
								{#each Object.entries(expandedContact.metadata) as [key, val]}
									<div class="flex gap-2">
										<span
											class="font-medium capitalize whitespace-nowrap text-[rgba(255,255,255,0.6)]"
											>{key.replace(/_/g, ' ')}:</span
										>
										<span class="text-[rgba(255,255,255,0.35)] break-all"
											>{typeof val === 'object' ? JSON.stringify(val) : val}</span
										>
									</div>
								{/each}
							</div>
						</details>
					</div>
				{/if}
			</div>
		{:else}
			<!-- Loading state in drawer -->
			<div class="px-5 py-5 space-y-4">
				<Skeleton class="h-8 w-3/4" />
				<Skeleton class="h-24 w-full" />
				<Skeleton class="h-32 w-full" />
				<Skeleton class="h-20 w-full" />
			</div>
		{/if}
	</div>
{/if}
