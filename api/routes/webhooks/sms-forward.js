/**
 * TextMagic bridge — used during parallel operation period.
 * Remove when TextMagic is retired.
 *
 * - forwardToTextMagic:  forwards inbound Twilio webhooks to TextMagic
 * - sendSmsViaTextMagic: sends outbound SMS through TextMagic's API
 */

const TM_BASE = 'https://rest.textmagic.com/api/v2';

/**
 * Forward a Twilio SMS webhook payload to TextMagic (inbound messages).
 * If TEXTMAGIC_WEBHOOK_URL env var is empty/unset, forwarding is skipped.
 * @param {Record<string, string>} body - The original Twilio POST params
 */
export async function forwardToTextMagic(body) {
	const url = process.env.TEXTMAGIC_WEBHOOK_URL;
	if (!url) return;

	try {
		const params = new URLSearchParams(body).toString();
		const resp = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: params
		});
		if (!resp.ok) {
			console.warn('[sms-forward] TextMagic returned', resp.status, resp.statusText);
		}
	} catch (err) {
		console.error('[sms-forward] TextMagic forwarding failed:', err.message);
	}
}

/**
 * Send an SMS through TextMagic's REST API (outbound messages).
 * Returns { id, sessionId } on success, or null if TextMagic is not configured.
 *
 * @param {{ to: string, text: string }} opts
 * @returns {Promise<{ id: string, sessionId: string } | null>}
 */
export async function sendSmsViaTextMagic({ to, text }) {
	const apiKey = process.env.TEXTMAGIC_API_KEY;
	const username = process.env.TEXTMAGIC_USERNAME;
	if (!apiKey || !username) return null;

	// TextMagic wants digits only, no leading +
	const phones = to.replace(/\D/g, '');

	const resp = await fetch(`${TM_BASE}/messages`, {
		method: 'POST',
		headers: {
			'X-TM-Username': username,
			'X-TM-Key': apiKey,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({ text, phones }).toString()
	});

	if (!resp.ok) {
		const errBody = await resp.text();
		throw new Error(`TextMagic API ${resp.status}: ${errBody}`);
	}

	return resp.json();
}
