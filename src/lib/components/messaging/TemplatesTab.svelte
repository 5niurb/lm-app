<script>
	import { onMount } from 'svelte';
	import { Search, Plus, Pencil, Trash2, FileText } from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import {
		Sheet,
		SheetContent,
		SheetHeader,
		SheetTitle,
		SheetFooter
	} from '$lib/components/ui/sheet/index.ts';
	import { api } from '$lib/api/client.js';
	import EmojiPicker from './EmojiPicker.svelte';
	import TagInsert from './TagInsert.svelte';

	/** @type {{ onError: (msg: string) => void }} */
	let { onError } = $props();

	/** @type {any[]} */
	let templates = $state([]);
	let loading = $state(true);
	let search = $state('');
	let categoryFilter = $state('');

	// Sheet state
	let sheetOpen = $state(false);
	/** @type {any|null} */
	let editingTemplate = $state(null);
	let formName = $state('');
	let formCategory = $state('general');
	let formBody = $state('');
	let saving = $state(false);

	/** @type {HTMLTextAreaElement|null} */
	let bodyRef = $state(null);

	const categories = [
		'appointment',
		'follow_up',
		'promotion',
		'reminder',
		'greeting',
		'general',
		'custom'
	];

	onMount(loadTemplates);

	async function loadTemplates() {
		loading = true;
		try {
			const params = new URLSearchParams();
			if (search) params.set('search', search);
			if (categoryFilter) params.set('category', categoryFilter);
			const res = await api(`/api/templates?${params}`);
			templates = res.data || [];
		} catch (e) {
			onError(e.message);
		} finally {
			loading = false;
		}
	}

	function openCreate() {
		editingTemplate = null;
		formName = '';
		formCategory = 'general';
		formBody = '';
		sheetOpen = true;
	}

	function openEdit(tpl) {
		editingTemplate = tpl;
		formName = tpl.name;
		formCategory = tpl.category;
		formBody = tpl.body;
		sheetOpen = true;
	}

	async function handleSave() {
		if (!formName.trim() || !formBody.trim()) return;
		saving = true;
		try {
			const payload = {
				name: formName.trim(),
				category: formCategory,
				body: formBody.trim()
			};
			if (editingTemplate) {
				await api(`/api/templates/${editingTemplate.id}`, {
					method: 'PUT',
					body: JSON.stringify(payload)
				});
			} else {
				await api('/api/templates', {
					method: 'POST',
					body: JSON.stringify(payload)
				});
			}
			sheetOpen = false;
			await loadTemplates();
		} catch (e) {
			onError(e.message);
		} finally {
			saving = false;
		}
	}

	async function handleDelete(tpl) {
		if (!window.confirm(`Delete template "${tpl.name}"?`)) return;
		try {
			await api(`/api/templates/${tpl.id}`, { method: 'DELETE' });
			await loadTemplates();
		} catch (e) {
			onError(e.message);
		}
	}

	function insertInBody(text) {
		if (!bodyRef) {
			formBody += text;
			return;
		}
		const start = bodyRef.selectionStart;
		const end = bodyRef.selectionEnd;
		formBody = formBody.slice(0, start) + text + formBody.slice(end);
		const newPos = start + text.length;
		requestAnimationFrame(() => {
			bodyRef?.setSelectionRange(newPos, newPos);
			bodyRef?.focus();
		});
	}

	function getCategoryColor(cat) {
		const colors = {
			appointment: 'text-blue-400 bg-blue-400/10',
			follow_up: 'text-emerald-400 bg-emerald-400/10',
			promotion: 'text-amber-400 bg-amber-400/10',
			reminder: 'text-orange-400 bg-orange-400/10',
			greeting: 'text-pink-400 bg-pink-400/10',
			general: 'text-text-tertiary bg-surface-subtle',
			custom: 'text-purple-400 bg-purple-400/10'
		};
		return colors[cat] || colors.general;
	}

	function getCharCountColor(len) {
		if (len <= 160) return 'text-emerald-400';
		if (len <= 320) return 'text-amber-400';
		return 'text-red-400';
	}

	/** Replace merge tags with sample data for preview */
	function getPreviewBody(body) {
		return body
			.replace(/\{\{first_name\}\}/g, 'Sarah')
			.replace(/\{\{last_name\}\}/g, 'Johnson')
			.replace(/\{\{full_name\}\}/g, 'Sarah Johnson')
			.replace(/\{\{phone\}\}/g, '(818) 555-0123')
			.replace(/\{\{email\}\}/g, 'sarah@example.com')
			.replace(/\{\{date\}\}/g, 'March 15, 2026')
			.replace(/\{\{time\}\}/g, '2:00 PM')
			.replace(/\{\{service\}\}/g, 'Botox')
			.replace(/\{\{provider\}\}/g, 'Dr. Smith')
			.replace(/\{\{clinic_name\}\}/g, 'Le Med Spa')
			.replace(/\{\{clinic_phone\}\}/g, '(818) 463-3772')
			.replace(/\{\{offer_details\}\}/g, '20% off your next visit')
			.replace(/\{\{expiry_date\}\}/g, 'April 30, 2026');
	}
</script>

<div class="h-full flex flex-col overflow-hidden">
	<!-- Header -->
	<div class="p-4 border-b border-border space-y-3">
		<div class="flex items-center justify-between">
			<p class="text-sm font-medium text-text-secondary">{templates.length} templates</p>
			<Button size="sm" onclick={openCreate}>
				<Plus class="h-3.5 w-3.5 mr-1" />
				New Template
			</Button>
		</div>

		<!-- Category filter pills -->
		<div class="flex flex-wrap gap-1">
			<button
				class="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200 {categoryFilter ===
				''
					? 'bg-gold text-primary-foreground'
					: 'bg-surface-subtle text-text-secondary hover:bg-surface-hover'}"
				onclick={() => {
					categoryFilter = '';
					loadTemplates();
				}}
			>
				All
			</button>
			{#each categories as cat (cat)}
				<button
					class="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200 {categoryFilter ===
					cat
						? 'bg-gold text-primary-foreground'
						: 'bg-surface-subtle text-text-secondary hover:bg-surface-hover'}"
					onclick={() => {
						categoryFilter = cat;
						loadTemplates();
					}}
				>
					{cat.replace('_', ' ')}
				</button>
			{/each}
		</div>

		<form
			class="relative"
			onsubmit={(e) => {
				e.preventDefault();
				loadTemplates();
			}}
		>
			<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
			<Input placeholder="Search templates..." class="pl-8 h-9 text-sm" bind:value={search} />
		</form>
	</div>

	<!-- List -->
	<div class="flex-1 overflow-y-auto">
		{#if loading}
			<div class="p-4 space-y-3">
				{#each Array(4) as _, i (i)}
					<Skeleton class="h-20 w-full" />
				{/each}
			</div>
		{:else if templates.length === 0}
			<div class="flex h-48 items-center justify-center">
				<div class="text-center">
					<div
						class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gold-glow border border-border"
					>
						<FileText class="h-5 w-5 empty-state-icon" />
					</div>
					<p
						class="text-sm font-light text-text-tertiary"
						style="font-family: 'Playfair Display', serif;"
					>
						No templates yet
					</p>
					<p class="text-xs text-text-ghost mt-1">Create a template to speed up messaging.</p>
					<button
						class="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-gold border border-border hover:bg-gold-glow transition-colors"
						onclick={openCreate}
					>
						<Plus class="h-3.5 w-3.5" />
						Create Template
					</button>
				</div>
			</div>
		{:else}
			{#each templates as tpl (tpl.id)}
				<div
					class="border-b border-border-subtle px-4 py-3 hover:bg-gold-glow transition-colors group"
				>
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2 mb-1">
								<span class="text-sm font-medium text-text-primary">{tpl.name}</span>
								<span
									class="text-[9px] px-1.5 py-0.5 rounded-full font-medium {getCategoryColor(
										tpl.category
									)}"
								>
									{tpl.category.replace('_', ' ')}
								</span>
								<span class="text-[10px] text-text-ghost">
									{tpl.body.length} chars
								</span>
							</div>
							<p class="text-xs text-text-tertiary line-clamp-2">{tpl.body}</p>
						</div>
						<div
							class="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
						>
							<button
								class="h-7 w-7 inline-flex items-center justify-center rounded-md text-text-tertiary hover:text-text-secondary hover:bg-surface-subtle transition-colors"
								title="Edit"
								onclick={() => openEdit(tpl)}
							>
								<Pencil class="h-3.5 w-3.5" />
							</button>
							<button
								class="h-7 w-7 inline-flex items-center justify-center rounded-md text-text-tertiary hover:text-red-400 hover:bg-red-400/10 transition-colors"
								title="Delete"
								onclick={() => handleDelete(tpl)}
							>
								<Trash2 class="h-3.5 w-3.5" />
							</button>
						</div>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>

<!-- Create/Edit Sheet -->
<Sheet bind:open={sheetOpen}>
	<SheetContent side="right" class="w-full sm:max-w-lg overflow-y-auto">
		<SheetHeader>
			<SheetTitle>{editingTemplate ? 'Edit Template' : 'New Template'}</SheetTitle>
		</SheetHeader>

		<div class="space-y-4 py-4">
			<!-- Name -->
			<div>
				<label class="text-xs font-medium text-text-secondary block mb-1.5">Name</label>
				<Input placeholder="Template name..." bind:value={formName} />
			</div>

			<!-- Category -->
			<div>
				<label class="text-xs font-medium text-text-secondary block mb-1.5">Category</label>
				<select
					class="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:border-gold focus:outline-none"
					bind:value={formCategory}
				>
					{#each categories as cat (cat)}
						<option value={cat}>{cat.replace('_', ' ')}</option>
					{/each}
				</select>
			</div>

			<!-- Body -->
			<div>
				<div class="flex items-center justify-between mb-1.5">
					<label class="text-xs font-medium text-text-secondary">Message Body</label>
					<span class="text-[10px] {getCharCountColor(formBody.length)}">
						{formBody.length} chars · {Math.ceil(formBody.length / 160) || 1} segment{formBody.length >
						160
							? 's'
							: ''}
					</span>
				</div>
				<div class="flex items-center gap-0.5 mb-1.5">
					<EmojiPicker onSelect={(emoji) => insertInBody(emoji)} />
					<TagInsert onInsert={(tag) => insertInBody(tag)} />
				</div>
				<textarea
					bind:this={bodyRef}
					bind:value={formBody}
					placeholder="Write your template message..."
					rows="5"
					class="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-gold focus:outline-none resize-none"
				></textarea>
			</div>

			<!-- Preview -->
			{#if formBody.trim()}
				<div>
					<label class="text-xs font-medium text-text-secondary block mb-1.5">Preview</label>
					<div class="rounded-lg bg-surface-subtle border border-border-subtle p-3">
						<p class="text-sm text-text-primary whitespace-pre-wrap">
							{getPreviewBody(formBody)}
						</p>
					</div>
				</div>
			{/if}
		</div>

		<SheetFooter>
			<Button
				variant="outline"
				onclick={() => {
					sheetOpen = false;
				}}>Cancel</Button
			>
			<Button
				onclick={handleSave}
				disabled={!formName.trim() || !formBody.trim() || saving}
				class="bg-gold hover:bg-gold/80 text-primary-foreground"
			>
				{saving ? 'Saving...' : editingTemplate ? 'Update' : 'Create'}
			</Button>
		</SheetFooter>
	</SheetContent>
</Sheet>
