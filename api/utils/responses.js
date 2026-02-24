/**
 * Send a standardized API error response.
 *
 * Format: { error: { code, message, details? } }
 *
 * @param {import('express').Response} res
 * @param {number} status - HTTP status code
 * @param {string} code - Machine-readable error code (e.g. 'validation_error')
 * @param {string} message - Human-readable error message
 * @param {Array} [details] - Optional field-level error details
 * @returns {import('express').Response}
 */
export function apiError(res, status, code, message, details) {
	const body = { error: { code, message } };
	if (details) body.error.details = details;
	return res.status(status).json(body);
}
