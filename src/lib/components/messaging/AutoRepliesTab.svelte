<script>
	import { onMount } from 'svelte';
	import { Plus, Pencil, Trash2, BotMessageSquare } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import { Switch } from '$lib/components/ui/switch/index.ts';
	import {
		Sheet,
		SheetContent,
		SheetHeader,
		SheetTitle,
		SheetFooter
	} from '$lib/components/ui/sheet/index.ts';
	import { api } from '$lib/api/client.js';

	/** @type {{ onError: (msg: string) => void }} */
	let { onError } = $props();

	/** @type {any[]} */
	let rules = $state([]);
	let loading = $state(true);

	// Sheet state
	let sheetOpen = $state(false);
	/** @type {any|null} */
	let editingRule = $state(null);
	let formTriggerType = $state('keyword');
	let formKeywords = $state('');
	let formResponseBody = $state('');
	let formHoursRestriction = $state('always');
	let formPriority = $state(10);
	let saving = $state(false);

	const hoursOptions = [
		{ value: 'always', label: 'Always' },
		{ value: 'after_hours', label: 'After Hours' },
		{ value: 'business_hours', label: 'Business Hours' }
	];

	onMount(loadRules);

	async function loadRules() {
		loading = true;
		try {
			const res = await api('/api/auto-replies');
			rules = res.data || [];
		} catch (e) {
			onError(e.message);
		} finally {
			loading = false;
		}
	}

	function openCreate() {
		editingRule = null;
		formTriggerType = 'keyword';
		formKeywords = '';
		formResponseBody = '';
		formHoursRestriction = 'always';
		formPriority = 10;
		sheetOpen = true;
	}

	function openEdit(rule) {
		editingRule = rule;
		formTriggerType = rule.trigger_type;
		formKeywords = (rule.trigger_keywords || []).join(', ');
		formResponseBody = rule.response_body;
		formHoursRestriction = rule.hours_restriction;
		formPriority = rule.priority;
		sheetOpen = true;
	}

	async function handleSave() {
		if (!formResponseBody.trim()) return;
		saving = true;
		try {
			const keywords = formKeywords
				.split(',')
				.map((k) =>
					k
						.trim()
						.replace(/^["']+|["']+$/g, '')
						.trim()
						.toLowerCase()
				)
				.filter(Boolean);
			const payload = {
				trigger_type: formTriggerType,
				trigger_keywords: formTriggerType === 'keyword' ? keywords : [],
				response_body: formResponseBody.trim(),
				hours_restriction: formHoursRestriction,
				priority: Number(formPriority) || 10
			};
			if (editingRule) {
				await api(`/api/auto-replies/${editingRule.id}`, {
					method: 'PUT',
					body: JSON.stringify(payload)
				});
			} else {
				await api('/api/auto-replies', {
					method: 'POST',
					body: JSON.stringify(payload)
				});
			}
			sheetOpen = false;
			await loadRules();
		} catch (e) {
			onError(e.message);
		} finally {
			saving = false;
		}
	}

	async function handleToggle(rule) {
		try {
			await api(`/api/auto-replies/${rule.id}`, {
				method: 'PUT',
				body: JSON.stringify({ is_active: !rule.is_active })
			});
			await loadRules();
		} catch (e) {
			onError(e.message);
		}
	}

	async function handleDelete(rule) {
		const label =
			rule.trigger_type === 'any'
				? 'catch-all rule'
				: `rule for "${(rule.trigger_keywords || []).join(', ')}"`;
		if (!window.confirm(`Delete ${label}?`)) return;
		try {
			await api(`/api/auto-replies/${rule.id}`, { method: 'DELETE' });
			await loadRules();
		} catch (e) {
			onError(e.message);
		}
	}

	function getHoursColor(restriction) {
		const colors = {
			always: 'text-emerald-400 bg-emerald-400/10',
			after_hours: 'text-amber-400 bg-amber-400/10',
			business_hours: 'text-blue-400 bg-blue-400/10'
		};
		return colors[restriction] || colors.always;
	}

	function getHoursLabel(restriction) {
		const labels = {
			always: 'Always',
			after_hours: 'After Hours',
			business_hours: 'Business Hours'
		};
		return labels[restriction] || restriction;
	}
</script>

<div class="h-full flex flex-col overflow-hidden">
	<!-- Header -->
	<div class="p-4 border-b border-border">
		<div class="flex items-center justify-between">
			<p class="text-sm font-medium text-text-secondary">{rules.length} rules</p>
			<Button size="sm" onclick={openCreate}>
				<Plus class="h-3.5 w-3.5 mr-1" />
				New Rule
			</Button>
		</div>
	</div>

	<!-- List -->
	<div class="flex-1 overflow-y-auto">
		{#if loading}
			<div class="p-4 space-y-3">
				{#each Array(4) as _, i (i)}
					<Skeleton class="h-20 w-full" />
				{/each}
			</div>
		{:else if rules.length === 0}
			<div class="flex h-48 items-center justify-center">
				<div class="text-center">
					<div
						class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gold-glow border border-border"
					>
						<BotMessageSquare class="h-5 w-5 empty-state-icon" />
					</div>
					<p
						class="text-sm font-light text-text-tertiary"
						style="font-family: 'Playfair Display', serif;"
					>
						No auto-reply rules
					</p>
					<p class="text-xs text-text-ghost mt-1">
						Create rules to auto-respond to common questions.
					</p>
					<button
						class="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-gold border border-border hover:bg-gold-glow transition-colors"
						onclick={openCreate}
					>
						<Plus class="h-3.5 w-3.5" />
						Create Rule
					</button>
				</div>
			</div>
		{:else}
			{#each rules as rule (rule.id)}
				<div
					class="border-b border-border-subtle px-4 py-3 hover:bg-gold-glow transition-colors group"
				>
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2 mb-1">
								{#if rule.trigger_type === 'any'}
									<span class="text-sm font-medium text-text-primary">Catch-all</span>
								{:else}
									<span class="text-sm font-medium text-text-primary">
										{(rule.trigger_keywords || []).join(', ')}
									</span>
								{/if}
								<span
									class="text-[9px] px-1.5 py-0.5 rounded-full font-medium {getHoursColor(
										rule.hours_restriction
									)}"
								>
									{getHoursLabel(rule.hours_restriction)}
								</span>
								<span class="text-[10px] text-text-ghost">
									P{rule.priority}
								</span>
							</div>
							<p class="text-xs text-text-tertiary line-clamp-2">{rule.response_body}</p>
						</div>
						<div class="flex items-center gap-2 shrink-0">
							<Switch checked={rule.is_active} onCheckedChange={() => handleToggle(rule)} />
							<div
								class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
							>
								<button
									class="h-7 w-7 inline-flex items-center justify-center rounded-md text-text-tertiary hover:text-text-secondary hover:bg-surface-subtle transition-colors"
									title="Edit"
									onclick={() => openEdit(rule)}
								>
									<Pencil class="h-3.5 w-3.5" />
								</button>
								<button
									class="h-7 w-7 inline-flex items-center justify-center rounded-md text-text-tertiary hover:text-red-400 hover:bg-red-400/10 transition-colors"
									title="Delete"
									onclick={() => handleDelete(rule)}
								>
									<Trash2 class="h-3.5 w-3.5" />
								</button>
							</div>
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
			<SheetTitle>{editingRule ? 'Edit Rule' : 'New Auto-Reply Rule'}</SheetTitle>
		</SheetHeader>

		<div class="space-y-4 py-4">
			<!-- Trigger Type -->
			<div>
				<label class="text-xs font-medium text-text-secondary block mb-1.5">Trigger Type</label>
				<select
					class="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:border-gold focus:outline-none"
					bind:value={formTriggerType}
				>
					<option value="keyword">Keyword Match</option>
					<option value="any">Catch-All (any message)</option>
				</select>
			</div>

			<!-- Keywords (only for keyword type) -->
			{#if formTriggerType === 'keyword'}
				<div>
					<label class="text-xs font-medium text-text-secondary block mb-1.5">
						Keywords
						<span class="text-text-ghost font-normal">(comma-separated)</span>
					</label>
					<Input placeholder="hours, open, close, closed" bind:value={formKeywords} />
				</div>
			{/if}

			<!-- Response Body -->
			<div>
				<label class="text-xs font-medium text-text-secondary block mb-1.5">Response Message</label>
				<textarea
					bind:value={formResponseBody}
					placeholder="The auto-reply message to send..."
					rows="5"
					class="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-gold focus:outline-none resize-none"
				></textarea>
			</div>

			<!-- Hours Restriction -->
			<div>
				<label class="text-xs font-medium text-text-secondary block mb-1.5">Hours Restriction</label
				>
				<select
					class="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:border-gold focus:outline-none"
					bind:value={formHoursRestriction}
				>
					{#each hoursOptions as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</div>

			<!-- Priority -->
			<div>
				<label class="text-xs font-medium text-text-secondary block mb-1.5">
					Priority
					<span class="text-text-ghost font-normal">(lower number = higher priority)</span>
				</label>
				<Input type="number" min="1" max="99" bind:value={formPriority} />
			</div>
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
				disabled={!formResponseBody.trim() ||
					(formTriggerType === 'keyword' && !formKeywords.trim()) ||
					saving}
				class="bg-gold hover:bg-gold/80 text-primary-foreground"
			>
				{saving ? 'Saving...' : editingRule ? 'Update' : 'Create'}
			</Button>
		</SheetFooter>
	</SheetContent>
</Sheet>
