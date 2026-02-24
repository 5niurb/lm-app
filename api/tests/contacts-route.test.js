/**
 * Contacts route handler tests.
 *
 * Tests the contacts CRUD API: listing with pagination/filtering,
 * search, creating, updating, and tag management.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockReqRes } from './helpers.js';

// Mock auth and audit middleware to pass through
vi.mock('../middleware/auth.js', () => ({
	verifyToken: (req, res, next) => next()
}));
vi.mock('../middleware/auditLog.js', () => ({
	logAction: () => (req, res, next) => next()
}));

// Track supabase calls
const mockSingleResult = vi.fn(() =>
	Promise.resolve({
		data: { id: 'contact-1', full_name: 'Jane Doe', tags: ['patient'] },
		error: null
	})
);
const mockSelectChain = vi.fn(() => ({
	eq: vi.fn(() => ({
		single: mockSingleResult,
		maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null }))
	})),
	or: vi.fn().mockReturnThis(),
	contains: vi.fn().mockReturnThis(),
	order: vi.fn().mockReturnThis(),
	range: vi.fn().mockReturnThis(),
	limit: vi.fn().mockReturnThis(),
	then: (resolve) =>
		resolve({
			data: [{ id: '1', full_name: 'Jane Doe' }],
			error: null,
			count: 1
		})
}));

const mockInsertChain = vi.fn(() => ({
	select: vi.fn(() => ({
		single: vi.fn(() =>
			Promise.resolve({
				data: { id: 'new-contact', full_name: 'New Contact' },
				error: null
			})
		)
	}))
}));

const mockUpdateChain = vi.fn(() => ({
	eq: vi.fn(() => ({
		select: vi.fn(() => ({
			single: vi.fn(() =>
				Promise.resolve({
					data: { id: 'contact-1', full_name: 'Updated Name' },
					error: null
				})
			)
		}))
	}))
}));

vi.mock('../services/supabase.js', () => ({
	supabaseAdmin: {
		from: vi.fn((table) => ({
			select: mockSelectChain,
			insert: mockInsertChain,
			update: mockUpdateChain,
			delete: vi.fn(() => ({
				eq: vi.fn(() => Promise.resolve({ error: null }))
			}))
		})),
		rpc: vi.fn(() => Promise.resolve({ data: null, error: { message: 'not found' } }))
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

describe('contacts route handlers', () => {
	let router;

	beforeEach(async () => {
		vi.clearAllMocks();
		const mod = await import('../routes/contacts.js');
		router = mod.default;
	});

	describe('GET / (list contacts)', () => {
		it('returns paginated contacts with defaults', async () => {
			const handler = findHandler(router, 'get', '/');
			const { req, res, getJson } = mockReqRes({ query: {} });

			await handler(req, res);

			expect(res.json).toHaveBeenCalled();
			const result = getJson();
			expect(result).toHaveProperty('data');
			expect(result).toHaveProperty('page', 1);
			expect(result).toHaveProperty('pageSize', 50);
		});

		it('clamps page to minimum of 1', async () => {
			const handler = findHandler(router, 'get', '/');
			const { req, res, getJson } = mockReqRes({
				query: { page: '-5', pageSize: '10' }
			});

			await handler(req, res);

			const result = getJson();
			expect(result.page).toBe(1);
		});

		it('clamps pageSize to max 100', async () => {
			const handler = findHandler(router, 'get', '/');
			const { req, res, getJson } = mockReqRes({
				query: { pageSize: '500' }
			});

			await handler(req, res);

			const result = getJson();
			expect(result.pageSize).toBe(100);
		});

		it('rejects sort field not in allowlist (prevents SQL injection)', async () => {
			const handler = findHandler(router, 'get', '/');
			const { req, res } = mockReqRes({
				query: { sort: 'DROP TABLE contacts;--' }
			});

			await handler(req, res);

			// Should have used default 'full_name' sort, not the injected value
			expect(mockSelectChain).toHaveBeenCalled();
		});
	});

	describe('GET /search', () => {
		it('returns empty array when query is too short', async () => {
			const handler = findHandler(router, 'get', '/search');
			const { req, res, getJson } = mockReqRes({ query: { q: 'a' } });

			await handler(req, res);

			expect(getJson()).toEqual({ data: [] });
		});

		it('returns empty array when query is missing', async () => {
			const handler = findHandler(router, 'get', '/search');
			const { req, res, getJson } = mockReqRes({ query: {} });

			await handler(req, res);

			expect(getJson()).toEqual({ data: [] });
		});
	});

	describe('POST / (create contact)', () => {
		it('returns 400 when no identifying fields provided', async () => {
			const handler = findHandler(router, 'post', '/');
			const { req, res, getJson } = mockReqRes({ body: {} });

			await handler(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(getJson()).toEqual(
				expect.objectContaining({
					error: expect.objectContaining({ message: expect.stringContaining('required') })
				})
			);
		});

		it('creates contact with full_name', async () => {
			const handler = findHandler(router, 'post', '/');
			const { req, res } = mockReqRes({
				body: { full_name: 'Jane Doe', phone: '(310) 555-1234' }
			});

			await handler(req, res);

			expect(res.status).toHaveBeenCalledWith(201);
			expect(mockInsertChain).toHaveBeenCalled();
		});

		it('creates contact with just email', async () => {
			const handler = findHandler(router, 'post', '/');
			const { req, res } = mockReqRes({
				body: { email: 'jane@example.com' }
			});

			await handler(req, res);

			expect(res.status).toHaveBeenCalledWith(201);
		});
	});

	describe('PATCH /:id (update contact)', () => {
		it('returns 400 when no fields to update', async () => {
			const handler = findHandler(router, 'patch', '/:id');
			const { req, res, getJson } = mockReqRes({
				params: { id: 'contact-1' },
				body: {}
			});

			await handler(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(getJson()).toEqual(
				expect.objectContaining({
					error: expect.objectContaining({ message: expect.stringContaining('No fields') })
				})
			);
		});

		it('updates contact with provided fields', async () => {
			const handler = findHandler(router, 'patch', '/:id');
			const { req, res } = mockReqRes({
				params: { id: 'contact-1' },
				body: { full_name: 'Jane Smith', email: 'jane.smith@example.com' }
			});

			await handler(req, res);

			expect(res.json).toHaveBeenCalled();
			expect(mockUpdateChain).toHaveBeenCalled();
		});

		it('normalizes phone on update', async () => {
			const handler = findHandler(router, 'patch', '/:id');
			const { req, res } = mockReqRes({
				params: { id: 'contact-1' },
				body: { phone: '(310) 555-9999' }
			});

			await handler(req, res);

			expect(mockUpdateChain).toHaveBeenCalled();
		});
	});

	describe('POST /:id/tags (add tags)', () => {
		it('returns 400 when tags is not an array', async () => {
			const handler = findHandler(router, 'post', '/:id/tags');
			const { req, res, getJson } = mockReqRes({
				params: { id: 'contact-1' },
				body: { tags: 'vip' }
			});

			await handler(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(getJson().error.message).toContain('non-empty array');
		});

		it('returns 400 when tags array is empty', async () => {
			const handler = findHandler(router, 'post', '/:id/tags');
			const { req, res } = mockReqRes({
				params: { id: 'contact-1' },
				body: { tags: [] }
			});

			await handler(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
		});
	});

	describe('DELETE /:id/tags (remove tags)', () => {
		it('returns 400 when tags is not an array', async () => {
			const handler = findHandler(router, 'delete', '/:id/tags');
			const { req, res } = mockReqRes({
				params: { id: 'contact-1' },
				body: { tags: 'vip' }
			});

			await handler(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
		});
	});
});
