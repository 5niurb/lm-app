import Twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

// Initialize Twilio client — will be null if credentials are not set
export const twilioClient =
	accountSid && authToken ? new Twilio.Twilio(accountSid, authToken) : null;

/**
 * Validate that an incoming request is genuinely from Twilio.
 * Uses Twilio's request validation to verify the X-Twilio-Signature header.
 *
 * @param {import('express').Request} req - Express request object
 * @returns {boolean} true if the signature is valid, false otherwise
 */
export function validateTwilioSignature(req) {
	if (!authToken) {
		console.warn('TWILIO_AUTH_TOKEN not set — cannot validate Twilio signature');
		return false;
	}

	const signature = req.headers['x-twilio-signature'];
	if (!signature) {
		return false;
	}

	// Build the full URL Twilio used to sign the request
	const protocol = req.headers['x-forwarded-proto'] || req.protocol;
	const host = req.headers.host;
	const url = `${protocol}://${host}${req.originalUrl}`;

	// req.body contains the URL-encoded parameters parsed by express.urlencoded
	const params = req.body || {};

	return Twilio.validateRequest(authToken, signature, url, params);
}
