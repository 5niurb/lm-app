import { supabaseAdmin } from './supabase.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send a push notification to all registered Expo devices.
 * Fire-and-forget — errors are logged but never thrown.
 *
 * @param {object} params
 * @param {string} params.title - Notification title (e.g. sender name)
 * @param {string} params.body - Notification body (message preview)
 * @param {Record<string, unknown>} [params.data] - Payload for deep linking
 * @param {number} [params.badge] - Badge count
 */
export async function sendPushToAll({ title, body, data, badge }) {
	try {
		const { data: tokens, error } = await supabaseAdmin
			.from('device_push_tokens')
			.select('token')
			.eq('type', 'expo');

		if (error || !tokens?.length) return;

		const messages = tokens.map((t) => ({
			to: t.token,
			title,
			body: body?.substring(0, 200) || '',
			sound: 'default',
			...(badge != null && { badge }),
			...(data && { data })
		}));

		const res = await fetch(EXPO_PUSH_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(messages)
		});

		if (!res.ok) {
			console.error('[push] Expo API error:', res.status, await res.text());
		}
	} catch (err) {
		console.error('[push] Failed to send push notifications:', err.message);
	}
}
