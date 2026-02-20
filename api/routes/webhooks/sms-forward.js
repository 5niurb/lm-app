/**
 * Fire-and-forget forwarding of Twilio SMS webhooks to TextMagic.
 * Used during parallel operation period — remove when TextMagic is retired.
 *
 * If TEXTMAGIC_WEBHOOK_URL env var is empty/unset, forwarding is skipped.
 * Failures are logged but never block the caller.
 */

/**
 * Forward a Twilio SMS webhook payload to TextMagic.
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
			body: params,
		});
		if (!resp.ok) {
			console.warn('[sms-forward] TextMagic returned', resp.status, resp.statusText);
		}
	} catch (err) {
		console.error('[sms-forward] TextMagic forwarding failed:', err.message);
	}
}
