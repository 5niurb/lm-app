import { Router } from 'express';
import { supabase } from '../services/supabase.js';
import { verifyToken } from '../middleware/auth.js';
import { apiError } from '../utils/responses.js';

const router = Router();

/**
 * POST /api/auth/login
 * Sign in with email and password via Supabase Auth.
 * Body: { email: string, password: string }
 */
router.post('/login', async (req, res) => {
	const { email, password } = req.body;

	if (!email || !password) {
		return apiError(res, 400, 'validation_error', 'Email and password are required');
	}

	try {
		const { data, error } = await supabase.auth.signInWithPassword({ email, password });

		if (error) {
			return apiError(res, 401, 'unauthorized', 'Invalid email or password');
		}

		return res.json({
			session: data.session,
			user: data.user
		});
	} catch (err) {
		console.error('Login error:', err.message);
		return apiError(res, 500, 'server_error', 'Internal server error');
	}
});

/**
 * POST /api/auth/verify-otp
 * Verify a one-time password sent to the user's email.
 * Body: { email: string, otp: string }
 * Skeleton: currently accepts '000000' as valid OTP for development.
 */
router.post('/verify-otp', async (req, res) => {
	const { email, otp } = req.body;

	if (!email || !otp) {
		return apiError(res, 400, 'validation_error', 'Email and OTP are required');
	}

	// OTP verification — dev bypass only in non-production
	if (process.env.NODE_ENV === 'production') {
		// TODO: Implement real OTP verification (check against stored OTP + expiry)
		return apiError(res, 501, 'not_implemented', 'OTP verification not yet implemented');
	}

	// Dev-only bypass
	if (otp !== '000000') {
		return apiError(res, 401, 'unauthorized', 'Invalid or expired OTP');
	}

	return res.json({
		success: true,
		message: 'OTP verified successfully',
		email
	});
});

/**
 * POST /api/auth/logout
 * Sign out the current user session.
 */
router.post('/logout', async (req, res) => {
	try {
		const { error } = await supabase.auth.signOut();

		if (error) {
			console.error('Logout error:', error.message);
			return apiError(res, 500, 'server_error', 'Logout failed');
		}

		return res.json({ success: true, message: 'Logged out successfully' });
	} catch (err) {
		console.error('Logout error:', err);
		return apiError(res, 500, 'server_error', 'Internal server error');
	}
});

/**
 * GET /api/auth/session
 * Get current user info for a valid session.
 * Requires valid Bearer token (verifyToken middleware).
 */
router.get('/session', verifyToken, (req, res) => {
	return res.json({
		user: req.user
	});
});

export default router;
