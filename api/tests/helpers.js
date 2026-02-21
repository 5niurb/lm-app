/**
 * Shared test helpers for API tests.
 *
 * Provides reusable utilities for mocking Express req/res objects,
 * extracting route handlers from Express routers, and building
 * chainable Supabase mock objects.
 */
import { vi } from 'vitest';

// ============================================================================
// EXPRESS HELPERS
// ============================================================================

/**
 * Find a route handler on an Express router by HTTP method and path.
 * Returns the last handler in the middleware chain (skipping middleware like verifyToken).
 *
 * @param {object} router - Express Router instance
 * @param {string} method - HTTP method (lowercase: 'get', 'post', 'patch', 'delete')
 * @param {string} path - Route path (e.g. '/', '/:id', '/search')
 * @returns {Function} The route handler function
 */
export function findHandler(router, method, path) {
	const layer = router.stack.find(
		(l) => l.route && l.route.path === path && l.route.methods[method]
	);
	if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
	// Return the last handler (skips middleware like verifyToken, logAction)
	const handlers = layer.route.stack.filter((s) => s.method === method);
	return handlers[handlers.length - 1].handle;
}

/**
 * Create mock Express req/res objects for testing route handlers.
 *
 * @param {object} [options]
 * @param {object} [options.body] - Request body
 * @param {object} [options.query] - Query string parameters
 * @param {object} [options.params] - Route parameters (e.g. { id: '123' })
 * @param {object} [options.headers] - Request headers
 * @param {object} [options.user] - Authenticated user (req.user)
 * @returns {{ req: object, res: object, getJson: Function, getStatus: Function, getSentXml: Function }}
 */
export function mockReqRes(options = {}) {
	let sentJson = null;
	let sentXml = '';
	let statusCode = 200;

	const req = {
		body: options.body || {},
		query: options.query || {},
		params: options.params || {},
		headers: options.headers || {},
		user: options.user || null,
		get: vi.fn((header) => (options.headers || {})[header.toLowerCase()]),
		protocol: 'https',
		originalUrl: options.originalUrl || '/test'
	};

	const res = {
		status: vi.fn(function (code) {
			statusCode = code;
			return this;
		}),
		json: vi.fn((data) => {
			sentJson = data;
		}),
		send: vi.fn((data) => {
			sentXml = data;
		}),
		sendStatus: vi.fn((code) => {
			statusCode = code;
		}),
		type: vi.fn().mockReturnThis()
	};

	return {
		req,
		res,
		getJson: () => sentJson,
		getStatus: () => statusCode,
		getSentXml: () => sentXml
	};
}

// ============================================================================
// SUPABASE MOCK FACTORY
// ============================================================================

/**
 * Create a chainable Supabase mock that tracks calls and returns configured data.
 *
 * Usage:
 *   const mock = mockSupabase({
 *     'contacts': {
 *       select: [{ id: '1', full_name: 'Jane Doe' }],
 *       insert: { id: '2', full_name: 'New Contact' },
 *     }
 *   });
 *
 * The mock supports chaining: mock.from('contacts').select('*').eq('id', '1').single()
 *
 * @param {object} tableConfig - Map of table names to their response configurations
 * @returns {object} A mock supabaseAdmin-like object
 */
export function mockSupabase(tableConfig = {}) {
	const calls = [];

	function createChain(tableName, operation) {
		const config = tableConfig[tableName] || {};
		const responseData = operation === 'insert' ? config.insert : config.select;
		const error = config.error || null;

		const chain = {
			select: vi.fn().mockReturnThis(),
			insert: vi.fn().mockReturnThis(),
			update: vi.fn().mockReturnThis(),
			delete: vi.fn().mockReturnThis(),
			upsert: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			neq: vi.fn().mockReturnThis(),
			or: vi.fn().mockReturnThis(),
			contains: vi.fn().mockReturnThis(),
			ilike: vi.fn().mockReturnThis(),
			gte: vi.fn().mockReturnThis(),
			lte: vi.fn().mockReturnThis(),
			order: vi.fn().mockReturnThis(),
			limit: vi.fn().mockReturnThis(),
			range: vi.fn().mockReturnThis(),
			single: vi.fn(() =>
				Promise.resolve({
					data: Array.isArray(responseData) ? responseData[0] : responseData,
					error
				})
			),
			maybeSingle: vi.fn(() =>
				Promise.resolve({
					data: Array.isArray(responseData) ? responseData[0] : responseData,
					error
				})
			),
			then: undefined // will be set below
		};

		// Make the chain itself thenable (for queries that don't end with single/maybeSingle)
		const resolveValue = {
			data: responseData,
			error,
			count: Array.isArray(responseData) ? responseData.length : 0
		};
		chain.then = (resolve) => resolve(resolveValue);

		return chain;
	}

	return {
		from: vi.fn((tableName) => {
			calls.push(tableName);
			const config = tableConfig[tableName] || {};

			return {
				select: vi.fn((...args) => {
					const chain = createChain(tableName, 'select');
					return chain;
				}),
				insert: vi.fn((data) => {
					return createChain(tableName, 'insert');
				}),
				update: vi.fn((data) => {
					return createChain(tableName, 'update');
				}),
				delete: vi.fn(() => {
					return createChain(tableName, 'delete');
				}),
				upsert: vi.fn((data) => {
					return createChain(tableName, 'insert');
				})
			};
		}),
		rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
		_calls: calls
	};
}

/**
 * Create a simple mock for supabase.auth.getUser().
 *
 * @param {object|null} user - The user to return, or null for auth failure
 * @param {string|null} errorMsg - Error message if auth fails
 * @returns {object} Mock supabase client with auth.getUser
 */
export function mockSupabaseAuth(user = null, errorMsg = null) {
	return {
		auth: {
			getUser: vi.fn(() =>
				Promise.resolve({
					data: { user },
					error: errorMsg ? { message: errorMsg } : null
				})
			)
		}
	};
}
