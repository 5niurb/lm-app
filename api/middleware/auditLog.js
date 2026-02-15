import { supabaseAdmin } from '../services/supabase.js';

/**
 * Middleware factory that logs actions to the audit_log table after the response is sent.
 * Usage: router.get('/calls', verifyToken, logAction('calls.list'), handler)
 *
 * @param {string} action - A dot-notation action name (e.g. 'calls.list', 'calls.create')
 * @returns {import('express').RequestHandler}
 */
export function logAction(action) {
	return function auditLogMiddleware(req, res, next) {
		// Log after the response has been sent so we don't block the response
		res.on('finish', () => {
			const userId = req.user?.id || null;
			const resourceType = action.split('.')[0] || null;
			const resourceId = req.params?.id || null;
			const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
			const userAgent = req.headers['user-agent'] || null;

			const metadata = {
				method: req.method,
				path: req.originalUrl,
				statusCode: res.statusCode
			};

			// Fire-and-forget — do not await, do not block
			supabaseAdmin
				.from('audit_log')
				.insert({
					user_id: userId,
					action,
					resource_type: resourceType,
					resource_id: resourceId,
					ip_address: ipAddress,
					user_agent: userAgent,
					metadata
				})
				.then(({ error }) => {
					if (error) {
						console.error('Audit log insert failed:', error.message);
					}
				})
				.catch((err) => {
					console.error('Audit log insert exception:', err.message);
				});
		});

		next();
	};
}
