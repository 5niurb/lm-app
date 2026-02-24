<script>
	import { Mail, ChevronDown, ChevronUp } from '@lucide/svelte';

	/**
	 * @type {{
	 *   email: {
	 *     id: string,
	 *     direction: string,
	 *     from_address: string,
	 *     from_name?: string,
	 *     to_address: string,
	 *     cc?: string[],
	 *     subject?: string,
	 *     body_text?: string,
	 *     status?: string,
	 *     created_at: string
	 *   }
	 * }}
	 */
	let { email } = $props();

	let expanded = $state(false);

	const isOutbound = email.direction === 'outbound';
	const previewText = email.body_text?.slice(0, 120) || '';
	const hasMore = (email.body_text?.length || 0) > 120;

	function statusColor(status) {
		const map = {
			sent: 'text-vivid-blue bg-vivid-blue/10',
			delivered: 'text-vivid-emerald bg-vivid-emerald/10',
			bounced: 'text-vivid-rose bg-vivid-rose/10',
			failed: 'text-vivid-rose bg-vivid-rose/10'
		};
		return map[status] || 'text-text-tertiary bg-surface-subtle';
	}
</script>

<div class="flex {isOutbound ? 'justify-end' : 'justify-start'}">
	<div
		class="max-w-[75%] rounded-2xl px-4 py-3 {isOutbound
			? 'rounded-br-md border-2 border-vivid-indigo/30 bg-gradient-to-br from-[#0e0e18] to-[#141422]'
			: 'rounded-bl-md border-2 border-vivid-indigo/20 bg-gradient-to-br from-[#0e0e14] to-[#16161e]'}"
	>
		<!-- Header -->
		<div class="flex items-center gap-2 mb-1.5">
			<div
				class="flex h-5 w-5 items-center justify-center rounded bg-vivid-indigo/15 text-vivid-indigo"
			>
				<Mail class="h-3 w-3" />
			</div>
			<span class="text-[10px] font-semibold text-vivid-indigo">Email</span>
			{#if email.status && email.status !== 'sent'}
				<span class="text-[9px] px-1.5 py-0.5 rounded-full font-medium {statusColor(email.status)}">
					{email.status}
				</span>
			{/if}
		</div>

		<!-- Subject -->
		{#if email.subject}
			<p class="text-sm font-semibold text-text-primary mb-1">{email.subject}</p>
		{/if}

		<!-- To/From -->
		<p class="text-[10px] text-text-tertiary mb-1.5">
			{#if isOutbound}
				To: {email.to_address}
			{:else}
				From: {email.from_name || email.from_address}
			{/if}
			{#if email.cc?.length}
				<span class="ml-2">CC: {email.cc.join(', ')}</span>
			{/if}
		</p>

		<!-- Body preview or full -->
		{#if expanded}
			<p class="text-xs text-text-secondary whitespace-pre-wrap break-words leading-relaxed">
				{email.body_text}
			</p>
		{:else}
			<p class="text-xs text-text-secondary line-clamp-3">
				{previewText}{hasMore ? '...' : ''}
			</p>
		{/if}

		{#if hasMore}
			<button
				type="button"
				class="mt-1 flex items-center gap-0.5 text-[10px] text-vivid-blue hover:text-vivid-blue/80 transition-colors"
				onclick={() => {
					expanded = !expanded;
				}}
			>
				{#if expanded}
					<ChevronUp class="h-3 w-3" />
					Show less
				{:else}
					<ChevronDown class="h-3 w-3" />
					Show more
				{/if}
			</button>
		{/if}

		<!-- Timestamp -->
		<p class="text-[10px] mt-1.5 text-text-tertiary">
			{new Date(email.created_at).toLocaleTimeString('en-US', {
				hour: 'numeric',
				minute: '2-digit'
			})}
		</p>
	</div>
</div>
