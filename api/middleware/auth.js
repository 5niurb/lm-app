import { supabase, supabaseAdmin } from '../services/supabase.js';

/**
 * Express middleware that verifies a Supabase JWT from the Authorization header.
 * On success, attaches user info (id, email, role) to req.user.
 * On failure, returns 401 Unauthorized.
 */
export async function verifyToken(req, res, next) {
	const authHeader = req.headers.authorization;

	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return res.status(401).json({ error: 'Missing or malformed Authorization header' });
	}

	const token = authHeader.slice(7); // strip "Bearer "

	try {
		// Verify the token with Supabase Auth
		const {
			data: { user },
			error
		} = await supabase.auth.getUser(token);

		if (error || !user) {
			return res.status(401).json({ error: 'Invalid or expired token' });
		}

		// Fetch the user's profile (including role) from the profiles table
		const { data: profile, error: profileError } = await supabaseAdmin
			.from('profiles')
			.select('role')
			.eq('id', user.id)
			.single();

		if (profileError) {
			console.error('Failed to fetch user profile:', profileError.message);
			// Still allow through — default to 'staff' role if profile is missing
		}

		req.user = {
			id: user.id,
			email: user.email,
			role: profile?.role || 'staff'
		};

		next();
	} catch (err) {
		console.error('Token verification error:', err);
		return res.status(401).json({ error: 'Authentication failed' });
	}
}
