import { supabaseAdmin } from '../services/supabase.js';

/**
 * Extract the client IP address from the request.
 * Checks x-forwarded-for header first (for reverse proxies), then falls back to req.ip.
 */
function getClientIp(req) {
	const forwarded = req.headers['x-forwarded-for'];
	if (forwarded) {
		// x-forwarded-for can be a comma-separated list; first entry is the original client
		return forwarded.split(',')[0].trim();
	}
	return req.ip;
}

/**
 * Express middleware that restricts access by IP address.
 * - If no allowed IPs are configured, everyone passes through (feature disabled).
 * - Admins always pass through regardless of IP.
 * - Non-admins with an IP not in the allowed list receive 403.
 */
export async function checkGeoRestriction(req, res, next) {
	// Admins always pass through
	if (req.user && req.user.role === 'admin') {
		return next();
	}

	let allowedIps = [];

	// Try to read allowed IPs from the settings table
	try {
		const { data, error } = await supabaseAdmin
			.from('settings')
			.select('value')
			.eq('key', 'allowed_ips')
			.single();

		if (!error && data && Array.isArray(data.value)) {
			allowedIps = data.value;
		}
	} catch (err) {
		// If settings table doesn't exist or query fails, allow all traffic
		console.warn('Could not read allowed IPs from settings, allowing all:', err.message);
	}

	// If the allowed list is empty, the restriction is disabled — everyone passes
	if (allowedIps.length === 0) {
		return next();
	}

	const clientIp = getClientIp(req);

	if (!allowedIps.includes(clientIp)) {
		return res.status(403).json({
			error: 'Access denied',
			message: 'Your IP address is not authorized to access this system.'
		});
	}

	next();
}
