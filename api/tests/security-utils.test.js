/**
 * Unit tests for security utility functions.
 *
 * Functions under test are defined inline in route files and not exported,
 * so implementations are copied here verbatim for isolated unit testing.
 *
 * Run with: node --test api/tests/security-utils.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

// ---------------------------------------------------------------------------
// Implementations under test (copied verbatim from source files)
// ---------------------------------------------------------------------------

/**
 * From api/routes/contacts.js and api/routes/services.js
 * Sanitize search input for Supabase .or() filter — strips PostgREST operators
 */
function sanitizeSearch(input) {
	return String(input).replace(/[,.()[\]{}]/g, '');
}

/**
 * From api/services/automation.js
 * HTML entity encoding to prevent XSS in email content
 */
function escHtml(str) {
	return String(str ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// sanitizeSearch tests
// ---------------------------------------------------------------------------

describe('sanitizeSearch', () => {
	// Happy path — normal search terms

	it('passes through a plain name unchanged', () => {
		assert.strictEqual(sanitizeSearch('Jane'), 'Jane');
	});

	it('passes through a full name with a space', () => {
		assert.strictEqual(sanitizeSearch('Jane Smith'), 'Jane Smith');
	});

	it('passes through a phone number with dashes', () => {
		assert.strictEqual(sanitizeSearch('818-463-3772'), '818-463-3772');
	});

	it('passes through an email address', () => {
		assert.strictEqual(sanitizeSearch('jane@example.com'), 'jane@examplecom');
		// Note: the dot in the domain IS stripped by design (dot is in the strip list)
	});

	it('passes through a hyphenated name', () => {
		assert.strictEqual(sanitizeSearch('Mary-Jane'), 'Mary-Jane');
	});

	it('passes through an apostrophe (not in strip list)', () => {
		assert.strictEqual(sanitizeSearch("O'Brien"), "O'Brien");
	});

	it('passes through numbers', () => {
		assert.strictEqual(sanitizeSearch('12345'), '12345');
	});

	it('passes through at-sign and underscore', () => {
		assert.strictEqual(sanitizeSearch('user_name@host'), 'user_name@host');
	});

	// Injection character stripping

	it('strips comma (PostgREST filter separator)', () => {
		assert.strictEqual(sanitizeSearch('foo,bar'), 'foobar');
	});

	it('strips period / dot', () => {
		assert.strictEqual(sanitizeSearch('foo.bar'), 'foobar');
	});

	it('strips opening parenthesis', () => {
		assert.strictEqual(sanitizeSearch('foo(bar'), 'foobar');
	});

	it('strips closing parenthesis', () => {
		assert.strictEqual(sanitizeSearch('foo)bar'), 'foobar');
	});

	it('strips opening square bracket', () => {
		assert.strictEqual(sanitizeSearch('foo[bar'), 'foobar');
	});

	it('strips closing square bracket', () => {
		assert.strictEqual(sanitizeSearch('foo]bar'), 'foobar');
	});

	it('strips opening curly brace', () => {
		assert.strictEqual(sanitizeSearch('foo{bar'), 'foobar');
	});

	it('strips closing curly brace', () => {
		assert.strictEqual(sanitizeSearch('foo}bar'), 'foobar');
	});

	it('strips all injection chars from a crafted injection payload', () => {
		// Attempt to inject an extra filter clause via .or()
		const payload = 'a,id.eq.1)or(1.eq.1';
		assert.strictEqual(sanitizeSearch(payload), 'aideq1or1eq1');
	});

	it('strips all injection chars in a single pass', () => {
		assert.strictEqual(sanitizeSearch(',(.[.{.}.).].,'), '');
	});

	// Edge cases

	it('returns empty string for empty string input', () => {
		assert.strictEqual(sanitizeSearch(''), '');
	});

	it('converts a number to its string representation', () => {
		assert.strictEqual(sanitizeSearch(42), '42');
	});

	it('converts null to the string "null"', () => {
		// String(null) === 'null' — the function coerces via String()
		assert.strictEqual(sanitizeSearch(null), 'null');
	});

	it('converts undefined to the string "undefined"', () => {
		assert.strictEqual(sanitizeSearch(undefined), 'undefined');
	});

	it('handles a string of only injection characters — returns empty string', () => {
		assert.strictEqual(sanitizeSearch(',.()[]{}'), '');
	});

	it('handles a very long string without performance issues', () => {
		const long = 'a'.repeat(10000) + ',' + 'b'.repeat(10000);
		const result = sanitizeSearch(long);
		assert.strictEqual(result.length, 20000); // comma removed
		assert.ok(!result.includes(','));
	});

	it('leaves non-ASCII characters (accented names) alone', () => {
		assert.strictEqual(sanitizeSearch('Chloé'), 'Chloé');
	});

	it('strips dot from a dot-only search', () => {
		assert.strictEqual(sanitizeSearch('.'), '');
	});
});

// ---------------------------------------------------------------------------
// escHtml tests
// ---------------------------------------------------------------------------

describe('escHtml', () => {
	// Happy path — safe text

	it('returns plain text unchanged', () => {
		assert.strictEqual(escHtml('Hello world'), 'Hello world');
	});

	it('returns an empty string unchanged', () => {
		assert.strictEqual(escHtml(''), '');
	});

	it('returns alphanumeric characters unchanged', () => {
		assert.strictEqual(escHtml('abc123'), 'abc123');
	});

	it('preserves spaces, dashes, and underscores', () => {
		assert.strictEqual(escHtml('Le Med Spa - Encino_CA'), 'Le Med Spa - Encino_CA');
	});

	// HTML entity escaping

	it('escapes ampersand', () => {
		assert.strictEqual(escHtml('A & B'), 'A &amp; B');
	});

	it('escapes less-than sign', () => {
		assert.strictEqual(escHtml('<script>'), '&lt;script&gt;');
	});

	it('escapes greater-than sign', () => {
		assert.strictEqual(escHtml('a > b'), 'a &gt; b');
	});

	it('escapes double quotes', () => {
		assert.strictEqual(escHtml('"quoted"'), '&quot;quoted&quot;');
	});

	it('escapes all four special characters in one pass', () => {
		assert.strictEqual(escHtml('& < > "'), '&amp; &lt; &gt; &quot;');
	});

	// XSS payloads

	it('escapes a basic script tag XSS payload', () => {
		const result = escHtml('<script>alert("xss")</script>');
		assert.ok(!result.includes('<script>'), 'should not contain raw <script>');
		assert.ok(!result.includes('</script>'), 'should not contain raw </script>');
		assert.strictEqual(result, '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
	});

	it('escapes an img onerror XSS payload', () => {
		const result = escHtml('<img src=x onerror="alert(1)">');
		assert.ok(!result.includes('<img'), 'should not contain raw <img');
		assert.strictEqual(result, '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
	});

	it('escapes a nested quotes payload', () => {
		const result = escHtml('" onmouseover="evil()"');
		assert.strictEqual(result, '&quot; onmouseover=&quot;evil()&quot;');
	});

	it('escapes ampersand-first to avoid double-encoding', () => {
		// If the regex order were wrong, & in &amp; would be re-encoded
		// The implementation replaces & first, so this should yield &amp;amp;
		// when input is already &amp; — confirm no double-encoding of plain &
		const result = escHtml('AT&T');
		assert.strictEqual(result, 'AT&amp;T');
	});

	it('does not double-encode — plain & becomes &amp; not &amp;amp;', () => {
		// Pass the result of one escHtml call back in (simulate double-call scenario)
		// The first call converts & to &amp;
		// The second call would convert & in &amp; to &amp;amp; — this is expected behavior
		// but let us confirm the single-call behavior is correct
		const once = escHtml('&');
		assert.strictEqual(once, '&amp;');
	});

	// Null / undefined / non-string inputs

	it('returns empty string for null', () => {
		assert.strictEqual(escHtml(null), '');
	});

	it('returns empty string for undefined', () => {
		assert.strictEqual(escHtml(undefined), '');
	});

	it('converts a number to its string representation', () => {
		assert.strictEqual(escHtml(42), '42');
	});

	it('converts false to "false"', () => {
		assert.strictEqual(escHtml(false), 'false');
	});

	it('handles a very long string without performance issues', () => {
		const long = '<'.repeat(5000) + 'safe' + '>'.repeat(5000);
		const result = escHtml(long);
		assert.ok(!result.includes('<'), 'result must not contain raw <');
		assert.ok(!result.includes('>'), 'result must not contain raw >');
		assert.ok(result.includes('&lt;'), 'result must contain &lt;');
		assert.ok(result.includes('&gt;'), 'result must contain &gt;');
	});

	it('handles a string with only special characters', () => {
		assert.strictEqual(escHtml('<>&"'), '&lt;&gt;&amp;&quot;');
	});

	it('handles unicode / non-ASCII characters unchanged', () => {
		assert.strictEqual(escHtml('Chloé Müller'), 'Chloé Müller');
	});

	it('handles newlines and tabs unchanged', () => {
		assert.strictEqual(escHtml('line1\nline2\ttabbed'), 'line1\nline2\ttabbed');
	});

	it('preserves single quotes (not in the escape list)', () => {
		// Single quotes are NOT escaped by this implementation — confirm they pass through
		assert.strictEqual(escHtml("it's fine"), "it's fine");
	});
});
