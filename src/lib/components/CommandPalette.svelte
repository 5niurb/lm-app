<script>
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { tick } from 'svelte';
	import { api } from '$lib/api/client.js';
	import {
		LayoutDashboard,
		Headset,
		Phone,
		MessageSquare,
		Users,
		CalendarDays,
		Sparkles,
		Zap,
		Settings,
		Search,
		PhoneOutgoing,
		Mail,
		UserPlus,
		ArrowRight,
		Clock
	} from '@lucide/svelte';

	let visible = $state(false);
	let query = $state('');
	let selectedIndex = $state(0);
	/** @type {HTMLInputElement|null} */
	let inputEl = $state(null);
	/** @type {HTMLDivElement|null} */
	let backdropEl = $state(null);

	/** @type {Array<{ id: string, name: string, phone?: string, email?: string }>} */
	let contactResults = $state([]);
	/** @type {ReturnType<typeof setTimeout>|null} */
	let searchTimer = null;

	// =========================================================================
	// FRECENCY — localStorage-backed recent page tracking
	// =========================================================================
	const STORAGE_KEY = 'lm-command-palette-recent';
	const MAX_HISTORY = 20;
	const MAX_RECENT_SHOWN = 5;

	/**
	 * @typedef {{ id: string, visits: number, lastVisit: number }} FrecencyEntry
	 */

	/** Load frecency data from localStorage */
	function loadFrecency() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return [];
			return /** @type {FrecencyEntry[]} */ (JSON.parse(raw));
		} catch {
			return [];
		}
	}

	/** Save frecency data to localStorage */
	function saveFrecency(/** @type {FrecencyEntry[]} */ entries) {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
		} catch {
			// Storage full or unavailable — silently fail
		}
	}

	/** Record a visit to a page/action item */
	function recordVisit(/** @type {string} */ itemId) {
		const entries = loadFrecency();
		const existing = entries.find((e) => e.id === itemId);
		const now = Date.now();

		if (existing) {
			existing.visits += 1;
			existing.lastVisit = now;
		} else {
			entries.push({ id: itemId, visits: 1, lastVisit: now });
		}

		// Prune to MAX_HISTORY, keeping highest-scored entries
		if (entries.length > MAX_HISTORY) {
			entries.sort((a, b) => getFrecencyScore(b) - getFrecencyScore(a));
			entries.length = MAX_HISTORY;
		}

		saveFrecency(entries);
	}

	/**
	 * Calculate frecency score for an entry.
	 * Score = visits × recencyMultiplier
	 * Recency decays: <1h = 4x, <1d = 2x, <3d = 1.5x, <7d = 1x, older = 0.5x
	 */
	function getFrecencyScore(/** @type {FrecencyEntry} */ entry) {
		const hoursSince = (Date.now() - entry.lastVisit) / (1000 * 60 * 60);
		let recency = 0.5;
		if (hoursSince < 1) recency = 4;
		else if (hoursSince < 24) recency = 2;
		else if (hoursSince < 72) recency = 1.5;
		else if (hoursSince < 168) recency = 1;
		return entry.visits * recency;
	}

	/** Get top frecent item IDs */
	function getRecentIds() {
		const entries = loadFrecency();
		if (entries.length === 0) return [];
		return entries
			.sort((a, b) => getFrecencyScore(b) - getFrecencyScore(a))
			.slice(0, MAX_RECENT_SHOWN)
			.map((e) => e.id);
	}

	const pages = [
		{
			id: 'dashboard',
			label: 'Dashboard',
			icon: LayoutDashboard,
			href: '/dashboard',
			group: 'Pages'
		},
		{ id: 'softphone', label: 'Softphone', icon: Headset, href: '/softphone', group: 'Pages' },
		{ id: 'calls', label: 'Phone Log', icon: Phone, href: '/calls', group: 'Pages' },
		{ id: 'messages', label: 'Messages', icon: MessageSquare, href: '/messages', group: 'Pages' },
		{ id: 'contacts', label: 'Contacts', icon: Users, href: '/contacts', group: 'Pages' },
		{
			id: 'schedule',
			label: 'Schedule',
			icon: CalendarDays,
			href: '/appointments',
			group: 'Pages'
		},
		{ id: 'services', label: 'Services', icon: Sparkles, href: '/services', group: 'Pages' },
		{ id: 'automation', label: 'Automation', icon: Zap, href: '/automation', group: 'Pages' },
		{ id: 'settings', label: 'Settings', icon: Settings, href: '/settings', group: 'Pages' }
	];

	const actions = [
		{
			id: 'new-message',
			label: 'New Message',
			icon: Mail,
			group: 'Actions',
			href: '/messages?compose=true'
		},
		{
			id: 'make-call',
			label: 'Make a Call',
			icon: PhoneOutgoing,
			group: 'Actions',
			href: '/softphone'
		},
		{
			id: 'add-contact',
			label: 'Add Contact',
			icon: UserPlus,
			group: 'Actions',
			href: '/contacts?action=add'
		}
	];

	/** All page + action items mapped by id for quick lookup */
	const itemsById = new Map([...pages, ...actions].map((i) => [i.id, i]));

	let filteredItems = $derived.by(() => {
		const q = query.toLowerCase().trim();

		if (!q) {
			// No query — show Recent group first, then pages, then actions
			const recentIds = getRecentIds();
			/** @type {any[]} */
			const recentItems = [];
			for (const rid of recentIds) {
				const item = itemsById.get(rid);
				if (item) {
					recentItems.push({ ...item, group: 'Recent', icon: Clock });
				}
			}
			return [...recentItems, ...pages, ...actions];
		}

		return [
			...pages.filter((p) => p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)),
			...actions.filter((a) => a.label.toLowerCase().includes(q))
		];
	});

	let allItems = $derived.by(() => {
		const items = [...filteredItems];
		for (const c of contactResults) {
			items.push({
				id: `contact-${c.id}`,
				label: c.name,
				subtitle: c.phone || c.email || '',
				icon: Users,
				group: 'Contacts',
				href: `/contacts?search=${encodeURIComponent(c.name)}`
			});
		}
		return items;
	});

	// Reset index when items change
	$effect(() => {
		allItems.length;
		selectedIndex = 0;
	});

	// Search contacts when query has 2+ chars
	$effect(() => {
		const q = query.trim();
		if (q.length < 2) {
			contactResults = [];
			return;
		}
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(async () => {
			try {
				const res = await api(`/api/contacts/search?q=${encodeURIComponent(q)}&limit=5`);
				contactResults = (res.data || res || []).map((/** @type {any} */ c) => ({
					id: c.id,
					name: c.full_name || c.phone_normalized || 'Unknown',
					phone: c.phone,
					email: c.email
				}));
			} catch {
				contactResults = [];
			}
		}, 200);
	});

	// Global keyboard listener via document.addEventListener
	$effect(() => {
		/** @param {KeyboardEvent} e */
		function onKeydown(e) {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				if (visible) {
					close();
				} else {
					show();
				}
				return;
			}
			if (visible && e.key === 'Escape') {
				e.preventDefault();
				close();
				return;
			}
		}
		document.addEventListener('keydown', onKeydown, true);
		return () => document.removeEventListener('keydown', onKeydown, true);
	});

	function close() {
		visible = false;
		query = '';
		contactResults = [];
	}

	/** Open the palette */
	export function show() {
		visible = true;
		query = '';
		contactResults = [];
		selectedIndex = 0;
		tick().then(() => inputEl?.focus());
	}

	/** @param {KeyboardEvent} e */
	function handleInputKeydown(e) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, allItems.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, 0);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const item = allItems[selectedIndex];
			if (item) selectItem(item);
		}
	}

	/** @param {{ id?: string, href?: string }} item */
	async function selectItem(item) {
		// Record visit for frecency tracking (only pages + actions, not contacts)
		if (item.id && !item.id.startsWith('contact-')) {
			// If it's a Recent item, record the underlying page/action id
			const baseId = item.id;
			const original = itemsById.get(baseId);
			if (original) recordVisit(original.id);
			else recordVisit(baseId);
		}

		close();
		await tick();
		if (item.href) {
			// Separate base path from query string for resolve
			const [path, qs] = item.href.split('?');
			const target = resolve(path) + (qs ? `?${qs}` : '');
			goto(target);
		}
	}

	/**
	 * @param {Array<any>} items
	 * @returns {Array<{ group: string, items: Array<any> }>}
	 */
	function groupItems(items) {
		/** @type {Map<string, Array<any>>} */
		const map = new Map();
		for (const item of items) {
			const group = item.group || 'Other';
			if (!map.has(group)) map.set(group, []);
			map.get(group)?.push(item);
		}
		return Array.from(map.entries()).map(([group, gItems]) => ({ group, items: gItems }));
	}

	/** @param {any} item */
	function getItemIndex(item) {
		return allItems.indexOf(item);
	}

	/** Sync query from input events (handles browser automation edge cases) */
	function handleInput(/** @type {Event} */ e) {
		const target = /** @type {HTMLInputElement} */ (e.target);
		query = target.value;
	}
</script>

{#if visible}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={backdropEl}
		class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
		onclick={(e) => {
			if (e.target === backdropEl) close();
		}}
		onkeydown={() => {}}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="mx-auto mt-[15vh] w-full max-w-lg overflow-hidden rounded-xl border border-border-subtle bg-[var(--surface-raised,#161619)] shadow-2xl"
			onkeydown={() => {}}
		>
			<!-- Search input -->
			<div class="flex items-center gap-3 border-b border-border-subtle px-4">
				<Search class="h-4 w-4 shrink-0 text-text-tertiary" />
				<input
					bind:this={inputEl}
					bind:value={query}
					oninput={handleInput}
					onkeydown={handleInputKeydown}
					type="text"
					placeholder="Search pages, actions, contacts..."
					class="h-12 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-ghost"
				/>
				<kbd
					class="hidden sm:inline-flex h-5 items-center rounded border border-border-subtle bg-[rgba(255,255,255,0.03)] px-1.5 text-[10px] text-text-ghost"
				>
					ESC
				</kbd>
			</div>

			<!-- Results -->
			<div class="max-h-80 overflow-y-auto overscroll-contain py-2">
				{#if allItems.length === 0}
					<div class="py-8 text-center text-sm text-text-tertiary">No results found</div>
				{:else}
					{#each groupItems(allItems) as { group, items } (group)}
						<div class="px-2 pb-1">
							<div
								class="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-text-ghost"
							>
								{group}
							</div>
							{#each items as item (item.id)}
								{@const idx = getItemIndex(item)}
								<button
									type="button"
									class="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors {idx ===
									selectedIndex
										? 'bg-gold/10 text-gold'
										: 'text-text-secondary hover:bg-[rgba(255,255,255,0.04)] hover:text-text-primary'}"
									onmouseenter={() => (selectedIndex = idx)}
									onclick={() => selectItem(item)}
								>
									<item.icon class="h-4 w-4 shrink-0 opacity-60" />
									<div class="flex-1 min-w-0">
										<div class="text-sm truncate">{item.label}</div>
										{#if item.subtitle}
											<div class="text-xs text-text-ghost truncate">{item.subtitle}</div>
										{/if}
									</div>
									{#if idx === selectedIndex}
										<ArrowRight class="h-3.5 w-3.5 shrink-0 opacity-40" />
									{/if}
								</button>
							{/each}
						</div>
					{/each}
				{/if}
			</div>

			<!-- Footer -->
			<div
				class="flex items-center gap-4 border-t border-border-subtle px-4 py-2 text-[10px] text-text-ghost"
			>
				<span class="flex items-center gap-1">
					<kbd class="rounded border border-border-subtle px-1 py-0.5">↑↓</kbd> navigate
				</span>
				<span class="flex items-center gap-1">
					<kbd class="rounded border border-border-subtle px-1 py-0.5">↵</kbd> select
				</span>
				<span class="flex items-center gap-1">
					<kbd class="rounded border border-border-subtle px-1 py-0.5">esc</kbd> close
				</span>
			</div>
		</div>
	</div>
{/if}
