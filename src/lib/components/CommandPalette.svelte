<script>
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
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
		ArrowRight
	} from '@lucide/svelte';

	let open = $state(false);
	let query = $state('');
	let selectedIndex = $state(0);
	/** @type {HTMLInputElement|null} */
	let inputEl = $state(null);

	/** @type {Array<{ id: string, name: string, phone?: string, email?: string }>} */
	let contactResults = $state([]);
	let searchTimeout = $state(0);

	const pages = [
		{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', group: 'Pages' },
		{ id: 'softphone', label: 'Softphone', icon: Headset, href: '/softphone', group: 'Pages' },
		{ id: 'calls', label: 'Phone Log', icon: Phone, href: '/calls', group: 'Pages' },
		{ id: 'messages', label: 'Messages', icon: MessageSquare, href: '/messages', group: 'Pages' },
		{ id: 'contacts', label: 'Contacts', icon: Users, href: '/contacts', group: 'Pages' },
		{ id: 'schedule', label: 'Schedule', icon: CalendarDays, href: '/appointments', group: 'Pages' },
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
			action: () => goto(resolve('/messages') + '?compose=true')
		},
		{
			id: 'make-call',
			label: 'Make a Call',
			icon: PhoneOutgoing,
			group: 'Actions',
			action: () => goto(resolve('/softphone'))
		},
		{
			id: 'add-contact',
			label: 'Add Contact',
			icon: UserPlus,
			group: 'Actions',
			action: () => goto(resolve('/contacts') + '?action=add')
		}
	];

	let filteredItems = $derived.by(() => {
		const q = query.toLowerCase().trim();
		if (!q) return [...pages, ...actions];

		const filtered = [
			...pages.filter(
				(p) => p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
			),
			...actions.filter((a) => a.label.toLowerCase().includes(q))
		];
		return filtered;
	});

	/** @type {Array<{ id: string, label: string, subtitle?: string, icon: any, group: string, href?: string, action?: () => void }>} */
	let allItems = $derived.by(() => {
		const items = [...filteredItems];
		for (const c of contactResults) {
			items.push({
				id: `contact-${c.id}`,
				label: c.name,
				subtitle: c.phone || c.email || '',
				icon: Users,
				group: 'Contacts',
				action: () => goto(resolve('/contacts') + `?search=${encodeURIComponent(c.name)}`)
			});
		}
		return items;
	});

	// Reset index when items change
	$effect(() => {
		// Access allItems to track changes
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
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(async () => {
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

	/** Open the palette */
	export function show() {
		open = true;
		query = '';
		contactResults = [];
		selectedIndex = 0;
		// Focus input after DOM update
		setTimeout(() => inputEl?.focus(), 10);
	}

	/** @param {KeyboardEvent} e */
	function handleGlobalKeydown(e) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			if (open) {
				open = false;
			} else {
				show();
			}
		}
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			open = false;
		}
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

	/** @param {any} item */
	function selectItem(item) {
		open = false;
		if (item.action) {
			item.action();
		} else if (item.href) {
			goto(resolve(item.href));
		}
	}

	/**
	 * Group items by their group property
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
		return Array.from(map.entries()).map(([group, items]) => ({ group, items }));
	}

	/**
	 * Get the flat index of an item
	 * @param {any} item
	 */
	function getItemIndex(item) {
		return allItems.indexOf(item);
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

{#if open}
	<!-- Backdrop -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
		onmousedown={() => (open = false)}
		onkeydown={() => {}}
	>
		<!-- Palette -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="mx-auto mt-[15vh] w-full max-w-lg overflow-hidden rounded-xl border border-border-subtle bg-[var(--surface-raised,#161619)] shadow-2xl"
			onmousedown={(e) => e.stopPropagation()}
			onkeydown={() => {}}
		>
			<!-- Search input -->
			<div class="flex items-center gap-3 border-b border-border-subtle px-4">
				<Search class="h-4 w-4 shrink-0 text-text-tertiary" />
				<input
					bind:this={inputEl}
					bind:value={query}
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
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors {idx ===
									selectedIndex
										? 'bg-gold/10 text-gold'
										: 'text-text-secondary hover:bg-[rgba(255,255,255,0.04)] hover:text-text-primary'}"
									onmouseenter={() => (selectedIndex = idx)}
									onmousedown={() => selectItem(item)}
									onkeydown={() => {}}
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
								</div>
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
