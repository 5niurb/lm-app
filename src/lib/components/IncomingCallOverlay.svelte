<script>
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Phone, PhoneOff, PhoneIncoming, Mic, MicOff } from '@lucide/svelte';
	import {
		callState,
		callerInfo,
		callDuration,
		isMuted,
		answerCall,
		rejectCall,
		hangUp,
		toggleMute
	} from '$lib/stores/softphone.js';
	import { formatPhone } from '$lib/utils/formatters.js';

	/**
	 * Format call duration seconds into M:SS display.
	 * @param {number} seconds
	 * @returns {string}
	 */
	function formatCallDuration(seconds) {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	let isOnSoftphonePage = $derived(page.url?.pathname?.startsWith('/softphone'));
	let showOverlay = $derived(!isOnSoftphonePage && $callState !== 'idle');
</script>

{#if showOverlay}
	<div
		class="fixed bottom-6 right-6 z-50 w-72 rounded-xl border border-border-subtle bg-card shadow-2xl overflow-hidden"
	>
		<!-- Incoming call state -->
		{#if $callState === 'incoming'}
			<div class="border-t-2 border-vivid-blue">
				<!-- Header -->
				<div class="flex items-center gap-3 px-4 pt-4 pb-3">
					<div
						class="flex h-10 w-10 items-center justify-center rounded-full bg-vivid-blue/15 shrink-0"
					>
						<PhoneIncoming class="h-5 w-5 animate-bounce text-vivid-blue" />
					</div>
					<div class="min-w-0 flex-1">
						<p class="text-[10px] font-semibold uppercase tracking-widest text-vivid-blue">
							Incoming Call
						</p>
						<p class="truncate text-sm font-medium text-text-primary">
							{formatPhone($callerInfo) || $callerInfo || 'Unknown'}
						</p>
					</div>
				</div>

				<!-- Actions -->
				<div class="flex gap-2 px-4 pb-4">
					<button
						onclick={answerCall}
						class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-vivid-emerald px-3 py-2.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
					>
						<Phone class="h-4 w-4" />
						Answer
					</button>
					<button
						onclick={rejectCall}
						class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-vivid-rose px-3 py-2.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
					>
						<PhoneOff class="h-4 w-4" />
						Decline
					</button>
				</div>
			</div>

			<!-- Connecting state -->
		{:else if $callState === 'connecting'}
			<div class="px-4 py-4">
				<!-- Header -->
				<div class="flex items-center gap-3 mb-3">
					<div
						class="flex h-10 w-10 items-center justify-center rounded-full bg-vivid-amber/15 shrink-0"
					>
						<Phone class="h-5 w-5 animate-pulse text-vivid-amber" />
					</div>
					<div class="min-w-0 flex-1">
						<p class="text-[10px] font-semibold uppercase tracking-widest text-vivid-amber">
							Connecting
						</p>
						<p class="truncate text-sm font-medium text-text-primary">
							{formatPhone($callerInfo) || $callerInfo || 'Unknown'}
						</p>
					</div>
				</div>

				<!-- Actions -->
				<div class="flex items-center gap-2">
					<button
						onclick={hangUp}
						class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-vivid-rose px-3 py-2.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
					>
						<PhoneOff class="h-4 w-4" />
						End
					</button>
					<a
						href={resolve('/softphone')}
						class="flex items-center justify-center rounded-lg border border-border-subtle px-3 py-2.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors"
					>
						Open
					</a>
				</div>
			</div>

			<!-- Connected state -->
		{:else if $callState === 'connected'}
			<div class="px-4 py-4">
				<!-- Header -->
				<div class="flex items-center gap-3 mb-3">
					<div
						class="flex h-10 w-10 items-center justify-center rounded-full bg-vivid-emerald/15 shrink-0"
					>
						<Phone class="h-5 w-5 text-vivid-emerald" />
					</div>
					<div class="min-w-0 flex-1">
						<p class="text-[10px] font-semibold uppercase tracking-widest text-vivid-emerald">
							Connected
						</p>
						<p class="truncate text-sm font-medium text-text-primary">
							{formatPhone($callerInfo) || $callerInfo || 'Unknown'}
						</p>
					</div>
					<!-- Duration -->
					<span class="shrink-0 font-mono text-xs text-text-secondary tabular-nums">
						{formatCallDuration($callDuration)}
					</span>
				</div>

				<!-- Actions -->
				<div class="flex items-center gap-2">
					<button
						onclick={toggleMute}
						class="flex items-center justify-center rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors {$isMuted
							? 'border-vivid-amber/40 bg-vivid-amber/10 text-vivid-amber'
							: 'border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-strong'}"
						title={$isMuted ? 'Unmute' : 'Mute'}
					>
						{#if $isMuted}
							<MicOff class="h-4 w-4" />
						{:else}
							<Mic class="h-4 w-4" />
						{/if}
					</button>
					<button
						onclick={hangUp}
						class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-vivid-rose px-3 py-2.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
					>
						<PhoneOff class="h-4 w-4" />
						End
					</button>
					<a
						href={resolve('/softphone')}
						class="flex items-center justify-center rounded-lg border border-border-subtle px-3 py-2.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors"
					>
						Open
					</a>
				</div>
			</div>
		{/if}
	</div>
{/if}
