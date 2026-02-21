/**
 * Auth middleware tests.
 *
 * Tests verifyToken middleware which validates Supabase JWTs
 * and attaches user info (id, email, role) to req.user.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReqRes } from './helpers.js';

// Mock Supabase modules before importing the middleware
const mockGetUser = vi.fn();
const mockProfileSelect = vi.fn();

vi.mock('../services/supabase.js', () => ({
	supabase: {
		auth: {
			getUser: (...args) => mockGetUser(...args)
		}
	},
	supabaseAdmin: {
		from: vi.fn(() => ({
			select: vi.fn(() => ({
				eq: vi.fn(() => ({
					single: () => mockProfileSelect()
				}))
			}))
		}))
	}
}));

const { verifyToken } = await import('../middleware/auth.js');

describe('verifyToken middleware', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 401 when Authorization header is missing', async () => {
		const { req, res } = mockReqRes({ headers: {} });
		const next = vi.fn();

		await verifyToken(req, res, next);

		expect(res.status).toHaveBeenCalledWith(401);
		expect(res.json).toHaveBeenCalledWith({
			error: 'Missing or malformed Authorization header'
		});
		expect(next).not.toHaveBeenCalled();
	});

	it('returns 401 when Authorization header lacks Bearer prefix', async () => {
		const { req, res } = mockReqRes({
			headers: { authorization: 'Token abc123' }
		});
		const next = vi.fn();

		await verifyToken(req, res, next);

		expect(res.status).toHaveBeenCalledWith(401);
		expect(res.json).toHaveBeenCalledWith({
			error: 'Missing or malformed Authorization header'
		});
		expect(next).not.toHaveBeenCalled();
	});

	it('returns 401 when token is invalid', async () => {
		mockGetUser.mockResolvedValue({
			data: { user: null },
			error: { message: 'Invalid token' }
		});

		const { req, res } = mockReqRes({
			headers: { authorization: 'Bearer invalid-token' }
		});
		const next = vi.fn();

		await verifyToken(req, res, next);

		expect(mockGetUser).toHaveBeenCalledWith('invalid-token');
		expect(res.status).toHaveBeenCalledWith(401);
		expect(res.json).toHaveBeenCalledWith({
			error: 'Invalid or expired token'
		});
		expect(next).not.toHaveBeenCalled();
	});

	it('attaches user with profile role and calls next on valid token', async () => {
		mockGetUser.mockResolvedValue({
			data: {
				user: { id: 'user-123', email: 'admin@lemedspa.com' }
			},
			error: null
		});
		mockProfileSelect.mockResolvedValue({
			data: { role: 'admin' },
			error: null
		});

		const { req, res } = mockReqRes({
			headers: { authorization: 'Bearer valid-token' }
		});
		const next = vi.fn();

		await verifyToken(req, res, next);

		expect(req.user).toEqual({
			id: 'user-123',
			email: 'admin@lemedspa.com',
			role: 'admin'
		});
		expect(next).toHaveBeenCalled();
	});

	it('defaults to staff role when profile lookup fails', async () => {
		mockGetUser.mockResolvedValue({
			data: {
				user: { id: 'user-456', email: 'staff@lemedspa.com' }
			},
			error: null
		});
		mockProfileSelect.mockResolvedValue({
			data: null,
			error: { message: 'Row not found' }
		});

		const { req, res } = mockReqRes({
			headers: { authorization: 'Bearer valid-token' }
		});
		const next = vi.fn();

		await verifyToken(req, res, next);

		expect(req.user).toEqual({
			id: 'user-456',
			email: 'staff@lemedspa.com',
			role: 'staff'
		});
		expect(next).toHaveBeenCalled();
	});

	it('returns 401 when getUser throws', async () => {
		mockGetUser.mockRejectedValue(new Error('Network failure'));

		const { req, res } = mockReqRes({
			headers: { authorization: 'Bearer some-token' }
		});
		const next = vi.fn();

		await verifyToken(req, res, next);

		expect(res.status).toHaveBeenCalledWith(401);
		expect(res.json).toHaveBeenCalledWith({
			error: 'Authentication failed'
		});
		expect(next).not.toHaveBeenCalled();
	});
});
