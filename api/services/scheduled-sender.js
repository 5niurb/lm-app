import twilio from 'twilio';
import { supabaseAdmin } from './supabase.js';
import { findConversation, normalizePhone } from './phone-lookup.js';

/**
 * Process due scheduled messages — send via Twilio and update status.
 * Called every 60s by setInterval in server.js.
 */
export async function processScheduledMessages() {
	const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
	const { data: due, error } = await supabaseAdmin
		.from('scheduled_messages')
		.select('*')
		.eq('status', 'pending')
		.lte('scheduled_at', new Date().toISOString())
		.lt('retry_count', 3)
		.lte('updated_at', fiveMinAgo)
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
			const twilioMsg = await client.messages.create({
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

			// Link to conversation — find existing or create new
			let convId = msg.conversation_id;
			if (!convId) {
				const existingConv = await findConversation(msg.to_number);
				if (existingConv) {
					convId = existingConv.id;
				} else {
					const toNorm = normalizePhone(msg.to_number);
					const phoneDigits = toNorm.replace(/\D/g, '');
					const { data: contact } = await supabaseAdmin
						.from('contacts')
						.select('id, full_name')
						.or(`phone_normalized.eq.${phoneDigits},phone.eq.${toNorm}`)
						.limit(1)
						.maybeSingle();

					const { data: newConv } = await supabaseAdmin
						.from('conversations')
						.insert({
							phone_number: toNorm,
							twilio_number: fromNumber || null,
							display_name: contact?.full_name || null,
							contact_id: contact?.id || null,
							last_message: msg.body,
							last_at: new Date().toISOString()
						})
						.select('id')
						.single();

					convId = newConv?.id;
				}
			}

			// Insert message into conversation thread
			if (convId) {
				const { error: msgErr } = await supabaseAdmin.from('messages').insert({
					conversation_id: convId,
					direction: 'outbound',
					body: msg.body,
					from_number: fromNumber,
					to_number: msg.to_number,
					twilio_sid: twilioMsg.sid,
					status: twilioMsg.status || 'sent',
					metadata: { source: 'scheduled', scheduled_message_id: msg.id }
				});

				if (msgErr) {
					console.error('[scheduled] Failed to insert message:', msgErr.message);
				}

				// Update conversation last_message and last_at
				await supabaseAdmin
					.from('conversations')
					.update({
						last_message: msg.body,
						last_at: new Date().toISOString(),
						status: 'active'
					})
					.eq('id', convId);
			}

			console.log('Scheduled send: to=' + msg.to_number + ' status=sent');
		} catch (err) {
			const newRetryCount = (msg.retry_count || 0) + 1;
			const permanently = newRetryCount >= 3;

			await supabaseAdmin
				.from('scheduled_messages')
				.update({
					retry_count: newRetryCount,
					error_message: err.message,
					...(permanently && { status: 'failed' })
				})
				.eq('id', msg.id);

			console.log(
				'Scheduled send: to=' +
					msg.to_number +
					' status=' +
					(permanently ? 'failed' : 'retry-' + newRetryCount)
			);
		}
	}
}
