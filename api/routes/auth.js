import { Router } from 'express';
import { supabase } from '../services/supabase.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/auth/login
 * Sign in with email and password via Supabase Auth.
 * Body: { email: string, password: string }
 */
router.post('/login', async (req, res) => {
	const { email, password } = req.body;

	if (!email || !password) {
		return res.status(400).json({ error: 'Email and password are required' });
	}

	try {
		const { data, error } = await supabase.auth.signInWithPassword({ email, password });

		if (error) {
			return res.status(401).json({ error: error.message });
		}

		return res.json({
			session: data.session,
			user: data.user
		});
	} catch (err) {
		console.error('Login error:', err);
		return res.status(500).json({ error: 'Internal server error' });
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
		return res.status(400).json({ error: 'Email and OTP are required' });
	}

	// Skeleton OTP verification — accepts '000000' for development
	// TODO: Replace with real OTP verification (check against stored OTP + expiry)
	if (otp !== '000000') {
		return res.status(401).json({ error: 'Invalid or expired OTP' });
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
			return res.status(500).json({ error: 'Logout failed' });
		}

		return res.json({ success: true, message: 'Logged out successfully' });
	} catch (err) {
		console.error('Logout error:', err);
		return res.status(500).json({ error: 'Internal server error' });
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
