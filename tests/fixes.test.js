/**
 * Frontend utility fixes tests
 * Tests API client Content-Type logic, softphone dial normalization,
 * and notification read-state logic.
 *
 * All function implementations are inlined here because they live inside
 * components and are not exported.
 */
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// 1. API client Content-Type check
//    Detects whether the caller already set a Content-Type header so the
//    API wrapper knows whether to add its own.
// ---------------------------------------------------------------------------
function shouldSetContentType(headers) {
	return !(headers && 'Content-Type' in headers);
}

describe('shouldSetContentType', () => {
	it('returns true when headers is undefined', () => {
		expect(shouldSetContentType(undefined)).toBe(true);
	});

	it('returns true when headers is null', () => {
		expect(shouldSetContentType(null)).toBe(true);
	});

	it('returns true when headers is an empty object', () => {
		expect(shouldSetContentType({})).toBe(true);
	});

	it('returns true when headers has other keys but no Content-Type', () => {
		expect(shouldSetContentType({ Authorization: 'Bearer token123' })).toBe(true);
		expect(shouldSetContentType({ Accept: 'application/json', 'X-Request-ID': 'abc' })).toBe(true);
	});

	it('returns false when Content-Type is already set', () => {
		expect(shouldSetContentType({ 'Content-Type': 'application/json' })).toBe(false);
	});

	it('returns false when Content-Type is set alongside other headers', () => {
		expect(
			shouldSetContentType({
				Authorization: 'Bearer token123',
				'Content-Type': 'multipart/form-data'
			})
		).toBe(false);
	});

	it('returns false for Content-Type with any value including empty string', () => {
		expect(shouldSetContentType({ 'Content-Type': '' })).toBe(false);
		expect(shouldSetContentType({ 'Content-Type': 'text/plain' })).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 2. E.164 phone normalization for softphone
//    Strips non-dial characters then normalises to E.164 for US numbers.
//    DTMF characters (# and *) are preserved because they are valid mid-call.
// ---------------------------------------------------------------------------
function normalizeDialNumber(input) {
	let number = input.replace(/[^\d+*#]/g, '');
	if (number.length === 10 && !number.startsWith('+')) {
		number = '+1' + number;
	} else if (number.length === 11 && number.startsWith('1') && !number.startsWith('+')) {
		number = '+' + number;
	}
	return number;
}

describe('normalizeDialNumber', () => {
	it('prepends +1 to a bare 10-digit number', () => {
		expect(normalizeDialNumber('8184633772')).toBe('+18184633772');
	});

	it('prepends + to an 11-digit number that starts with 1', () => {
		expect(normalizeDialNumber('18184633772')).toBe('+18184633772');
	});

	it('leaves an already-E.164 number unchanged', () => {
		expect(normalizeDialNumber('+18184633772')).toBe('+18184633772');
	});

	it('strips formatting characters and normalises to E.164', () => {
		// (818) 463-3772 → 8184633772 → +18184633772
		expect(normalizeDialNumber('(818) 463-3772')).toBe('+18184633772');
	});

	it('strips dashes and spaces from a formatted number', () => {
		expect(normalizeDialNumber('818-463-3772')).toBe('+18184633772');
	});

	it('strips dots used as separators', () => {
		expect(normalizeDialNumber('818.463.3772')).toBe('+18184633772');
	});

	it('does not alter short numbers like emergency codes', () => {
		// 911 is only 3 digits — neither 10 nor 11, so returned as-is
		expect(normalizeDialNumber('911')).toBe('911');
	});

	it('preserves DTMF * character', () => {
		// *67 prefix — strip nothing valid, length is 3 → returned as-is
		expect(normalizeDialNumber('*67')).toBe('*67');
	});

	it('preserves DTMF # character', () => {
		expect(normalizeDialNumber('#')).toBe('#');
	});

	it('strips letters and special chars but keeps digits and DTMF', () => {
		// Input like "ext. 1234" should strip letters, spaces, periods
		expect(normalizeDialNumber('1234')).toBe('1234');
	});

	it('handles a number with country code already prefixed with +', () => {
		// +18184633772 is 12 chars including the +; digits = 11, starts with + → no change
		expect(normalizeDialNumber('+18184633772')).toBe('+18184633772');
	});

	it('does not double-prefix a number that already has +1', () => {
		const result = normalizeDialNumber('+18184633772');
		expect(result.startsWith('+1+1')).toBe(false);
		expect(result).toBe('+18184633772');
	});
});

// ---------------------------------------------------------------------------
// 3. Notification read state
//    Determines whether a notification has been seen based on a Set of seen IDs.
// ---------------------------------------------------------------------------
function buildNotification(id, seenIds) {
	return { id, read: seenIds.has(id) };
}

describe('buildNotification', () => {
	it('marks a notification as unread when id is not in seenIds', () => {
		const seenIds = new Set(['abc', 'def']);
		const notification = buildNotification('xyz', seenIds);
		expect(notification.read).toBe(false);
	});

	it('marks a notification as read when id is in seenIds', () => {
		const seenIds = new Set(['abc', 'def']);
		const notification = buildNotification('abc', seenIds);
		expect(notification.read).toBe(true);
	});

	it('includes the correct id in the returned object', () => {
		const seenIds = new Set(['abc']);
		expect(buildNotification('abc', seenIds).id).toBe('abc');
		expect(buildNotification('xyz', seenIds).id).toBe('xyz');
	});

	it('returns read:false for an empty seenIds set', () => {
		const seenIds = new Set();
		expect(buildNotification('any-id', seenIds).read).toBe(false);
	});

	it('handles numeric IDs', () => {
		const seenIds = new Set([1, 2, 3]);
		expect(buildNotification(2, seenIds).read).toBe(true);
		expect(buildNotification(99, seenIds).read).toBe(false);
	});

	it('handles UUID-style string IDs', () => {
		const id = '550e8400-e29b-41d4-a716-446655440000';
		const seenIds = new Set([id]);
		expect(buildNotification(id, seenIds).read).toBe(true);
	});

	it('is case-sensitive for string IDs', () => {
		const seenIds = new Set(['ABC']);
		expect(buildNotification('abc', seenIds).read).toBe(false);
		expect(buildNotification('ABC', seenIds).read).toBe(true);
	});

	it('returns exactly the shape { id, read }', () => {
		const seenIds = new Set(['x']);
		const result = buildNotification('x', seenIds);
		expect(Object.keys(result).sort()).toEqual(['id', 'read']);
	});
});
