# Global Softphone — Always-On Twilio Voice SDK

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep the Twilio Voice SDK connected across all authenticated pages so incoming calls ring everywhere, not just on `/softphone`.

**Architecture:** Extract all Twilio Device state from the softphone page into a global Svelte store (`$lib/stores/softphone.js`). The `(auth)/+layout.svelte` initializes the store on login and renders an `IncomingCallOverlay` component. The `/softphone` page becomes a thin dial-pad UI that reads/writes the shared store. Token auto-refresh at 50 min prevents silent disconnects.

**Tech Stack:** Svelte 5 runes, `@twilio/voice-sdk` 2.x (already installed), existing `/api/twilio/token` endpoint.

---

### Task 1: Create the global softphone store

**Files:**
- Create: `src/lib/stores/softphone.js`

**Step 1: Create the store file**

```javascript
import { writable, get } from 'svelte/store';
import { api } from '$lib/api/client.js';

// ─── State stores ────────────────────────────────────────
/** @type {import('svelte/store').Writable<any>} Twilio Device instance */
export const device = writable(null);

/** @type {import('svelte/store').Writable<any>} Active call */
export const activeCall = writable(null);

/** @type {import('svelte/store').Writable<'offline'|'registering'|'registered'|'error'>} */
export const deviceStatus = writable('offline');

/** @type {import('svelte/store').Writable<string>} */
export const statusMessage = writable('Disconnected');

/** @type {import('svelte/store').Writable<string>} */
export const errorMessage = writable('');

/** @type {import('svelte/store').Writable<'idle'|'incoming'|'connecting'|'connected'>} */
export const callState = writable('idle');

/** @type {import('svelte/store').Writable<string>} Caller/callee display info */
export const callerInfo = writable('');

/** @type {import('svelte/store').Writable<boolean>} */
export const isMuted = writable(false);

/** @type {import('svelte/store').Writable<number>} Call duration in seconds */
export const callDuration = writable(0);

// ─── Internal state (not exported as stores) ─────────────
/** @type {any} */
let TwilioDevice = null;
/** @type {any} */
let TwilioCall = null;
/** @type {any} Duration timer interval */
let durationTimer = null;
/** @type {any} Token refresh timer */
let tokenRefreshTimer = null;
/** @type {boolean} */
let isConnecting = false;
/** @type {string} */
let currentIdentity = 'lea';

// ─── Ringtone (Web Audio API) ────────────────────────────
/** @type {AudioContext|null} */
let audioCtx = null;
/** @type {any} */
let ringInterval = null;

function playRingBurst() {
	if (!audioCtx) return;
	const t = audioCtx.currentTime;

	const osc = audioCtx.createOscillator();
	const gain = audioCtx.createGain();
	osc.type = 'sine';
	osc.frequency.setValueAtTime(440, t);
	gain.gain.setValueAtTime(0.15, t);
	gain.gain.exponentialRampToValueAtTime(0.01, t + 0.8);
	osc.connect(gain);
	gain.connect(audioCtx.destination);
	osc.start();
	osc.stop(t + 0.8);

	const osc2 = audioCtx.createOscillator();
	const gain2 = audioCtx.createGain();
	osc2.type = 'sine';
	osc2.frequency.setValueAtTime(480, t);
	gain2.gain.setValueAtTime(0.12, t);
	gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.8);
	osc2.connect(gain2);
	gain2.connect(audioCtx.destination);
	osc2.start();
	osc2.stop(t + 0.8);
}

function startRingtone() {
	try {
		audioCtx = new (window.AudioContext || /** @type {any} */ (window).webkitAudioContext)();
		playRingBurst();
		ringInterval = setInterval(playRingBurst, 3000);
	} catch (e) {
		console.warn('Could not play ringtone:', e);
	}
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

// ─── Browser notifications ───────────────────────────────
function requestNotificationPermission() {
	if ('Notification' in window && Notification.permission === 'default') {
		Notification.requestPermission();
	}
}

/** @param {string} caller */
function showIncomingCallNotification(caller) {
	if ('Notification' in window && Notification.permission === 'granted') {
		const { formatPhone } = /** @type {any} */ (window).__softphoneFormatters || {};
		const display = formatPhone ? formatPhone(caller) : caller;
		const n = new Notification('Incoming Call — Le Med Spa', {
			body: `Call from ${display}`,
			icon: '/favicon.png',
			tag: 'incoming-call',
			requireInteraction: true,
		});
		n.onclick = () => {
			window.focus();
			n.close();
		};
		setTimeout(() => n.close(), 20000);
	}
}

// ─── Call lifecycle helpers ──────────────────────────────
function startDurationTimer() {
	callDuration.set(0);
	durationTimer = setInterval(() => {
		callDuration.update((d) => d + 1);
	}, 1000);
}

function handleDisconnect() {
	if (durationTimer) {
		clearInterval(durationTimer);
		durationTimer = null;
	}
	callState.set('idle');
	activeCall.set(null);
	callerInfo.set('');
	callDuration.set(0);
	isMuted.set(false);
	const dev = get(device);
	statusMessage.set(dev ? 'Ready — listening for calls' : 'Disconnected');
}

// ─── Token refresh ───────────────────────────────────────
function scheduleTokenRefresh() {
	if (tokenRefreshTimer) clearTimeout(tokenRefreshTimer);
	// Refresh at 50 minutes (token TTL is 60 min)
	tokenRefreshTimer = setTimeout(async () => {
		try {
			const dev = get(device);
			if (!dev) return;
			const { token } = await api('/api/twilio/token', {
				method: 'POST',
				body: JSON.stringify({ identity: currentIdentity }),
			});
			dev.updateToken(token);
			scheduleTokenRefresh();
		} catch (e) {
			console.error('Token refresh failed:', e.message);
			errorMessage.set('Token refresh failed — reconnecting...');
			// Try full reconnect
			setTimeout(() => connectDevice(), 5000);
		}
	}, 50 * 60 * 1000);
}

// ─── Public API ──────────────────────────────────────────

/**
 * Initialize and register the Twilio Device.
 * Safe to call multiple times — no-ops if already connected.
 * @param {string} [identity='lea']
 */
export async function connectDevice(identity = 'lea') {
	if (isConnecting || get(deviceStatus) === 'registered') return;

	isConnecting = true;
	currentIdentity = identity;
	errorMessage.set('');

	try {
		if (!TwilioDevice) {
			statusMessage.set('Loading Twilio SDK...');
			const mod = await import('@twilio/voice-sdk');
			TwilioDevice = mod.Device;
			TwilioCall = mod.Call;
		}

		statusMessage.set('Getting token...');
		const { token } = await api('/api/twilio/token', {
			method: 'POST',
			body: JSON.stringify({ identity }),
		});

		requestNotificationPermission();

		// Pre-request mic permission
		try {
			statusMessage.set('Requesting microphone access...');
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			stream.getTracks().forEach((t) => t.stop());
		} catch (micErr) {
			if (micErr.name === 'NotAllowedError' || micErr.name === 'PermissionDeniedError') {
				throw new Error('Microphone permission denied. Please allow microphone access in your browser settings.', { cause: micErr });
			}
			console.warn('Mic permission check:', micErr.message);
		}

		statusMessage.set('Connecting to Twilio...');
		deviceStatus.set('registering');

		const dev = new TwilioDevice(token, {
			logLevel: 1,
			codecPreferences: [TwilioCall.Codec.Opus, TwilioCall.Codec.PCMU],
			allowIncomingWhileBusy: false,
			closeProtection: true,
		});

		dev.on('registered', () => {
			deviceStatus.set('registered');
			statusMessage.set('Ready — listening for calls');
			isConnecting = false;
			scheduleTokenRefresh();
		});

		dev.on('error', (error) => {
			console.error('Twilio Device error:', error);
			errorMessage.set(error.message || 'Device error');
			deviceStatus.set('error');
			statusMessage.set('Error — see details above');
			isConnecting = false;
		});

		dev.on('unregistered', () => {
			deviceStatus.set('offline');
			statusMessage.set('Disconnected');
		});

		dev.on('incoming', (call) => {
			callState.set('incoming');
			activeCall.set(call);
			const from = call.parameters.From || 'Unknown';
			callerInfo.set(from);
			statusMessage.set(`Incoming call`);

			startRingtone();
			showIncomingCallNotification(from);

			call.on('accept', () => {
				stopRingtone();
				callState.set('connected');
				statusMessage.set('Connected');
				startDurationTimer();
			});

			call.on('disconnect', () => {
				stopRingtone();
				handleDisconnect();
			});

			call.on('cancel', () => {
				stopRingtone();
				handleDisconnect();
			});

			call.on('error', (err) => {
				stopRingtone();
				console.error('Incoming call error:', err);
				errorMessage.set(`Call error: ${err.message || 'unknown'}`);
				handleDisconnect();
			});

			call.on('reject', () => {
				stopRingtone();
				handleDisconnect();
			});
		});

		dev.register();
		device.set(dev);
	} catch (err) {
		console.error('Failed to connect:', err);
		errorMessage.set(err.message);
		deviceStatus.set('error');
		statusMessage.set('Failed to connect');
		isConnecting = false;
	}
}

/** Disconnect and destroy the device. */
export function disconnectDevice() {
	if (tokenRefreshTimer) {
		clearTimeout(tokenRefreshTimer);
		tokenRefreshTimer = null;
	}
	const dev = get(device);
	if (dev) {
		dev.unregister();
		dev.destroy();
	}
	device.set(null);
	deviceStatus.set('offline');
	statusMessage.set('Disconnected');
}

/** Answer an incoming call. */
export async function answerCall() {
	const call = get(activeCall);
	if (!call) return;

	callState.set('connecting');
	statusMessage.set('Answering...');

	try {
		await navigator.mediaDevices.getUserMedia({ audio: true });
		call.accept({
			rtcConstraints: {
				audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
			},
		});
	} catch (err) {
		console.error('Failed to answer call:', err);
		if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
			errorMessage.set('Microphone permission denied. Please allow microphone access and try again.');
		} else {
			errorMessage.set(`Failed to answer: ${err.message}`);
		}
		callState.set('incoming');
	}
}

/** Reject an incoming call. */
export function rejectCall() {
	const call = get(activeCall);
	if (call) {
		stopRingtone();
		call.reject();
		handleDisconnect();
	}
}

/**
 * Make an outbound call.
 * @param {string} number - Phone number to dial
 */
export async function makeOutboundCall(number) {
	const dev = get(device);
	if (!dev || !number) return;

	// Normalize to E.164
	let cleaned = number.replace(/[^\d+*#]/g, '');
	if (cleaned.length === 10 && !cleaned.startsWith('+')) {
		cleaned = '+1' + cleaned;
	} else if (cleaned.length === 11 && cleaned.startsWith('1') && !cleaned.startsWith('+')) {
		cleaned = '+' + cleaned;
	}

	try {
		const call = await dev.connect({ params: { To: cleaned } });
		activeCall.set(call);
		callState.set('connecting');
		callerInfo.set(cleaned);
		statusMessage.set('Calling...');

		call.on('accept', () => {
			callState.set('connected');
			statusMessage.set('Connected');
			startDurationTimer();
		});

		call.on('disconnect', handleDisconnect);
		call.on('cancel', handleDisconnect);
		call.on('error', (err) => {
			errorMessage.set(err.message);
			handleDisconnect();
		});
	} catch (err) {
		errorMessage.set(err.message);
	}
}

/** Hang up the active call. */
export function hangUp() {
	const call = get(activeCall);
	if (call) call.disconnect();
	const dev = get(device);
	if (dev) dev.disconnectAll();
}

/** Toggle mute on the active call. */
export function toggleMute() {
	const call = get(activeCall);
	if (call) {
		const muted = !get(isMuted);
		isMuted.set(muted);
		call.mute(muted);
	}
}

/**
 * Send a DTMF digit. If in a call, sends as tone. Otherwise no-op (dial pad handles input).
 * @param {string} digit
 */
export function sendDtmf(digit) {
	const call = get(activeCall);
	if (call && get(callState) === 'connected') {
		call.sendDigits(digit);
	}
}
```

**Step 2: Verify no syntax errors**

Run: `node -e "import('file:///C:/Users/LMOperations/lmdev/lm-app/src/lib/stores/softphone.js').catch(e => console.log('Parse check — expected import errors are OK:', e.message))"`

This will fail on Svelte imports (expected) but confirms no syntax errors.

**Step 3: Commit**

```bash
git add src/lib/stores/softphone.js
git commit -m "[softphone] Add global Twilio Voice SDK store

- Device lifecycle, call state, token refresh in one module
- Exported functions: connectDevice, disconnectDevice, answerCall, rejectCall, makeOutboundCall, hangUp, toggleMute, sendDtmf
- Auto-refreshes token at 50 min (TTL=60)"
```

---

### Task 2: Create the IncomingCallOverlay component

**Files:**
- Create: `src/lib/components/IncomingCallOverlay.svelte`

**Step 1: Create the overlay component**

This component renders a floating card at the bottom-right of the screen when an incoming call arrives. It shows on every authenticated page.

```svelte
<script>
	import { Phone, PhoneOff, PhoneIncoming } from '@lucide/svelte';
	import { formatPhone } from '$lib/utils/formatters.js';
	import {
		callState,
		callerInfo,
		callDuration,
		isMuted,
		deviceStatus,
		statusMessage,
		errorMessage,
		answerCall,
		rejectCall,
		hangUp,
		toggleMute,
	} from '$lib/stores/softphone.js';
	import { page } from '$app/state';
	import { Mic, MicOff, Clock } from '@lucide/svelte';

	// Don't show overlay on the softphone page itself — it has its own full UI
	let isOnSoftphonePage = $derived(page.url?.pathname?.startsWith('/softphone'));

	// Show overlay when there's an active call and we're NOT on the softphone page
	let showOverlay = $derived(!isOnSoftphonePage && $callState !== 'idle');

	function formatCallDuration(seconds) {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	}
</script>

{#if showOverlay}
	<div class="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
		<div class="rounded-xl border border-border-subtle bg-card shadow-2xl shadow-black/40 w-72 overflow-hidden">
			{#if $callState === 'incoming'}
				<!-- Incoming call -->
				<div class="p-4 space-y-3 border-t-2 border-vivid-blue">
					<div class="flex items-center gap-2 text-vivid-blue">
						<PhoneIncoming class="h-4 w-4 animate-bounce" />
						<span class="text-xs font-semibold tracking-widest uppercase">Incoming Call</span>
					</div>
					<p class="text-lg font-light text-text-primary" style="font-family: var(--font-display);">
						{formatPhone($callerInfo)}
					</p>
					<div class="flex items-center gap-3">
						<button
							class="flex-1 flex items-center justify-center gap-2 h-10 rounded-lg bg-vivid-emerald hover:bg-vivid-emerald/80 text-white text-sm font-medium transition-all"
							onclick={() => answerCall()}
						>
							<Phone class="h-4 w-4" />
							Answer
						</button>
						<button
							class="flex-1 flex items-center justify-center gap-2 h-10 rounded-lg bg-vivid-rose hover:bg-vivid-rose/80 text-white text-sm font-medium transition-all"
							onclick={() => rejectCall()}
						>
							<PhoneOff class="h-4 w-4" />
							Decline
						</button>
					</div>
				</div>
			{:else}
				<!-- Active call (connecting or connected) -->
				<div class="p-4 space-y-2">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							{#if $callState === 'connecting'}
								<Phone class="h-4 w-4 text-vivid-amber animate-pulse" />
								<span class="text-xs font-semibold text-vivid-amber uppercase tracking-widest">Connecting</span>
							{:else}
								<Phone class="h-4 w-4 text-vivid-emerald" />
								<span class="text-xs font-semibold text-vivid-emerald uppercase tracking-widest">Connected</span>
							{/if}
						</div>
						{#if $callState === 'connected'}
							<div class="flex items-center gap-1 text-text-tertiary">
								<Clock class="h-3 w-3" />
								<span class="text-xs font-mono tabular-nums">{formatCallDuration($callDuration)}</span>
							</div>
						{/if}
					</div>
					<p class="text-lg font-light text-text-primary" style="font-family: var(--font-display);">
						{formatPhone($callerInfo)}
					</p>
					<div class="flex items-center gap-2 pt-1">
						<button
							class="flex items-center justify-center h-9 w-9 rounded-full {$isMuted ? 'bg-vivid-rose text-white' : 'bg-surface-hover text-text-secondary'} transition-all"
							onclick={() => toggleMute()}
							title={$isMuted ? 'Unmute' : 'Mute'}
						>
							{#if $isMuted}
								<MicOff class="h-4 w-4" />
							{:else}
								<Mic class="h-4 w-4" />
							{/if}
						</button>
						<button
							class="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg bg-vivid-rose hover:bg-vivid-rose/80 text-white text-sm font-medium transition-all"
							onclick={() => hangUp()}
						>
							<PhoneOff class="h-4 w-4" />
							End
						</button>
						<a
							href="/softphone"
							class="flex items-center justify-center h-9 px-3 rounded-lg bg-surface-hover hover:bg-border text-text-secondary text-xs font-medium transition-all"
						>
							Open
						</a>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
```

**Step 2: Commit**

```bash
git add src/lib/components/IncomingCallOverlay.svelte
git commit -m "[softphone] Add IncomingCallOverlay component

- Floating bottom-right card for incoming/active calls
- Answer, decline, mute, hang up, open softphone
- Hidden on /softphone page (it has its own full UI)"
```

---

### Task 3: Wire up global initialization in auth layout

**Files:**
- Modify: `src/routes/(auth)/+layout.svelte`

**Step 1: Import store + overlay and initialize on mount**

Add to the `<script>` block:
```javascript
import { connectDevice, disconnectDevice } from '$lib/stores/softphone.js';
import IncomingCallOverlay from '$lib/components/IncomingCallOverlay.svelte';
```

Add to the `onMount` callback, after the auth check:
```javascript
// Initialize global softphone — stays connected across all pages
connectDevice();
```

Add cleanup in the onMount return:
```javascript
return () => {
	unsub();
	disconnectDevice();
};
```

**Step 2: Add overlay to template**

After the `<CommandPalette>` component, add:
```svelte
<IncomingCallOverlay />
```

**Step 3: Commit**

```bash
git add src/routes/(auth)/+layout.svelte
git commit -m "[softphone] Initialize global softphone on auth layout

- connectDevice() on mount, disconnectDevice() on unmount
- IncomingCallOverlay rendered on all authenticated pages"
```

---

### Task 4: Refactor softphone page to use global store

**Files:**
- Modify: `src/routes/(auth)/softphone/+page.svelte`

**Step 1: Replace all local state with store imports**

Remove all local state variables (`device`, `activeCall`, `deviceStatus`, `statusMessage`, `errorMessage`, `callState`, `callerInfo`, `isMuted`, `callDuration`, `isConnecting`, `TwilioDevice`, `TwilioCall`, `audioCtx`, `ringInterval`).

Remove all local functions that are now in the store: `connectDevice`, `disconnectDevice`, `handleDisconnect`, `answerCall`, `rejectCall`, `makeCall`, `hangUp`, `toggleMute`, `startRingtone`, `stopRingtone`, `playRingBurst`, `requestNotificationPermission`, `showIncomingCallNotification`, `startDurationTimer`.

Import from store instead:
```javascript
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
	sendDtmf,
} from '$lib/stores/softphone.js';
```

Keep local-only state:
- `dialNumber` (local input)
- `dialPad` / `digitLabels` (constants)
- `callHistory` (session-only UI list)
- `pendingCall` (URL param auto-dial)
- `formatCallDuration` (local helper)

**Key changes in template:**
- All `deviceStatus` → `$deviceStatus` (store subscription)
- All `callState` → `$callState`
- All `callerInfo` → `$callerInfo`
- All `isMuted` → `$isMuted`
- All `callDuration` → `$callDuration`
- All `statusMessage` → `$statusMessage`
- All `errorMessage` → `$errorMessage`
- `device` checks → `$device`
- `activeCall` checks → `$activeCall`
- `makeCall()` → `makeOutboundCall(dialNumber)`
- `sendDigit(d)` → in-call: `sendDtmf(d)`, otherwise: `dialNumber += d`

**onMount changes:**
- Remove `connectDevice()` call (layout handles it)
- Keep `?call=` URL param handling → call `makeOutboundCall(dialNumber)` once `$deviceStatus === 'registered'`
- Remove device cleanup from return (layout handles it)

**Step 2: Verify the page builds**

Run: `npx vite build`

**Step 3: Commit**

```bash
git add src/routes/(auth)/softphone/+page.svelte
git commit -m "[softphone] Refactor page to use global store

- All Device state now from $lib/stores/softphone.js
- Page is just dial pad + session history
- Device lifecycle managed by auth layout"
```

---

### Task 5: Build check and final commit

**Step 1: Full build**

Run: `npx vite build`
Expected: Clean build, no errors.

**Step 2: Verify all files are committed**

Run: `git status`

**Step 3: Push**

Run: `git push`
