<script>
	import { Voicemail, ChevronDown, ChevronUp } from '@lucide/svelte';
	import AudioPlayer from './AudioPlayer.svelte';

	/**
	 * @type {{
	 *   voicemail: {
	 *     id: string,
	 *     from_number?: string,
	 *     duration?: number,
	 *     transcription?: string,
	 *     transcription_status?: string,
	 *     mailbox?: string,
	 *     is_new?: boolean,
	 *     created_at: string
	 *   }
	 * }}
	 */
	let { voicemail } = $props();

	let showTranscript = $state(false);

	function formatDuration(seconds) {
		if (!seconds) return '0:00';
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}
</script>

<div class="flex justify-center">
	<div
		class="w-full max-w-[85%] rounded-xl border border-vivid-orange/20 bg-vivid-orange/5 px-4 py-3"
	>
		<!-- Header -->
		<div class="flex items-center gap-2.5">
			<div
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-vivid-orange/15 text-vivid-orange"
			>
				<Voicemail class="h-4 w-4" />
			</div>
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					<p class="text-xs font-semibold text-text-primary">Voicemail</p>
					{#if voicemail.mailbox}
						<span
							class="text-[9px] px-1.5 py-0.5 rounded-full bg-vivid-orange/10 text-vivid-orange font-medium"
						>
							{voicemail.mailbox.replace('_', ' ')}
						</span>
					{/if}
					{#if voicemail.is_new}
						<span class="flex h-2 w-2 rounded-full bg-vivid-orange"></span>
					{/if}
				</div>
				<div class="flex items-center gap-2 text-[10px] text-text-tertiary">
					{#if voicemail.duration > 0}
						<span>{formatDuration(voicemail.duration)}</span>
						<span class="text-border">•</span>
					{/if}
					<span>
						{new Date(voicemail.created_at).toLocaleTimeString('en-US', {
							hour: 'numeric',
							minute: '2-digit'
						})}
					</span>
				</div>
			</div>
		</div>

		<!-- Audio player -->
		<div class="mt-2.5">
			<AudioPlayer
				src={`/api/voicemails/${voicemail.id}/recording`}
				duration={voicemail.duration || 0}
			/>
		</div>

		<!-- Transcript -->
		{#if voicemail.transcription}
			<button
				type="button"
				class="mt-2 flex items-center gap-1 text-[10px] font-medium text-vivid-blue hover:text-vivid-blue/80 transition-colors"
				onclick={() => {
					showTranscript = !showTranscript;
				}}
			>
				{#if showTranscript}
					<ChevronUp class="h-3 w-3" />
					Hide Transcript
				{:else}
					<ChevronDown class="h-3 w-3" />
					View Transcript
				{/if}
			</button>
			{#if showTranscript}
				<div class="mt-1.5 rounded-lg bg-surface-hover/50 px-3 py-2">
					<p class="text-xs text-text-secondary leading-relaxed">{voicemail.transcription}</p>
				</div>
			{/if}
		{:else if voicemail.transcription_status === 'in-progress'}
			<p class="mt-2 text-[10px] text-text-ghost italic">Transcription in progress...</p>
		{/if}
	</div>
</div>
