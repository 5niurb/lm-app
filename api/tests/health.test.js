/**
 * API health check tests (Node.js built-in test runner)
 *
 * Run with: node --test api/tests/
 *
 * These test the API endpoints against the production server.
 * No local server needed — tests the deployed API.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

const API_URL = process.env.API_URL || 'https://lm-app-api.onrender.com';

describe('API Health', () => {
	it('returns ok status', async () => {
		const res = await fetch(`${API_URL}/api/health`);
		assert.strictEqual(res.status, 200);
		const data = await res.json();
		assert.strictEqual(data.status, 'ok');
		assert.ok(data.timestamp);
	});

	it('returns CORS headers for CF Pages origin', async () => {
		const res = await fetch(`${API_URL}/api/health`, {
			headers: { Origin: 'https://lm-app.pages.dev' }
		});
		assert.strictEqual(res.status, 200);
		const corsHeader = res.headers.get('access-control-allow-origin');
		assert.strictEqual(corsHeader, 'https://lm-app.pages.dev');
	});

	it('rejects unknown CORS origins', async () => {
		const res = await fetch(`${API_URL}/api/health`, {
			headers: { Origin: 'https://evil.com' }
		});
		// Should still return 200 (health check) but without CORS header
		// OR the server might reject — either way, no CORS header for evil.com
		const corsHeader = res.headers.get('access-control-allow-origin');
		assert.notStrictEqual(corsHeader, 'https://evil.com');
	});
});

describe('Public API Endpoints', () => {
	it('GET /api/public/content returns 200', async () => {
		const res = await fetch(`${API_URL}/api/public/content`);
		assert.strictEqual(res.status, 200);
	});

	it('GET /api/public/consent/consent-neuromodulators returns 200', async () => {
		const res = await fetch(`${API_URL}/api/public/consent/consent-neuromodulators`);
		assert.strictEqual(res.status, 200);
	});

	it('GET /api/public/consent/nonexistent returns 404', async () => {
		const res = await fetch(`${API_URL}/api/public/consent/nonexistent-form`);
		assert.strictEqual(res.status, 404);
	});
});
