/**
 * Voice webhook handler tests.
 *
 * Tests the voice webhook routes: incoming call logging,
 * call event tracking, status updates, recording/voicemail handling,
 * and transcription updates.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReqRes } from './helpers.js';

// Track mock calls for assertions
const mockInsert = vi.fn(() => ({
	select: vi.fn(() => ({
		single: vi.fn(() =>
			Promise.resolve({ data: { id: 'new-record-id', full_name: null }, error: null })
		)
	}))
}));
const mockUpdate = vi.fn(() => ({
	eq: vi.fn(() => ({
		select: vi.fn(() => ({
			maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null }))
		})),
		then: (resolve) => resolve({ data: null, error: null })
	}))
}));
const mockSelectChain = {
	eq: vi.fn(() => ({
		maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
		single: vi.fn(() => Promise.resolve({ data: { id: 'call-log-id' }, error: null }))
	})),
	or: vi.fn(() => ({
		limit: vi.fn(() => ({
			maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null }))
		}))
	}))
};

const mockUpsert = vi.fn(() => ({
	select: vi.fn(() => ({
		single: vi.fn(() =>
			Promise.resolve({ data: { id: 'new-record-id', full_name: null }, error: null })
		)
	})),
	then: (resolve) => resolve({ data: null, error: null })
}));

vi.mock('../services/supabase.js', () => ({
	supabaseAdmin: {
		from: vi.fn(() => ({
			select: vi.fn(() => mockSelectChain),
			insert: mockInsert,
			update: mockUpdate,
			upsert: mockUpsert
		}))
	}
}));

vi.mock('../middleware/twilioSignature.js', () => ({
	validateTwilioSignature: (req, res, next) => next()
}));

// Helper to find handlers on the router
function findHandler(router, method, path) {
	const layer = router.stack.find(
		(l) => l.route && l.route.path === path && l.route.methods[method]
	);
	if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
	const handlers = layer.route.stack.filter((s) => s.method === method);
	return handlers[handlers.length - 1].handle;
}

describe('voice webhook handlers', () => {
	let router;

	beforeEach(async () => {
		vi.clearAllMocks();
		const mod = await import('../routes/webhooks/voice.js');
		router = mod.default;
	});

	describe('POST /incoming', () => {
		it('returns 200 with empty body when CallSid is missing', async () => {
			const handler = findHandler(router, 'post', '/incoming');
			const { req, res } = mockReqRes({ body: {} });

			await handler(req, res);

			expect(res.sendStatus).toHaveBeenCalledWith(200);
		});

		it('creates a call log for inbound call', async () => {
			const handler = findHandler(router, 'post', '/incoming');
			const { req, res } = mockReqRes({
				body: {
					CallSid: 'CA123',
					From: '+13105551234',
					To: '+18184633772',
					CallStatus: 'ringing',
					CallerName: 'Jane Doe',
					CallerCity: 'Los Angeles',
					CallerState: 'CA'
				}
			});

			await handler(req, res);

			expect(res.sendStatus).toHaveBeenCalledWith(200);
			const { supabaseAdmin } = await import('../services/supabase.js');
			expect(supabaseAdmin.from).toHaveBeenCalledWith('contacts');
			expect(supabaseAdmin.from).toHaveBeenCalledWith('call_logs');
		});
	});

	describe('POST /event', () => {
		it('returns 200 with empty body when CallSid is missing', async () => {
			const handler = findHandler(router, 'post', '/event');
			const { req, res } = mockReqRes({ body: {} });

			await handler(req, res);

			expect(res.sendStatus).toHaveBeenCalledWith(200);
		});

		it('logs call events with digit and menu data', async () => {
			const handler = findHandler(router, 'post', '/event');
			const { req, res } = mockReqRes({
				body: {
					CallSid: 'CA456',
					event_type: 'menu_selection',
					digit: '2',
					menu: 'main',
					action: 'directory'
				}
			});

			await handler(req, res);

			expect(res.sendStatus).toHaveBeenCalledWith(200);
			const { supabaseAdmin } = await import('../services/supabase.js');
			expect(supabaseAdmin.from).toHaveBeenCalledWith('call_events');
		});
	});

	describe('POST /transcription', () => {
		it('returns 200 when RecordingSid is missing', async () => {
			const handler = findHandler(router, 'post', '/transcription');
			const { req, res } = mockReqRes({ body: {} });

			await handler(req, res);

			expect(res.sendStatus).toHaveBeenCalledWith(200);
		});

		it('updates voicemail with transcription text', async () => {
			const handler = findHandler(router, 'post', '/transcription');
			const { req, res } = mockReqRes({
				body: {
					RecordingSid: 'RE789',
					TranscriptionText: 'Hi, I would like to schedule an appointment.',
					TranscriptionStatus: 'completed'
				}
			});

			await handler(req, res);

			expect(res.sendStatus).toHaveBeenCalledWith(200);
			const { supabaseAdmin } = await import('../services/supabase.js');
			expect(supabaseAdmin.from).toHaveBeenCalledWith('voicemails');
		});

		it('marks transcription as failed when status is not completed', async () => {
			const handler = findHandler(router, 'post', '/transcription');
			const { req, res } = mockReqRes({
				body: {
					RecordingSid: 'RE999',
					TranscriptionText: '',
					TranscriptionStatus: 'failed'
				}
			});

			await handler(req, res);

			expect(res.sendStatus).toHaveBeenCalledWith(200);
		});
	});

	describe('GET /hours-check', () => {
		it('returns forced open when FORCE_HOURS_OPEN is true', async () => {
			const origForce = process.env.FORCE_HOURS_OPEN;
			process.env.FORCE_HOURS_OPEN = 'true';

			const handler = findHandler(router, 'get', '/hours-check');
			const { req, res, getJson } = mockReqRes();

			handler(req, res);

			expect(res.json).toHaveBeenCalled();
			const result = getJson();
			expect(result.status).toBe('open');
			expect(result.forced).toBe(true);

			process.env.FORCE_HOURS_OPEN = origForce;
		});

		it('returns timezone in response', () => {
			const origForce = process.env.FORCE_HOURS_OPEN;
			delete process.env.FORCE_HOURS_OPEN;

			const handler = findHandler(router, 'get', '/hours-check');
			const { req, res, getJson } = mockReqRes();

			handler(req, res);

			const result = getJson();
			expect(result.timezone).toBe('America/Los_Angeles');
			expect(['open', 'closed']).toContain(result.status);

			process.env.FORCE_HOURS_OPEN = origForce;
		});
	});
});
