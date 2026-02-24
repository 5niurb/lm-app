<script>
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import {
		Users,
		Search,
		Phone,
		ChevronLeft,
		ChevronRight,
		Tag,
		X,
		Plus,
		MessageSquare,
		PhoneOutgoing,
		FileText,
		GitMerge
	} from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { api } from '$lib/api/client.js';
	import { formatPhone, formatRelativeDate } from '$lib/utils/formatters.js';
	import { resolve } from '$app/paths';
	import ContactAvatar from '$lib/components/ContactAvatar.svelte';
	import DedupReviewSheet from '$lib/components/DedupReviewSheet.svelte';

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
	let dedupOpen = $state(false);

	function handleMerged(count) {
		loadContacts();
		loadStats();
		toast.success(`Merged ${count} duplicate group${count !== 1 ? 's' : ''}`);
	}

	const tagConfig = {
		patient: {
			label: 'Patient',
			color: 'bg-vivid-emerald/15 text-vivid-emerald border-vivid-emerald/30'
		},
		lead: { label: 'Lead', color: 'bg-vivid-blue/15 text-vivid-blue border-vivid-blue/30' },
		partner: {
			label: 'Partner',
			color: 'bg-vivid-violet/15 text-vivid-violet border-vivid-violet/30'
		},
		employee: {
			label: 'Employee',
			color: 'bg-vivid-amber/15 text-vivid-amber border-vivid-amber/30'
		},
		unknown: { label: 'Unknown', color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
		vip: { label: 'VIP', color: 'bg-vivid-amber/15 text-vivid-amber border-vivid-amber/30' },
		friendfam: {
			label: 'FriendFam',
			color: 'bg-vivid-pink/15 text-vivid-pink border-vivid-pink/30'
		},
		vendor: {
			label: 'Vendor',
			color: 'bg-vivid-orange/15 text-vivid-orange border-vivid-orange/30'
		}
	};

	const sourceLabels = {
		aesthetic_record: 'Aesthetic Record',
		textmagic: 'TextMagic',
		google_sheet: 'Google Sheet',
		manual: 'Manual',
		inbound_call: 'Phone',
		website_form: 'Website'
	};

	function formatPatientSince(raw) {
		if (!raw) return null;
		const d = new Date(raw);
		if (isNaN(d)) return raw; // fallback to raw string
		return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
	}

	// Initial load only — event handlers call loadContacts() explicitly.
	// untrack prevents the effect from re-running when page/search/tagFilter change.
	$effect(() => {
		untrack(() => {
			loadContacts();
			loadStats();
		});
	});

	async function loadContacts() {
		try {
			const params = new URLSearchParams({
				page: String(page),
				pageSize: String(pageSize)
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
	<div class="flex items-start justify-between">
		<div>
			<h1 class="text-2xl tracking-wide">Contacts</h1>
			<p class="text-sm text-text-secondary mt-1">
				CRM directory — {stats?.total || '...'} contacts across all sources.
			</p>
		</div>
		<Button variant="outline" size="sm" onclick={() => (dedupOpen = true)}>
			<GitMerge class="h-4 w-4 mr-1.5" />
			Review Duplicates
		</Button>
	</div>

	{#if error}
		<div class="rounded border border-vivid-rose/20 bg-vivid-rose/5 px-4 py-3">
			<p class="text-sm text-vivid-rose">{error}</p>
		</div>
	{/if}

	<!-- Tag filter tabs -->
	{#if stats}
		<div class="flex flex-wrap gap-2">
			<button
				class="group rounded border px-4 py-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 {tagFilter ===
				'all'
					? 'border-border bg-gold-glow'
					: 'border-border bg-surface-subtle hover:border-border hover:bg-gold-glow'}"
				onclick={() => setTag('all')}
			>
				<span
					class="text-xs uppercase tracking-[0.15em] {tagFilter === 'all'
						? 'text-gold'
						: 'text-text-tertiary'}">All</span
				>
				<span
					class="ml-2 text-xl font-light text-text-primary"
					style="font-family: var(--font-display);">{stats.total}</span
				>
			</button>
			{#each Object.entries(tagConfig) as [key, config] (key)}
				{#if stats.byTag?.[key]}
					<button
						class="group rounded border px-4 py-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 {tagFilter ===
						key
							? 'border-border bg-gold-glow'
							: 'border-border bg-surface-subtle hover:border-border hover:bg-gold-glow'}"
						onclick={() => setTag(key)}
					>
						<span class="inline-block w-2 h-2 rounded-full mr-1.5 {config.color.split(' ')[0]}"
							>&nbsp;</span
						>
						<span
							class="text-xs uppercase tracking-[0.15em] {tagFilter === key
								? 'text-gold'
								: 'text-text-tertiary'}">{config.label}</span
						>
						<span
							class="ml-2 text-xl font-light text-text-primary"
							style="font-family: var(--font-display);">{stats.byTag[key]}</span
						>
					</button>
				{/if}
			{/each}
		</div>
	{/if}

	<div class="rounded border border-border overflow-hidden bg-card">
		<div class="px-5 py-4 border-b border-border">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
				<form
					class="relative flex-1"
					onsubmit={(e) => {
						e.preventDefault();
						handleSearch();
					}}
				>
					<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-text-secondary" />
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
					{#each Array(8) as _, i (i)}
						<Skeleton class="h-14 w-full" />
					{/each}
				</div>
			{:else if contacts.length === 0}
				<div class="flex h-56 items-center justify-center">
					<div class="text-center">
						<div
							class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-glow border border-border"
						>
							<Users class="h-6 w-6 empty-state-icon" />
						</div>
						<p
							class="text-sm font-light text-text-tertiary mb-1"
							style="font-family: var(--font-display);"
						>
							No contacts found
						</p>
						{#if search || tagFilter !== 'all'}
							<p class="text-xs text-text-ghost">Try adjusting your search or filters.</p>
						{:else}
							<p class="text-xs text-text-ghost">
								Import contacts using the sync script or add them manually.
							</p>
						{/if}
					</div>
				</div>
			{:else}
				<div class="list-enter">
					{#each contacts as contact, i (contact.id)}
						<div
							class="group rounded-md border transition-all duration-200 hover:bg-gold-glow hover:border-border {expandedId ===
								contact.id && drawerOpen
								? 'border-border bg-gold-glow'
								: 'border-transparent'} {i > 0 ? 'border-t border-t-border-subtle' : ''}"
						>
							<button
								class="flex w-full items-center justify-between p-3 text-left"
								onclick={() => toggleExpand(contact.id)}
							>
								<div class="flex items-center gap-3 min-w-0 flex-1">
									<ContactAvatar
										name={contact.full_name}
										phone={contact.phone}
										source={contact.source}
										size="md"
									/>
									<p
										class="font-medium text-text-primary truncate text-sm group-hover:text-base group-hover:tracking-wide transition-all duration-200"
										style="font-family: var(--font-display);"
									>
										{contact.full_name || (contact.phone ? formatPhone(contact.phone) : 'Unknown')}
									</p>
									<!-- Quick actions — visible on hover -->
									{#if contact.phone}
										<div
											class="flex items-center gap-1.5 shrink-0 transition-opacity duration-200 opacity-0 group-hover:opacity-100"
										>
											<a
												href={resolve(`/softphone?call=${encodeURIComponent(contact.phone)}`)}
												class="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-vivid-emerald/30 text-vivid-emerald/50 hover:bg-vivid-emerald/10 hover:text-vivid-emerald hover:border-vivid-emerald transition-all"
												title="Call {contact.full_name || 'contact'}"
												onclick={(e) => e.stopPropagation()}
											>
												<PhoneOutgoing class="h-4 w-4" />
											</a>
											<a
												href={resolve(
													`/messages?phone=${encodeURIComponent(contact.phone)}${contact.full_name ? '&name=' + encodeURIComponent(contact.full_name) : ''}&new=true`
												)}
												class="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-vivid-blue/30 text-vivid-blue/50 hover:bg-vivid-blue/10 hover:text-vivid-blue hover:border-vivid-blue transition-all"
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
										{#each contact.tags as tag (tag)}
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
						<p class="text-sm text-text-secondary">
							Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount}
						</p>
						<div class="flex gap-1">
							<Button variant="outline" size="sm" onclick={prevPage} disabled={page <= 1}>
								<ChevronLeft class="h-4 w-4" />
							</Button>
							<span class="flex items-center px-2 text-sm text-text-secondary"
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
		class="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-border bg-card shadow-2xl transform transition-transform duration-200 ease-out overflow-y-auto {drawerOpen
			? 'translate-x-0'
			: 'translate-x-full'}"
	>
		<!-- Drawer header -->
		<div class="sticky top-0 z-10 bg-card border-b border-border px-5 py-4">
			<div class="flex items-start justify-between gap-3">
				<div class="flex items-center gap-4 min-w-0">
					<!-- Large avatar -->
					{#if expandedContact}
						<ContactAvatar
							name={expandedContact.full_name}
							phone={expandedContact.phone}
							source={expandedContact.source}
							size="lg"
						/>
					{:else}
						<div
							class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-subtle border border-border text-text-ghost"
						>
							&middot;
						</div>
					{/if}
					<div class="min-w-0">
						<h2
							class="text-xl font-medium text-text-primary truncate tracking-wide"
							style="font-family: var(--font-display);"
						>
							{#if expandedContact}
								{expandedContact.full_name ||
									(expandedContact.phone ? formatPhone(expandedContact.phone) : 'Unknown')}
							{:else}
								Loading...
							{/if}
						</h2>
						{#if expandedContact?.email}
							<p class="text-sm text-text-tertiary truncate">{expandedContact.email}</p>
						{/if}
					</div>
				</div>
				<button
					class="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg border border-border text-text-tertiary hover:text-text-primary hover:border-border hover:bg-gold-glow transition-all"
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
						href={resolve(`/softphone?call=${encodeURIComponent(expandedContact.phone)}`)}
						class="flex-1 inline-flex items-center justify-center gap-2 h-9 rounded-lg border border-vivid-emerald/30 text-vivid-emerald hover:bg-vivid-emerald/10 hover:border-vivid-emerald transition-all text-sm font-medium"
					>
						<PhoneOutgoing class="h-4 w-4" />
						Call
					</a>
					<a
						href={resolve(
							`/messages?phone=${encodeURIComponent(expandedContact.phone)}${expandedContact.full_name ? '&name=' + encodeURIComponent(expandedContact.full_name) : ''}&new=true`
						)}
						class="flex-1 inline-flex items-center justify-center gap-2 h-9 rounded-lg border border-vivid-blue/30 text-vivid-blue hover:bg-vivid-blue/10 hover:border-vivid-blue transition-all text-sm font-medium"
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
						class="section-label text-xs font-medium text-text-tertiary mb-2.5 flex items-center gap-1.5 uppercase tracking-[0.1em]"
					>
						<Tag class="h-3.5 w-3.5" /> Tags
					</p>
					<div class="flex flex-wrap items-center gap-1.5">
						{#each expandedContact.tags || [] as tag (tag)}
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
									class="h-7 w-28 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-gold"
									placeholder="tag name"
									bind:value={newTagInput}
									autofocus
								/>
								<button type="submit" class="text-xs text-gold hover:underline">Add</button>
								<button
									type="button"
									class="text-xs text-text-secondary hover:underline"
									onclick={() => {
										addingTag = null;
										newTagInput = '';
									}}>Cancel</button
								>
							</form>
						{:else}
							<button
								class="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-text-tertiary hover:text-gold hover:border-border transition-colors"
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
						class="section-label text-xs font-medium text-text-tertiary mb-3 uppercase tracking-[0.1em]"
					>
						Contact Details
					</p>
					<div class="grid gap-3 grid-cols-2">
						<div>
							<p class="text-xs text-text-tertiary mb-0.5">Full Name</p>
							<p class="text-sm text-text-primary">
								{expandedContact.full_name || '—'}
							</p>
						</div>
						<div>
							<p class="text-xs text-text-tertiary mb-0.5">Phone</p>
							<p class="text-sm text-text-primary">
								{expandedContact.phone ? formatPhone(expandedContact.phone) : '—'}
							</p>
						</div>
						<div class="col-span-2">
							<p class="text-xs text-text-tertiary mb-0.5">Email</p>
							<p class="text-sm text-text-primary break-all">
								{expandedContact.email || '—'}
							</p>
						</div>
						<div>
							<p class="text-xs text-text-tertiary mb-0.5">City</p>
							<p class="text-sm text-text-primary">
								{expandedContact.metadata?.address?.city || '—'}
							</p>
						</div>
						<div>
							<p class="text-xs text-text-tertiary mb-0.5">State</p>
							<p class="text-sm text-text-primary">
								{expandedContact.metadata?.address?.state || '—'}
							</p>
						</div>
						<div>
							<p class="text-xs text-text-tertiary mb-0.5">Preferred Contact</p>
							<p class="text-sm text-text-primary">
								{expandedContact.metadata?.preferred_contact || '—'}
							</p>
						</div>
						<div>
							<p class="text-xs text-text-tertiary mb-0.5">Source</p>
							<p class="text-sm text-text-primary">
								{sourceLabels[expandedContact.source] || expandedContact.source}
							</p>
						</div>
						<div>
							<p class="text-xs text-text-tertiary mb-0.5">Last Synced</p>
							<p class="text-sm text-text-primary">
								{expandedContact.last_synced_at
									? formatRelativeDate(expandedContact.last_synced_at)
									: '—'}
							</p>
						</div>
					</div>
				</div>

				<!-- Patient / Business Info -->
				{#if expandedContact.source === 'aesthetic_record' || expandedContact.tags?.includes('patient')}
					<div class="card-elevated rounded-lg p-4">
						<p
							class="section-label text-xs font-medium text-text-tertiary mb-3 uppercase tracking-[0.1em]"
						>
							Patient Info
						</p>
						<div class="grid gap-3 grid-cols-2">
							{#if expandedContact.metadata?.ar_created_date}
								<div class="col-span-2">
									<p class="text-xs text-text-tertiary mb-0.5">Patient Since</p>
									<p class="text-sm text-gold font-medium">
										{formatPatientSince(expandedContact.metadata.ar_created_date)}
									</p>
								</div>
							{/if}
							<div>
								<p class="text-xs text-text-tertiary mb-0.5">AR ID</p>
								<p class="text-sm font-mono text-text-secondary">
									{expandedContact.source_id && expandedContact.source === 'aesthetic_record'
										? expandedContact.source_id
										: '—'}
								</p>
							</div>
							<div>
								<p class="text-xs text-text-tertiary mb-0.5">Last Visited</p>
								<p class="text-sm text-text-primary">
									{expandedContact.metadata?.last_visited || '—'}
								</p>
							</div>
							<div>
								<p class="text-xs text-text-tertiary mb-0.5">Total Sales</p>
								<p class="text-sm text-text-primary">
									{expandedContact.metadata?.total_sales
										? `$${Math.round(Number(expandedContact.metadata.total_sales)).toLocaleString()}`
										: '—'}
								</p>
							</div>
							{#if expandedContact.metadata?.referral_source}
								<div>
									<p class="text-xs text-text-tertiary mb-0.5">Referral</p>
									<p class="text-sm text-text-primary">
										{expandedContact.metadata.referral_source}
									</p>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Recent calls -->
				<div class="card-elevated rounded-lg p-4">
					<p
						class="section-label text-xs font-medium text-text-tertiary mb-2.5 flex items-center gap-1.5 uppercase tracking-[0.1em]"
					>
						<Phone class="h-3.5 w-3.5" /> Recent Calls
					</p>
					{#if expandedContact.recent_calls && expandedContact.recent_calls.length > 0}
						<div class="space-y-1.5">
							{#each expandedContact.recent_calls.slice(0, 5) as call (call.id)}
								<div
									class="flex items-center justify-between text-sm bg-gold-glow rounded-md px-3 py-2 border border-border"
								>
									<div class="flex items-center gap-2">
										<Badge variant="outline" class="text-xs">
											{call.direction === 'inbound' ? 'In' : 'Out'}
										</Badge>
										<span class="text-text-secondary">{call.disposition || call.status}</span>
									</div>
									<span class="text-xs text-text-tertiary">
										{formatRelativeDate(call.started_at)}
									</span>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-sm text-text-tertiary italic">No call history yet.</p>
					{/if}
				</div>

				<!-- Form submissions -->
				{#if expandedContact.form_submissions && expandedContact.form_submissions.length > 0}
					<div class="card-elevated rounded-lg p-4">
						<p
							class="section-label text-xs font-medium text-text-tertiary mb-2.5 flex items-center gap-1.5 uppercase tracking-[0.1em]"
						>
							<FileText class="h-3.5 w-3.5" /> Website Inquiries
						</p>
						<div class="space-y-2">
							{#each expandedContact.form_submissions as sub (sub.id)}
								<div class="bg-gold-glow rounded-md px-3 py-2.5 border border-border">
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
										<span class="text-xs text-text-tertiary"
											>{formatRelativeDate(sub.created_at)}</span
										>
									</div>
									{#if sub.message}
										<p class="text-sm text-text-secondary leading-relaxed mt-1">
											{sub.message}
										</p>
									{/if}
									{#if sub.preferred_contact || sub.referral_source}
										<div class="flex gap-3 mt-1 text-xs text-text-tertiary">
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
								class="text-xs font-medium text-text-tertiary cursor-pointer hover:text-gold transition-colors uppercase tracking-[0.1em]"
							>
								Additional Info ({Object.keys(expandedContact.metadata).length} fields)
							</summary>
							<div
								class="grid gap-1.5 text-xs bg-gold-glow rounded-md p-3 mt-2 border border-border"
							>
								{#each Object.entries(expandedContact.metadata) as [key, val] (key)}
									<div class="flex gap-2">
										<span class="font-medium capitalize whitespace-nowrap text-text-secondary"
											>{key.replace(/_/g, ' ')}:</span
										>
										<span class="text-text-tertiary break-all"
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

<DedupReviewSheet bind:open={dedupOpen} onMerged={handleMerged} />
