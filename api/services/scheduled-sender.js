import twilio from 'twilio';
import { supabaseAdmin } from './supabase.js';

/**
 * Process due scheduled messages — send via Twilio and update status.
 * Called every 60s by setInterval in server.js.
 */
export async function processScheduledMessages() {
	const { data: due, error } = await supabaseAdmin
		.from('scheduled_messages')
		.select('*')
		.eq('status', 'pending')
		.lte('scheduled_at', new Date().toISOString())
		.order('scheduled_at', { ascending: true })
		.limit(10);

	if (error) {
		console.error('[scheduled] Failed to query due messages:', error.message);
		return;
	}

	if (!due || due.length === 0) return;

	const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
	const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.API_BASE_URL || '';
	const statusCallback = baseUrl ? baseUrl + '/api/webhooks/sms/status' : undefined;

	for (const msg of due) {
		const fromNumber =
			msg.from_number ||
			process.env.TWILIO_SMS_FROM_NUMBER ||
			process.env.TWILIO_TEST1_PHONE_NUMBER ||
			process.env.TWILIO_PHONE_NUMBER ||
			process.env.TWILIO_MAIN_PHONE_NUMBER;

		try {
			await client.messages.create({
				to: msg.to_number,
				from: fromNumber,
				body: msg.body,
				...(statusCallback && { statusCallback })
			});

			await supabaseAdmin
				.from('scheduled_messages')
				.update({
					status: 'sent',
					sent_at: new Date().toISOString()
				})
				.eq('id', msg.id);

			console.log('Scheduled send: to=' + msg.to_number + ' status=sent');
		} catch (err) {
			await supabaseAdmin
				.from('scheduled_messages')
				.update({
					status: 'failed',
					error_message: err.message
				})
				.eq('id', msg.id);

			console.log('Scheduled send: to=' + msg.to_number + ' status=failed');
		}
	}
}
