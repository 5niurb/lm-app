<script>
	import {
		PhoneIncoming,
		PhoneOutgoing,
		PhoneMissed,
		ChevronDown,
		ChevronUp
	} from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import AudioPlayer from './AudioPlayer.svelte';

	/**
	 * @type {{
	 *   call: {
	 *     id: string,
	 *     direction: string,
	 *     disposition?: string,
	 *     duration?: number,
	 *     recording_url?: string,
	 *     recording_sid?: string,
	 *     transcription?: string,
	 *     caller_name?: string,
	 *     from_number?: string,
	 *     to_number?: string,
	 *     created_at: string,
	 *     started_at?: string,
	 *     notes?: string
	 *   }
	 * }}
	 */
	let { call } = $props();

	let showTranscript = $state(false);

	const hasRecording = !!(call.recording_url || call.recording_sid);
	const isMissed = call.disposition === 'missed' || call.disposition === 'no-answer';
	const isVoicemail = call.disposition === 'voicemail';

	function formatDuration(seconds) {
		if (!seconds) return '0:00';
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	const callbackNumber = call.direction === 'inbound' ? call.from_number : call.to_number;
</script>

<div class="flex justify-center">
	<div
		class="w-full max-w-[85%] rounded-xl border border-border-subtle bg-surface-subtle/30 px-4 py-3"
	>
		<!-- Header row -->
		<div class="flex items-center gap-2.5">
			<!-- Icon -->
			<div
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full {isMissed
					? 'bg-vivid-rose/15 text-vivid-rose'
					: call.direction === 'inbound'
						? 'bg-vivid-emerald/15 text-vivid-emerald'
						: 'bg-vivid-blue/15 text-vivid-blue'}"
			>
				{#if isMissed}
					<PhoneMissed class="h-4 w-4" />
				{:else if call.direction === 'inbound'}
					<PhoneIncoming class="h-4 w-4" />
				{:else}
					<PhoneOutgoing class="h-4 w-4" />
				{/if}
			</div>

			<!-- Details -->
			<div class="min-w-0 flex-1">
				<p class="text-xs font-semibold text-text-primary">
					{#if isMissed}
						Missed Call
					{:else if isVoicemail}
						Call → Voicemail
					{:else}
						{call.direction === 'inbound' ? 'Inbound' : 'Outbound'} Call
					{/if}
				</p>
				<div class="flex items-center gap-2 text-[10px] text-text-tertiary">
					{#if call.duration > 0}
						<span>{formatDuration(call.duration)}</span>
						<span class="text-text-tertiary">•</span>
					{/if}
					<span>
						{new Date(call.started_at || call.created_at).toLocaleTimeString('en-US', {
							hour: 'numeric',
							minute: '2-digit'
						})}
					</span>
				</div>
			</div>

			<!-- Call back button for missed calls -->
			{#if isMissed && callbackNumber}
				<a
					href={resolve(`/softphone?call=${encodeURIComponent(callbackNumber)}`)}
					class="flex items-center gap-1 rounded-lg bg-vivid-emerald/15 px-2.5 py-1 text-[10px] font-semibold text-vivid-emerald hover:bg-vivid-emerald/25 transition-colors"
				>
					<PhoneOutgoing class="h-3 w-3" />
					Call Back
				</a>
			{/if}
		</div>

		<!-- Audio player for recordings -->
		{#if hasRecording}
			<div class="mt-2.5">
				<AudioPlayer src={`/api/calls/${call.id}/recording`} duration={call.duration || 0} />
			</div>
		{/if}

		<!-- Notes -->
		{#if call.notes}
			<p class="mt-2 text-xs text-text-secondary italic">{call.notes}</p>
		{/if}

		<!-- Transcript toggle -->
		{#if call.transcription}
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
					<p class="text-xs text-text-secondary leading-relaxed">{call.transcription}</p>
				</div>
			{/if}
		{/if}
	</div>
</div>
