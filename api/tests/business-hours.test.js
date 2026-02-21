/**
 * Business hours middleware tests.
 *
 * Tests checkBusinessHours which restricts access outside
 * business hours (Mon-Sat 9am-6pm Pacific). Admins always pass.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockReqRes } from './helpers.js';

// Mock supabase
vi.mock('../services/supabase.js', () => ({
	supabaseAdmin: {
		from: vi.fn(() => ({
			select: vi.fn(() => ({
				eq: vi.fn(() => ({
					single: vi.fn(() => Promise.resolve({ data: null, error: { message: 'not found' } }))
				}))
			}))
		}))
	}
}));

const { checkBusinessHours } = await import('../middleware/businessHours.js');

describe('checkBusinessHours middleware', () => {
	let realDate;

	beforeEach(() => {
		vi.clearAllMocks();
		realDate = globalThis.Date;
	});

	afterEach(() => {
		globalThis.Date = realDate;
	});

	/** Helper: mock Date to return a specific time in LA timezone */
	function mockTime(isoString) {
		const fakeDate = new realDate(isoString);
		globalThis.Date = class extends realDate {
			constructor(...args) {
				if (args.length === 0) return fakeDate;
				return new realDate(...args);
			}

			static now() {
				return fakeDate.getTime();
			}
		};
		// Preserve static methods
		globalThis.Date.UTC = realDate.UTC;
		globalThis.Date.parse = realDate.parse;
	}

	it('always passes admins through regardless of time', async () => {
		// Mock a Sunday at 3am — definitely outside business hours
		mockTime('2026-01-04T11:00:00Z'); // Sunday 3am Pacific

		const { req, res } = mockReqRes({
			user: { id: 'admin-1', email: 'boss@lemedspa.com', role: 'admin' }
		});
		const next = vi.fn();

		await checkBusinessHours(req, res, next);

		expect(next).toHaveBeenCalled();
		expect(res.status).not.toHaveBeenCalled();
	});

	it('returns 403 for non-admin users on Sunday', async () => {
		// Sunday 2pm Pacific = Sunday 10pm UTC
		mockTime('2026-01-04T22:00:00Z');

		const { req, res } = mockReqRes({
			user: { id: 'staff-1', email: 'staff@lemedspa.com', role: 'staff' }
		});
		const next = vi.fn();

		await checkBusinessHours(req, res, next);

		expect(res.status).toHaveBeenCalledWith(403);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ error: 'Outside business hours' })
		);
		expect(next).not.toHaveBeenCalled();
	});

	it('allows access during weekday business hours (Mon-Fri 9am-6pm)', async () => {
		// Wednesday 12pm Pacific = Wednesday 8pm UTC
		mockTime('2026-01-07T20:00:00Z');

		const { req, res } = mockReqRes({
			user: { id: 'staff-1', email: 'staff@lemedspa.com', role: 'staff' }
		});
		const next = vi.fn();

		await checkBusinessHours(req, res, next);

		expect(next).toHaveBeenCalled();
	});

	it('blocks access before opening (e.g. 7am weekday)', async () => {
		// Tuesday 7am Pacific = Tuesday 3pm UTC
		mockTime('2026-01-06T15:00:00Z');

		const { req, res } = mockReqRes({
			user: { id: 'staff-1', email: 'staff@lemedspa.com', role: 'staff' }
		});
		const next = vi.fn();

		await checkBusinessHours(req, res, next);

		expect(res.status).toHaveBeenCalledWith(403);
		expect(next).not.toHaveBeenCalled();
	});

	it('blocks access after closing (e.g. 7pm weekday)', async () => {
		// Monday 7pm Pacific = Tuesday 3am UTC
		mockTime('2026-01-06T03:00:00Z');

		const { req, res } = mockReqRes({
			user: { id: 'staff-1', email: 'staff@lemedspa.com', role: 'staff' }
		});
		const next = vi.fn();

		await checkBusinessHours(req, res, next);

		expect(res.status).toHaveBeenCalledWith(403);
		expect(next).not.toHaveBeenCalled();
	});

	it('allows access on Saturday during hours', async () => {
		// Saturday 10am Pacific = Saturday 6pm UTC
		mockTime('2026-01-10T18:00:00Z');

		const { req, res } = mockReqRes({
			user: { id: 'staff-1', email: 'staff@lemedspa.com', role: 'staff' }
		});
		const next = vi.fn();

		await checkBusinessHours(req, res, next);

		expect(next).toHaveBeenCalled();
	});

	it('allows through when no user is set (unauthenticated request)', async () => {
		// Weekday business hours
		mockTime('2026-01-07T20:00:00Z');

		const { req, res } = mockReqRes();
		const next = vi.fn();

		await checkBusinessHours(req, res, next);

		expect(next).toHaveBeenCalled();
	});
});
