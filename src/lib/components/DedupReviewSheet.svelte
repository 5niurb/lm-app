<script>
	import {
		Sheet,
		SheetContent,
		SheetHeader,
		SheetTitle,
		SheetDescription,
		SheetFooter
	} from '$lib/components/ui/sheet/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import { toast } from 'svelte-sonner';
	import { GitMerge, Crown, ArrowRight, Check, SkipForward, Loader2 } from '@lucide/svelte';
	import { api } from '$lib/api/client.js';
	import { formatPhone, formatRelativeDate } from '$lib/utils/formatters.js';
	import ContactAvatar from '$lib/components/ContactAvatar.svelte';

	/**
	 * @type {{
	 *   open: boolean,
	 *   onMerged?: (count: number) => void
	 * }}
	 */
	let { open = $bindable(false), onMerged } = $props();

	/** @type {any[]|null} */
	let groups = $state(null);
	let currentIndex = $state(0);
	let merging = $state(false);
	let mergedCount = $state(0);
	let skippedCount = $state(0);
	let loading = $state(false);
	let done = $state(false);

	const SOURCE_LABELS = {
		aesthetic_record: 'Aesthetic Record',
		textmagic: 'TextMagic',
		google_sheet: 'Google Sheet',
		manual: 'Manual',
		inbound_call: 'Phone',
		website_form: 'Website'
	};

	const SOURCE_PRIORITY_LABELS = {
		aesthetic_record: 'Highest',
		textmagic: 'High',
		website_form: 'Medium',
		google_sheet: 'Medium',
		inbound_call: 'Low',
		manual: 'Lowest'
	};

	// Load duplicates when sheet opens
	$effect(() => {
		if (open) {
			loadDuplicates();
		} else {
			// Reset on close
			groups = null;
			currentIndex = 0;
			mergedCount = 0;
			skippedCount = 0;
			done = false;
		}
	});

	async function loadDuplicates() {
		loading = true;
		groups = null;
		currentIndex = 0;
		mergedCount = 0;
		skippedCount = 0;
		done = false;
		try {
			const res = await api('/api/contacts/duplicates');
			groups = res.groups || [];
			if (groups.length === 0) {
				done = true;
			}
		} catch (e) {
			toast.error('Failed to load duplicates: ' + e.message);
			groups = [];
			done = true;
		} finally {
			loading = false;
		}
	}

	/** @param {any} group */
	async function mergeGroup(group) {
		merging = true;
		try {
			const loserIds = group.contacts
				.filter((c) => c.id !== group.suggestedWinnerId)
				.map((c) => c.id);

			await api('/api/contacts/merge', {
				method: 'POST',
				body: JSON.stringify({
					winnerId: group.suggestedWinnerId,
					loserIds
				})
			});

			mergedCount++;
			toast.success(`Merged ${loserIds.length + 1} contacts into one`);
			advance();
		} catch (e) {
			toast.error('Merge failed: ' + e.message);
		} finally {
			merging = false;
		}
	}

	function skip() {
		skippedCount++;
		advance();
	}

	function advance() {
		if (groups && currentIndex < groups.length - 1) {
			currentIndex++;
		} else {
			done = true;
			if (mergedCount > 0 && onMerged) {
				onMerged(mergedCount);
			}
		}
	}

	function closeSheet() {
		if (mergedCount > 0 && onMerged) {
			onMerged(mergedCount);
		}
		open = false;
	}

	/** Check if a field differs between winner and a loser (loser has a value winner doesn't) */
	function isAbsorbed(winner, loser, field) {
		return !winner[field] && loser[field];
	}

	let currentGroup = $derived(groups?.[currentIndex] ?? null);
	let winner = $derived(
		currentGroup?.contacts.find((c) => c.id === currentGroup.suggestedWinnerId) ?? null
	);
	let losers = $derived(
		currentGroup?.contacts.filter((c) => c.id !== currentGroup?.suggestedWinnerId) ?? []
	);
</script>

<Sheet bind:open>
	<SheetContent side="right" class="w-full sm:max-w-3xl overflow-y-auto bg-card">
		<SheetHeader class="pb-4 border-b border-border">
			<SheetTitle class="flex items-center gap-2">
				<div
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-vivid-violet/15 text-vivid-violet"
				>
					<GitMerge class="h-4 w-4" />
				</div>
				Review Duplicates
			</SheetTitle>
			<SheetDescription>
				{#if groups && !done}
					Reviewing group {currentIndex + 1} of {groups.length} — contacts sharing the same phone number
				{:else if done}
					Review complete
				{:else}
					Loading duplicate groups...
				{/if}
			</SheetDescription>
		</SheetHeader>

		<div class="py-5 space-y-5">
			{#if loading}
				<div class="space-y-4">
					<Skeleton class="h-32 w-full" />
					<Skeleton class="h-32 w-full" />
					<Skeleton class="h-24 w-full" />
				</div>
			{:else if done}
				<!-- Summary -->
				<div class="text-center py-8 space-y-4">
					<div
						class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-vivid-emerald/15 border border-vivid-emerald/30"
					>
						<Check class="h-8 w-8 text-vivid-emerald" />
					</div>
					<div>
						<h3
							class="text-lg font-medium text-text-primary"
							style="font-family: var(--font-display);"
						>
							{#if mergedCount === 0 && groups?.length === 0}
								No duplicates found
							{:else if mergedCount === 0}
								All groups skipped
							{:else}
								Merge complete
							{/if}
						</h3>
						<p class="text-sm text-text-secondary mt-1">
							{#if mergedCount > 0}
								Merged {mergedCount} group{mergedCount !== 1 ? 's' : ''}.
							{/if}
							{#if skippedCount > 0}
								Skipped {skippedCount}.
							{/if}
							{#if mergedCount === 0 && groups?.length === 0}
								All contacts have unique phone numbers.
							{/if}
						</p>
					</div>
					<Button onclick={closeSheet} class="mt-4">Done</Button>
				</div>
			{:else if currentGroup && winner}
				<!-- Phone number header -->
				<div class="flex items-center gap-2 text-sm text-text-secondary">
					<span class="font-mono">{formatPhone(currentGroup.phone)}</span>
					<Badge variant="outline" class="text-xs">{currentGroup.contacts.length} records</Badge>
				</div>

				<!-- Side-by-side cards -->
				<div class="grid gap-4 sm:grid-cols-2">
					<!-- Winner card -->
					<div class="rounded-lg border-2 border-gold/40 bg-gold-glow p-4 space-y-3">
						<div class="flex items-center gap-2">
							<Crown class="h-4 w-4 text-gold" />
							<Badge class="bg-gold/20 text-gold border-gold/30 text-xs">Primary</Badge>
							<span class="text-xs text-text-tertiary ml-auto"
								>{SOURCE_LABELS[winner.source] || winner.source}</span
							>
						</div>
						<div class="flex items-center gap-3">
							<ContactAvatar
								name={winner.full_name}
								phone={winner.phone}
								source={winner.source}
								size="md"
							/>
							<div class="min-w-0">
								<p
									class="font-medium text-text-primary truncate"
									style="font-family: var(--font-display);"
								>
									{winner.full_name || '—'}
								</p>
								<p class="text-xs text-text-tertiary truncate">{winner.email || 'No email'}</p>
							</div>
						</div>
						{@render contactFields(winner)}
					</div>

					<!-- Loser cards -->
					{#each losers as loser (loser.id)}
						<div class="card-elevated rounded-lg p-4 space-y-3">
							<div class="flex items-center gap-2">
								<ArrowRight class="h-4 w-4 text-text-tertiary" />
								<Badge variant="outline" class="text-xs">Will merge into primary</Badge>
								<span class="text-xs text-text-tertiary ml-auto"
									>{SOURCE_LABELS[loser.source] || loser.source}</span
								>
							</div>
							<div class="flex items-center gap-3">
								<ContactAvatar
									name={loser.full_name}
									phone={loser.phone}
									source={loser.source}
									size="md"
								/>
								<div class="min-w-0">
									<p
										class="font-medium text-text-primary truncate"
										style="font-family: var(--font-display);"
									>
										{loser.full_name || '—'}
									</p>
									<p class="text-xs text-text-tertiary truncate">{loser.email || 'No email'}</p>
								</div>
							</div>
							{@render contactFields(loser, winner)}
						</div>
					{/each}
				</div>

				<!-- Merged preview -->
				<div class="rounded-lg border border-border bg-surface-subtle p-4 space-y-2">
					<p
						class="text-xs font-medium text-text-tertiary uppercase tracking-[0.1em] flex items-center gap-1.5"
					>
						<GitMerge class="h-3.5 w-3.5" /> Merged Result
					</p>
					<div class="grid gap-2 grid-cols-2 text-sm">
						<div>
							<span class="text-text-tertiary text-xs">Name</span>
							<p class="text-text-primary">{currentGroup.preview.full_name || '—'}</p>
						</div>
						<div>
							<span class="text-text-tertiary text-xs">Email</span>
							<p class="text-text-primary">{currentGroup.preview.email || '—'}</p>
						</div>
						<div>
							<span class="text-text-tertiary text-xs">Tags</span>
							<div class="flex flex-wrap gap-1 mt-0.5">
								{#each currentGroup.preview.tags || [] as tag (tag)}
									<span
										class="inline-block rounded-full bg-zinc-700/50 px-2 py-0.5 text-xs text-text-secondary"
									>
										{tag}
									</span>
								{/each}
								{#if !currentGroup.preview.tags?.length}
									<span class="text-text-tertiary">—</span>
								{/if}
							</div>
						</div>
						<div>
							<span class="text-text-tertiary text-xs">Phone</span>
							<p class="text-text-primary">{formatPhone(currentGroup.phone)}</p>
						</div>
					</div>
				</div>
			{/if}
		</div>

		{#if !loading && !done && currentGroup}
			<SheetFooter
				class="border-t border-border pt-4 flex items-center justify-between gap-3 sm:justify-between"
			>
				<span class="text-xs text-text-tertiary">
					{currentIndex + 1} / {groups?.length ?? 0}
				</span>
				<div class="flex items-center gap-2">
					<Button variant="outline" size="sm" onclick={skip} disabled={merging}>
						<SkipForward class="h-4 w-4 mr-1" />
						Skip
					</Button>
					<Button
						size="sm"
						onclick={() => mergeGroup(currentGroup)}
						disabled={merging}
						class="bg-gold hover:bg-gold/90 text-background"
					>
						{#if merging}
							<Loader2 class="h-4 w-4 mr-1 animate-spin" />
							Merging...
						{:else}
							<GitMerge class="h-4 w-4 mr-1" />
							Merge
						{/if}
					</Button>
				</div>
			</SheetFooter>
		{/if}
	</SheetContent>
</Sheet>

{#snippet contactFields(contact, comparedTo)}
	<div class="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
		<div>
			<span class="text-text-ghost">First</span>
			<p
				class="text-text-secondary {comparedTo && isAbsorbed(comparedTo, contact, 'first_name')
					? 'text-vivid-emerald font-medium'
					: ''}"
			>
				{contact.first_name || '—'}
			</p>
		</div>
		<div>
			<span class="text-text-ghost">Last</span>
			<p
				class="text-text-secondary {comparedTo && isAbsorbed(comparedTo, contact, 'last_name')
					? 'text-vivid-emerald font-medium'
					: ''}"
			>
				{contact.last_name || '—'}
			</p>
		</div>
		<div>
			<span class="text-text-ghost">Source</span>
			<p class="text-text-secondary">
				{SOURCE_LABELS[contact.source] || contact.source}
				<span class="text-text-ghost">({SOURCE_PRIORITY_LABELS[contact.source] || '?'})</span>
			</p>
		</div>
		<div>
			<span class="text-text-ghost">Created</span>
			<p class="text-text-secondary">{formatRelativeDate(contact.created_at)}</p>
		</div>
		{#if contact.tags?.length}
			<div class="col-span-2">
				<span class="text-text-ghost">Tags</span>
				<div class="flex flex-wrap gap-1 mt-0.5">
					{#each contact.tags as tag (tag)}
						<span class="inline-block rounded-full bg-zinc-700/50 px-1.5 py-0.5 text-xs">
							{tag}
						</span>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/snippet}
