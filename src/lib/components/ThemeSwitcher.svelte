<script>
	import { theme, themeChoice, setTheme, themes } from '$lib/stores/theme.js';
	import { Moon, Sun, Sunset, Monitor, Check } from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';

	let open = $state(false);

	const themeIcons = {
		midnight: Moon,
		dusk: Sunset,
		champagne: Sun
	};

	/** @type {typeof Moon} */
	let CurrentIcon = $derived($themeChoice === 'auto' ? Monitor : themeIcons[$theme] || Moon);
</script>

<DropdownMenu.Root bind:open>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				variant="ghost"
				size="sm"
				class="relative h-8 w-8 text-text-tertiary hover:text-text-primary"
				{...props}
				aria-label="Change theme"
			>
				<CurrentIcon class="h-4 w-4" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end" class="w-56 p-1.5">
		<DropdownMenu.Label class="px-2 pb-1.5">
			<span class="text-xs font-semibold text-text-tertiary">Appearance</span>
		</DropdownMenu.Label>

		{#each themes as t (t.id)}
			{@const isActive = $themeChoice === t.id}
			<DropdownMenu.Item
				class="flex items-center gap-3 rounded-md px-2 py-2 cursor-pointer {isActive
					? 'bg-surface-raised'
					: ''}"
				onclick={() => {
					setTheme(t.id);
					open = false;
				}}
			>
				<!-- Theme preview orb -->
				<div
					class="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
					style="background: {t.colors.bg}; border: 1.5px solid {t.colors.accent}30;"
				>
					<div
						class="h-2.5 w-2.5 rounded-full"
						style="background: {t.colors.accent}; box-shadow: 0 0 8px {t.colors.accent}50;"
					></div>
					{#if isActive}
						<div
							class="absolute inset-[-3px] rounded-[10px]"
							style="border: 2px solid {t.colors.accent};"
						></div>
					{/if}
				</div>

				<div class="flex flex-col gap-0 min-w-0">
					<span class="text-sm font-medium text-text-primary">{t.label}</span>
					<span class="text-[11px] text-text-tertiary">{t.description}</span>
				</div>

				{#if isActive}
					<Check class="ml-auto h-4 w-4 shrink-0 text-gold" />
				{/if}
			</DropdownMenu.Item>
		{/each}

		<DropdownMenu.Separator class="my-1.5" />

		{@const isAuto = $themeChoice === 'auto'}
		<DropdownMenu.Item
			class="flex items-center gap-3 rounded-md px-2 py-2 cursor-pointer {isAuto
				? 'bg-surface-raised'
				: ''}"
			onclick={() => {
				setTheme('auto');
				open = false;
			}}
		>
			<div
				class="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
				style="background: var(--surface-raised); border: 1.5px solid var(--border-default);"
			>
				<Monitor class="h-3.5 w-3.5 text-text-secondary" />
				{#if isAuto}
					<div
						class="absolute inset-[-3px] rounded-[10px]"
						style="border: 2px solid var(--gold);"
					></div>
				{/if}
			</div>
			<div class="flex flex-col gap-0 min-w-0">
				<span class="text-sm font-medium text-text-primary">Auto</span>
				<span class="text-[11px] text-text-tertiary">Match system</span>
			</div>
			{#if isAuto}
				<Check class="ml-auto h-4 w-4 shrink-0 text-gold" />
			{/if}
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
