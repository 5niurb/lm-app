<script>
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import { Sparkles, Plus, Pencil, Trash2, ChevronDown, ChevronRight, FileText, X } from '@lucide/svelte';
	import { api } from '$lib/api/client.js';
	import { isAdmin } from '$lib/stores/auth.js';

	/** @type {any[]} */
	let services = $state([]);
	let loading = $state(true);
	let error = $state('');

	// Form state
	let showForm = $state(false);
	/** @type {any} */
	let editingService = $state(null);
	let formName = $state('');
	let formSlug = $state('');
	let formCategory = $state('advanced_aesthetics');
	let formDescription = $state('');
	let formDuration = $state('');
	let formPrice = $state('');
	let formActive = $state(true);
	let formSaving = $state(false);

	// Expanded service (shows content blocks)
	/** @type {string|null} */
	let expandedId = $state(null);
	/** @type {Record<string, any[]>} */
	let serviceContent = $state({});

	// Toast
	let toast = $state('');
	let toastType = $state('success');

	const categories = [
		{ value: 'advanced_aesthetics', label: 'Advanced Aesthetics' },
		{ value: 'regenerative_wellness', label: 'Regenerative Wellness' },
		{ value: 'bespoke_treatments', label: 'Bespoke Treatments' }
	];

	const contentTypes = [
		{ value: 'pre_instructions', label: 'Pre-Treatment Instructions', color: 'text-blue-400' },
		{ value: 'post_instructions', label: 'Post-Treatment Instructions', color: 'text-green-400' },
		{ value: 'consent_form', label: 'Consent Form', color: 'text-yellow-400' },
		{ value: 'questionnaire', label: 'Questionnaire', color: 'text-purple-400' },
		{ value: 'faq', label: 'FAQ', color: 'text-cyan-400' },
		{ value: 'what_to_expect', label: 'What to Expect', color: 'text-orange-400' }
	];

	$effect(() => { loadServices(); });

	async function loadServices() {
		try {
			const res = await api('/api/services');
			services = res.data || [];
		} catch (e) {
			error = e.message;
		} finally {
			loading = false;
		}
	}

	function showToast(msg, type = 'success') {
		toast = msg;
		toastType = type;
		setTimeout(() => { toast = ''; }, 3000);
	}

	function categoryLabel(val) {
		return categories.find(c => c.value === val)?.label || val;
	}

	function categoryColor(val) {
		switch(val) {
			case 'advanced_aesthetics': return 'bg-[rgba(197,165,90,0.15)] text-[#c5a55a]';
			case 'regenerative_wellness': return 'bg-emerald-500/10 text-emerald-400';
			case 'bespoke_treatments': return 'bg-purple-500/10 text-purple-400';
			default: return 'bg-white/5 text-white/50';
		}
	}

	function openCreateForm() {
		editingService = null;
		formName = '';
		formSlug = '';
		formCategory = 'advanced_aesthetics';
		formDescription = '';
		formDuration = '';
		formPrice = '';
		formActive = true;
		showForm = true;
	}

	function openEditForm(service) {
		editingService = service;
		formName = service.name;
		formSlug = service.slug;
		formCategory = service.category;
		formDescription = service.description || '';
		formDuration = service.duration_min?.toString() || '';
		formPrice = service.price_from?.toString() || '';
		formActive = service.is_active;
		showForm = true;
	}

	function autoSlug() {
		if (!editingService) {
			formSlug = formName
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '');
		}
	}

	async function saveService() {
		if (!formName || !formSlug || !formCategory) {
			showToast('Name, slug, and category are required', 'error');
			return;
		}
		formSaving = true;
		try {
			const body = {
				name: formName,
				slug: formSlug,
				category: formCategory,
				description: formDescription || null,
				duration_min: formDuration ? parseInt(formDuration) : null,
				price_from: formPrice ? parseFloat(formPrice) : null,
				is_active: formActive
			};

			if (editingService) {
				await api(`/api/services/${editingService.id}`, {
					method: 'PUT',
					body: JSON.stringify(body)
				});
				showToast('Service updated');
			} else {
				await api('/api/services', {
					method: 'POST',
					body: JSON.stringify(body)
				});
				showToast('Service created');
			}
			showForm = false;
			await loadServices();
		} catch (e) {
			showToast(e.message, 'error');
		} finally {
			formSaving = false;
		}
	}

	async function deleteService(service) {
		if (!confirm(`Delete "${service.name}"? This will also delete all associated content and automation sequences.`)) return;
		try {
			await api(`/api/services/${service.id}`, { method: 'DELETE' });
			showToast('Service deleted');
			await loadServices();
		} catch (e) {
			showToast(e.message, 'error');
		}
	}

	async function toggleExpanded(serviceId) {
		if (expandedId === serviceId) {
			expandedId = null;
			return;
		}
		expandedId = serviceId;
		if (!serviceContent[serviceId]) {
			try {
				const res = await api(`/api/services/${serviceId}/content`);
				serviceContent[serviceId] = res.data || [];
			} catch {
				serviceContent[serviceId] = [];
			}
		}
	}

	function contentTypeLabel(val) {
		return contentTypes.find(c => c.value === val)?.label || val;
	}

	function contentTypeColor(val) {
		return contentTypes.find(c => c.value === val)?.color || 'text-white/50';
	}

	// Group services by category
	let grouped = $derived(
		categories.map(cat => ({
			...cat,
			services: services.filter(s => s.category === cat.value)
		})).filter(g => g.services.length > 0)
	);
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl tracking-wide">Services</h1>
			<p class="text-sm text-muted-foreground mt-1">Treatment catalog — powers automation, content, and booking.</p>
		</div>
		{#if $isAdmin}
			<button
				onclick={openCreateForm}
				class="flex items-center gap-2 px-4 py-2 rounded text-sm bg-[#c5a55a] text-[#0a0a0c] hover:bg-[#d4af37] transition-colors font-medium"
			>
				<Plus class="h-4 w-4" />
				Add Service
			</button>
		{/if}
	</div>

	{#if error}
		<div class="rounded border border-red-500/30 bg-red-500/5 px-4 py-3">
			<p class="text-sm text-red-400">{error}</p>
		</div>
	{/if}

	<!-- Toast -->
	{#if toast}
		<div class="fixed top-4 right-4 z-50 px-4 py-3 rounded border text-sm animate-in fade-in slide-in-from-top-2 {toastType === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}">
			{toast}
		</div>
	{/if}

	<!-- Service Form (Create/Edit) -->
	{#if showForm}
		<div class="rounded border border-[rgba(197,165,90,0.2)] bg-[rgba(197,165,90,0.03)] p-6 space-y-4">
			<div class="flex items-center justify-between">
				<h2 class="text-base tracking-wide">{editingService ? 'Edit Service' : 'New Service'}</h2>
				<button onclick={() => showForm = false} class="text-[rgba(255,255,255,0.3)] hover:text-white transition-colors">
					<X class="h-4 w-4" />
				</button>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label class="text-xs uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-1 block">Name *</label>
					<input
						type="text"
						bind:value={formName}
						oninput={autoSlug}
						placeholder="e.g. Neuromodulators (Botox/Dysport)"
						class="w-full px-3 py-2 rounded border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-sm focus:border-[#c5a55a] focus:outline-none transition-colors"
					/>
				</div>

				<div>
					<label class="text-xs uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-1 block">Slug *</label>
					<input
						type="text"
						bind:value={formSlug}
						placeholder="e.g. neuromodulators"
						class="w-full px-3 py-2 rounded border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-sm font-mono focus:border-[#c5a55a] focus:outline-none transition-colors"
					/>
				</div>

				<div>
					<label class="text-xs uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-1 block">Category *</label>
					<select
						bind:value={formCategory}
						class="w-full px-3 py-2 rounded border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-sm focus:border-[#c5a55a] focus:outline-none transition-colors"
					>
						{#each categories as cat}
							<option value={cat.value}>{cat.label}</option>
						{/each}
					</select>
				</div>

				<div class="flex gap-4">
					<div class="flex-1">
						<label class="text-xs uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-1 block">Duration (min)</label>
						<input
							type="number"
							bind:value={formDuration}
							placeholder="45"
							class="w-full px-3 py-2 rounded border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-sm focus:border-[#c5a55a] focus:outline-none transition-colors"
						/>
					</div>
					<div class="flex-1">
						<label class="text-xs uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-1 block">Price From ($)</label>
						<input
							type="number"
							bind:value={formPrice}
							placeholder="250"
							step="0.01"
							class="w-full px-3 py-2 rounded border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-sm focus:border-[#c5a55a] focus:outline-none transition-colors"
						/>
					</div>
				</div>
			</div>

			<div>
				<label class="text-xs uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-1 block">Description</label>
				<textarea
					bind:value={formDescription}
					rows="2"
					placeholder="Brief service description..."
					class="w-full px-3 py-2 rounded border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-sm focus:border-[#c5a55a] focus:outline-none transition-colors resize-none"
				></textarea>
			</div>

			<div class="flex items-center gap-6">
				<label class="flex items-center gap-2 cursor-pointer">
					<input type="checkbox" bind:checked={formActive} class="accent-[#c5a55a]" />
					<span class="text-sm text-[rgba(255,255,255,0.6)]">Active</span>
				</label>

				<div class="flex-1"></div>

				<button onclick={() => showForm = false} class="px-4 py-2 text-sm text-[rgba(255,255,255,0.5)] hover:text-white transition-colors">
					Cancel
				</button>
				<button
					onclick={saveService}
					disabled={formSaving}
					class="px-4 py-2 rounded text-sm bg-[#c5a55a] text-[#0a0a0c] hover:bg-[#d4af37] transition-colors font-medium disabled:opacity-50"
				>
					{formSaving ? 'Saving...' : editingService ? 'Update' : 'Create'}
				</button>
			</div>
		</div>
	{/if}

	<!-- Loading -->
	{#if loading}
		<div class="space-y-3">
			{#each Array(4) as _}
				<Skeleton class="h-16 w-full" />
			{/each}
		</div>
	{:else if services.length === 0}
		<div class="flex flex-col items-center justify-center h-64 text-center">
			<Sparkles class="h-10 w-10 text-[rgba(197,165,90,0.2)] mb-3" />
			<p class="text-sm text-[rgba(255,255,255,0.35)]">No services yet.</p>
			<p class="text-xs text-[rgba(255,255,255,0.2)] mt-1">Run the Phase 1C schema migration to seed default services.</p>
		</div>
	{:else}
		<!-- Service List grouped by category -->
		{#each grouped as group}
			<div>
				<div class="flex items-center gap-2 mb-3">
					<span class="px-2 py-0.5 rounded text-[10px] uppercase tracking-[0.12em] font-medium {categoryColor(group.value)}">
						{group.label}
					</span>
					<span class="text-xs text-[rgba(255,255,255,0.2)]">{group.services.length} service{group.services.length !== 1 ? 's' : ''}</span>
				</div>

				<div class="space-y-1">
					{#each group.services as service}
						<div class="rounded border border-[rgba(197,165,90,0.08)] hover:border-[rgba(197,165,90,0.15)] transition-colors bg-[rgba(255,255,255,0.01)]">
							<!-- Service row -->
							<div class="flex items-center gap-3 px-4 py-3">
								<button
									onclick={() => toggleExpanded(service.id)}
									class="text-[rgba(255,255,255,0.25)] hover:text-[#c5a55a] transition-colors"
								>
									{#if expandedId === service.id}
										<ChevronDown class="h-4 w-4" />
									{:else}
										<ChevronRight class="h-4 w-4" />
									{/if}
								</button>

								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2">
										<span class="text-sm font-medium text-[rgba(255,255,255,0.85)]">{service.name}</span>
										{#if !service.is_active}
											<Badge variant="outline" class="text-[10px]">Inactive</Badge>
										{/if}
									</div>
									{#if service.description}
										<p class="text-xs text-[rgba(255,255,255,0.3)] mt-0.5 truncate">{service.description}</p>
									{/if}
								</div>

								<div class="flex items-center gap-4 text-xs text-[rgba(255,255,255,0.3)]">
									{#if service.duration_min}
										<span>{service.duration_min} min</span>
									{/if}
									{#if service.price_from}
										<span>From ${Number(service.price_from).toFixed(0)}</span>
									{/if}
									<span class="font-mono text-[rgba(255,255,255,0.15)]">/{service.slug}</span>
								</div>

								{#if $isAdmin}
									<div class="flex items-center gap-1">
										<button
											onclick={() => openEditForm(service)}
											class="p-1.5 rounded text-[rgba(255,255,255,0.2)] hover:text-[#c5a55a] hover:bg-[rgba(197,165,90,0.05)] transition-colors"
											title="Edit"
										>
											<Pencil class="h-3.5 w-3.5" />
										</button>
										<button
											onclick={() => deleteService(service)}
											class="p-1.5 rounded text-[rgba(255,255,255,0.2)] hover:text-red-400 hover:bg-red-500/5 transition-colors"
											title="Delete"
										>
											<Trash2 class="h-3.5 w-3.5" />
										</button>
									</div>
								{/if}
							</div>

							<!-- Expanded: Content blocks -->
							{#if expandedId === service.id}
								<div class="px-4 pb-4 pt-1 border-t border-[rgba(197,165,90,0.06)]">
									<div class="ml-7">
										<div class="flex items-center justify-between mb-2">
											<span class="text-xs uppercase tracking-[0.12em] text-[rgba(255,255,255,0.3)]">Content Blocks</span>
										</div>

										{#if serviceContent[service.id]?.length > 0}
											<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
												{#each serviceContent[service.id] as content}
													<div class="rounded border border-[rgba(255,255,255,0.06)] px-3 py-2 bg-[rgba(255,255,255,0.01)] hover:border-[rgba(197,165,90,0.12)] transition-colors">
														<div class="flex items-center gap-2">
															<FileText class="h-3 w-3 {contentTypeColor(content.content_type)}" />
															<span class="text-xs font-medium text-[rgba(255,255,255,0.7)]">{content.title}</span>
														</div>
														<div class="flex items-center gap-2 mt-1">
															<span class="text-[10px] {contentTypeColor(content.content_type)}">{contentTypeLabel(content.content_type)}</span>
															<span class="text-[10px] text-[rgba(255,255,255,0.15)]">v{content.version}</span>
															{#if content.page_slug}
																<span class="text-[10px] text-[rgba(255,255,255,0.15)] font-mono">/care/{content.page_slug}</span>
															{/if}
														</div>
														{#if content.summary}
															<p class="text-[10px] text-[rgba(255,255,255,0.2)] mt-1 line-clamp-2">{content.summary}</p>
														{/if}
													</div>
												{/each}
											</div>
										{:else}
											<div class="flex items-center gap-2 py-3">
												<FileText class="h-4 w-4 text-[rgba(255,255,255,0.1)]" />
												<span class="text-xs text-[rgba(255,255,255,0.2)]">No content blocks yet. Add pre/post instructions, consent forms, and FAQs.</span>
											</div>
										{/if}

										<!-- Content type checklist -->
										<div class="mt-3 flex flex-wrap gap-1.5">
											{#each contentTypes as ct}
												{@const exists = serviceContent[service.id]?.some(c => c.content_type === ct.value)}
												<span class="px-2 py-0.5 rounded text-[10px] border {exists
													? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
													: 'border-[rgba(255,255,255,0.06)] bg-transparent text-[rgba(255,255,255,0.15)]'
												}">
													{exists ? '✓' : '○'} {ct.label}
												</span>
											{/each}
										</div>
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/each}

		<!-- Summary stats -->
		<div class="flex items-center gap-6 pt-4 border-t border-[rgba(197,165,90,0.06)]">
			<span class="text-xs text-[rgba(255,255,255,0.25)]">
				{services.length} service{services.length !== 1 ? 's' : ''}
			</span>
			<span class="text-xs text-[rgba(255,255,255,0.25)]">
				{services.filter(s => s.is_active).length} active
			</span>
			{#each categories as cat}
				{@const count = services.filter(s => s.category === cat.value).length}
				{#if count > 0}
					<span class="text-xs text-[rgba(255,255,255,0.15)]">
						{cat.label}: {count}
					</span>
				{/if}
			{/each}
		</div>
	{/if}
</div>
