/**
 * Automation service tests.
 *
 * Tests sendSms, sendEmail, and executeSequence — the core automation
 * engine that sends real messages to clients.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Twilio
const mockTwilioCreate = vi.fn(() => Promise.resolve({ sid: 'SM_auto_123', status: 'sent' }));
vi.mock('twilio', () => {
	class MockTwilio {
		constructor() {
			this.messages = { create: mockTwilioCreate };
		}
	}
	return { default: { Twilio: MockTwilio } };
});

// Mock supabase
const mockFrom = vi.fn();
vi.mock('../services/supabase.js', () => ({
	supabaseAdmin: {
		from: (...args) => mockFrom(...args)
	}
}));

// Mock global fetch for Resend API
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const { sendSms, sendEmail, executeSequence } = await import('../services/automation.js');

describe('sendSms', () => {
	const origEnv = { ...process.env };

	beforeEach(() => {
		vi.clearAllMocks();
		process.env.TWILIO_ACCOUNT_SID = 'ACtest';
		process.env.TWILIO_AUTH_TOKEN = 'testtoken';
		process.env.TWILIO_PHONE_NUMBER = '+18184633772';

		// Default supabase mock for conversation upsert
		mockFrom.mockReturnValue({
			select: vi.fn(() => ({
				eq: vi.fn(() => ({
					maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 'conv-1' }, error: null }))
				}))
			})),
			insert: vi.fn(() => ({
				select: vi.fn(() => ({
					single: vi.fn(() => Promise.resolve({ data: { id: 'conv-1' }, error: null }))
				}))
			})),
			update: vi.fn(() => ({
				eq: vi.fn(() => Promise.resolve({ data: null, error: null }))
			}))
		});
	});

	afterEach(() => {
		process.env = { ...origEnv };
	});

	it('returns error when Twilio credentials are missing', async () => {
		delete process.env.TWILIO_ACCOUNT_SID;
		delete process.env.TWILIO_AUTH_TOKEN;

		const result = await sendSms({ to: '+13105551234', body: 'Hello' });

		expect(result.success).toBe(false);
		expect(result.error).toContain('credentials');
	});

	it('returns error when no phone number is configured', async () => {
		delete process.env.TWILIO_PHONE_NUMBER;
		delete process.env.TWILIO_SMS_FROM_NUMBER;
		delete process.env.TWILIO_TEST1_PHONE_NUMBER;
		delete process.env.TWILIO_MAIN_PHONE_NUMBER;

		const result = await sendSms({ to: '+13105551234', body: 'Hello' });

		expect(result.success).toBe(false);
		expect(result.error).toContain('phone number');
	});

	it('normalizes 10-digit phone numbers to E.164', async () => {
		await sendSms({ to: '3105551234', body: 'Test' });

		expect(mockTwilioCreate).toHaveBeenCalledWith(expect.objectContaining({ to: '+13105551234' }));
	});

	it('returns success with twilioSid on successful send', async () => {
		const result = await sendSms({
			to: '+13105551234',
			body: 'Your appointment is confirmed.',
			clientId: 'client-1',
			clientName: 'Jane Doe'
		});

		expect(result.success).toBe(true);
		expect(result.twilioSid).toBe('SM_auto_123');
	});

	it('returns error when Twilio API throws', async () => {
		mockTwilioCreate.mockRejectedValueOnce(new Error('Twilio API rate limit'));

		const result = await sendSms({ to: '+13105551234', body: 'Test' });

		expect(result.success).toBe(false);
		expect(result.error).toContain('rate limit');
	});
});

describe('sendEmail', () => {
	const origEnv = { ...process.env };

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		process.env = { ...origEnv };
	});

	it('returns error when RESEND_API_KEY is missing', async () => {
		delete process.env.RESEND_API_KEY;

		const result = await sendEmail({
			to: 'jane@example.com',
			subject: 'Test',
			html: '<p>Hello</p>'
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain('RESEND_API_KEY');
	});

	it('sends email via Resend API and returns resendId', async () => {
		process.env.RESEND_API_KEY = 'test-resend-key';
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ id: 'resend-id-123' })
		});

		const result = await sendEmail({
			to: 'jane@example.com',
			subject: 'Your Appointment',
			html: '<p>Confirmed</p>'
		});

		expect(result.success).toBe(true);
		expect(result.resendId).toBe('resend-id-123');

		// Verify the fetch call
		expect(mockFetch).toHaveBeenCalledWith(
			'https://api.resend.com/emails',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					Authorization: 'Bearer test-resend-key',
					'Content-Type': 'application/json'
				})
			})
		);

		// Verify the body contains correct fields
		const callArgs = mockFetch.mock.calls[0][1];
		const body = JSON.parse(callArgs.body);
		expect(body.to).toEqual(['jane@example.com']);
		expect(body.subject).toBe('Your Appointment');
		expect(body.from).toContain('Le Med Spa');
	});

	it('returns error on Resend API failure', async () => {
		process.env.RESEND_API_KEY = 'test-resend-key';
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 429,
			text: () => Promise.resolve('Rate limited')
		});

		const result = await sendEmail({
			to: 'jane@example.com',
			subject: 'Test',
			html: '<p>Hello</p>'
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain('429');
	});

	it('includes plain text fallback when provided', async () => {
		process.env.RESEND_API_KEY = 'test-resend-key';
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ id: 'resend-456' })
		});

		await sendEmail({
			to: 'jane@example.com',
			subject: 'Test',
			html: '<p>Hello</p>',
			text: 'Hello plain text'
		});

		const callArgs = mockFetch.mock.calls[0][1];
		const body = JSON.parse(callArgs.body);
		expect(body.text).toBe('Hello plain text');
	});

	it('returns error when fetch throws (network failure)', async () => {
		process.env.RESEND_API_KEY = 'test-resend-key';
		mockFetch.mockRejectedValueOnce(new Error('DNS resolution failed'));

		const result = await sendEmail({
			to: 'jane@example.com',
			subject: 'Test',
			html: '<p>Hello</p>'
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain('DNS');
	});
});

describe('executeSequence', () => {
	const origEnv = { ...process.env };

	beforeEach(() => {
		vi.clearAllMocks();
		process.env.TWILIO_ACCOUNT_SID = 'ACtest';
		process.env.TWILIO_AUTH_TOKEN = 'testtoken';
		process.env.TWILIO_PHONE_NUMBER = '+18184633772';
		process.env.RESEND_API_KEY = 'test-resend-key';

		mockFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ id: 'resend-exec-1' })
		});

		mockFrom.mockReturnValue({
			select: vi.fn(() => ({
				eq: vi.fn(() => ({
					maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 'conv-1' }, error: null })),
					single: vi.fn(() => Promise.resolve({ data: { id: 'conv-1' }, error: null }))
				}))
			})),
			insert: vi.fn(() => ({
				select: vi.fn(() => ({
					single: vi.fn(() =>
						Promise.resolve({ data: { id: 'log-1', status: 'sent' }, error: null })
					)
				}))
			})),
			update: vi.fn(() => ({
				eq: vi.fn(() => Promise.resolve({ data: null, error: null }))
			}))
		});
	});

	afterEach(() => {
		process.env = { ...origEnv };
	});

	it('logs failure when client has no valid contact method', async () => {
		const result = await executeSequence({
			sequence: { id: 'seq-1', name: 'Welcome', channel: 'sms' },
			client: { id: 'c-1', full_name: 'Jane Doe', phone: null, email: null }
		});

		expect(result.smsResult).toBeUndefined();
		expect(result.emailResult).toBeUndefined();
		// Should have logged to automation_log
		expect(mockFrom).toHaveBeenCalledWith('automation_log');
	});

	it('sends SMS when channel is sms and client has phone', async () => {
		const result = await executeSequence({
			sequence: {
				id: 'seq-2',
				name: 'Appointment Reminder',
				channel: 'sms',
				message_body: 'Hi {name}, your appointment is tomorrow!'
			},
			client: {
				id: 'c-2',
				full_name: 'Jane Doe',
				phone: '+13105551234',
				email: 'jane@example.com'
			}
		});

		expect(result.smsResult).toBeDefined();
		expect(result.smsResult.success).toBe(true);
		expect(mockTwilioCreate).toHaveBeenCalled();
	});

	it('sends both SMS and email when channel is both', async () => {
		const result = await executeSequence({
			sequence: {
				id: 'seq-3',
				name: 'Post-Treatment',
				channel: 'both',
				message_body: 'Hi {name}, thanks for visiting!',
				subject_line: 'Thank You'
			},
			client: {
				id: 'c-3',
				full_name: 'Jane Doe',
				phone: '+13105551234',
				email: 'jane@example.com'
			}
		});

		expect(result.smsResult).toBeDefined();
		expect(result.emailResult).toBeDefined();
		expect(mockTwilioCreate).toHaveBeenCalled();
		expect(mockFetch).toHaveBeenCalled();
	});

	it('only sends email when channel is email (skips SMS)', async () => {
		const result = await executeSequence({
			sequence: {
				id: 'seq-4',
				name: 'Newsletter',
				channel: 'email',
				subject_line: 'Monthly Update'
			},
			client: {
				id: 'c-4',
				full_name: 'Jane Doe',
				phone: '+13105551234',
				email: 'jane@example.com'
			}
		});

		expect(result.smsResult).toBeUndefined();
		expect(result.emailResult).toBeDefined();
		expect(mockTwilioCreate).not.toHaveBeenCalled();
		expect(mockFetch).toHaveBeenCalled();
	});
});
