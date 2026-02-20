import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('TextMagic SMS forwarding', () => {
	let originalFetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		delete process.env.TEXTMAGIC_WEBHOOK_URL;
	});

	it('forwards Twilio payload to TEXTMAGIC_WEBHOOK_URL when set', async () => {
		process.env.TEXTMAGIC_WEBHOOK_URL = 'https://my.textmagic.com/webhook/twilio/sms/incoming';
		const fetchSpy = vi.fn(() => Promise.resolve({ ok: true }));
		globalThis.fetch = fetchSpy;

		const { forwardToTextMagic } = await import('../routes/webhooks/sms-forward.js');

		const twilioBody = {
			MessageSid: 'SM123',
			From: '+13105551234',
			To: '+12134442242',
			Body: 'Hello',
		};

		await forwardToTextMagic(twilioBody);

		expect(fetchSpy).toHaveBeenCalledOnce();
		const [url, opts] = fetchSpy.mock.calls[0];
		expect(url).toBe('https://my.textmagic.com/webhook/twilio/sms/incoming');
		expect(opts.method).toBe('POST');
		expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
		expect(opts.body).toContain('MessageSid=SM123');
		expect(opts.body).toContain('From=%2B13105551234');
	});

	it('skips forwarding when TEXTMAGIC_WEBHOOK_URL is not set', async () => {
		const fetchSpy = vi.fn();
		globalThis.fetch = fetchSpy;

		const { forwardToTextMagic } = await import('../routes/webhooks/sms-forward.js');

		await forwardToTextMagic({ MessageSid: 'SM123' });

		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('does not throw when forwarding fails', async () => {
		process.env.TEXTMAGIC_WEBHOOK_URL = 'https://my.textmagic.com/webhook/twilio/sms/incoming';
		globalThis.fetch = vi.fn(() => Promise.reject(new Error('Network error')));

		const { forwardToTextMagic } = await import('../routes/webhooks/sms-forward.js');

		await expect(forwardToTextMagic({ MessageSid: 'SM123' })).resolves.not.toThrow();
	});
});
