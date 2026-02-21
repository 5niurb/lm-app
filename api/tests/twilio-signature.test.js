/**
 * Twilio signature validation middleware tests.
 *
 * Tests validateTwilioSignature which verifies that incoming webhook
 * requests genuinely originated from Twilio.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockReqRes } from './helpers.js';

// Mock the twilio module
const mockValidateRequest = vi.fn();
vi.mock('twilio', () => ({
	default: {
		validateRequest: (...args) => mockValidateRequest(...args)
	}
}));

const { validateTwilioSignature } = await import('../middleware/twilioSignature.js');

describe('validateTwilioSignature middleware', () => {
	const origEnv = { ...process.env };

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		process.env = { ...origEnv };
	});

	it('skips validation when TWILIO_AUTH_TOKEN is not set', async () => {
		delete process.env.TWILIO_AUTH_TOKEN;
		const { req, res } = mockReqRes();
		const next = vi.fn();

		validateTwilioSignature(req, res, next);

		expect(next).toHaveBeenCalled();
		expect(mockValidateRequest).not.toHaveBeenCalled();
	});

	it('returns 403 when x-twilio-signature header is missing', () => {
		process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
		const { req, res } = mockReqRes({ headers: {} });
		const next = vi.fn();

		validateTwilioSignature(req, res, next);

		expect(res.status).toHaveBeenCalledWith(403);
		expect(res.send).toHaveBeenCalledWith('Forbidden');
		expect(next).not.toHaveBeenCalled();
	});

	it('returns 403 when signature is invalid', () => {
		process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
		process.env.RENDER_EXTERNAL_URL = 'https://api.lemedspa.app';
		mockValidateRequest.mockReturnValue(false);

		const { req, res } = mockReqRes({
			headers: { 'x-twilio-signature': 'bad-signature' },
			body: { From: '+13105551234', Body: 'Hello' },
			originalUrl: '/api/webhooks/sms/incoming'
		});
		const next = vi.fn();

		validateTwilioSignature(req, res, next);

		expect(mockValidateRequest).toHaveBeenCalledWith(
			'test-auth-token',
			'bad-signature',
			'https://api.lemedspa.app/api/webhooks/sms/incoming',
			{ From: '+13105551234', Body: 'Hello' }
		);
		expect(res.status).toHaveBeenCalledWith(403);
		expect(next).not.toHaveBeenCalled();
	});

	it('calls next when signature is valid', () => {
		process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
		process.env.RENDER_EXTERNAL_URL = 'https://api.lemedspa.app';
		mockValidateRequest.mockReturnValue(true);

		const { req, res } = mockReqRes({
			headers: { 'x-twilio-signature': 'valid-signature' },
			body: { From: '+13105551234', Body: 'Hello' },
			originalUrl: '/api/webhooks/sms/incoming'
		});
		const next = vi.fn();

		validateTwilioSignature(req, res, next);

		expect(mockValidateRequest).toHaveBeenCalled();
		expect(next).toHaveBeenCalled();
	});

	it('uses API_BASE_URL fallback when RENDER_EXTERNAL_URL is not set', () => {
		process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
		delete process.env.RENDER_EXTERNAL_URL;
		process.env.API_BASE_URL = 'https://custom-api.example.com';
		mockValidateRequest.mockReturnValue(true);

		const { req, res } = mockReqRes({
			headers: { 'x-twilio-signature': 'some-sig' },
			originalUrl: '/api/webhooks/sms/status'
		});
		const next = vi.fn();

		validateTwilioSignature(req, res, next);

		expect(mockValidateRequest).toHaveBeenCalledWith(
			'test-auth-token',
			'some-sig',
			'https://custom-api.example.com/api/webhooks/sms/status',
			{}
		);
	});
});
