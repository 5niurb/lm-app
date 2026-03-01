import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { supabaseAdmin } from '../services/supabase.js';

const router = Router();

router.use(verifyToken);

/**
 * POST /api/push-tokens
 * Register an Expo push token for the authenticated user.
 * Body: { token: string, platform: 'ios' | 'android' }
 */
router.post('/', async (req, res) => {
	const { token, platform } = req.body;
	const userId = req.user.id;

	if (!token || !platform) {
		return res.status(400).json({ error: 'token and platform are required' });
	}
	if (!['ios', 'android'].includes(platform)) {
		return res.status(400).json({ error: 'platform must be ios or android' });
	}

	try {
		const { error } = await supabaseAdmin.from('device_push_tokens').upsert(
			{
				user_id: userId,
				token,
				platform,
				type: 'expo',
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'user_id,platform,type' }
		);

		if (error) {
			console.error('[push-tokens] Upsert failed:', error.message);
			return res.status(500).json({ error: 'Failed to register token' });
		}

		res.json({ registered: true });
	} catch (err) {
		console.error('[push-tokens] Error:', err.message);
		res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;
