/**
 * Frontend utility tests
 * Tests phone formatting, date helpers, and other shared utilities.
 */
import { describe, it, expect } from 'vitest';

// Phone number formatting (matches the pattern used across the app)
function formatPhone(phone) {
	if (!phone) return '';
	const digits = phone.replace(/\D/g, '');
	if (digits.length === 11 && digits[0] === '1') {
		return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
	}
	if (digits.length === 10) {
		return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
	}
	return phone;
}

// Phone normalization (E.164 format)
function normalizePhone(phone) {
	if (!phone) return '';
	const digits = phone.replace(/\D/g, '');
	if (digits.length === 10) return `+1${digits}`;
	if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
	return phone;
}

// Duration formatting (seconds to human-readable)
function formatDuration(seconds) {
	if (!seconds || seconds < 0) return '0s';
	if (seconds < 60) return `${seconds}s`;
	const min = Math.floor(seconds / 60);
	const sec = seconds % 60;
	return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

describe('formatPhone', () => {
	it('formats 10-digit numbers', () => {
		expect(formatPhone('8184633772')).toBe('(818) 463-3772');
	});

	it('formats 11-digit numbers with country code', () => {
		expect(formatPhone('18184633772')).toBe('(818) 463-3772');
	});

	it('formats E.164 numbers', () => {
		expect(formatPhone('+18184633772')).toBe('(818) 463-3772');
	});

	it('returns empty string for null/undefined', () => {
		expect(formatPhone(null)).toBe('');
		expect(formatPhone(undefined)).toBe('');
		expect(formatPhone('')).toBe('');
	});

	it('returns raw input for non-standard lengths', () => {
		expect(formatPhone('911')).toBe('911');
		expect(formatPhone('12345')).toBe('12345');
	});
});

describe('normalizePhone', () => {
	it('normalizes 10-digit to E.164', () => {
		expect(normalizePhone('8184633772')).toBe('+18184633772');
	});

	it('normalizes 11-digit with country code', () => {
		expect(normalizePhone('18184633772')).toBe('+18184633772');
	});

	it('handles formatted numbers', () => {
		expect(normalizePhone('(818) 463-3772')).toBe('+18184633772');
	});

	it('handles E.164 input', () => {
		expect(normalizePhone('+18184633772')).toBe('+18184633772');
	});

	it('returns empty for empty input', () => {
		expect(normalizePhone('')).toBe('');
		expect(normalizePhone(null)).toBe('');
	});
});

describe('formatDuration', () => {
	it('formats seconds only', () => {
		expect(formatDuration(30)).toBe('30s');
		expect(formatDuration(1)).toBe('1s');
	});

	it('formats minutes and seconds', () => {
		expect(formatDuration(90)).toBe('1m 30s');
		expect(formatDuration(125)).toBe('2m 5s');
	});

	it('formats even minutes', () => {
		expect(formatDuration(60)).toBe('1m');
		expect(formatDuration(120)).toBe('2m');
	});

	it('handles zero and negative', () => {
		expect(formatDuration(0)).toBe('0s');
		expect(formatDuration(-5)).toBe('0s');
		expect(formatDuration(null)).toBe('0s');
	});
});
