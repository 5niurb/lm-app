import twilio from 'twilio';

/**
 * Middleware that validates the X-Twilio-Signature header on incoming webhook
 * requests. This ensures the request genuinely originated from Twilio, preventing
 * spoofed webhook payloads.
 *
 * If TWILIO_AUTH_TOKEN is not set, validation is skipped with a console warning
 * (safe for local development but noisy enough to notice in production).
 *
 * NOTE: Only apply this to routes that receive DIRECT Twilio callbacks
 * (statusCallbacks, recordingStatusCallbacks, etc.). Routes called from
 * Twilio Studio's HTTP Request widget do NOT carry a signature and should
 * NOT use this middleware.
 */
export function validateTwilioSignature(req, res, next) {
	const authToken = process.env.TWILIO_AUTH_TOKEN;
	if (!authToken) {
		console.warn('[twilio-sig] TWILIO_AUTH_TOKEN not set — skipping signature validation');
		return next();
	}

	const signature = req.headers['x-twilio-signature'];
	if (!signature) {
		return res.status(403).send('Forbidden');
	}

	// Build the full URL Twilio used to sign the request.
	// In production behind a proxy/load-balancer, RENDER_EXTERNAL_URL or
	// API_BASE_URL must be set so the reconstructed URL matches what Twilio signed.
	const baseUrl =
		process.env.RENDER_EXTERNAL_URL ||
		process.env.API_BASE_URL ||
		`${req.protocol}://${req.get('host')}`;
	const fullUrl = `${baseUrl}${req.originalUrl}`;

	const isValid = twilio.validateRequest(authToken, signature, fullUrl, req.body || {});

	if (!isValid) {
		console.warn('[twilio-sig] Invalid signature for', req.method, req.originalUrl);
		return res.status(403).send('Forbidden');
	}

	next();
}
