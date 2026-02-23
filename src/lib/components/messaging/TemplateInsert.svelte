<script>
	import { FileText, Search } from '@lucide/svelte';
	import { api } from '$lib/api/client.js';

	/** @type {{ onInsert: (body: string) => void }} */
	let { onInsert } = $props();

	let open = $state(false);
	let search = $state('');
	/** @type {any[]} */
	let templates = $state([]);
	let loading = $state(false);
	/** @type {HTMLElement|null} */
	let menuRef = $state(null);

	async function loadTemplates() {
		loading = true;
		try {
			const params = new URLSearchParams();
			if (search) params.set('search', search);
			const res = await api(`/api/templates?${params}`);
			templates = res.data || [];
		} catch (e) {
			console.error('Failed to load templates:', e);
		} finally {
			loading = false;
		}
	}

	function handleSelect(template) {
		onInsert(template.body);
		open = false;
		search = '';
	}

	function handleClickOutside(e) {
		if (menuRef && !menuRef.contains(e.target)) {
			open = false;
		}
	}

	$effect(() => {
		if (open) {
			loadTemplates();
			document.addEventListener('mousedown', handleClickOutside);
			return () => document.removeEventListener('mousedown', handleClickOutside);
		}
	});

	function getCategoryColor(cat) {
		const colors = {
			appointment: 'text-vivid-blue bg-vivid-blue/10',
			follow_up: 'text-vivid-emerald bg-vivid-emerald/10',
			promotion: 'text-amber-400 bg-amber-400/10',
			reminder: 'text-orange-400 bg-orange-400/10',
			greeting: 'text-pink-400 bg-pink-400/10',
			general: 'text-text-tertiary bg-surface-subtle',
			custom: 'text-purple-400 bg-purple-400/10'
		};
		return colors[cat] || colors.general;
	}
</script>

<div class="relative" bind:this={menuRef}>
	<button
		type="button"
		class="inline-flex items-center justify-center h-8 w-8 rounded-md text-text-tertiary hover:text-text-secondary hover:bg-surface-subtle transition-colors"
		title="Insert template"
		onclick={() => {
			open = !open;
		}}
	>
		<FileText class="h-4 w-4" />
	</button>

	{#if open}
		<div
			class="absolute bottom-10 left-0 z-50 w-80 rounded-lg border border-border bg-card shadow-xl"
		>
			<!-- Search -->
			<div class="p-2 border-b border-border">
				<div class="relative">
					<Search class="absolute left-2 top-2 h-3.5 w-3.5 text-text-ghost" />
					<input
						type="text"
						placeholder="Search templates..."
						class="w-full pl-7 pr-2 py-1.5 text-xs rounded bg-surface-subtle border border-border-subtle focus:border-gold focus:outline-none text-text-primary placeholder:text-text-ghost"
						bind:value={search}
						oninput={() => loadTemplates()}
					/>
				</div>
			</div>

			<!-- Template list -->
			<div class="max-h-64 overflow-y-auto">
				{#if loading}
					<div class="p-4 text-center">
						<p class="text-xs text-text-tertiary">Loading...</p>
					</div>
				{:else if templates.length === 0}
					<div class="p-4 text-center">
						<p class="text-xs text-text-tertiary">No templates found</p>
					</div>
				{:else}
					{#each templates as tpl (tpl.id)}
						<button
							type="button"
							class="w-full text-left px-3 py-2.5 hover:bg-surface-hover transition-colors border-b border-border-subtle last:border-0"
							onclick={() => handleSelect(tpl)}
						>
							<div class="flex items-center gap-2 mb-1">
								<span class="text-sm font-medium text-text-primary">{tpl.name}</span>
								<span
									class="text-[9px] px-1.5 py-0.5 rounded-full font-medium {getCategoryColor(
										tpl.category
									)}"
								>
									{tpl.category.replace('_', ' ')}
								</span>
							</div>
							<p class="text-[11px] text-text-tertiary line-clamp-2">{tpl.body}</p>
						</button>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>
