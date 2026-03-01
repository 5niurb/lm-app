import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock phone-lookup before importing the route
vi.mock('../services/phone-lookup.js', () => ({
	lookupContactByPhone: vi.fn().mockResolvedValue({ contactId: null, contactName: null }),
	findConversation: vi.fn().mockResolvedValue(null),
	normalizePhone: vi.fn((p) => p)
}));

// Mock supabaseAdmin
vi.mock('../services/supabase.js', () => ({
	supabaseAdmin: {
		from: () => ({
			select: () => ({
				eq: () => ({
					maybeSingle: () => Promise.resolve({ data: null }),
					single: () => Promise.resolve({ data: { id: 'conv-1' } })
				}),
				or: () => ({
					limit: () => ({
						maybeSingle: () => Promise.resolve({ data: null })
					})
				})
			}),
			insert: () => ({
				select: () => ({
					single: () => Promise.resolve({ data: { id: 'conv-1' } })
				})
			}),
			update: () => ({
				eq: () => Promise.resolve({})
			}),
			upsert: () => Promise.resolve({ error: null })
		})
	}
}));

// Mock twilio client (used by connect-operator-text to send SMS)
vi.mock('twilio', async (importOriginal) => {
	const actual = await importOriginal();
	const mockClient = () => ({
		messages: {
			create: vi.fn().mockResolvedValue({ sid: 'SM_test_123', status: 'sent' })
		}
	});
	// The default export is used both as a constructor (for client) and has properties like .twiml and .jwt
	const twilioDefault = Object.assign(mockClient, {
		twiml: actual.default.twiml,
		jwt: actual.default.jwt
	});
	return { default: twilioDefault };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Find a route handler on the Express router by path and method.
 * Returns the last handler (skips middleware like verifyToken).
 */
function findHandler(router, method, path) {
	const layer = router.stack.find(
		(l) => l.route && l.route.path === path && l.route.methods[method]
	);
	if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
	const handlers = layer.route.stack.filter((s) => s.method === method);
	return handlers[handlers.length - 1].handle;
}

/**
 * Create mock req/res that captures TwiML output.
 */
function mockReqRes(body = {}) {
	let sentXml = '';
	let sentJson = null;
	let statusCode = 200;
	const req = { body, user: { id: 'user-1' } };
	const res = {
		type: vi.fn().mockReturnThis(),
		send: vi.fn((data) => {
			sentXml = data;
		}),
		json: vi.fn((data) => {
			sentJson = data;
		}),
		status: vi.fn(function (code) {
			statusCode = code;
			return this;
		})
	};
	return {
		req,
		res,
		getSentXml: () => sentXml,
		getSentJson: () => sentJson,
		getStatus: () => statusCode
	};
}

// ── Setup ────────────────────────────────────────────────────────────────────

describe('Twilio Call Flow — Full Chain', () => {
	let router;

	beforeEach(async () => {
		process.env.TWILIO_ACCOUNT_SID = 'ACtest';
		process.env.TWILIO_AUTH_TOKEN = 'testtoken';
		process.env.TWILIO_API_KEY_SID = 'SKtest';
		process.env.TWILIO_API_KEY_SECRET = 'secret';
		process.env.TWILIO_TWIML_APP_SID = 'APtest';
		process.env.TWILIO_PHONE_NUMBER = '+12134442242';
		process.env.API_BASE_URL = 'https://api.lemedspa.app';
		process.env.TWILIO_OPERATOR_PHONE = '+18184632211';
		delete process.env.TWILIO_OPERATOR_FALLBACK;

		const mod = await import('../routes/twilio.js');
		router = mod.default;
	}, 30_000);

	// ── connect-operator ──────────────────────────────────────────────────

	describe('POST /connect-operator', () => {
		it('includes <Client>lea</Client> for the browser softphone', async () => {
			const handler = findHandler(router, 'post', '/connect-operator');
			const { req, res, getSentXml } = mockReqRes({
				From: '+13105551234',
				Caller: '+13105551234'
			});

			handler(req, res);
			const xml = getSentXml();

			expect(xml).toContain('<Client>lea</Client>');
		});

		it('includes the operator desk phone with a screening whisper URL', async () => {
			const handler = findHandler(router, 'post', '/connect-operator');
			const { req, res, getSentXml } = mockReqRes({
				From: '+13105551234'
			});

			handler(req, res);
			const xml = getSentXml();

			expect(xml).toContain('+18184632211');
			expect(xml).toContain('screen-call');
		});

		it('uses the caller number as callerId (not the Twilio number)', async () => {
			const handler = findHandler(router, 'post', '/connect-operator');
			const { req, res, getSentXml } = mockReqRes({
				From: '+13105551234'
			});

			handler(req, res);
			const xml = getSentXml();

			expect(xml).toContain('callerId="+13105551234"');
		});

		it('includes fallback number when set and different from operator', async () => {
			process.env.TWILIO_OPERATOR_FALLBACK = '+18185559999';
			const handler = findHandler(router, 'post', '/connect-operator');
			const { req, res, getSentXml } = mockReqRes({
				From: '+13105551234'
			});

			handler(req, res);
			const xml = getSentXml();

			expect(xml).toContain('+18185559999');
			delete process.env.TWILIO_OPERATOR_FALLBACK;
		});

		it('excludes fallback when same as operator phone', async () => {
			process.env.TWILIO_OPERATOR_FALLBACK = '+18184632211'; // same as TWILIO_OPERATOR_PHONE
			const handler = findHandler(router, 'post', '/connect-operator');
			const { req, res, getSentXml } = mockReqRes({
				From: '+13105551234'
			});

			handler(req, res);
			const xml = getSentXml();

			// Should only have one Number tag, not two
			const numberCount = (xml.match(/<Number/g) || []).length;
			expect(numberCount).toBe(1);
			delete process.env.TWILIO_OPERATOR_FALLBACK;
		});

		it('uses absolute URLs for action and screen-call', async () => {
			const handler = findHandler(router, 'post', '/connect-operator');
			const { req, res, getSentXml } = mockReqRes({ From: '+13105551234' });

			handler(req, res);
			const xml = getSentXml();

			expect(xml).toContain('https://api.lemedspa.app/api/twilio/connect-operator-status');
			expect(xml).toContain('https://api.lemedspa.app/api/twilio/screen-call');
		});

		it('sets timeout and response type correctly', async () => {
			const handler = findHandler(router, 'post', '/connect-operator');
			const { req, res, getSentXml } = mockReqRes({ From: '+13105551234' });

			handler(req, res);

			expect(res.type).toHaveBeenCalledWith('text/xml');
			expect(getSentXml()).toContain('timeout="25"');
		});
	});

	// ── screen-call ───────────────────────────────────────────────────────

	describe('POST /screen-call', () => {
		it('prompts with "press 1 to accept" via Gather', () => {
			const handler = findHandler(router, 'post', '/screen-call');
			const { req, res, getSentXml } = mockReqRes({});

			handler(req, res);
			const xml = getSentXml();

			expect(xml).toContain('<Gather');
			expect(xml).toContain('numDigits="1"');
			expect(xml).toContain('Press 1 to accept');
		});

		it('hangs up if no digit is pressed (voicemail fallback)', () => {
			const handler = findHandler(router, 'post', '/screen-call');
			const { req, res, getSentXml } = mockReqRes({});

			handler(req, res);
			const xml = getSentXml();

			expect(xml).toContain('<Hangup');
		});

		it('points Gather action to screen-call-result with absolute URL', () => {
			const handler = findHandler(router, 'post', '/screen-call');
			const { req, res, getSentXml } = mockReqRes({});

			handler(req, res);
			const xml = getSentXml();

			expect(xml).toContain('https://api.lemedspa.app/api/twilio/screen-call-result');
		});

		it('uses Polly.Joanna voice', () => {
			const handler = findHandler(router, 'post', '/screen-call');
			const { req, res, getSentXml } = mockReqRes({});

			handler(req, res);
			expect(getSentXml()).toContain('Polly.Joanna');
		});
	});

	// ── screen-call-result ────────────────────────────────────────────────

	describe('POST /screen-call-result', () => {
		it('returns empty TwiML (bridges call) when digit is 1', () => {
			const handler = findHandler(router, 'post', '/screen-call-result');
			const { req, res, getSentXml } = mockReqRes({ Digits: '1' });

			handler(req, res);
			const xml = getSentXml();

			expect(xml).not.toContain('<Hangup');
			// Should be a minimal Response (just the root element)
			expect(xml).toContain('<?xml');
			expect(xml).toContain('<Response');
		});

		it('hangs up when digit is not 1 (e.g., 2)', () => {
			const handler = findHandler(router, 'post', '/screen-call-result');
			const { req, res, getSentXml } = mockReqRes({ Digits: '2' });

			handler(req, res);
			expect(getSentXml()).toContain('<Hangup');
		});

		it('hangs up when digit is 0', () => {
			const handler = findHandler(router, 'post', '/screen-call-result');
			const { req, res, getSentXml } = mockReqRes({ Digits: '0' });

			handler(req, res);
			expect(getSentXml()).toContain('<Hangup');
		});
	});

	// ── connect-operator-status ───────────────────────────────────────────

	describe('POST /connect-operator-status', () => {
		it('offers voicemail when DialCallStatus is no-answer', () => {
			const handler = findHandler(router, 'post', '/connect-operator-status');
			const { req, res, getSentXml } = mockReqRes({
				DialCallStatus: 'no-answer',
				From: '+13105551234'
			});

			handler(req, res);
			const xml = getSentXml();

			expect(xml).toContain('<Gather');
			expect(xml).toContain('<Record');
			expect(xml).toContain('mailbox=operator');
		});

		it('offers voicemail when DialCallStatus is busy', () => {
			const handler = findHandler(router, 'post', '/connect-operator-status');
			const { req, res, getSentXml } = mockReqRes({ DialCallStatus: 'busy' });

			handler(req, res);
			expect(getSentXml()).toContain('<Gather');
			expect(getSentXml()).toContain('<Record');
		});

		it('offers voicemail when DialCallStatus is failed', () => {
			const handler = findHandler(router, 'post', '/connect-operator-status');
			const { req, res, getSentXml } = mockReqRes({ DialCallStatus: 'failed' });

			handler(req, res);
			expect(getSentXml()).toContain('<Gather');
			expect(getSentXml()).toContain('<Record');
		});

		it('returns empty TwiML when call was answered (completed)', () => {
			const handler = findHandler(router, 'post', '/connect-operator-status');
			const { req, res, getSentXml } = mockReqRes({ DialCallStatus: 'completed' });

			handler(req, res);
			const xml = getSentXml();

			expect(xml).not.toContain('<Gather');
			expect(xml).not.toContain('<Record');
		});

		it('uses absolute URLs for all callbacks', () => {
			const handler = findHandler(router, 'post', '/connect-operator-status');
			const { req, res, getSentXml } = mockReqRes({ DialCallStatus: 'no-answer' });

			handler(req, res);
			const xml = getSentXml();

			expect(xml).toContain('https://api.lemedspa.app/api/twilio/connect-operator-text');
			expect(xml).toContain(
				'https://api.lemedspa.app/api/webhooks/voice/recording?mailbox=operator'
			);
			expect(xml).toContain('https://api.lemedspa.app/api/webhooks/voice/transcription');
		});

		it('plays the apology audio in the Gather prompt', () => {
			const handler = findHandler(router, 'post', '/connect-operator-status');
			const { req, res, getSentXml } = mockReqRes({ DialCallStatus: 'no-answer' });

			handler(req, res);
			expect(getSentXml()).toContain('<Play>');
			expect(getSentXml()).toContain('twil.io');
		});
	});

	// ── connect-operator-text ─────────────────────────────────────────────

	describe('POST /connect-operator-text', () => {
		it('sends SMS and plays confirmation when digit is 1', async () => {
			const handler = findHandler(router, 'post', '/connect-operator-text');
			const { req, res, getSentXml } = mockReqRes({
				Digits: '1',
				From: '+13105551234',
				Called: '+12134442242'
			});

			await handler(req, res);
			const xml = getSentXml();

			expect(xml).toContain('<Play>');
			expect(xml).toContain('message-sent');
			expect(xml).toContain('<Hangup');
		});

		it('falls through to voicemail when digit is not 1', async () => {
			const handler = findHandler(router, 'post', '/connect-operator-text');
			const { req, res, getSentXml } = mockReqRes({
				Digits: '2',
				From: '+13105551234',
				Called: '+12134442242'
			});

			await handler(req, res);
			const xml = getSentXml();

			expect(xml).toContain('<Record');
			expect(xml).toContain('mailbox=operator');
		});

		it('uses absolute URLs in the voicemail fallback', async () => {
			const handler = findHandler(router, 'post', '/connect-operator-text');
			const { req, res, getSentXml } = mockReqRes({
				Digits: '3',
				From: '+13105551234'
			});

			await handler(req, res);
			const xml = getSentXml();

			expect(xml).toContain(
				'https://api.lemedspa.app/api/webhooks/voice/recording?mailbox=operator'
			);
		});
	});

	// ── voice (outbound call) ─────────────────────────────────────────────

	describe('POST /voice (outbound call)', () => {
		it('dials the target phone number', async () => {
			const handler = findHandler(router, 'post', '/voice');
			const { req, res, getSentXml } = mockReqRes({
				To: '+18185559999',
				CallSid: 'CA_test_out_1',
				From: 'client:lea'
			});

			await handler(req, res);
			const xml = getSentXml();

			expect(xml).toContain('<Number>+18185559999</Number>');
			expect(xml).toContain('callerId');
		});

		it('extracts phone from SIP URI in To field', async () => {
			const handler = findHandler(router, 'post', '/voice');
			const { req, res, getSentXml } = mockReqRes({
				To: 'sip:+18185559999@lemedflex.sip.twilio.com',
				CallSid: 'CA_test_sip_1',
				From: 'sip:lea@lemedflex.sip.twilio.com',
				SipDomainSid: 'SD123'
			});

			await handler(req, res);
			expect(getSentXml()).toContain('<Number>+18185559999</Number>');
		});

		it('uses Twilio phone number as callerId', async () => {
			const handler = findHandler(router, 'post', '/voice');
			const { req, res, getSentXml } = mockReqRes({
				To: '+18185559999',
				CallSid: 'CA_test_out_2'
			});

			await handler(req, res);
			expect(getSentXml()).toContain('+12134442242');
		});

		it('says "no destination" when To is missing', async () => {
			const handler = findHandler(router, 'post', '/voice');
			const { req, res, getSentXml } = mockReqRes({
				CallSid: 'CA_test_out_3'
			});

			await handler(req, res);
			expect(getSentXml()).toContain('No destination specified');
		});

		it('dials a client when To starts with client:', async () => {
			const handler = findHandler(router, 'post', '/voice');
			const { req, res, getSentXml } = mockReqRes({
				To: 'client:lea',
				CallSid: 'CA_test_client_1'
			});

			await handler(req, res);
			expect(getSentXml()).toContain('<Client>lea</Client>');
		});

		it('sets outbound-status as the action URL', async () => {
			const handler = findHandler(router, 'post', '/voice');
			const { req, res, getSentXml } = mockReqRes({
				To: '+18185559999',
				CallSid: 'CA_test_out_4'
			});

			await handler(req, res);
			expect(getSentXml()).toContain('https://api.lemedspa.app/api/twilio/outbound-status');
		});
	});

	// ── outbound-status ───────────────────────────────────────────────────

	describe('POST /outbound-status', () => {
		it('returns valid TwiML for completed call', async () => {
			const handler = findHandler(router, 'post', '/outbound-status');
			const { req, res, getSentXml } = mockReqRes({
				CallSid: 'CA_test_done',
				DialCallStatus: 'completed',
				DialCallDuration: '45'
			});

			await handler(req, res);
			const xml = getSentXml();

			expect(res.type).toHaveBeenCalledWith('text/xml');
			expect(xml).toContain('<?xml');
			expect(xml).toContain('<Response');
		});

		it('handles no-answer status', async () => {
			const handler = findHandler(router, 'post', '/outbound-status');
			const { req, res, getSentXml } = mockReqRes({
				CallSid: 'CA_test_noanswer',
				DialCallStatus: 'no-answer',
				DialCallDuration: '0'
			});

			await handler(req, res);
			expect(res.type).toHaveBeenCalledWith('text/xml');
		});

		it('handles missing CallSid gracefully', async () => {
			const handler = findHandler(router, 'post', '/outbound-status');
			const { req, res, getSentXml } = mockReqRes({
				DialCallStatus: 'completed'
			});

			await handler(req, res);
			// Should still return valid TwiML, just skip DB update
			expect(res.type).toHaveBeenCalledWith('text/xml');
			expect(getSentXml()).toContain('<Response');
		});
	});

	// ── Full chain simulation ─────────────────────────────────────────────

	describe('Full inbound call chain simulation', () => {
		it('connect-operator → (nobody answers) → connect-operator-status → voicemail', () => {
			// Step 1: Twilio calls connect-operator
			const connectHandler = findHandler(router, 'post', '/connect-operator');
			const step1 = mockReqRes({ From: '+13105551234' });
			connectHandler(step1.req, step1.res);

			// Verify: TwiML has Client + Number with screening
			const connectXml = step1.getSentXml();
			expect(connectXml).toContain('<Client>lea</Client>');
			expect(connectXml).toContain('screen-call');

			// Step 2: Nobody answers → Twilio hits the action URL (connect-operator-status)
			const statusHandler = findHandler(router, 'post', '/connect-operator-status');
			const step2 = mockReqRes({
				DialCallStatus: 'no-answer',
				From: '+13105551234'
			});
			statusHandler(step2.req, step2.res);

			// Verify: offers press-1-to-text then voicemail
			const statusXml = step2.getSentXml();
			expect(statusXml).toContain('<Gather');
			expect(statusXml).toContain('connect-operator-text');
			expect(statusXml).toContain('<Record');
		});

		it('connect-operator → desk phone answers screening → bridges call', () => {
			// Step 1: connect-operator sends ring with screening
			const connectHandler = findHandler(router, 'post', '/connect-operator');
			const step1 = mockReqRes({ From: '+13105551234' });
			connectHandler(step1.req, step1.res);
			expect(step1.getSentXml()).toContain('screen-call');

			// Step 2: Desk phone answers → Twilio fetches screen-call whisper URL
			const screenHandler = findHandler(router, 'post', '/screen-call');
			const step2 = mockReqRes({});
			screenHandler(step2.req, step2.res);
			expect(step2.getSentXml()).toContain('Press 1 to accept');

			// Step 3: Human presses 1 → screen-call-result returns empty TwiML (bridges)
			const resultHandler = findHandler(router, 'post', '/screen-call-result');
			const step3 = mockReqRes({ Digits: '1' });
			resultHandler(step3.req, step3.res);
			const bridgeXml = step3.getSentXml();
			expect(bridgeXml).not.toContain('<Hangup');

			// Step 4: After call completes → connect-operator-status with 'completed'
			const statusHandler = findHandler(router, 'post', '/connect-operator-status');
			const step4 = mockReqRes({ DialCallStatus: 'completed' });
			statusHandler(step4.req, step4.res);
			// Should NOT offer voicemail — call was answered
			expect(step4.getSentXml()).not.toContain('<Record');
		});

		it('connect-operator → voicemail answers screening → hangup kills that leg', () => {
			// Step 1: connect-operator sends ring
			const connectHandler = findHandler(router, 'post', '/connect-operator');
			const step1 = mockReqRes({ From: '+13105551234' });
			connectHandler(step1.req, step1.res);

			// Step 2: Voicemail answers desk phone → screen-call plays "press 1"
			const screenHandler = findHandler(router, 'post', '/screen-call');
			const step2 = mockReqRes({});
			screenHandler(step2.req, step2.res);
			// Voicemail won't press any digits → Gather times out → falls through to <Hangup/>
			expect(step2.getSentXml()).toContain('<Hangup');
			// This kills the voicemail leg, other legs (Client) keep ringing
		});

		it('connect-operator-status (no-answer) → caller presses 1 → SMS sent', async () => {
			// Step 1: No one answers → voicemail greeting plays
			const statusHandler = findHandler(router, 'post', '/connect-operator-status');
			const step1 = mockReqRes({
				DialCallStatus: 'no-answer',
				From: '+13105551234'
			});
			statusHandler(step1.req, step1.res);
			expect(step1.getSentXml()).toContain('connect-operator-text');

			// Step 2: Caller presses 1 during voicemail greeting → SMS is sent
			const textHandler = findHandler(router, 'post', '/connect-operator-text');
			const step2 = mockReqRes({
				Digits: '1',
				From: '+13105551234',
				Called: '+12134442242'
			});
			await textHandler(step2.req, step2.res);
			const textXml = step2.getSentXml();
			expect(textXml).toContain('message-sent'); // confirmation audio
			expect(textXml).toContain('<Hangup');
		});
	});

	// ── No middleware blocking (regression for busy signal bug) ────────────

	describe('Regression: no middleware blocking TwiML callbacks', () => {
		it('connect-operator-status has no validateTwilioSignature middleware', () => {
			const layer = router.stack.find(
				(l) => l.route && l.route.path === '/connect-operator-status'
			);
			expect(layer).toBeTruthy();

			// Check that no middleware layer references "signature" or "validate"
			const handlerNames = layer.route.stack.map((s) => s.handle.name || 'anonymous');
			const hasSignatureMiddleware = handlerNames.some(
				(name) =>
					name.toLowerCase().includes('signature') || name.toLowerCase().includes('validate')
			);
			expect(hasSignatureMiddleware).toBe(false);
		});

		it('connect-operator-text has no validateTwilioSignature middleware', () => {
			const layer = router.stack.find((l) => l.route && l.route.path === '/connect-operator-text');
			expect(layer).toBeTruthy();

			const handlerNames = layer.route.stack.map((s) => s.handle.name || 'anonymous');
			const hasSignatureMiddleware = handlerNames.some(
				(name) =>
					name.toLowerCase().includes('signature') || name.toLowerCase().includes('validate')
			);
			expect(hasSignatureMiddleware).toBe(false);
		});

		it('screen-call has no auth middleware', () => {
			const layer = router.stack.find((l) => l.route && l.route.path === '/screen-call');
			expect(layer).toBeTruthy();

			const handlerNames = layer.route.stack.map((s) => s.handle.name || 'anonymous');
			const hasAuthMiddleware = handlerNames.some(
				(name) => name.toLowerCase().includes('verify') || name.toLowerCase().includes('auth')
			);
			expect(hasAuthMiddleware).toBe(false);
		});
	});

	// ── URL correctness (no stale RENDER_EXTERNAL_URL references) ────────

	describe('URL correctness — no stale references', () => {
		it('connect-operator uses API_BASE_URL, not RENDER_EXTERNAL_URL', () => {
			delete process.env.RENDER_EXTERNAL_URL;
			const handler = findHandler(router, 'post', '/connect-operator');
			const { req, res, getSentXml } = mockReqRes({ From: '+13105551234' });

			handler(req, res);
			const xml = getSentXml();

			// All URLs should start with API_BASE_URL
			expect(xml).toContain('https://api.lemedspa.app');
			expect(xml).not.toContain('undefined');
		});

		it('connect-operator-status uses API_BASE_URL', () => {
			const handler = findHandler(router, 'post', '/connect-operator-status');
			const { req, res, getSentXml } = mockReqRes({ DialCallStatus: 'no-answer' });

			handler(req, res);
			expect(getSentXml()).toContain('https://api.lemedspa.app');
		});
	});
});
