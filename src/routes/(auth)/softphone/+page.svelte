<script>
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.ts';
	import {
		Phone,
		PhoneOff,
		PhoneIncoming,
		PhoneOutgoing,
		Mic,
		MicOff,
		Headset,
		Clock,
		X
	} from '@lucide/svelte';
	import { formatPhone } from '$lib/utils/formatters.js';
	import {
		device,
		activeCall,
		deviceStatus,
		statusMessage,
		errorMessage,
		callState,
		callerInfo,
		isMuted,
		callDuration,
		connectDevice,
		disconnectDevice,
		answerCall,
		rejectCall,
		makeOutboundCall,
		hangUp,
		toggleMute,
		sendDtmf
	} from '$lib/stores/softphone.js';

	/** @type {string} Number to dial */
	let dialNumber = $state('');

	/** @type {string|null} Phone number from URL ?call= param — triggers auto-dial once device registers */
	let pendingCall = $state(null);

	/** @type {Array<{time: string, type: string, info: string}>} */
	let callHistory = $state([]);

	const dialPad = [
		['1', '2', '3'],
		['4', '5', '6'],
		['7', '8', '9'],
		['*', '0', '#']
	];

	/** Sub-labels for dial buttons (standard ITU E.161) */
	const digitLabels = {
		'2': 'ABC',
		'3': 'DEF',
		'4': 'GHI',
		'5': 'JKL',
		'6': 'MNO',
		'7': 'PQRS',
		'8': 'TUV',
		'9': 'WXYZ',
		'0': '+'
	};

	onMount(() => {
		// Check for ?call= URL parameter (from contacts/calls quick action)
		const params = new URLSearchParams(window.location.search);
		const callParam = params.get('call');
		if (callParam) {
			dialNumber = callParam;
			pendingCall = callParam;
			// Clean the URL so refresh doesn't re-trigger
			const url = new URL(window.location.href);
			url.searchParams.delete('call');
			window.history.replaceState({}, '', url.pathname);
		}
	});

	// Auto-dial when device becomes registered after arriving via ?call= param
	$effect(() => {
		if (pendingCall && dialNumber && $deviceStatus === 'registered') {
			pendingCall = null;
			setTimeout(() => makeOutboundCall(dialNumber), 300);
		}
	});

	function formatCallDuration(seconds) {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	function addToHistory(type, info) {
		const time = new Date().toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
		callHistory = [{ time, type, info }, ...callHistory.slice(0, 29)];
	}

	function statusColor(status) {
		switch (status) {
			case 'registered':
				return 'bg-vivid-emerald';
			case 'registering':
				return 'bg-vivid-amber animate-pulse';
			case 'error':
				return 'bg-vivid-rose';
			default:
				return 'bg-zinc-500';
		}
	}

	function sendDigit(digit) {
		if ($activeCall && $callState === 'connected') {
			sendDtmf(digit);
		} else {
			dialNumber += digit;
		}
	}
</script>

<svelte:head>
	<title>Softphone — Le Med Spa</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl tracking-wide">Softphone</h1>
			<p class="text-sm text-text-secondary mt-1">Answer and make calls from your browser.</p>
		</div>
		<div class="flex items-center gap-3">
			<span class="flex items-center gap-2 text-sm">
				<span class="relative flex h-2.5 w-2.5">
					<span
						class="absolute inline-flex h-full w-full rounded-full {statusColor(
							$deviceStatus
						)} opacity-75 {$deviceStatus === 'registering' ? 'animate-ping' : ''}"
					></span>
					<span class="relative inline-flex h-2.5 w-2.5 rounded-full {statusColor($deviceStatus)}"
					></span>
				</span>
				<span class="text-text-secondary">{$statusMessage}</span>
			</span>
			{#if $deviceStatus === 'offline' || $deviceStatus === 'error'}
				<Button size="sm" onclick={connectDevice} disabled={$deviceStatus === 'registering'}>
					{$deviceStatus === 'registering' ? 'Connecting...' : 'Connect'}
				</Button>
			{:else if $deviceStatus === 'registered'}
				<Button variant="outline" size="sm" onclick={disconnectDevice}>Disconnect</Button>
			{/if}
		</div>
	</div>

	{#if $errorMessage}
		<div
			class="rounded-lg border border-vivid-rose/20 bg-vivid-rose/5 px-4 py-3 flex items-center justify-between"
		>
			<p class="text-sm text-vivid-rose">{$errorMessage}</p>
			<Button
				variant="outline"
				size="sm"
				onclick={() => {
					errorMessage.set('');
					connectDevice();
				}}>Retry</Button
			>
		</div>
	{/if}

	<div class="grid gap-6 lg:grid-cols-2">
		<!-- Softphone Panel -->
		<div class="rounded-xl border border-border-subtle overflow-hidden bg-card">
			<div class="px-4 py-3 border-b border-border-subtle flex items-center gap-2">
				<Headset class="h-4 w-4 text-gold" />
				<h2 class="text-sm font-medium tracking-wide">Phone</h2>
			</div>

			<div class="p-4 space-y-3">
				<!-- Active Call States -->
				{#if $callState !== 'idle'}
					{#if $callState === 'incoming'}
						<!-- INCOMING CALL -->
						<div
							class="rounded-xl border-2 border-vivid-blue/50 bg-gradient-to-b from-vivid-blue/15 to-vivid-blue/5 p-5 text-center space-y-3"
						>
							<div class="flex items-center justify-center gap-2 text-vivid-blue">
								<PhoneIncoming class="h-5 w-5 animate-bounce" />
								<span class="text-xs font-semibold tracking-widest uppercase">Incoming Call</span>
								<PhoneIncoming class="h-5 w-5 animate-bounce" />
							</div>
							<p
								class="text-2xl font-light text-text-primary"
								style="font-family: var(--font-display);"
							>
								{formatPhone($callerInfo)}
							</p>
							<div class="flex items-center justify-center gap-10 pt-1">
								<div class="flex flex-col items-center gap-1.5">
									<button
										class="flex items-center justify-center h-14 w-14 rounded-full bg-vivid-emerald hover:bg-vivid-emerald/80 text-white shadow-lg shadow-vivid-emerald/30 transition-all duration-200 hover:scale-105 active:scale-95"
										onclick={answerCall}
									>
										<Phone class="h-6 w-6" />
									</button>
									<span
										class="text-[10px] font-semibold text-vivid-emerald uppercase tracking-widest"
										>Answer</span
									>
								</div>
								<div class="flex flex-col items-center gap-1.5">
									<button
										class="flex items-center justify-center h-14 w-14 rounded-full bg-vivid-rose hover:bg-vivid-rose/80 text-white shadow-lg shadow-vivid-rose/30 transition-all duration-200 hover:scale-105 active:scale-95"
										onclick={rejectCall}
									>
										<PhoneOff class="h-6 w-6" />
									</button>
									<span class="text-[10px] font-semibold text-vivid-rose uppercase tracking-widest"
										>Decline</span
									>
								</div>
							</div>
						</div>
					{:else if $callState === 'connecting' && $activeCall}
						<!-- Answering incoming -->
						<div
							class="rounded-xl border border-vivid-amber/40 bg-vivid-amber/10 p-4 text-center space-y-2"
						>
							<div class="flex items-center justify-center gap-2 text-vivid-amber">
								<Phone class="h-4 w-4 animate-pulse" />
								<span class="text-sm font-medium">Connecting...</span>
							</div>
							<p
								class="text-xl font-light text-text-primary"
								style="font-family: var(--font-display);"
							>
								{formatPhone($callerInfo)}
							</p>
						</div>
					{:else}
						<!-- Outbound connecting / active call -->
						<div class="rounded-lg bg-gold-glow border border-border p-4 text-center space-y-2">
							{#if $callState === 'connecting'}
								<div class="flex items-center justify-center gap-1.5 text-vivid-amber">
									<PhoneOutgoing class="h-4 w-4 animate-pulse" />
									<span class="text-xs font-semibold uppercase tracking-widest">Connecting</span>
								</div>
							{:else if $callState === 'connected'}
								<div class="flex items-center justify-center gap-1.5 text-vivid-emerald">
									<Phone class="h-4 w-4" />
									<span class="text-xs font-semibold uppercase tracking-widest">Connected</span>
								</div>
							{/if}
							<p
								class="text-xl font-light text-text-primary"
								style="font-family: var(--font-display);"
							>
								{formatPhone($callerInfo)}
							</p>
							{#if $callState === 'connected'}
								<div class="flex items-center justify-center gap-1 text-text-tertiary">
									<Clock class="h-3 w-3" />
									<span class="text-sm font-mono tabular-nums"
										>{formatCallDuration($callDuration)}</span
									>
								</div>
							{/if}
							<div class="flex items-center justify-center gap-3 pt-1">
								<Button
									variant={$isMuted ? 'destructive' : 'outline'}
									size="icon"
									class="rounded-full h-10 w-10"
									onclick={toggleMute}
									title={$isMuted ? 'Unmute' : 'Mute'}
								>
									{#if $isMuted}
										<MicOff class="h-4 w-4" />
									{:else}
										<Mic class="h-4 w-4" />
									{/if}
								</Button>
								<Button
									variant="destructive"
									size="icon"
									class="rounded-full h-12 w-12 shadow-lg shadow-vivid-rose/20"
									onclick={hangUp}
								>
									<PhoneOff class="h-5 w-5" />
								</Button>
							</div>
						</div>
					{/if}
				{/if}

				<!-- Dial Pad -->
				<div class="space-y-2">
					<!-- Number display -->
					<div class="relative flex items-center border-b border-border-subtle pb-1">
						<input
							placeholder="· · ·"
							class="flex-1 w-full text-center text-2xl font-mono tracking-[0.2em] bg-transparent border-0 focus:outline-none text-text-primary placeholder:text-text-ghost/40 py-2"
							bind:value={dialNumber}
							onkeydown={(e) => {
								if (e.key === 'Enter') makeOutboundCall(dialNumber);
							}}
						/>
						{#if dialNumber}
							<button
								class="absolute right-0 p-2 text-text-tertiary hover:text-text-secondary rounded transition-colors"
								onclick={() => (dialNumber = dialNumber.slice(0, -1))}
								title="Backspace"
							>
								<X class="h-3.5 w-3.5" />
							</button>
						{/if}
					</div>

					<!-- Compact dial grid with sub-labels -->
					<div class="grid grid-cols-3 gap-1.5 max-w-[216px] mx-auto py-1">
						{#each dialPad as row, rowIdx (rowIdx)}
							{#each row as digit (digit)}
								<button
									class="flex flex-col items-center justify-center h-11 rounded-lg bg-surface-hover hover:bg-border border border-border-subtle/60 transition-all duration-100 active:scale-95 select-none"
									onclick={() => sendDigit(digit)}
								>
									<span class="text-sm font-medium text-text-primary leading-none">{digit}</span>
									{#if digitLabels[digit]}
										<span
											class="text-[8px] font-semibold tracking-widest text-text-ghost mt-0.5 leading-none"
											>{digitLabels[digit]}</span
										>
									{/if}
								</button>
							{/each}
						{/each}
					</div>

					<!-- Call / End button -->
					{#if $callState === 'idle'}
						<button
							class="w-full h-10 rounded-full bg-gold hover:bg-gold/85 text-primary-foreground text-sm font-medium tracking-wide flex items-center justify-center gap-2 transition-all shadow-md shadow-gold/20 disabled:opacity-40 disabled:cursor-not-allowed"
							onclick={() => makeOutboundCall(dialNumber)}
							disabled={!dialNumber || $deviceStatus !== 'registered'}
						>
							<Phone class="h-4 w-4" />
							Call
						</button>
					{:else if $callState !== 'incoming'}
						<button
							class="w-full h-10 rounded-full bg-vivid-rose hover:bg-vivid-rose/85 text-white text-sm font-medium flex items-center justify-center gap-2 transition-all shadow-md shadow-vivid-rose/20"
							onclick={hangUp}
						>
							<PhoneOff class="h-4 w-4" />
							End Call
						</button>
					{/if}
				</div>
			</div>
		</div>

		<!-- Session Activity Panel -->
		<div class="rounded-xl border border-border-subtle overflow-hidden bg-card">
			<div class="px-4 py-3 border-b border-border-subtle">
				<div class="flex items-center gap-2">
					<Clock class="h-4 w-4 text-gold" />
					<h2 class="text-sm font-medium tracking-wide">Session Activity</h2>
				</div>
				<p class="text-xs text-text-tertiary mt-0.5">Calls during this browser session</p>
			</div>
			<div class="p-4">
				{#if callHistory.length === 0}
					<div class="flex h-48 items-center justify-center">
						<div class="text-center">
							<div
								class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gold-glow border border-border"
							>
								<Headset class="h-5 w-5 empty-state-icon" />
							</div>
							<p
								class="text-sm font-light text-text-tertiary mb-1"
								style="font-family: var(--font-display);"
							>
								No calls yet
							</p>
							<p class="text-xs text-text-ghost">Incoming calls will ring here once connected.</p>
						</div>
					</div>
				{:else}
					<div class="space-y-1.5 max-h-[400px] overflow-y-auto">
						{#each callHistory as entry, entryIdx (entryIdx)}
							<div
								class="flex items-center gap-3 rounded-md border border-border-subtle px-3 py-2.5 transition-all duration-200 hover:bg-surface-hover"
							>
								{#if entry.type === 'incoming'}
									<PhoneIncoming class="h-3.5 w-3.5 shrink-0 text-vivid-blue" />
								{:else if entry.type === 'outgoing'}
									<PhoneOutgoing class="h-3.5 w-3.5 shrink-0 text-vivid-emerald" />
								{:else if entry.type === 'ended'}
									<PhoneOff class="h-3.5 w-3.5 shrink-0 text-zinc-400" />
								{:else}
									<Headset class="h-3.5 w-3.5 shrink-0 text-gold-dim" />
								{/if}
								<div class="min-w-0 flex-1">
									<p class="text-sm text-text-secondary">{entry.info}</p>
								</div>
								<span class="text-xs text-text-tertiary shrink-0 tabular-nums">{entry.time}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
