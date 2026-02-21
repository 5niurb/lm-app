import { describe, it, expect, vi, beforeAll } from 'vitest';

// Set dummy Supabase env vars before importing — supabase.js validates on load
beforeAll(() => {
	process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
	process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
	process.env.SUPABASE_SERVICE_ROLE_KEY =
		process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key';
});

// Mock supabase to prevent actual client creation side effects
vi.mock('../services/supabase.js', () => ({
	supabaseAdmin: { from: vi.fn() },
	supabase: { from: vi.fn() }
}));

const { buildContactFormSmsBody } = await import('../routes/webhooks/contact-form.js');

describe('buildContactFormSmsBody', () => {
	it('includes name, interest, and message when all provided', () => {
		const body = buildContactFormSmsBody({
			name: 'Sarah Johnson',
			interested_in: 'aesthetics',
			message: 'I want to learn about facials and chemical peels for anti-aging.'
		});
		expect(body).toContain('Hi Sarah');
		expect(body).toContain('Aesthetics / Skin');
		expect(body).toContain('facials and chemical peels');
		expect(body).toContain('(818) 463-3772');
		expect(body).toContain('LeMed Spa');
	});

	it('omits interest line when not provided', () => {
		const body = buildContactFormSmsBody({
			name: 'Maria',
			interested_in: null,
			message: 'Just a question'
		});
		expect(body).not.toContain('Interest:');
		expect(body).toContain('Hi Maria');
		expect(body).toContain('Just a question');
	});

	it('omits message line when not provided', () => {
		const body = buildContactFormSmsBody({
			name: 'Alex Kim',
			interested_in: 'wellness',
			message: null
		});
		expect(body).not.toContain('Message:');
		expect(body).toContain('Wellness / Body');
	});

	it('truncates long messages to ~100 chars', () => {
		const longMsg = 'A'.repeat(200);
		const body = buildContactFormSmsBody({
			name: 'Test User',
			interested_in: null,
			message: longMsg
		});
		expect(body).toContain('...');
		expect(body).not.toContain(longMsg);
	});

	it('uses first name only from full name', () => {
		const body = buildContactFormSmsBody({
			name: 'Jennifer Lee Martinez',
			interested_in: null,
			message: null
		});
		expect(body).toContain('Hi Jennifer');
		expect(body).not.toContain('Lee');
	});

	it('formats interest labels nicely', () => {
		const body = buildContactFormSmsBody({
			name: 'Test',
			interested_in: 'homecare',
			message: null
		});
		expect(body).toContain('Home Care / Products');
	});

	it('falls back to "there" when name is empty', () => {
		const body = buildContactFormSmsBody({
			name: '',
			interested_in: null,
			message: null
		});
		expect(body).toContain('Hi there');
	});

	it('omits inquiry section when neither interest nor message provided', () => {
		const body = buildContactFormSmsBody({
			name: 'Test',
			interested_in: null,
			message: null
		});
		expect(body).not.toContain('We received your inquiry');
		expect(body).toContain('Our care team will follow up shortly');
	});
});
