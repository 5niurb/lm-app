/**
 * Express middleware that restricts access to admin users.
 * Must be used after verifyToken (requires req.user.role).
 */
export function requireAdmin(req, res, next) {
	if (!req.user || req.user.role !== 'admin') {
		return res.status(403).json({ error: { code: 'forbidden', message: 'Admin access required' } });
	}
	next();
}
