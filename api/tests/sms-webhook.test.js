/**
 * SMS webhook handler tests.
 *
 * Tests the SMS webhook routes: incoming message handling,
 * delivery status updates, and Studio-initiated sends.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReqRes } from './helpers.js';

// Mock phone-lookup service
vi.mock('../services/phone-lookup.js', () => ({
	normalizePhone: vi.fn((p) => {
		if (!p) return p;
		const d = p.replace(/\D/g, '');
		if (d.length === 10) return '+1' + d;
		if (d.length === 11 && d.startsWith('1')) return '+' + d;
		return p;
	}),
	findConversation: vi.fn(() => Promise.resolve(null)),
	lookupContactByPhone: vi.fn(() => Promise.resolve({ contactId: null, contactName: null }))
}));

// Mock sms-forward (relative to the module that imports it, but vi.mock resolves relative to test)
vi.mock('../routes/webhooks/sms-forward.js', () => ({
	forwardToTextMagic: vi.fn(),
	sendSmsViaTextMagic: vi.fn(() => Promise.resolve(null))
}));

// Mock Twilio signature middleware
vi.mock('../middleware/twilioSignature.js', () => ({
	validateTwilioSignature: (req, res, next) => next()
}));

// Mock twilio client
vi.mock('twilio', () => ({
	default: vi.fn(() => ({
		messages: {
			create: vi.fn(() => Promise.resolve({ sid: 'SM_test_123', status: 'sent' }))
		}
	}))
}));

// Mock supabase
const mockInsert = vi.fn(() => ({
	select: vi.fn(() => ({
		single: vi.fn(() => Promise.resolve({ data: { id: 'conv-new' }, error: null }))
	}))
}));
const mockUpdate = vi.fn(() => ({
	eq: vi.fn(() => Promise.resolve({ data: null, error: null }))
}));

vi.mock('../services/supabase.js', () => ({
	supabaseAdmin: {
		from: vi.fn(() => ({
			select: vi.fn(() => ({
				eq: vi.fn(() => ({
					maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
					single: vi.fn(() => Promise.resolve({ data: { id: 'conv-1' }, error: null }))
				})),
				or: vi.fn(() => ({
					limit: vi.fn(() => ({
						maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null }))
					})),
					order: vi.fn(() => ({
						limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
					}))
				}))
			})),
			insert: mockInsert,
			update: mockUpdate
		}))
	}
}));

function findHandler(router, method, path) {
	const layer = router.stack.find(
		(l) => l.route && l.route.path === path && l.route.methods[method]
	);
	if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
	const handlers = layer.route.stack.filter((s) => s.method === method);
	return handlers[handlers.length - 1].handle;
}

describe('SMS webhook handlers', () => {
	let router;

	beforeEach(async () => {
		vi.clearAllMocks();
		const mod = await import('../routes/webhooks/sms.js');
		router = mod.default;
	});

	describe('POST /incoming', () => {
		it('returns 200 with empty body when MessageSid is missing', async () => {
			const handler = findHandler(router, 'post', '/incoming');
			const { req, res } = mockReqRes({ body: {} });

			await handler(req, res);

			expect(res.sendStatus).toHaveBeenCalledWith(200);
		});

		it('processes inbound SMS and responds with empty TwiML', async () => {
			const handler = findHandler(router, 'post', '/incoming');
			const { req, res, getSentXml } = mockReqRes({
				body: {
					MessageSid: 'SM_abc123',
					From: '+13105551234',
					To: '+18184633772',
					Body: 'I want to book an appointment',
					NumMedia: '0'
				}
			});

			await handler(req, res);

			expect(res.type).toHaveBeenCalledWith('text/xml');
			const xml = getSentXml();
			expect(xml).toContain('<Response>');
			expect(xml).toContain('</Response>');
		});

		it('collects media URLs when NumMedia > 0', async () => {
			const handler = findHandler(router, 'post', '/incoming');
			const { req, res } = mockReqRes({
				body: {
					MessageSid: 'SM_media123',
					From: '+13105551234',
					To: '+18184633772',
					Body: 'Check this out',
					NumMedia: '2',
					MediaUrl0: 'https://api.twilio.com/media/img1.jpg',
					MediaUrl1: 'https://api.twilio.com/media/img2.jpg'
				}
			});

			await handler(req, res);

			expect(res.type).toHaveBeenCalledWith('text/xml');
		});

		it('forwards to TextMagic after processing', async () => {
			const handler = findHandler(router, 'post', '/incoming');
			const body = {
				MessageSid: 'SM_fwd123',
				From: '+13105551234',
				To: '+18184633772',
				Body: 'Hello',
				NumMedia: '0'
			};
			const { req, res } = mockReqRes({ body });

			await handler(req, res);

			const { forwardToTextMagic } = await import('../routes/webhooks/sms-forward.js');
			expect(forwardToTextMagic).toHaveBeenCalledWith(body);
		});
	});

	describe('POST /status', () => {
		it('returns 200 when MessageSid or MessageStatus is missing', async () => {
			const handler = findHandler(router, 'post', '/status');
			const { req, res } = mockReqRes({
				body: { MessageSid: 'SM123' } // missing MessageStatus
			});

			await handler(req, res);

			expect(res.sendStatus).toHaveBeenCalledWith(200);
		});

		it('updates message status on valid callback', async () => {
			const handler = findHandler(router, 'post', '/status');
			const { req, res } = mockReqRes({
				body: {
					MessageSid: 'SM_delivered',
					MessageStatus: 'delivered'
				}
			});

			await handler(req, res);

			expect(res.sendStatus).toHaveBeenCalledWith(200);
			const { supabaseAdmin } = await import('../services/supabase.js');
			expect(supabaseAdmin.from).toHaveBeenCalledWith('messages');
		});
	});

	describe('POST /studio-send', () => {
		it('returns 400 when "to" or "body" is missing', async () => {
			const handler = findHandler(router, 'post', '/studio-send');
			const { req, res, getJson } = mockReqRes({
				body: { to: '+13105551234' }, // missing body
				headers: {}
			});

			await handler(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(getJson()).toEqual(
				expect.objectContaining({ error: expect.stringContaining('required') })
			);
		});

		it('returns 403 when studio secret is set but header is wrong', async () => {
			const origSecret = process.env.STUDIO_WEBHOOK_SECRET;
			process.env.STUDIO_WEBHOOK_SECRET = 'super-secret';

			const handler = findHandler(router, 'post', '/studio-send');
			const { req, res } = mockReqRes({
				body: { to: '+13105551234', body: 'Hello' },
				headers: { 'x-studio-secret': 'wrong-secret' }
			});

			await handler(req, res);

			expect(res.status).toHaveBeenCalledWith(403);

			process.env.STUDIO_WEBHOOK_SECRET = origSecret;
		});
	});
});
