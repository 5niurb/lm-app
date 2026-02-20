import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock supabaseAdmin before importing the route
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
			})
		})
	}
}));

/**
 * Helper: find a route handler on the Express router by path and method.
 */
function findHandler(router, method, path) {
	const layer = router.stack.find(
		(l) => l.route && l.route.path === path && l.route.methods[method]
	);
	if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
	// Return the last handler (skips middleware like verifyToken)
	const handlers = layer.route.stack.filter((s) => s.method === method);
	return handlers[handlers.length - 1].handle;
}

/**
 * Helper: create mock req/res that captures TwiML output.
 */
function mockReqRes(body = {}) {
	let sentXml = '';
	const req = { body };
	const res = {
		type: vi.fn().mockReturnThis(),
		send: vi.fn((xml) => {
			sentXml = xml;
		})
	};
	return { req, res, getSentXml: () => sentXml };
}

describe('connect-operator-status handler', () => {
	let router;

	beforeEach(async () => {
		// Set env vars the route module needs
		process.env.TWILIO_ACCOUNT_SID = 'ACtest';
		process.env.TWILIO_AUTH_TOKEN = 'testtoken';
		process.env.TWILIO_API_KEY_SID = 'SKtest';
		process.env.TWILIO_API_KEY_SECRET = 'secret';
		process.env.TWILIO_TWIML_APP_SID = 'APtest';
		process.env.TWILIO_PHONE_NUMBER = '+12134442242';
		process.env.RENDER_EXTERNAL_URL = 'https://api.lemedspa.app';

		const mod = await import('../routes/twilio.js');
		router = mod.default;
	});

	it('generates Gather with press-1-to-text when DialCallStatus is no-answer', async () => {
		const handler = findHandler(router, 'post', '/connect-operator-status');
		const { req, res, getSentXml } = mockReqRes({
			DialCallStatus: 'no-answer',
			Called: '+12134442242',
			From: '+13105551234'
		});

		await handler(req, res);
		const xml = getSentXml();

		expect(res.type).toHaveBeenCalledWith('text/xml');
		expect(xml).toContain('<Gather');
		expect(xml).toContain('numDigits="1"');
		expect(xml).toContain('connect-operator-text');
		expect(xml).toContain('press 1');
		expect(xml).toContain('<Record');
	});

	it('generates Gather when DialCallStatus is busy', async () => {
		const handler = findHandler(router, 'post', '/connect-operator-status');
		const { req, res, getSentXml } = mockReqRes({ DialCallStatus: 'busy' });

		await handler(req, res);

		expect(getSentXml()).toContain('<Gather');
		expect(getSentXml()).toContain('<Record');
	});

	it('returns empty TwiML when call was answered (completed)', async () => {
		const handler = findHandler(router, 'post', '/connect-operator-status');
		const { req, res, getSentXml } = mockReqRes({ DialCallStatus: 'completed' });

		await handler(req, res);
		const xml = getSentXml();

		expect(xml).not.toContain('<Gather');
		expect(xml).not.toContain('<Record');
	});

	it('uses absolute URLs for all callbacks', async () => {
		const handler = findHandler(router, 'post', '/connect-operator-status');
		const { req, res, getSentXml } = mockReqRes({ DialCallStatus: 'no-answer' });

		await handler(req, res);
		const xml = getSentXml();

		expect(xml).toContain('https://api.lemedspa.app/api/twilio/connect-operator-text');
		expect(xml).toContain('https://api.lemedspa.app/api/webhooks/voice/recording?mailbox=operator');
	});
});
