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

	// ── connect-operator (phase 1: softphone only) ──────────────────────

	describe('POST /connect-operator', () => {
		it('rings ONLY the softphone client (no desk phone)', () => {
			const handler = findHandler(router, 'post', '/connect-operator');
			const { req, res, getSentXml } = mockReqRes({
				From: '+13105551234',
				Caller: '+13105551234'
			});

			handler(req, res);
			const xml = getSentXml();

			expect(xml).toContain('<Client>lea</Client>');
			// Must NOT contain desk phone — sequential ring prevents voicemail race
			expect(xml).not.toContain('+18184632211');
			expect(xml).not.toContain('screen-call');
		});

		it('uses the caller number as callerId', () => {
			const handler = findHandler(router, 'post', '/connect-operator');
			const { req, res, getSentXml } = mockReqRes({ From: '+13105551234' });

			handler(req, res);
			expect(getSentXml()).toContain('callerId="+13105551234"');
		});

		it('action URL points to connect-operator-fallback (not status)', () => {
			const handler = findHandler(router, 'post', '/connect-operator');
			const { req, res, getSentXml } = mockReqRes({ From: '+13105551234' });

			handler(req, res);
			expect(getSentXml()).toContain(
				'https://api.lemedspa.app/api/twilio/connect-operator-fallback'
			);
		});

		it('sets 15s timeout for softphone ring', () => {
			const handler = findHandler(router, 'post', '/connect-operator');
			const { req, res, getSentXml } = mockReqRes({ From: '+13105551234' });

			handler(req, res);
			expect(res.type).toHaveBeenCalledWith('text/xml');
			expect(getSentXml()).toContain('timeout="15"');
		});
	});

	// ── connect-operator-fallback (phase 2: desk phone) ──────────────────

	describe('POST /connect-operator-fallback', () => {
		it('returns empty TwiML when softphone answered (completed)', () => {
			const handler = findHandler(router, 'post', '/connect-operator-fallback');
			const { req, res, getSentXml } = mockReqRes({ DialCallStatus: 'completed' });

			handler(req, res);
			const xml = getSentXml();

			expect(xml).not.toContain('<Dial');
			expect(xml).not.toContain('<Record');
		});

		it('dials desk phone with screening when softphone not answered', () => {
			const handler = findHandler(router, 'post', '/connect-operator-fallback');
			const { req, res, getSentXml } = mockReqRes({
				DialCallStatus: 'no-answer',
				From: '+13105551234'
			});

			handler(req, res);
			const xml = getSentXml();

			expect(xml).toContain('+18184632211');
			expect(xml).toContain('screen-call');
			expect(xml).toContain('connect-operator-status');
		});

		it('includes fallback number when set and different from operator', () => {
			process.env.TWILIO_OPERATOR_FALLBACK = '+18185559999';
			const handler = findHandler(router, 'post', '/connect-operator-fallback');
			const { req, res, getSentXml } = mockReqRes({
				DialCallStatus: 'no-answer',
				From: '+13105551234'
			});

			handler(req, res);
			const xml = getSentXml();

			expect(xml).toContain('+18185559999');
			expect(xml).toContain('+18184632211');
			delete process.env.TWILIO_OPERATOR_FALLBACK;
		});

		it('excludes fallback when same as operator phone', () => {
			process.env.TWILIO_OPERATOR_FALLBACK = '+18184632211';
			const handler = findHandler(router, 'post', '/connect-operator-fallback');
			const { req, res, getSentXml } = mockReqRes({
				DialCallStatus: 'no-answer',
				From: '+13105551234'
			});

			handler(req, res);
			const numberCount = (getSentXml().match(/<Number/g) || []).length;
			expect(numberCount).toBe(1);
			delete process.env.TWILIO_OPERATOR_FALLBACK;
		});

		it('goes straight to voicemail when no desk phone configured', () => {
			delete process.env.TWILIO_OPERATOR_PHONE;
			const handler = findHandler(router, 'post', '/connect-operator-fallback');
			const { req, res, getSentXml } = mockReqRes({
				DialCallStatus: 'no-answer',
				From: '+13105551234'
			});

			handler(req, res);
			const xml = getSentXml();

			expect(xml).toContain('<Gather');
			expect(xml).toContain('<Record');
			expect(xml).not.toContain('<Dial');
			process.env.TWILIO_OPERATOR_PHONE = '+18184632211';
		});

		it('handles busy status (falls through to desk phone)', () => {
			const handler = findHandler(router, 'post', '/connect-operator-fallback');
			const { req, res, getSentXml } = mockReqRes({
				DialCallStatus: 'busy',
				From: '+13105551234'
			});

			handler(req, res);
			expect(getSentXml()).toContain('+18184632211');
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

		it('returns empty TwiML when call was answered with real conversation (completed, long duration)', () => {
			const handler = findHandler(router, 'post', '/connect-operator-status');
			const { req, res, getSentXml } = mockReqRes({
				DialCallStatus: 'completed',
				DialCallDuration: '45'
			});

			handler(req, res);
			const xml = getSentXml();

			expect(xml).not.toContain('<Gather');
			expect(xml).not.toContain('<Record');
		});

		it('offers voicemail when screening failed (completed but short duration)', () => {
			const handler = findHandler(router, 'post', '/connect-operator-status');
			const { req, res, getSentXml } = mockReqRes({
				DialCallStatus: 'completed',
				DialCallDuration: '8'
			});

			handler(req, res);
			const xml = getSentXml();

			expect(xml).toContain('<Gather');
			expect(xml).toContain('<Record');
			expect(xml).toContain('mailbox=operator');
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
		it('softphone answers → call completes → fallback returns empty TwiML', () => {
			// Step 1: connect-operator rings softphone only
			const connectHandler = findHandler(router, 'post', '/connect-operator');
			const step1 = mockReqRes({ From: '+13105551234' });
			connectHandler(step1.req, step1.res);

			const connectXml = step1.getSentXml();
			expect(connectXml).toContain('<Client>lea</Client>');
			expect(connectXml).not.toContain('+18184632211'); // no desk phone

			// Step 2: Softphone answers, call completes → fallback fires
			const fallbackHandler = findHandler(router, 'post', '/connect-operator-fallback');
			const step2 = mockReqRes({ DialCallStatus: 'completed' });
			fallbackHandler(step2.req, step2.res);

			// Should end gracefully — no further dialing
			expect(step2.getSentXml()).not.toContain('<Dial');
			expect(step2.getSentXml()).not.toContain('<Record');
		});

		it('softphone no-answer → fallback dials desk phone → screening → bridges', () => {
			// Step 1: connect-operator rings softphone
			const connectHandler = findHandler(router, 'post', '/connect-operator');
			const step1 = mockReqRes({ From: '+13105551234' });
			connectHandler(step1.req, step1.res);

			// Step 2: Softphone not answered → fallback fires with desk phone
			const fallbackHandler = findHandler(router, 'post', '/connect-operator-fallback');
			const step2 = mockReqRes({
				DialCallStatus: 'no-answer',
				From: '+13105551234'
			});
			fallbackHandler(step2.req, step2.res);
			expect(step2.getSentXml()).toContain('+18184632211');
			expect(step2.getSentXml()).toContain('screen-call');

			// Step 3: Desk phone answers → screening plays
			const screenHandler = findHandler(router, 'post', '/screen-call');
			const step3 = mockReqRes({});
			screenHandler(step3.req, step3.res);
			expect(step3.getSentXml()).toContain('Press 1 to accept');

			// Step 4: Human presses 1 → call bridges
			const resultHandler = findHandler(router, 'post', '/screen-call-result');
			const step4 = mockReqRes({ Digits: '1' });
			resultHandler(step4.req, step4.res);
			expect(step4.getSentXml()).not.toContain('<Hangup');

			// Step 5: Call completes → connect-operator-status (real conversation = long duration)
			const statusHandler = findHandler(router, 'post', '/connect-operator-status');
			const step5 = mockReqRes({ DialCallStatus: 'completed', DialCallDuration: '60' });
			statusHandler(step5.req, step5.res);
			expect(step5.getSentXml()).not.toContain('<Record');
		});

		it('nobody answers (both phases) → voicemail', () => {
			// Step 1: Softphone no-answer
			const fallbackHandler = findHandler(router, 'post', '/connect-operator-fallback');
			const step1 = mockReqRes({
				DialCallStatus: 'no-answer',
				From: '+13105551234'
			});
			fallbackHandler(step1.req, step1.res);

			// Step 2: Desk phone also no-answer → connect-operator-status
			const statusHandler = findHandler(router, 'post', '/connect-operator-status');
			const step2 = mockReqRes({
				DialCallStatus: 'no-answer',
				From: '+13105551234'
			});
			statusHandler(step2.req, step2.res);

			const statusXml = step2.getSentXml();
			expect(statusXml).toContain('<Gather');
			expect(statusXml).toContain('connect-operator-text');
			expect(statusXml).toContain('<Record');
		});

		it('voicemail answers desk phone screening → hangup kills that leg', () => {
			const screenHandler = findHandler(router, 'post', '/screen-call');
			const step = mockReqRes({});
			screenHandler(step.req, step.res);
			// Voicemail can't press digits → Gather times out → <Hangup/>
			expect(step.getSentXml()).toContain('<Hangup');
		});

		it('desk phone voicemail answers + screening fails → caller gets voicemail greeting', () => {
			// Simulates: softphone no-answer → desk phone voicemail answers →
			// screening fails (short duration) → caller hears voicemail greeting
			const fallbackHandler = findHandler(router, 'post', '/connect-operator-fallback');
			const step1 = mockReqRes({
				DialCallStatus: 'no-answer',
				From: '+13105551234'
			});
			fallbackHandler(step1.req, step1.res);

			// Desk phone voicemail answered (completed) but screening failed (8s duration)
			const statusHandler = findHandler(router, 'post', '/connect-operator-status');
			const step2 = mockReqRes({
				DialCallStatus: 'completed',
				DialCallDuration: '8',
				From: '+13105551234'
			});
			statusHandler(step2.req, step2.res);

			const statusXml = step2.getSentXml();
			expect(statusXml).toContain('<Gather');
			expect(statusXml).toContain('<Record');
			expect(statusXml).toContain('mailbox=operator');
		});

		it('connect-operator-status (no-answer) → caller presses 1 → SMS sent', async () => {
			const statusHandler = findHandler(router, 'post', '/connect-operator-status');
			const step1 = mockReqRes({
				DialCallStatus: 'no-answer',
				From: '+13105551234'
			});
			statusHandler(step1.req, step1.res);
			expect(step1.getSentXml()).toContain('connect-operator-text');

			const textHandler = findHandler(router, 'post', '/connect-operator-text');
			const step2 = mockReqRes({
				Digits: '1',
				From: '+13105551234',
				Called: '+12134442242'
			});
			await textHandler(step2.req, step2.res);
			expect(step2.getSentXml()).toContain('message-sent');
			expect(step2.getSentXml()).toContain('<Hangup');
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

		it('connect-operator-fallback has no auth middleware', () => {
			const layer = router.stack.find(
				(l) => l.route && l.route.path === '/connect-operator-fallback'
			);
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

			expect(xml).toContain('https://api.lemedspa.app');
			expect(xml).not.toContain('undefined');
		});

		it('connect-operator-fallback uses API_BASE_URL', () => {
			const handler = findHandler(router, 'post', '/connect-operator-fallback');
			const { req, res, getSentXml } = mockReqRes({
				DialCallStatus: 'no-answer',
				From: '+13105551234'
			});

			handler(req, res);
			expect(getSentXml()).toContain('https://api.lemedspa.app');
		});

		it('connect-operator-status uses API_BASE_URL', () => {
			const handler = findHandler(router, 'post', '/connect-operator-status');
			const { req, res, getSentXml } = mockReqRes({ DialCallStatus: 'no-answer' });

			handler(req, res);
			expect(getSentXml()).toContain('https://api.lemedspa.app');
		});
	});
});
