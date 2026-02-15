<script>
	import { theme, themeChoice, setTheme, themes } from '$lib/stores/theme.js';
	import { Moon, Sun, Sunset, Monitor } from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';

	let open = $state(false);

	const themeIcons = {
		midnight: Moon,
		dusk: Sunset,
		champagne: Sun
	};

	/** @type {typeof Moon} */
	let CurrentIcon = $derived(
		$themeChoice === 'auto' ? Monitor : themeIcons[$theme] || Moon
	);
</script>

<DropdownMenu.Root bind:open>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				variant="ghost"
				size="sm"
				class="relative h-8 w-8 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
				{...props}
				aria-label="Change theme"
			>
				<CurrentIcon class="h-4 w-4" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end" class="w-64 p-2">
		<DropdownMenu.Label class="px-2 pb-2">
			<span class="text-xs font-semibold uppercase tracking-[0.1em]" style="color: var(--text-tertiary)">
				Ambiance
			</span>
		</DropdownMenu.Label>

		<!-- Theme options -->
		{#each themes as t}
			{@const isActive = $themeChoice === t.id}
			<DropdownMenu.Item
				class="flex items-center gap-3 rounded-md px-2 py-2.5 cursor-pointer {isActive ? 'bg-[var(--surface-raised)]' : ''}"
				onclick={() => { setTheme(t.id); open = false; }}
			>
				<!-- Theme preview orb -->
				<div
					class="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
					style="background: {t.colors.bg}; border: 1.5px solid {t.colors.accent}40;"
				>
					<div
						class="h-3 w-3 rounded-full"
						style="background: {t.colors.accent}; box-shadow: 0 0 8px {t.colors.accent}60;"
					></div>
					<!-- Active indicator ring -->
					{#if isActive}
						<div
							class="absolute inset-[-3px] rounded-full"
							style="border: 2px solid {t.colors.accent};"
						></div>
					{/if}
				</div>

				<!-- Label + description -->
				<div class="flex flex-col gap-0.5 min-w-0">
					<span class="text-sm font-medium" style="color: var(--text-primary)">{t.label}</span>
					<span class="text-[11px]" style="color: var(--text-tertiary)">{t.description}</span>
				</div>

				<!-- Checkmark -->
				{#if isActive}
					<div class="ml-auto shrink-0" style="color: var(--gold)">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
					</div>
				{/if}
			</DropdownMenu.Item>
		{/each}

		<DropdownMenu.Separator class="my-2" />

		<!-- Auto / System option -->
		{@const isAuto = $themeChoice === 'auto'}
		<DropdownMenu.Item
			class="flex items-center gap-3 rounded-md px-2 py-2.5 cursor-pointer {isAuto ? 'bg-[var(--surface-raised)]' : ''}"
			onclick={() => { setTheme('auto'); open = false; }}
		>
			<div
				class="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
				style="background: var(--surface-raised); border: 1.5px solid var(--border-default);"
			>
				<Monitor class="h-4 w-4" style="color: var(--text-secondary)" />
				{#if isAuto}
					<div
						class="absolute inset-[-3px] rounded-full"
						style="border: 2px solid var(--gold);"
					></div>
				{/if}
			</div>
			<div class="flex flex-col gap-0.5 min-w-0">
				<span class="text-sm font-medium" style="color: var(--text-primary)">Auto</span>
				<span class="text-[11px]" style="color: var(--text-tertiary)">Match system preference</span>
			</div>
			{#if isAuto}
				<div class="ml-auto shrink-0" style="color: var(--gold)">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
				</div>
			{/if}
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
