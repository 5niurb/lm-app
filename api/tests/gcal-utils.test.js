/**
 * Tests for laTimeToISO — converts a YYYY-MM-DD + HH:MM:SS in
 * America/Los_Angeles timezone to an ISO 8601 UTC string.
 *
 * DST rules for America/Los_Angeles (Pacific time):
 *   PST  = UTC-8  (clocks fall back, winter)
 *   PDT  = UTC-7  (clocks spring forward, summer)
 *
 * 2026 transitions:
 *   Spring forward: 2026-03-08 02:00 PST → 03:00 PDT
 *   Fall back:      2026-11-01 02:00 PDT → 01:00 PST
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Inline the function under test exactly as it appears in google-calendar.js.
// We do NOT import from the module because it has side effects (googleapis auth)
// that require environment variables and would throw in a test environment.
// ---------------------------------------------------------------------------
const TIMEZONE = 'America/Los_Angeles';

function laTimeToISO(dateStr, time) {
	const naive = new Date(`${dateStr}T${time}`);
	const laStr = naive.toLocaleString('en-US', { timeZone: TIMEZONE });
	const utcMs = naive.getTime() - (new Date(laStr).getTime() - naive.getTime());
	return new Date(utcMs).toISOString();
}

// ---------------------------------------------------------------------------
// Helper: parse the UTC hour from an ISO string
// ---------------------------------------------------------------------------
function utcHour(iso) {
	return new Date(iso).getUTCHours();
}
function utcMinute(iso) {
	return new Date(iso).getUTCMinutes();
}
function utcSecond(iso) {
	return new Date(iso).getUTCSeconds();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('laTimeToISO', () => {
	// -----------------------------------------------------------------------
	// 1. PST — winter date (UTC-8): midnight LA = 08:00 UTC
	// -----------------------------------------------------------------------
	it('PST winter date: midnight LA (2026-01-15 00:00:00) should be 08:00 UTC', () => {
		const result = laTimeToISO('2026-01-15', '00:00:00');
		assert.equal(utcHour(result), 8, `Expected UTC hour 8, got ${utcHour(result)} — full ISO: ${result}`);
		assert.equal(utcMinute(result), 0);
		assert.equal(utcSecond(result), 0);
	});

	// -----------------------------------------------------------------------
	// 2. PDT — summer date (UTC-7): midnight LA = 07:00 UTC
	// -----------------------------------------------------------------------
	it('PDT summer date: midnight LA (2026-07-15 00:00:00) should be 07:00 UTC', () => {
		const result = laTimeToISO('2026-07-15', '00:00:00');
		assert.equal(utcHour(result), 7, `Expected UTC hour 7, got ${utcHour(result)} — full ISO: ${result}`);
		assert.equal(utcMinute(result), 0);
		assert.equal(utcSecond(result), 0);
	});

	// -----------------------------------------------------------------------
	// 3. DST spring-forward boundary: 2026-03-08
	//    Before 02:00 the offset is PST (UTC-8); at/after 02:00 it is PDT (UTC-7).
	//    Midnight on that day is still in PST → 08:00 UTC.
	//    11:00 on that day is in PDT → 18:00 UTC.
	// -----------------------------------------------------------------------
	it('DST spring-forward day: midnight LA (2026-03-08 00:00:00) should be 08:00 UTC (PST)', () => {
		const result = laTimeToISO('2026-03-08', '00:00:00');
		assert.equal(utcHour(result), 8, `Expected UTC hour 8 (PST), got ${utcHour(result)} — full ISO: ${result}`);
	});

	it('DST spring-forward day: 11:00 LA (2026-03-08 11:00:00) should be 18:00 UTC (PDT)', () => {
		const result = laTimeToISO('2026-03-08', '11:00:00');
		assert.equal(utcHour(result), 18, `Expected UTC hour 18 (PDT), got ${utcHour(result)} — full ISO: ${result}`);
	});

	// -----------------------------------------------------------------------
	// 4. DST fall-back boundary: 2026-11-01
	//    Clocks fall back at 02:00 PDT → 01:00 PST.
	//    Midnight is in PDT (UTC-7) → 07:00 UTC.
	//    15:00 is well after the transition (PST, UTC-8) → 23:00 UTC.
	// -----------------------------------------------------------------------
	it('DST fall-back day: midnight LA (2026-11-01 00:00:00) should be 07:00 UTC (PDT)', () => {
		const result = laTimeToISO('2026-11-01', '00:00:00');
		assert.equal(utcHour(result), 7, `Expected UTC hour 7 (PDT), got ${utcHour(result)} — full ISO: ${result}`);
	});

	it('DST fall-back day: 15:00 LA (2026-11-01 15:00:00) should be 23:00 UTC (PST)', () => {
		const result = laTimeToISO('2026-11-01', '15:00:00');
		assert.equal(utcHour(result), 23, `Expected UTC hour 23 (PST), got ${utcHour(result)} — full ISO: ${result}`);
	});

	// -----------------------------------------------------------------------
	// 5. End-of-day PST (23:59:59) — offset UTC-8 → next calendar day 07:59:59 UTC
	// -----------------------------------------------------------------------
	it('End-of-day PST (2026-01-15 23:59:59) should be 07:59:59 the next day UTC', () => {
		const result = laTimeToISO('2026-01-15', '23:59:59');
		const d = new Date(result);
		assert.equal(d.getUTCDate(), 16, `Expected UTC day 16, got ${d.getUTCDate()} — full ISO: ${result}`);
		assert.equal(d.getUTCHours(), 7, `Expected UTC hour 7, got ${d.getUTCHours()} — full ISO: ${result}`);
		assert.equal(d.getUTCMinutes(), 59);
		assert.equal(d.getUTCSeconds(), 59);
	});

	// -----------------------------------------------------------------------
	// 6. End-of-day PDT (23:59:59) — offset UTC-7 → next calendar day 06:59:59 UTC
	// -----------------------------------------------------------------------
	it('End-of-day PDT (2026-07-15 23:59:59) should be 06:59:59 the next day UTC', () => {
		const result = laTimeToISO('2026-07-15', '23:59:59');
		const d = new Date(result);
		assert.equal(d.getUTCDate(), 16, `Expected UTC day 16, got ${d.getUTCDate()} — full ISO: ${result}`);
		assert.equal(d.getUTCHours(), 6, `Expected UTC hour 6, got ${d.getUTCHours()} — full ISO: ${result}`);
		assert.equal(d.getUTCMinutes(), 59);
		assert.equal(d.getUTCSeconds(), 59);
	});

	// -----------------------------------------------------------------------
	// 7. Return value is a valid ISO 8601 string
	// -----------------------------------------------------------------------
	it('Return value is a valid ISO 8601 string ending in Z', () => {
		const result = laTimeToISO('2026-01-15', '09:30:00');
		assert.match(result, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, `Not a valid ISO string: ${result}`);
	});

	// -----------------------------------------------------------------------
	// 8. Mid-day PST sanity check: 12:00 LA (UTC-8) = 20:00 UTC
	// -----------------------------------------------------------------------
	it('Mid-day PST (2026-02-10 12:00:00) should be 20:00 UTC', () => {
		const result = laTimeToISO('2026-02-10', '12:00:00');
		assert.equal(utcHour(result), 20, `Expected UTC hour 20, got ${utcHour(result)} — full ISO: ${result}`);
	});

	// -----------------------------------------------------------------------
	// 9. Mid-day PDT sanity check: 12:00 LA (UTC-7) = 19:00 UTC
	// -----------------------------------------------------------------------
	it('Mid-day PDT (2026-08-20 12:00:00) should be 19:00 UTC', () => {
		const result = laTimeToISO('2026-08-20', '12:00:00');
		assert.equal(utcHour(result), 19, `Expected UTC hour 19, got ${utcHour(result)} — full ISO: ${result}`);
	});
});
