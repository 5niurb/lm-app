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
	import { api } from '$lib/api/client.js';

	/** @type {any} Twilio Device class — dynamically imported to avoid SSR issues */
	let TwilioDevice = null;
	/** @type {any} Twilio Call class — needed for Codec enum */
	let TwilioCall = null;
	/** @type {any} Twilio Device instance */
	let device = $state(null);
	/** @type {any} Active Twilio Call */
	let activeCall = $state(null);
	/** @type {'offline'|'registering'|'registered'|'error'} */
	let deviceStatus = $state('offline');
	/** @type {string} */
	let statusMessage = $state('Connecting...');
	/** @type {string} Error message */
	let errorMessage = $state('');
	/** @type {string} */
	let identity = $state('lea');
	/** @type {string} Number to dial */
	let dialNumber = $state('');
	/** @type {boolean} */
	let isMuted = $state(false);
	/** @type {'idle'|'incoming'|'connecting'|'connected'} */
	let callState = $state('idle');
	/** @type {string} */
	let callerInfo = $state('');
	/** @type {number} Call duration in seconds */
	let callDuration = $state(0);
	/** @type {any} Duration timer interval */
	let durationTimer = null;
	/** @type {boolean} */
	let isConnecting = $state(false);
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

	/** @type {AudioContext|null} */
	let audioCtx = null;
	/** @type {OscillatorNode|null} */
	let _ringOscillator = null;
	/** @type {any} Ring interval */
	let ringInterval = null;

	/** Play a browser-native ringtone using Web Audio API */
	function startRingtone() {
		try {
			audioCtx = new (window.AudioContext || /** @type {any} */ (window).webkitAudioContext)();
			playRingBurst();
			// Ring pattern: 1s ring, 2s silence
			ringInterval = setInterval(playRingBurst, 3000);
		} catch (e) {
			console.warn('Could not play ringtone:', e);
		}
	}

	function playRingBurst() {
		if (!audioCtx) return;
		const osc = audioCtx.createOscillator();
		const gain = audioCtx.createGain();
		osc.type = 'sine';
		osc.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
		gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);
		osc.connect(gain);
		gain.connect(audioCtx.destination);
		osc.start();
		osc.stop(audioCtx.currentTime + 0.8);

		// Second tone at slightly higher pitch for classic ring sound
		const osc2 = audioCtx.createOscillator();
		const gain2 = audioCtx.createGain();
		osc2.type = 'sine';
		osc2.frequency.setValueAtTime(480, audioCtx.currentTime);
		gain2.gain.setValueAtTime(0.12, audioCtx.currentTime);
		gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);
		osc2.connect(gain2);
		gain2.connect(audioCtx.destination);
		osc2.start();
		osc2.stop(audioCtx.currentTime + 0.8);
	}

	function stopRingtone() {
		if (ringInterval) {
			clearInterval(ringInterval);
			ringInterval = null;
		}
		if (audioCtx) {
			audioCtx.close().catch(() => {});
			audioCtx = null;
		}
	}

	/** @type {string|null} Phone number from URL ?call= param — triggers auto-dial once device registers */
	let pendingCall = $state(null);

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

		// Auto-connect to Twilio on page load — no manual "Connect" button needed.
		// Registering with Twilio's signaling server costs nothing; bandwidth is only
		// used when an actual call happens.
		connectDevice();

		return () => {
			// Cleanup on unmount
			if (durationTimer) clearInterval(durationTimer);
			stopRingtone();
			if (device) {
				device.destroy();
				device = null;
			}
		};
	});

	/** Request browser notification permission (for incoming call alerts) */
	function requestNotificationPermission() {
		if ('Notification' in window && Notification.permission === 'default') {
			Notification.requestPermission();
		}
	}

	/** Show browser notification for incoming call */
	function showIncomingCallNotification(caller) {
		if ('Notification' in window && Notification.permission === 'granted') {
			const n = new Notification('Incoming Call — Le Med Spa', {
				body: `Call from ${formatPhone(caller)}`,
				icon: '/favicon.png',
				tag: 'incoming-call',
				requireInteraction: true
			});
			n.onclick = () => {
				window.focus();
				n.close();
			};
			// Auto-close after 20 seconds
			setTimeout(() => n.close(), 20000);
		}
	}

	/**
	 * Connect to Twilio. Auto-called on mount; can also be triggered manually
	 * (e.g. after disconnect or error). Browser mic permission is requested
	 * during this flow.
	 */
	async function connectDevice() {
		if (isConnecting || deviceStatus === 'registered') return;

		isConnecting = true;
		errorMessage = '';

		try {
			// Dynamically import Twilio Voice SDK (browser-only, can't SSR)
			if (!TwilioDevice) {
				statusMessage = 'Loading Twilio SDK...';
				const mod = await import('@twilio/voice-sdk');
				TwilioDevice = mod.Device;
				TwilioCall = mod.Call;
			}

			statusMessage = 'Getting token...';

			const { token } = await api('/api/twilio/token', {
				method: 'POST',
				body: JSON.stringify({ identity })
			});
			// Request browser notification permission
			requestNotificationPermission();

			// Request microphone permission early (so the user grants it once, not during a call)
			try {
				statusMessage = 'Requesting microphone access...';
				const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
				// Release the stream — we just needed the permission
				stream.getTracks().forEach((t) => t.stop());
			} catch (micErr) {
				if (micErr.name === 'NotAllowedError' || micErr.name === 'PermissionDeniedError') {
					throw new Error(
						'Microphone permission denied. Please allow microphone access in your browser settings.',
						{ cause: micErr }
					);
				}
				console.warn('Mic permission check:', micErr.message);
			}

			statusMessage = 'Connecting to Twilio...';
			deviceStatus = 'registering';

			// Create Device with the 2.x SDK
			device = new TwilioDevice(token, {
				logLevel: 1,
				codecPreferences: [TwilioCall.Codec.Opus, TwilioCall.Codec.PCMU],
				allowIncomingWhileBusy: false,
				closeProtection: true
			});

			// Register event handlers
			device.on('registered', () => {
				deviceStatus = 'registered';
				statusMessage = 'Ready — listening for calls';
				isConnecting = false;
				addToHistory('system', 'Connected to Twilio');

				// Auto-dial if we arrived via ?call= parameter
				if (pendingCall && dialNumber) {
					pendingCall = null;
					// Short delay so the UI can render the "Ready" state first
					setTimeout(() => makeCall(), 300);
				}
			});

			device.on('error', (error) => {
				console.error('Twilio Device error:', error);
				errorMessage = error.message || 'Device error';
				deviceStatus = 'error';
				statusMessage = 'Error — see details above';
				isConnecting = false;
			});

			device.on('unregistered', () => {
				deviceStatus = 'offline';
				statusMessage = 'Disconnected';
			});

			device.on('incoming', (call) => {
				callState = 'incoming';
				activeCall = call;
				callerInfo = call.parameters.From || 'Unknown';
				statusMessage = `Incoming call from ${formatPhone(callerInfo)}`;
				addToHistory('incoming', `From: ${formatPhone(callerInfo)}`);

				// Play audible ringtone + browser notification
				startRingtone();
				showIncomingCallNotification(callerInfo);

				call.on('accept', () => {
					stopRingtone();
					callState = 'connected';
					statusMessage = `Connected — ${formatPhone(callerInfo)}`;
					startDurationTimer();
					addToHistory('system', 'Call connected (audio active)');
				});

				call.on('disconnect', () => {
					stopRingtone();
					handleDisconnect();
				});

				call.on('cancel', () => {
					stopRingtone();
					addToHistory('system', 'Call canceled by caller');
					handleDisconnect();
				});

				call.on('error', (err) => {
					stopRingtone();
					console.error('Incoming call error:', err);
					errorMessage = `Call error: ${err.message || 'unknown'}`;
					addToHistory('system', `Call error: ${err.message || 'unknown'}`);
					handleDisconnect();
				});

				call.on('reject', () => {
					stopRingtone();
					addToHistory('system', 'Call rejected');
					handleDisconnect();
				});
			});

			// Register the device with Twilio to start receiving calls
			device.register();
		} catch (err) {
			console.error('Failed to connect:', err);
			errorMessage = err.message;
			deviceStatus = 'error';
			statusMessage = 'Failed to connect';
			isConnecting = false;
		}
	}

	function handleDisconnect() {
		if (durationTimer) {
			clearInterval(durationTimer);
			durationTimer = null;
		}
		if (callDuration > 0) {
			addToHistory('ended', `Duration: ${formatCallDuration(callDuration)}`);
		}
		callState = 'idle';
		activeCall = null;
		callerInfo = '';
		callDuration = 0;
		isMuted = false;
		statusMessage = device ? 'Ready — listening for calls' : 'Disconnected';
	}

	async function answerCall() {
		if (!activeCall) return;

		callState = 'connecting';
		statusMessage = 'Answering...';
		addToHistory('system', 'Answering call...');

		try {
			// Request microphone permission first
			await navigator.mediaDevices.getUserMedia({ audio: true });

			activeCall.accept({
				rtcConstraints: {
					audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
				}
			});
			// callState → 'connected' will be set by the 'accept' event handler above
		} catch (err) {
			console.error('Failed to answer call:', err);
			if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
				errorMessage =
					'Microphone permission denied. Please allow microphone access and try again.';
			} else {
				errorMessage = `Failed to answer: ${err.message}`;
			}
			addToHistory('system', `Failed to answer: ${err.message}`);
			// Don't disconnect — let the call keep ringing so they can retry
			callState = 'incoming';
			statusMessage = `Incoming call from ${formatPhone(callerInfo)}`;
		}
	}

	function rejectCall() {
		if (activeCall) {
			stopRingtone();
			activeCall.reject();
			addToHistory('system', 'Call rejected');
			handleDisconnect();
		}
	}

	async function makeCall() {
		if (!device || !dialNumber) return;

		// Clean up the number and normalize to E.164
		let number = dialNumber.replace(/[^\d+*#]/g, '');
		if (number.length === 10 && !number.startsWith('+')) {
			number = '+1' + number;
		} else if (number.length === 11 && number.startsWith('1') && !number.startsWith('+')) {
			number = '+' + number;
		}

		try {
			const call = await device.connect({
				params: { To: number }
			});
			activeCall = call;
			callState = 'connecting';
			callerInfo = number;
			statusMessage = `Calling ${formatPhone(number)}...`;
			addToHistory('outgoing', `To: ${formatPhone(number)}`);

			call.on('accept', () => {
				callState = 'connected';
				statusMessage = `Connected — ${formatPhone(number)}`;
				startDurationTimer();
			});

			call.on('disconnect', handleDisconnect);
			call.on('cancel', handleDisconnect);
			call.on('error', (err) => {
				errorMessage = err.message;
				handleDisconnect();
			});
		} catch (err) {
			errorMessage = err.message;
		}
	}

	function hangUp() {
		if (activeCall) {
			activeCall.disconnect();
		}
		if (device) {
			device.disconnectAll();
		}
	}

	function toggleMute() {
		if (activeCall) {
			isMuted = !isMuted;
			activeCall.mute(isMuted);
		}
	}

	function sendDigit(digit) {
		if (activeCall && callState === 'connected') {
			activeCall.sendDigits(digit);
		} else {
			dialNumber += digit;
		}
	}

	function startDurationTimer() {
		callDuration = 0;
		durationTimer = setInterval(() => {
			callDuration++;
		}, 1000);
	}

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

	function disconnectDevice() {
		if (device) {
			device.unregister();
			device.destroy();
			device = null;
		}
		deviceStatus = 'offline';
		statusMessage = 'Disconnected — click Connect to reconnect';
		addToHistory('system', 'Disconnected');
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
							deviceStatus
						)} opacity-75 {deviceStatus === 'registering' ? 'animate-ping' : ''}"
					></span>
					<span class="relative inline-flex h-2.5 w-2.5 rounded-full {statusColor(deviceStatus)}"
					></span>
				</span>
				<span class="text-text-secondary">{statusMessage}</span>
			</span>
			{#if deviceStatus === 'offline' || deviceStatus === 'error'}
				<Button size="sm" onclick={connectDevice} disabled={isConnecting}>
					{isConnecting ? 'Connecting...' : 'Connect'}
				</Button>
			{:else if deviceStatus === 'registered'}
				<Button variant="outline" size="sm" onclick={disconnectDevice}>Disconnect</Button>
			{/if}
		</div>
	</div>

	{#if errorMessage}
		<div
			class="rounded-lg border border-vivid-rose/20 bg-vivid-rose/5 px-4 py-3 flex items-center justify-between"
		>
			<p class="text-sm text-vivid-rose">{errorMessage}</p>
			<Button
				variant="outline"
				size="sm"
				onclick={() => {
					errorMessage = '';
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
				{#if callState !== 'idle'}
					{#if callState === 'incoming'}
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
								{formatPhone(callerInfo)}
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
					{:else if callState === 'connecting' && activeCall}
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
								{formatPhone(callerInfo)}
							</p>
						</div>
					{:else}
						<!-- Outbound connecting / active call -->
						<div class="rounded-lg bg-gold-glow border border-border p-4 text-center space-y-2">
							{#if callState === 'connecting'}
								<div class="flex items-center justify-center gap-1.5 text-vivid-amber">
									<PhoneOutgoing class="h-4 w-4 animate-pulse" />
									<span class="text-xs font-semibold uppercase tracking-widest">Connecting</span>
								</div>
							{:else if callState === 'connected'}
								<div class="flex items-center justify-center gap-1.5 text-vivid-emerald">
									<Phone class="h-4 w-4" />
									<span class="text-xs font-semibold uppercase tracking-widest">Connected</span>
								</div>
							{/if}
							<p
								class="text-xl font-light text-text-primary"
								style="font-family: var(--font-display);"
							>
								{formatPhone(callerInfo)}
							</p>
							{#if callState === 'connected'}
								<div class="flex items-center justify-center gap-1 text-text-tertiary">
									<Clock class="h-3 w-3" />
									<span class="text-sm font-mono tabular-nums"
										>{formatCallDuration(callDuration)}</span
									>
								</div>
							{/if}
							<div class="flex items-center justify-center gap-3 pt-1">
								<Button
									variant={isMuted ? 'destructive' : 'outline'}
									size="icon"
									class="rounded-full h-10 w-10"
									onclick={toggleMute}
									title={isMuted ? 'Unmute' : 'Mute'}
								>
									{#if isMuted}
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
								if (e.key === 'Enter') makeCall();
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
					{#if callState === 'idle'}
						<button
							class="w-full h-10 rounded-full bg-gold hover:bg-gold/85 text-primary-foreground text-sm font-medium tracking-wide flex items-center justify-center gap-2 transition-all shadow-md shadow-gold/20 disabled:opacity-40 disabled:cursor-not-allowed"
							onclick={makeCall}
							disabled={!dialNumber || deviceStatus !== 'registered'}
						>
							<Phone class="h-4 w-4" />
							Call
						</button>
					{:else if callState !== 'incoming'}
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
