<script>
	import { onMount } from 'svelte';
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import {
		Phone, PhoneOff, PhoneIncoming, PhoneOutgoing,
		Mic, MicOff, Pause, Play, Volume2, VolumeX,
		Headset, Wifi, WifiOff, Clock
	} from '@lucide/svelte';
	import { api } from '$lib/api/client.js';
	import { formatPhone } from '$lib/utils/formatters.js';

	/** @type {any} Twilio Device instance */
	let device = $state(null);
	/** @type {any} Active Twilio Call */
	let activeCall = $state(null);
	/** @type {'offline'|'registering'|'registered'|'error'} */
	let deviceStatus = $state('offline');
	/** @type {string} */
	let statusMessage = $state('Initializing...');
	/** @type {string} Error message */
	let errorMessage = $state('');
	/** @type {string} */
	let identity = $state('lea');
	/** @type {string} Number to dial */
	let dialNumber = $state('');
	/** @type {boolean} */
	let isMuted = $state(false);
	/** @type {boolean} */
	let isOnHold = $state(false);
	/** @type {'idle'|'incoming'|'connecting'|'connected'|'disconnected'} */
	let callState = $state('idle');
	/** @type {string} */
	let callerInfo = $state('');
	/** @type {number} Call duration in seconds */
	let callDuration = $state(0);
	/** @type {any} Duration timer interval */
	let durationTimer = null;
	/** @type {boolean} SDK loaded */
	let sdkLoaded = $state(false);
	/** @type {Array<{time: string, type: string, info: string}>} */
	let callHistory = $state([]);

	const dialPad = [
		['1', '2', '3'],
		['4', '5', '6'],
		['7', '8', '9'],
		['*', '0', '#']
	];

	onMount(async () => {
		// Load Twilio Voice SDK from CDN
		await loadTwilioSDK();
		if (sdkLoaded) {
			await initDevice();
		}

		return () => {
			// Cleanup
			if (durationTimer) clearInterval(durationTimer);
			if (device) {
				device.destroy();
			}
		};
	});

	async function loadTwilioSDK() {
		if (window.Twilio && window.Twilio.Device) {
			sdkLoaded = true;
			return;
		}

		return new Promise((resolve, reject) => {
			const script = document.createElement('script');
			script.src = 'https://sdk.twilio.com/js/client/releases/1.14.3/twilio.min.js';
			script.onload = () => {
				sdkLoaded = true;
				resolve();
			};
			script.onerror = () => {
				errorMessage = 'Failed to load Twilio Voice SDK';
				reject(new Error('SDK load failed'));
			};
			document.head.appendChild(script);
		});
	}

	async function initDevice() {
		try {
			statusMessage = 'Getting token...';
			const { token } = await api('/api/twilio/token', {
				method: 'POST',
				body: JSON.stringify({ identity })
			});

			statusMessage = 'Connecting to Twilio...';
			deviceStatus = 'registering';

			// Use the older Twilio.Device API (1.x SDK loaded from CDN)
			const Twilio = window.Twilio;
			Twilio.Device.setup(token, {
				closeProtection: true,
				debug: false
			});

			Twilio.Device.ready(() => {
				deviceStatus = 'registered';
				statusMessage = 'Ready to receive calls';
				device = Twilio.Device;
			});

			Twilio.Device.error((error) => {
				console.error('Twilio Device error:', error);
				errorMessage = error.message || 'Device error';
				deviceStatus = 'error';
				statusMessage = 'Error — check console';
			});

			Twilio.Device.incoming((conn) => {
				callState = 'incoming';
				activeCall = conn;
				callerInfo = conn.parameters.From || 'Unknown';
				statusMessage = `Incoming call from ${formatPhone(callerInfo)}`;

				addToHistory('incoming', `From: ${formatPhone(callerInfo)}`);

				conn.on('disconnect', handleDisconnect);
				conn.on('cancel', handleDisconnect);
			});

			Twilio.Device.disconnect(() => {
				handleDisconnect();
			});

			Twilio.Device.offline(() => {
				deviceStatus = 'offline';
				statusMessage = 'Disconnected from Twilio';
			});

		} catch (err) {
			console.error('Failed to init Twilio Device:', err);
			errorMessage = err.message;
			deviceStatus = 'error';
			statusMessage = 'Failed to connect';
		}
	}

	function handleDisconnect() {
		if (durationTimer) {
			clearInterval(durationTimer);
			durationTimer = null;
		}
		addToHistory('ended', `Duration: ${formatCallDuration(callDuration)}`);
		callState = 'idle';
		activeCall = null;
		callerInfo = '';
		callDuration = 0;
		isMuted = false;
		isOnHold = false;
		statusMessage = 'Ready to receive calls';
	}

	function answerCall() {
		if (activeCall) {
			activeCall.accept();
			callState = 'connected';
			statusMessage = `Connected — ${formatPhone(callerInfo)}`;
			startDurationTimer();
		}
	}

	function rejectCall() {
		if (activeCall) {
			activeCall.reject();
			handleDisconnect();
		}
	}

	function makeCall() {
		if (!device || !dialNumber) return;

		// Clean up the number
		let number = dialNumber.replace(/[^\d+*#]/g, '');
		if (number.length === 10 && !number.startsWith('+')) {
			number = '+1' + number;
		}

		try {
			const conn = device.connect({ To: number });
			activeCall = conn;
			callState = 'connecting';
			callerInfo = number;
			statusMessage = `Calling ${formatPhone(number)}...`;
			addToHistory('outgoing', `To: ${formatPhone(number)}`);

			conn.on('accept', () => {
				callState = 'connected';
				statusMessage = `Connected — ${formatPhone(number)}`;
				startDurationTimer();
			});

			conn.on('disconnect', handleDisconnect);
			conn.on('cancel', handleDisconnect);
			conn.on('error', (err) => {
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
		} else if (device) {
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
			minute: '2-digit'
		});
		callHistory = [{ time, type, info }, ...callHistory.slice(0, 19)];
	}

	function statusColor(status) {
		switch (status) {
			case 'registered': return 'bg-emerald-500';
			case 'registering': return 'bg-yellow-500 animate-pulse';
			case 'error': return 'bg-red-500';
			default: return 'bg-zinc-500';
		}
	}

	async function reconnect() {
		errorMessage = '';
		await initDevice();
	}
</script>

<svelte:head>
	<title>Softphone — Le Med Spa</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Softphone</h1>
			<p class="text-muted-foreground">Answer and make calls from your browser.</p>
		</div>
		<div class="flex items-center gap-2">
			<span class="flex items-center gap-2 text-sm">
				<span class="relative flex h-2.5 w-2.5">
					<span class="absolute inline-flex h-full w-full rounded-full {statusColor(deviceStatus)} opacity-75 {deviceStatus === 'registering' ? 'animate-ping' : ''}"></span>
					<span class="relative inline-flex h-2.5 w-2.5 rounded-full {statusColor(deviceStatus)}"></span>
				</span>
				<span class="text-muted-foreground">{statusMessage}</span>
			</span>
		</div>
	</div>

	{#if errorMessage}
		<Card.Root class="border-destructive/50 bg-destructive/5">
			<Card.Content class="py-4 flex items-center justify-between">
				<p class="text-sm text-destructive">{errorMessage}</p>
				<Button variant="outline" size="sm" onclick={reconnect}>Retry</Button>
			</Card.Content>
		</Card.Root>
	{/if}

	<div class="grid gap-6 lg:grid-cols-2">
		<!-- Softphone Panel -->
		<Card.Root class="overflow-hidden">
			<Card.Header class="pb-3">
				<div class="flex items-center gap-2">
					<Headset class="h-5 w-5 text-primary" />
					<Card.Title>Phone</Card.Title>
				</div>
			</Card.Header>
			<Card.Content class="space-y-4">
				<!-- Active Call Display -->
				{#if callState !== 'idle'}
					<div class="rounded-lg bg-muted/50 p-4 text-center space-y-2">
						{#if callState === 'incoming'}
							<div class="flex items-center justify-center gap-2 text-blue-400">
								<PhoneIncoming class="h-5 w-5 animate-pulse" />
								<span class="text-sm font-medium">Incoming Call</span>
							</div>
						{:else if callState === 'connecting'}
							<div class="flex items-center justify-center gap-2 text-yellow-400">
								<PhoneOutgoing class="h-5 w-5 animate-pulse" />
								<span class="text-sm font-medium">Connecting...</span>
							</div>
						{:else if callState === 'connected'}
							<div class="flex items-center justify-center gap-2 text-emerald-400">
								<Phone class="h-5 w-5" />
								<span class="text-sm font-medium">Connected</span>
							</div>
						{/if}

						<p class="text-lg font-semibold">{formatPhone(callerInfo)}</p>

						{#if callState === 'connected'}
							<div class="flex items-center justify-center gap-1 text-muted-foreground">
								<Clock class="h-3.5 w-3.5" />
								<span class="text-sm font-mono">{formatCallDuration(callDuration)}</span>
							</div>
						{/if}

						<!-- Call Controls -->
						<div class="flex items-center justify-center gap-3 pt-2">
							{#if callState === 'incoming'}
								<Button
									variant="default"
									size="lg"
									class="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full h-14 w-14"
									onclick={answerCall}
								>
									<Phone class="h-6 w-6" />
								</Button>
								<Button
									variant="destructive"
									size="lg"
									class="rounded-full h-14 w-14"
									onclick={rejectCall}
								>
									<PhoneOff class="h-6 w-6" />
								</Button>
							{:else}
								<Button
									variant={isMuted ? 'destructive' : 'outline'}
									size="icon"
									class="rounded-full h-12 w-12"
									onclick={toggleMute}
									title={isMuted ? 'Unmute' : 'Mute'}
								>
									{#if isMuted}
										<MicOff class="h-5 w-5" />
									{:else}
										<Mic class="h-5 w-5" />
									{/if}
								</Button>
								<Button
									variant="destructive"
									size="lg"
									class="rounded-full h-14 w-14"
									onclick={hangUp}
								>
									<PhoneOff class="h-6 w-6" />
								</Button>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Dial Pad -->
				<div class="space-y-3">
					<!-- Number Input -->
					<div class="flex gap-2">
						<Input
							placeholder="Enter phone number..."
							class="text-center text-lg font-mono tracking-wider"
							bind:value={dialNumber}
							onkeydown={(e) => { if (e.key === 'Enter') makeCall(); }}
						/>
					</div>

					<!-- Dial Pad Grid -->
					<div class="grid grid-cols-3 gap-2">
						{#each dialPad as row}
							{#each row as digit}
								<button
									class="h-14 rounded-lg bg-muted/50 hover:bg-muted text-lg font-medium transition-colors active:scale-95"
									onclick={() => sendDigit(digit)}
								>
									{digit}
								</button>
							{/each}
						{/each}
					</div>

					<!-- Dial / Hangup Button -->
					{#if callState === 'idle'}
						<Button
							class="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-12 text-base"
							onclick={makeCall}
							disabled={!dialNumber || deviceStatus !== 'registered'}
						>
							<Phone class="h-5 w-5 mr-2" />
							Call
						</Button>
					{:else}
						<Button
							variant="destructive"
							class="w-full h-12 text-base"
							onclick={hangUp}
						>
							<PhoneOff class="h-5 w-5 mr-2" />
							End Call
						</Button>
					{/if}
				</div>
			</Card.Content>
		</Card.Root>

		<!-- Call History Panel -->
		<Card.Root>
			<Card.Header class="pb-3">
				<div class="flex items-center gap-2">
					<Clock class="h-5 w-5 text-primary" />
					<Card.Title>Session Activity</Card.Title>
				</div>
				<Card.Description>Calls during this browser session</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if callHistory.length === 0}
					<div class="flex h-48 items-center justify-center text-muted-foreground">
						<div class="text-center">
							<Headset class="mx-auto mb-3 h-10 w-10 opacity-50" />
							<p class="text-sm">No calls yet this session.</p>
							<p class="text-xs mt-1">Incoming calls will ring here automatically.</p>
						</div>
					</div>
				{:else}
					<div class="space-y-2">
						{#each callHistory as entry}
							<div class="flex items-center gap-3 rounded-md border border-border/50 p-3">
								{#if entry.type === 'incoming'}
									<PhoneIncoming class="h-4 w-4 shrink-0 text-blue-400" />
								{:else if entry.type === 'outgoing'}
									<PhoneOutgoing class="h-4 w-4 shrink-0 text-emerald-400" />
								{:else}
									<PhoneOff class="h-4 w-4 shrink-0 text-zinc-400" />
								{/if}
								<div class="min-w-0 flex-1">
									<p class="text-sm">{entry.info}</p>
								</div>
								<span class="text-xs text-muted-foreground shrink-0">{entry.time}</span>
							</div>
						{/each}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
</div>
