import { writable, get } from 'svelte/store';
import { api } from '$lib/api/client.js';

// ---------------------------------------------------------------------------
// Exported stores
// ---------------------------------------------------------------------------

/** @type {import('svelte/store').Writable<any>} Twilio Device instance (or null) */
export const device = writable(null);

/** @type {import('svelte/store').Writable<any>} Active Twilio Call (or null) */
export const activeCall = writable(null);

/** @type {import('svelte/store').Writable<'offline'|'registering'|'registered'|'error'>} */
export const deviceStatus = writable('offline');

/** @type {import('svelte/store').Writable<string>} Human-readable status string */
export const statusMessage = writable('Offline');

/** @type {import('svelte/store').Writable<string>} Error message (empty = no error) */
export const errorMessage = writable('');

/** @type {import('svelte/store').Writable<'idle'|'incoming'|'connecting'|'connected'>} */
export const callState = writable('idle');

/** @type {import('svelte/store').Writable<string>} Phone number or name of caller/callee */
export const callerInfo = writable('');

/** @type {import('svelte/store').Writable<boolean>} */
export const isMuted = writable(false);

/** @type {import('svelte/store').Writable<number>} Call duration in seconds */
export const callDuration = writable(0);

// ---------------------------------------------------------------------------
// Module-level (non-reactive) internals
// ---------------------------------------------------------------------------

/** @type {any} Twilio Device class — dynamically imported to avoid SSR issues */
let TwilioDevice = null;

/** @type {any} Twilio Call class — needed for Codec enum */
let TwilioCall = null;

/** @type {boolean} Guards against concurrent connectDevice() calls */
let isConnecting = false;

/** @type {ReturnType<typeof setInterval>|null} Token auto-refresh timer */
let tokenRefreshTimer = null;

/** @type {ReturnType<typeof setInterval>|null} Call duration timer */
let durationTimer = null;

/** @type {AudioContext|null} */
let audioCtx = null;

/** @type {ReturnType<typeof setInterval>|null} Ringtone interval */
let ringInterval = null;

// ---------------------------------------------------------------------------
// Simple inline phone formatter for browser notifications
// (avoids importing formatters.js which may run SSR-side)
// ---------------------------------------------------------------------------

/**
 * Format a US phone number as (XXX) XXX-XXXX for display.
 * Falls back to the raw string if it doesn't match a known pattern.
 * @param {string} phone
 * @returns {string}
 */
function formatPhoneInline(phone) {
	if (!phone) return '';
	const digits = phone.replace(/\D/g, '');
	const num = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
	if (num.length !== 10) return phone;
	return `(${num.slice(0, 3)}) ${num.slice(3, 6)}-${num.slice(6)}`;
}

// ---------------------------------------------------------------------------
// Ringtone (Web Audio API)
// ---------------------------------------------------------------------------

/** Play a single 0.8s ring burst using two oscillators (440Hz + 480Hz). */
function playRingBurst() {
	if (!audioCtx) return;

	const now = audioCtx.currentTime;

	const osc1 = audioCtx.createOscillator();
	const gain1 = audioCtx.createGain();
	osc1.type = 'sine';
	osc1.frequency.setValueAtTime(440, now);
	gain1.gain.setValueAtTime(0.15, now);
	gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
	osc1.connect(gain1);
	gain1.connect(audioCtx.destination);
	osc1.start();
	osc1.stop(now + 0.8);

	const osc2 = audioCtx.createOscillator();
	const gain2 = audioCtx.createGain();
	osc2.type = 'sine';
	osc2.frequency.setValueAtTime(480, now);
	gain2.gain.setValueAtTime(0.12, now);
	gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
	osc2.connect(gain2);
	gain2.connect(audioCtx.destination);
	osc2.start();
	osc2.stop(now + 0.8);
}

/** Start the ringtone: play immediately, then repeat every 3 seconds. */
function startRingtone() {
	try {
		audioCtx = new (window.AudioContext || /** @type {any} */ (window).webkitAudioContext)();
		playRingBurst();
		ringInterval = setInterval(playRingBurst, 3000);
	} catch (e) {
		console.warn('Could not play ringtone:', e);
	}
}

/** Stop the ringtone and close the AudioContext. */
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

// ---------------------------------------------------------------------------
// Browser notifications
// ---------------------------------------------------------------------------

/** Request notification permission (called once during connectDevice). */
function requestNotificationPermission() {
	if (
		typeof window !== 'undefined' &&
		'Notification' in window &&
		Notification.permission === 'default'
	) {
		Notification.requestPermission();
	}
}

/**
 * Show a browser notification for an incoming call.
 * @param {string} caller - Raw caller number/ID from Twilio
 */
function showIncomingCallNotification(caller) {
	if (
		typeof window === 'undefined' ||
		!('Notification' in window) ||
		Notification.permission !== 'granted'
	) {
		return;
	}

	const n = new Notification('Incoming Call — Le Med Spa', {
		body: `Call from ${formatPhoneInline(caller)}`,
		icon: '/favicon.png',
		tag: 'incoming-call',
		requireInteraction: true
	});

	n.onclick = () => {
		window.focus();
		n.close();
	};

	// Auto-close after 20 seconds if the user doesn't interact
	setTimeout(() => n.close(), 20000);
}

// ---------------------------------------------------------------------------
// Duration timer
// ---------------------------------------------------------------------------

function startDurationTimer() {
	callDuration.set(0);
	durationTimer = setInterval(() => {
		callDuration.update((s) => s + 1);
	}, 1000);
}

function stopDurationTimer() {
	if (durationTimer) {
		clearInterval(durationTimer);
		durationTimer = null;
	}
}

// ---------------------------------------------------------------------------
// Token auto-refresh
// ---------------------------------------------------------------------------

/**
 * Schedule a token refresh 50 minutes from now (tokens expire at 60 min).
 * @param {string} identity
 */
function scheduleTokenRefresh(identity) {
	if (tokenRefreshTimer) {
		clearTimeout(tokenRefreshTimer);
	}

	tokenRefreshTimer = setTimeout(
		async () => {
			const currentDevice = get(device);
			if (!currentDevice) return;

			try {
				const { token } = await api('/api/twilio/token', {
					method: 'POST',
					body: JSON.stringify({ identity })
				});
				currentDevice.updateToken(token);
				// Schedule the next refresh
				scheduleTokenRefresh(identity);
			} catch (err) {
				console.error('Token refresh failed:', err);
				errorMessage.set('Token refresh failed — calls may drop. Please reconnect.');
			}
		},
		50 * 60 * 1000
	);
}

function clearTokenRefresh() {
	if (tokenRefreshTimer) {
		clearTimeout(tokenRefreshTimer);
		tokenRefreshTimer = null;
	}
}

// ---------------------------------------------------------------------------
// Internal disconnect handler
// ---------------------------------------------------------------------------

/** Reset all call state after a call ends. */
function handleDisconnect() {
	stopDurationTimer();
	stopRingtone();

	callState.set('idle');
	activeCall.set(null);
	callerInfo.set('');
	callDuration.set(0);
	isMuted.set(false);

	const currentDevice = get(device);
	statusMessage.set(currentDevice ? 'Ready — listening for calls' : 'Disconnected');
}

// ---------------------------------------------------------------------------
// Exported action functions
// ---------------------------------------------------------------------------

/**
 * Load the Twilio Voice SDK, fetch a token, request mic permission, create the
 * Device, and register it for incoming calls. No-ops if already connected.
 *
 * @param {string} [identity='lea'] - Twilio identity to register as
 */
export async function connectDevice(identity = 'lea') {
	// Guard: don't connect if we're already in progress or registered
	if (isConnecting || get(deviceStatus) === 'registered') return;

	isConnecting = true;
	errorMessage.set('');

	try {
		// Step 1: load the SDK dynamically (browser-only — can't SSR)
		if (!TwilioDevice) {
			statusMessage.set('Loading Twilio SDK...');
			const mod = await import('@twilio/voice-sdk');
			TwilioDevice = mod.Device;
			TwilioCall = mod.Call;
		}

		// Step 2: fetch a capability token from the API
		statusMessage.set('Getting token...');
		const { token } = await api('/api/twilio/token', {
			method: 'POST',
			body: JSON.stringify({ identity })
		});

		// Step 3: request notification permission (best-effort, fire-and-forget)
		requestNotificationPermission();

		// Step 4: request microphone access early so the user grants it once,
		//         not mid-call when the browser prompt would be disruptive.
		try {
			statusMessage.set('Requesting microphone access...');
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			// We only needed the permission — release the stream immediately.
			stream.getTracks().forEach((t) => t.stop());
		} catch (micErr) {
			if (micErr.name === 'NotAllowedError' || micErr.name === 'PermissionDeniedError') {
				throw new Error(
					'Microphone permission denied. Please allow microphone access in your browser settings.',
					{ cause: micErr }
				);
			}
			// Other mic errors are non-fatal (e.g. device busy) — log and continue
			console.warn('Mic permission check:', micErr.message);
		}

		// Step 5: create and configure the Twilio Device
		statusMessage.set('Connecting to Twilio...');
		deviceStatus.set('registering');

		const dev = new TwilioDevice(token, {
			logLevel: 1,
			codecPreferences: [TwilioCall.Codec.Opus, TwilioCall.Codec.PCMU],
			allowIncomingWhileBusy: false,
			closeProtection: true
		});

		// --- Device event handlers ---

		dev.on('registered', () => {
			deviceStatus.set('registered');
			statusMessage.set('Ready — listening for calls');
			isConnecting = false;
			scheduleTokenRefresh(identity);
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
			const caller = call.parameters.From || 'Unknown';

			callState.set('incoming');
			activeCall.set(call);
			callerInfo.set(caller);
			statusMessage.set(`Incoming call from ${formatPhoneInline(caller)}`);

			// Audible ringtone + browser notification
			startRingtone();
			showIncomingCallNotification(caller);

			call.on('accept', () => {
				stopRingtone();
				callState.set('connected');
				statusMessage.set(`Connected — ${formatPhoneInline(caller)}`);
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

			call.on('reject', () => {
				stopRingtone();
				handleDisconnect();
			});

			call.on('error', (err) => {
				console.error('Incoming call error:', err);
				errorMessage.set(`Call error: ${err.message || 'unknown'}`);
				stopRingtone();
				handleDisconnect();
			});
		});

		// Step 6: register with Twilio's signaling server
		dev.register();

		// Publish the device instance to the store
		device.set(dev);
	} catch (err) {
		console.error('Failed to connect device:', err);
		errorMessage.set(err.message || 'Failed to connect');
		deviceStatus.set('error');
		statusMessage.set('Failed to connect');
		isConnecting = false;
	}
}

/**
 * Unregister and destroy the Twilio Device, clearing all timers.
 */
export function disconnectDevice() {
	const dev = get(device);
	if (dev) {
		dev.unregister();
		dev.destroy();
	}

	clearTokenRefresh();
	stopDurationTimer();
	stopRingtone();

	device.set(null);
	deviceStatus.set('offline');
	statusMessage.set('Disconnected');
	isConnecting = false;
}

/**
 * Accept an incoming call.
 * Requests mic access again right before accepting to surface any permission
 * changes since the device was first connected.
 */
export async function answerCall() {
	const call = get(activeCall);
	if (!call) return;

	callState.set('connecting');
	statusMessage.set('Answering...');

	try {
		await navigator.mediaDevices.getUserMedia({ audio: true });

		call.accept({
			rtcConstraints: {
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				}
			}
		});
		// callState → 'connected' is set by the 'accept' event handler on the call
	} catch (err) {
		console.error('Failed to answer call:', err);
		if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
			errorMessage.set(
				'Microphone permission denied. Please allow microphone access and try again.'
			);
		} else {
			errorMessage.set(`Failed to answer: ${err.message}`);
		}
		// Revert to incoming state — don't hang up so they can retry
		callState.set('incoming');
		statusMessage.set(`Incoming call from ${formatPhoneInline(get(callerInfo))}`);
	}
}

/**
 * Reject an incoming call.
 */
export function rejectCall() {
	const call = get(activeCall);
	if (!call) return;
	stopRingtone();
	call.reject();
	handleDisconnect();
}

/**
 * Place an outbound call.
 * The number is normalized to E.164 before dialing.
 *
 * @param {string} number - Number to dial (10-digit US, 11-digit with leading 1, or E.164)
 */
export async function makeOutboundCall(number) {
	const dev = get(device);
	if (!dev || !number) return;

	// Normalize to E.164
	let normalized = number.replace(/[^\d+*#]/g, '');
	if (normalized.length === 10 && !normalized.startsWith('+')) {
		normalized = '+1' + normalized;
	} else if (
		normalized.length === 11 &&
		normalized.startsWith('1') &&
		!normalized.startsWith('+')
	) {
		normalized = '+' + normalized;
	}

	try {
		const call = await dev.connect({ params: { To: normalized } });

		activeCall.set(call);
		callState.set('connecting');
		callerInfo.set(normalized);
		statusMessage.set(`Calling ${formatPhoneInline(normalized)}...`);

		call.on('accept', () => {
			callState.set('connected');
			statusMessage.set(`Connected — ${formatPhoneInline(normalized)}`);
			startDurationTimer();
		});

		call.on('disconnect', handleDisconnect);
		call.on('cancel', handleDisconnect);
		call.on('error', (err) => {
			errorMessage.set(err.message || 'Call error');
			handleDisconnect();
		});
	} catch (err) {
		errorMessage.set(err.message || 'Failed to place call');
	}
}

/**
 * Hang up the active call and disconnect all device calls.
 */
export function hangUp() {
	const call = get(activeCall);
	if (call) call.disconnect();

	const dev = get(device);
	if (dev) dev.disconnectAll();
}

/**
 * Toggle mute on the active call.
 */
export function toggleMute() {
	const call = get(activeCall);
	if (!call) return;

	isMuted.update((muted) => {
		const next = !muted;
		call.mute(next);
		return next;
	});
}

/**
 * Send a DTMF digit during a connected call.
 * @param {string} digit - Single DTMF character (0-9, *, #)
 */
export function sendDtmf(digit) {
	const call = get(activeCall);
	if (call && get(callState) === 'connected') {
		call.sendDigits(digit);
	}
}
