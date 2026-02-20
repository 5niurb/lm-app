<script>
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import {
		Sparkles,
		Plus,
		Pencil,
		Trash2,
		ChevronDown,
		ChevronRight,
		FileText,
		X,
		ArrowUp,
		ArrowDown,
		Clock,
		DollarSign
	} from '@lucide/svelte';
	import { api } from '$lib/api/client.js';
	import { isAdmin } from '$lib/stores/auth.js';

	/** @type {any[]} */
	let services = $state([]);
	let loading = $state(true);
	let error = $state('');

	// Service form state
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

	// Content editor state
	let showContentEditor = $state(false);
	/** @type {any} */
	let editingContent = $state(null);
	/** @type {string} */
	let contentServiceId = $state('');
	/** @type {string} */
	let contentServiceName = $state('');
	let cType = $state('pre_instructions');
	let cTitle = $state('');
	let cSummary = $state('');
	let cPageSlug = $state('');
	let cActive = $state(true);
	/** @type {{heading: string, body: string}[]} */
	let cSections = $state([]);
	let cSaving = $state(false);

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
		{
			value: 'pre_instructions',
			label: 'Pre-Treatment Instructions',
			color: 'text-blue-400',
			shortLabel: 'Pre-Care'
		},
		{
			value: 'post_instructions',
			label: 'Post-Treatment Instructions',
			color: 'text-green-400',
			shortLabel: 'Post-Care'
		},
		{
			value: 'consent_form',
			label: 'Consent Form',
			color: 'text-yellow-400',
			shortLabel: 'Consent'
		},
		{
			value: 'questionnaire',
			label: 'Questionnaire',
			color: 'text-purple-400',
			shortLabel: 'Questionnaire'
		},
		{ value: 'faq', label: 'FAQ', color: 'text-cyan-400', shortLabel: 'FAQ' },
		{
			value: 'what_to_expect',
			label: 'What to Expect',
			color: 'text-orange-400',
			shortLabel: 'Expectations'
		}
	];

	$effect(() => {
		loadServices();
	});

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
		setTimeout(() => {
			toast = '';
		}, 3000);
	}

	function categoryColor(val) {
		switch (val) {
			case 'advanced_aesthetics':
				return 'bg-gold/15 text-gold';
			case 'regenerative_wellness':
				return 'bg-emerald-500/10 text-emerald-400';
			case 'bespoke_treatments':
				return 'bg-purple-500/10 text-purple-400';
			default:
				return 'bg-white/5 text-white/50';
		}
	}

	function categoryBorderColor(val) {
		switch (val) {
			case 'advanced_aesthetics':
				return 'border-t-gold';
			case 'regenerative_wellness':
				return 'border-t-emerald-400';
			case 'bespoke_treatments':
				return 'border-t-purple-400';
			default:
				return 'border-t-white/20';
		}
	}

	// ---- Service CRUD ----
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
				await api('/api/services', { method: 'POST', body: JSON.stringify(body) });
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
		if (
			!confirm(
				`Delete "${service.name}"? This will also delete all associated content and automation sequences.`
			)
		)
			return;
		try {
			await api(`/api/services/${service.id}`, { method: 'DELETE' });
			showToast('Service deleted');
			await loadServices();
		} catch (e) {
			showToast(e.message, 'error');
		}
	}

	// ---- Content CRUD ----
	async function toggleExpanded(serviceId) {
		if (expandedId === serviceId) {
			expandedId = null;
			return;
		}
		expandedId = serviceId;
		await refreshContent(serviceId);
	}

	async function refreshContent(serviceId) {
		try {
			const res = await api(`/api/services/${serviceId}/content`);
			serviceContent[serviceId] = res.data || [];
		} catch {
			serviceContent[serviceId] = [];
		}
	}

	function openContentCreate(serviceId, serviceName) {
		editingContent = null;
		contentServiceId = serviceId;
		contentServiceName = serviceName;
		cType = 'pre_instructions';
		cTitle = '';
		cSummary = '';
		cPageSlug = '';
		cActive = true;
		cSections = [{ heading: '', body: '' }];
		showContentEditor = true;
	}

	function openContentEdit(content, serviceName) {
		editingContent = content;
		contentServiceId = content.service_id;
		contentServiceName = serviceName;
		cType = content.content_type;
		cTitle = content.title;
		cSummary = content.summary || '';
		cPageSlug = content.page_slug || '';
		cActive = content.is_active;
		cSections =
			Array.isArray(content.content_json) && content.content_json.length > 0
				? content.content_json.map((s) => ({ heading: s.heading || '', body: s.body || '' }))
				: [{ heading: '', body: '' }];
		showContentEditor = true;
	}

	function autoContentSlug() {
		if (!editingContent) {
			const service = services.find((s) => s.id === contentServiceId);
			const suffix = cType.replace('_', '-').replace('instructions', '').replace(/^-|-$/g, '');
			cPageSlug = `${service?.slug || 'service'}-${suffix}`.replace(/--+/g, '-').replace(/-$/g, '');
		}
	}

	function addSection() {
		cSections = [...cSections, { heading: '', body: '' }];
	}

	function removeSection(idx) {
		if (cSections.length <= 1) return;
		cSections = cSections.filter((_, i) => i !== idx);
	}

	function moveSection(idx, dir) {
		const newIdx = idx + dir;
		if (newIdx < 0 || newIdx >= cSections.length) return;
		const arr = [...cSections];
		[arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
		cSections = arr;
	}

	async function saveContent() {
		if (!cType || !cTitle) {
			showToast('Content type and title are required', 'error');
			return;
		}
		cSaving = true;
		try {
			// Filter out empty sections
			const sections = cSections.filter((s) => s.heading.trim() || s.body.trim());
			const body = {
				content_type: cType,
				title: cTitle,
				summary: cSummary || null,
				page_slug: cPageSlug || null,
				content_json: sections,
				is_active: cActive
			};

			if (editingContent) {
				await api(`/api/services/content/${editingContent.id}`, {
					method: 'PUT',
					body: JSON.stringify(body)
				});
				showToast('Content updated');
			} else {
				await api(`/api/services/${contentServiceId}/content`, {
					method: 'POST',
					body: JSON.stringify(body)
				});
				showToast('Content created');
			}
			showContentEditor = false;
			await refreshContent(contentServiceId);
		} catch (e) {
			showToast(e.message, 'error');
		} finally {
			cSaving = false;
		}
	}

	async function deleteContent(content) {
		if (!confirm(`Delete "${content.title}"?`)) return;
		try {
			await api(`/api/services/content/${content.id}`, { method: 'DELETE' });
			showToast('Content deleted');
			await refreshContent(content.service_id);
		} catch (e) {
			showToast(e.message, 'error');
		}
	}

	function contentTypeLabel(val) {
		return contentTypes.find((c) => c.value === val)?.label || val;
	}
	function contentTypeColor(val) {
		return contentTypes.find((c) => c.value === val)?.color || 'text-white/50';
	}

	let grouped = $derived(
		categories
			.map((cat) => ({ ...cat, services: services.filter((s) => s.category === cat.value) }))
			.filter((g) => g.services.length > 0)
	);
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl tracking-wide">Services</h1>
			<p class="text-sm text-muted-foreground mt-1">
				Treatment catalog — powers automation, content, and booking.
			</p>
		</div>
		{#if $isAdmin}
			<button
				onclick={openCreateForm}
				class="flex items-center gap-2 px-4 py-2 rounded text-sm bg-gold text-primary-foreground hover:bg-gold/80 transition-colors font-medium"
			>
				<Plus class="h-4 w-4" /> Add Service
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
		<div
			class="fixed top-4 right-4 z-50 px-4 py-3 rounded border text-sm {toastType === 'error'
				? 'bg-red-500/10 border-red-500/30 text-red-400'
				: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}"
		>
			{toast}
		</div>
	{/if}

	<!-- ========== CONTENT EDITOR OVERLAY ========== -->
	{#if showContentEditor}
		<div
			class="fixed inset-0 z-40 bg-black/70 flex items-start justify-center pt-12 overflow-y-auto"
			role="dialog"
		>
			<div class="w-full max-w-3xl mx-4 mb-12 rounded-lg border border-border bg-card shadow-2xl">
				<!-- Editor header -->
				<div class="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
					<div>
						<h2 class="text-base tracking-wide">
							{editingContent ? 'Edit Content' : 'New Content'}
						</h2>
						<p class="text-xs text-text-tertiary mt-0.5">
							for <span class="text-gold">{contentServiceName}</span>
						</p>
					</div>
					<button
						onclick={() => (showContentEditor = false)}
						class="p-1 text-text-tertiary hover:text-white transition-colors"
					>
						<X class="h-5 w-5" />
					</button>
				</div>

				<div class="p-6 space-y-5">
					<!-- Meta fields -->
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label class="text-xs uppercase tracking-[0.12em] text-text-tertiary mb-1 block"
								>Content Type *</label
							>
							<select
								bind:value={cType}
								onchange={autoContentSlug}
								class="w-full px-3 py-2 rounded border border-border-default bg-surface-subtle text-sm focus:border-gold focus:outline-none transition-colors"
							>
								{#each contentTypes as ct (ct.value)}
									<option value={ct.value}>{ct.label}</option>
								{/each}
							</select>
						</div>
						<div>
							<label class="text-xs uppercase tracking-[0.12em] text-text-tertiary mb-1 block"
								>Title *</label
							>
							<input
								type="text"
								bind:value={cTitle}
								placeholder="e.g. Botox Pre-Treatment Guide"
								class="w-full px-3 py-2 rounded border border-border-default bg-surface-subtle text-sm focus:border-gold focus:outline-none transition-colors"
							/>
						</div>
					</div>

					<div>
						<label class="text-xs uppercase tracking-[0.12em] text-text-tertiary mb-1 block">
							SMS/Email Summary
							<span class="normal-case tracking-normal text-text-ghost"
								>— 2-3 sentences sent in messages, links to full page</span
							>
						</label>
						<textarea
							bind:value={cSummary}
							rows="2"
							placeholder="Brief summary for text messages..."
							class="w-full px-3 py-2 rounded border border-border-default bg-surface-subtle text-sm focus:border-gold focus:outline-none transition-colors resize-none"
						></textarea>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label class="text-xs uppercase tracking-[0.12em] text-text-tertiary mb-1 block">
								Page Slug
								<span class="normal-case tracking-normal text-text-ghost">— lemedspa.com/care/</span
								>
							</label>
							<input
								type="text"
								bind:value={cPageSlug}
								placeholder="e.g. botox-pre"
								class="w-full px-3 py-2 rounded border border-border-default bg-surface-subtle text-sm font-mono focus:border-gold focus:outline-none transition-colors"
							/>
						</div>
						<div class="flex items-end pb-1">
							<label class="flex items-center gap-2 cursor-pointer">
								<input type="checkbox" bind:checked={cActive} class="accent-gold" />
								<span class="text-sm text-text-secondary">Active</span>
							</label>
						</div>
					</div>

					<!-- Content sections (accordion builder) -->
					<div>
						<div class="flex items-center justify-between mb-3">
							<label class="text-xs uppercase tracking-[0.12em] text-text-tertiary">
								Content Sections
								<span class="normal-case tracking-normal text-text-ghost"
									>— expandable accordion on care page</span
								>
							</label>
							<button
								onclick={addSection}
								class="flex items-center gap-1 px-2 py-1 rounded text-xs text-gold hover:bg-gold-glow transition-colors"
							>
								<Plus class="h-3 w-3" /> Add Section
							</button>
						</div>

						<div class="space-y-3">
							{#each cSections as section, idx (idx)}
								<div class="rounded border border-border-subtle bg-surface-subtle p-4">
									<div class="flex items-center gap-2 mb-2">
										<span class="text-[10px] text-text-ghost w-5 text-center">{idx + 1}</span>

										<input
											type="text"
											bind:value={section.heading}
											placeholder="Section heading..."
											class="flex-1 px-2 py-1.5 rounded border border-border-subtle bg-transparent text-sm font-medium focus:border-gold focus:outline-none transition-colors"
										/>

										<div class="flex items-center gap-0.5">
											<button
												onclick={() => moveSection(idx, -1)}
												disabled={idx === 0}
												class="p-1 text-text-ghost hover:text-text-secondary disabled:opacity-20 transition-colors"
												title="Move up"
											>
												<ArrowUp class="h-3 w-3" />
											</button>
											<button
												onclick={() => moveSection(idx, 1)}
												disabled={idx === cSections.length - 1}
												class="p-1 text-text-ghost hover:text-text-secondary disabled:opacity-20 transition-colors"
												title="Move down"
											>
												<ArrowDown class="h-3 w-3" />
											</button>
											<button
												onclick={() => removeSection(idx)}
												disabled={cSections.length <= 1}
												class="p-1 text-text-ghost hover:text-red-400 disabled:opacity-20 transition-colors"
												title="Remove"
											>
												<Trash2 class="h-3 w-3" />
											</button>
										</div>
									</div>

									<textarea
										bind:value={section.body}
										rows="4"
										placeholder="Section body — detailed instructions, restrictions, expectations..."
										class="w-full px-2 py-1.5 rounded border border-border-subtle bg-transparent text-xs leading-relaxed focus:border-gold focus:outline-none transition-colors resize-y"
									></textarea>
								</div>
							{/each}
						</div>
					</div>
				</div>

				<!-- Editor footer -->
				<div class="flex items-center justify-between px-6 py-4 border-t border-border-subtle">
					<div class="text-xs text-text-ghost">
						{cSections.filter((s) => s.heading.trim() || s.body.trim()).length} section{cSections.filter(
							(s) => s.heading.trim() || s.body.trim()
						).length !== 1
							? 's'
							: ''}
						{#if editingContent}· v{editingContent.version}{/if}
					</div>
					<div class="flex items-center gap-3">
						<button
							onclick={() => (showContentEditor = false)}
							class="px-4 py-2 text-sm text-text-secondary hover:text-white transition-colors"
							>Cancel</button
						>
						<button
							onclick={saveContent}
							disabled={cSaving}
							class="px-5 py-2 rounded text-sm bg-gold text-primary-foreground hover:bg-gold/80 transition-colors font-medium disabled:opacity-50"
						>
							{cSaving ? 'Saving...' : editingContent ? 'Update Content' : 'Create Content'}
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- ========== SERVICE FORM ========== -->
	{#if showForm}
		<div class="rounded border border-border bg-gold-glow p-6 space-y-4">
			<div class="flex items-center justify-between">
				<h2 class="text-base tracking-wide">{editingService ? 'Edit Service' : 'New Service'}</h2>
				<button
					onclick={() => (showForm = false)}
					class="text-text-tertiary hover:text-white transition-colors"
					><X class="h-4 w-4" /></button
				>
			</div>
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label class="text-xs uppercase tracking-[0.12em] text-text-tertiary mb-1 block"
						>Name *</label
					>
					<input
						type="text"
						bind:value={formName}
						oninput={autoSlug}
						placeholder="e.g. Neuromodulators (Botox/Dysport)"
						class="w-full px-3 py-2 rounded border border-border-default bg-surface-subtle text-sm focus:border-gold focus:outline-none transition-colors"
					/>
				</div>
				<div>
					<label class="text-xs uppercase tracking-[0.12em] text-text-tertiary mb-1 block"
						>Slug *</label
					>
					<input
						type="text"
						bind:value={formSlug}
						placeholder="e.g. neuromodulators"
						class="w-full px-3 py-2 rounded border border-border-default bg-surface-subtle text-sm font-mono focus:border-gold focus:outline-none transition-colors"
					/>
				</div>
				<div>
					<label class="text-xs uppercase tracking-[0.12em] text-text-tertiary mb-1 block"
						>Category *</label
					>
					<select
						bind:value={formCategory}
						class="w-full px-3 py-2 rounded border border-border-default bg-surface-subtle text-sm focus:border-gold focus:outline-none transition-colors"
					>
						{#each categories as cat (cat.value)}<option value={cat.value}>{cat.label}</option>{/each}
					</select>
				</div>
				<div class="flex gap-4">
					<div class="flex-1">
						<label class="text-xs uppercase tracking-[0.12em] text-text-tertiary mb-1 block"
							>Duration (min)</label
						>
						<input
							type="number"
							bind:value={formDuration}
							placeholder="45"
							class="w-full px-3 py-2 rounded border border-border-default bg-surface-subtle text-sm focus:border-gold focus:outline-none transition-colors"
						/>
					</div>
					<div class="flex-1">
						<label class="text-xs uppercase tracking-[0.12em] text-text-tertiary mb-1 block"
							>Price From ($)</label
						>
						<input
							type="number"
							bind:value={formPrice}
							placeholder="250"
							step="0.01"
							class="w-full px-3 py-2 rounded border border-border-default bg-surface-subtle text-sm focus:border-gold focus:outline-none transition-colors"
						/>
					</div>
				</div>
			</div>
			<div>
				<label class="text-xs uppercase tracking-[0.12em] text-text-tertiary mb-1 block"
					>Description</label
				>
				<textarea
					bind:value={formDescription}
					rows="2"
					placeholder="Brief service description..."
					class="w-full px-3 py-2 rounded border border-border-default bg-surface-subtle text-sm focus:border-gold focus:outline-none transition-colors resize-none"
				></textarea>
			</div>
			<div class="flex items-center gap-6">
				<label class="flex items-center gap-2 cursor-pointer">
					<input type="checkbox" bind:checked={formActive} class="accent-gold" />
					<span class="text-sm text-text-secondary">Active</span>
				</label>
				<div class="flex-1"></div>
				<button
					onclick={() => (showForm = false)}
					class="px-4 py-2 text-sm text-text-secondary hover:text-white transition-colors"
					>Cancel</button
				>
				<button
					onclick={saveService}
					disabled={formSaving}
					class="px-4 py-2 rounded text-sm bg-gold text-primary-foreground hover:bg-gold/80 transition-colors font-medium disabled:opacity-50"
				>
					{formSaving ? 'Saving...' : editingService ? 'Update' : 'Create'}
				</button>
			</div>
		</div>
	{/if}

	<!-- ========== SERVICE LIST ========== -->
	<div class="rounded border border-border overflow-hidden bg-card p-5">
	{#if loading}
		<div class="space-y-3">
			{#each Array(4) as _, i (i)}<Skeleton class="h-16 w-full" />{/each}
		</div>
	{:else if services.length === 0}
		<div class="flex flex-col items-center justify-center h-64 text-center">
			<div
				class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-glow border border-border-subtle"
			>
				<Sparkles class="h-7 w-7 empty-state-icon" />
			</div>
			<p
				class="text-base font-light text-text-tertiary mb-1"
				style="font-family: 'Playfair Display', serif;"
			>
				No services yet
			</p>
			<p class="text-xs text-text-ghost">
				Run the Phase 1C schema migration to seed default services.
			</p>
			{#if $isAdmin}
				<button
					onclick={openCreateForm}
					class="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-gold border border-border hover:bg-gold-glow transition-colors"
				>
					<Plus class="h-3.5 w-3.5" /> Add your first service
				</button>
			{/if}
		</div>
	{:else}
		{#each grouped as group (group.value)}
			<div>
				<!-- Category header -->
				<div class="flex items-center gap-3 mb-4">
					<span
						class="px-3 py-1 rounded text-[11px] uppercase tracking-[0.14em] font-semibold {categoryColor(
							group.value
						)}">{group.label}</span
					>
					<span class="text-xs text-text-tertiary"
						>{group.services.length} service{group.services.length !== 1 ? 's' : ''}</span
					>
					<div class="flex-1 h-px bg-gold-glow"></div>
				</div>

				<!-- Service card grid -->
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{#each group.services as service (service.id)}
						<!-- Service card -->
						<div
							class="group/card card-elevated rounded-lg border border-t-2 {categoryBorderColor(
								group.value
							)} cursor-pointer transition-all duration-200 hover:translate-y-[-2px] relative flex flex-col"
							role="button"
							tabindex="0"
							onclick={() => toggleExpanded(service.id)}
							onkeydown={(e) => {
								if (e.key === 'Enter') toggleExpanded(service.id);
							}}
						>
							<!-- Active/Inactive badge -->
							<div class="absolute top-3 right-3">
								{#if service.is_active}
									<span
										class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
									>
										<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
										Active
									</span>
								{:else}
									<span
										class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-text-tertiary border border-white/10"
									>
										Inactive
									</span>
								{/if}
							</div>

							<!-- Card body -->
							<div class="p-5 flex-1 flex flex-col">
								<!-- Service name -->
								<h3
									class="text-base text-text-primary pr-16 mb-2"
									style="font-family: 'Playfair Display', serif;"
								>
									{service.name}
								</h3>

								<!-- Description -->
								{#if service.description}
									<p class="text-xs text-text-tertiary line-clamp-2 leading-relaxed mb-4">
										{service.description}
									</p>
								{:else}
									<div class="mb-4"></div>
								{/if}

								<!-- Spacer to push footer down -->
								<div class="flex-1"></div>

								<!-- Footer: duration + price -->
								<div class="flex items-center justify-between pt-3 border-t border-border-subtle">
									<div class="flex items-center gap-4">
										{#if service.duration_min}
											<span class="flex items-center gap-1.5 text-xs text-text-tertiary">
												<Clock class="h-3.5 w-3.5 text-text-ghost" />
												{service.duration_min} min
											</span>
										{/if}
										{#if service.price_from}
											<span class="flex items-center gap-1.5 text-xs text-text-tertiary">
												<DollarSign class="h-3.5 w-3.5 text-text-ghost" />
												From ${Number(service.price_from).toFixed(0)}
											</span>
										{/if}
									</div>
									<!-- Expand indicator -->
									<div class="text-text-ghost group-hover/card:text-gold transition-colors">
										{#if expandedId === service.id}
											<ChevronDown class="h-4 w-4" />
										{:else}
											<ChevronRight class="h-4 w-4" />
										{/if}
									</div>
								</div>
							</div>

							<!-- Admin action buttons (appear on hover) -->
							{#if $isAdmin}
								<div
									class="absolute top-3 left-3 flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity duration-200"
								>
									<button
										onclick={(e) => {
											e.stopPropagation();
											openEditForm(service);
										}}
										class="p-1.5 rounded bg-black/50 text-text-tertiary hover:text-gold hover:bg-gold/10 transition-colors"
										title="Edit service"
									>
										<Pencil class="h-3.5 w-3.5" />
									</button>
									<button
										onclick={(e) => {
											e.stopPropagation();
											deleteService(service);
										}}
										class="p-1.5 rounded bg-black/50 text-text-tertiary hover:text-red-400 hover:bg-red-500/10 transition-colors"
										title="Delete service"
									>
										<Trash2 class="h-3.5 w-3.5" />
									</button>
								</div>
							{/if}
						</div>

						<!-- Expanded content blocks (full-width row below the card) -->
						{#if expandedId === service.id}
							<div class="col-span-full rounded-lg border border-border bg-card/95 p-5">
								<div class="flex items-center justify-between mb-4">
									<div class="flex items-center gap-3">
										<h3
											class="text-sm text-text-secondary"
											style="font-family: 'Playfair Display', serif;"
										>
											{service.name}
										</h3>
										<span class="text-xs uppercase tracking-[0.12em] text-text-ghost"
											>Content Blocks</span
										>
									</div>
									{#if $isAdmin}
										<button
											onclick={() => openContentCreate(service.id, service.name)}
											class="flex items-center gap-1 px-2.5 py-1 rounded text-xs text-gold hover:bg-gold-glow border border-border transition-colors"
										>
											<Plus class="h-3 w-3" /> Add Content
										</button>
									{/if}
								</div>

								{#if serviceContent[service.id]?.length > 0}
									<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
										{#each serviceContent[service.id] as content (content.id)}
											<div
												class="group rounded border border-border-subtle px-3 py-2.5 bg-surface-subtle hover:border-border transition-colors cursor-pointer"
												role="button"
												tabindex="0"
												onclick={() => openContentEdit(content, service.name)}
												onkeydown={(e) => {
													if (e.key === 'Enter') openContentEdit(content, service.name);
												}}
											>
												<div class="flex items-center justify-between">
													<div class="flex items-center gap-2">
														<FileText class="h-3 w-3 {contentTypeColor(content.content_type)}" />
														<span class="text-xs font-medium text-text-secondary"
															>{content.title}</span
														>
													</div>
													{#if $isAdmin}
														<button
															onclick={(e) => {
																e.stopPropagation();
																deleteContent(content);
															}}
															class="p-0.5 opacity-0 group-hover:opacity-100 text-text-ghost hover:text-red-400 transition-all"
															title="Delete"
														>
															<Trash2 class="h-3 w-3" />
														</button>
													{/if}
												</div>
												<div class="flex items-center gap-2 mt-1">
													<span class="text-[10px] {contentTypeColor(content.content_type)}"
														>{contentTypeLabel(content.content_type)}</span
													>
													<span class="text-[10px] text-text-ghost">v{content.version}</span>
													{#if Array.isArray(content.content_json)}
														<span class="text-[10px] text-text-ghost"
															>{content.content_json.length} section{content.content_json.length !==
															1
																? 's'
																: ''}</span
														>
													{/if}
													{#if content.page_slug}
														<span class="text-[10px] text-text-ghost font-mono"
															>/care/{content.page_slug}</span
														>
													{/if}
												</div>
												{#if content.summary}
													<p class="text-[10px] text-text-ghost mt-1 line-clamp-2">
														{content.summary}
													</p>
												{/if}
											</div>
										{/each}
									</div>
								{:else}
									<div class="flex items-center gap-2 py-3">
										<FileText class="h-4 w-4 text-text-ghost" />
										<span class="text-xs text-text-ghost">No content blocks yet.</span>
									</div>
								{/if}

								<!-- Content type checklist -->
								<div class="mt-3 flex flex-wrap gap-1.5">
									{#each contentTypes as ct (ct.value)}
										{@const exists = serviceContent[service.id]?.some(
											(c) => c.content_type === ct.value
										)}
										<button
											class="px-2 py-0.5 rounded text-[10px] border transition-colors {exists
												? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
												: 'border-border-subtle bg-transparent text-text-ghost hover:border-border hover:text-text-tertiary'}"
											onclick={() => {
												if (!exists && $isAdmin) {
													cType = ct.value;
													openContentCreate(service.id, service.name);
												}
											}}
											title={exists ? `${ct.label} exists — click to edit` : `Add ${ct.label}`}
										>
											{exists ? '✓' : '+'}
											{ct.shortLabel}
										</button>
									{/each}
								</div>
							</div>
						{/if}
					{/each}
				</div>
			</div>
		{/each}

		<!-- Summary -->
		<div class="flex items-center gap-6 pt-4 border-t border-border-subtle">
			<span class="text-xs text-text-ghost"
				>{services.length} service{services.length !== 1 ? 's' : ''}</span
			>
			<span class="text-xs text-text-ghost"
				>{services.filter((s) => s.is_active).length} active</span
			>
		</div>
	{/if}
	</div>
</div>
