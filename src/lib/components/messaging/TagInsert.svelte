<script>
	import { Braces } from '@lucide/svelte';

	/** @type {{ onInsert: (tag: string) => void }} */
	let { onInsert } = $props();

	let open = $state(false);
	/** @type {HTMLElement|null} */
	let menuRef = $state(null);

	const tags = [
		{ label: 'First Name', tag: '{{first_name}}', description: 'Contact first name' },
		{ label: 'Last Name', tag: '{{last_name}}', description: 'Contact last name' },
		{ label: 'Full Name', tag: '{{full_name}}', description: 'Contact full name' },
		{ label: 'Phone', tag: '{{phone}}', description: 'Contact phone number' },
		{ label: 'Email', tag: '{{email}}', description: 'Contact email' },
		{ label: 'Date', tag: '{{date}}', description: 'Appointment date' },
		{ label: 'Time', tag: '{{time}}', description: 'Appointment time' },
		{ label: 'Service', tag: '{{service}}', description: 'Service/treatment name' },
		{ label: 'Provider', tag: '{{provider}}', description: 'Provider/staff name' },
		{ label: 'Clinic Name', tag: '{{clinic_name}}', description: 'Le Med Spa' },
		{ label: 'Clinic Phone', tag: '{{clinic_phone}}', description: '(818) 463-3772' },
		{ label: 'Offer Details', tag: '{{offer_details}}', description: 'Promotion details' },
		{ label: 'Expiry Date', tag: '{{expiry_date}}', description: 'Offer expiration' }
	];

	function handleSelect(tag) {
		onInsert(tag.tag);
		open = false;
	}

	function handleClickOutside(e) {
		if (menuRef && !menuRef.contains(e.target)) {
			open = false;
		}
	}

	$effect(() => {
		if (open) {
			document.addEventListener('mousedown', handleClickOutside);
			return () => document.removeEventListener('mousedown', handleClickOutside);
		}
	});
</script>

<div class="relative" bind:this={menuRef}>
	<button
		type="button"
		class="inline-flex items-center justify-center h-8 w-8 rounded-md text-text-tertiary hover:text-text-secondary hover:bg-surface-subtle transition-colors"
		title="Insert dynamic tag"
		onclick={() => {
			open = !open;
		}}
	>
		<Braces class="h-4 w-4" />
	</button>

	{#if open}
		<div
			class="absolute bottom-10 left-0 z-50 w-64 rounded-lg border border-border bg-card shadow-xl max-h-72 overflow-y-auto"
		>
			<div class="p-2 border-b border-border">
				<p class="text-[10px] text-text-tertiary uppercase tracking-wider font-medium">
					Merge Tags
				</p>
			</div>
			<div class="py-1">
				{#each tags as tag (tag.tag)}
					<button
						type="button"
						class="w-full text-left px-3 py-2 hover:bg-surface-hover transition-colors group"
						onclick={() => handleSelect(tag)}
					>
						<div class="flex items-center justify-between gap-2">
							<span class="text-sm text-text-primary">{tag.label}</span>
							<code
								class="text-[10px] text-gold-dim font-mono bg-surface-subtle px-1.5 py-0.5 rounded"
								>{tag.tag}</code
							>
						</div>
						<p class="text-[10px] text-text-ghost mt-0.5">{tag.description}</p>
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
