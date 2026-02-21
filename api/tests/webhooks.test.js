/**
 * Webhook simulation tests (Node.js built-in test runner)
 *
 * Tests Twilio webhook endpoints against the staging API.
 * Sends sample payloads and verifies responses.
 *
 * Endpoints split into two categories:
 *   1. Studio-called (no Twilio signature required): /incoming, /event
 *   2. Twilio-direct (signature required): /status, /recording, /transcription, sms/*
 *
 * For signature-protected endpoints, we verify they enforce 403 when
 * no signature is present — proving the security middleware works.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
	voiceIncoming,
	voiceEvent,
	voiceEventVoicemail,
	voiceStatus,
	voiceRecording,
	voiceTranscription,
	smsIncoming,
	smsStatus
} from './fixtures/twilio-payloads.js';

const API_URL = process.env.API_URL || 'https://staging-api.lemedspa.app';

/**
 * POST a URL-encoded body (like Twilio sends) and return the response.
 */
async function postUrlEncoded(path, body) {
	const params = new URLSearchParams(body);
	return fetch(`${API_URL}${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: params.toString()
	});
}

// ── Voice webhooks (Studio-called, no signature) ────────────

describe('Voice Webhooks (no signature required)', () => {
	it('GET /api/webhooks/voice/hours-check returns status', async () => {
		const res = await fetch(`${API_URL}/api/webhooks/voice/hours-check`);
		assert.strictEqual(res.status, 200);
		const data = await res.json();
		assert.ok(['open', 'closed'].includes(data.status));
		assert.strictEqual(data.timezone, 'America/Los_Angeles');
	});

	it('POST /api/webhooks/voice/incoming returns 200', async () => {
		const res = await postUrlEncoded('/api/webhooks/voice/incoming', voiceIncoming);
		assert.strictEqual(res.status, 200);
	});

	it('POST /api/webhooks/voice/incoming handles empty body', async () => {
		const res = await postUrlEncoded('/api/webhooks/voice/incoming', {});
		assert.strictEqual(res.status, 200);
	});

	it('POST /api/webhooks/voice/event logs menu selection', async () => {
		const res = await postUrlEncoded('/api/webhooks/voice/event', voiceEvent);
		assert.strictEqual(res.status, 200);
	});

	it('POST /api/webhooks/voice/event logs voicemail start', async () => {
		const res = await postUrlEncoded('/api/webhooks/voice/event', voiceEventVoicemail);
		assert.strictEqual(res.status, 200);
	});

	it('POST /api/webhooks/voice/event handles empty body', async () => {
		const res = await postUrlEncoded('/api/webhooks/voice/event', {});
		assert.strictEqual(res.status, 200);
	});
});

// ── Signature-protected webhooks ────────────────────────────
// These endpoints require a valid X-Twilio-Signature.
// Without it, they should return 403 — proving security works.

describe('Voice Webhooks (signature required — expect 403)', () => {
	it('POST /api/webhooks/voice/status rejects unsigned request', async () => {
		const res = await postUrlEncoded('/api/webhooks/voice/status', voiceStatus);
		assert.strictEqual(res.status, 403);
	});

	it('POST /api/webhooks/voice/recording rejects unsigned request', async () => {
		const res = await postUrlEncoded('/api/webhooks/voice/recording', voiceRecording);
		assert.strictEqual(res.status, 403);
	});

	it('POST /api/webhooks/voice/transcription rejects unsigned request', async () => {
		const res = await postUrlEncoded('/api/webhooks/voice/transcription', voiceTranscription);
		assert.strictEqual(res.status, 403);
	});
});

describe('SMS Webhooks (signature required — expect 403)', () => {
	it('POST /api/webhooks/sms/incoming rejects unsigned request', async () => {
		const res = await postUrlEncoded('/api/webhooks/sms/incoming', smsIncoming);
		assert.strictEqual(res.status, 403);
	});

	it('POST /api/webhooks/sms/status rejects unsigned request', async () => {
		const res = await postUrlEncoded('/api/webhooks/sms/status', smsStatus);
		assert.strictEqual(res.status, 403);
	});
});
