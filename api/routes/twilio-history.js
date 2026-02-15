import { Router } from 'express';
import twilio from 'twilio';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { supabaseAdmin } from '../services/supabase.js';

const router = Router();
router.use(verifyToken);

/**
 * GET /api/twilio-history/numbers
 * List all phone numbers on the Twilio account.
 */
router.get('/numbers', logAction('twilio.numbers'), async (req, res) => {
	try {
		const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
		const numbers = await client.incomingPhoneNumbers.list();

		const data = numbers.map((n) => ({
			sid: n.sid,
			phoneNumber: n.phoneNumber,
			friendlyName: n.friendlyName,
			capabilities: n.capabilities
		}));

		return res.json({ data });
	} catch (err) {
		console.error('Failed to list Twilio numbers:', err.message);
		return res.status(500).json({ error: 'Failed to fetch Twilio phone numbers' });
	}
});

/**
 * POST /api/twilio-history/sync
 * Sync message and call history from Twilio into the app DB.
 *
 * Body: { phoneNumber?: string, since?: string }
 * - phoneNumber: specific Twilio number to sync (optional, syncs all if omitted)
 * - since: ISO date string for how far back to sync (default: 90 days)
 */
router.post('/sync', logAction('twilio.sync'), async (req, res) => {
	const { phoneNumber, since } = req.body;
	const sinceDate = since ? new Date(since) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

	try {
		const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

		// Determine which numbers to sync
		let numbersToSync = [];
		if (phoneNumber) {
			numbersToSync = [phoneNumber];
		} else {
			const numbers = await client.incomingPhoneNumbers.list();
			numbersToSync = numbers.map((n) => n.phoneNumber);
		}

		let totalMessages = 0;
		let newMessages = 0;
		let totalCalls = 0;
		let newCalls = 0;

		for (const number of numbersToSync) {
			// ── Sync Messages ──
			const [outboundMsgs, inboundMsgs] = await Promise.all([
				client.messages.list({ from: number, dateSentAfter: sinceDate, limit: 1000 }),
				client.messages.list({ to: number, dateSentAfter: sinceDate, limit: 1000 })
			]);

			const allMessages = [...outboundMsgs, ...inboundMsgs];
			totalMessages += allMessages.length;

			// Dedup: check existing SIDs in batches of 200
			const existingSids = new Set();
			const msgSids = allMessages.map((m) => m.sid);
			for (let i = 0; i < msgSids.length; i += 200) {
				const batch = msgSids.slice(i, i + 200);
				const { data } = await supabaseAdmin
					.from('messages')
					.select('twilio_sid')
					.in('twilio_sid', batch);
				(data || []).forEach((r) => existingSids.add(r.twilio_sid));
			}

			// Group new messages by conversation (remote + twilio number)
			/** @type {Record<string, { remoteNumber: string, msgs: Array<{msg: any, direction: string}> }>} */
			const convMap = {};
			for (const msg of allMessages) {
				if (existingSids.has(msg.sid)) continue;
				const direction = msg.from === number ? 'outbound' : 'inbound';
				const remoteNumber = direction === 'outbound' ? msg.to : msg.from;
				const key = `${remoteNumber}|${number}`;
				if (!convMap[key]) convMap[key] = { remoteNumber, msgs: [] };
				convMap[key].msgs.push({ msg, direction });
			}

			// Process each conversation group
			for (const group of Object.values(convMap)) {
				const convId = await findOrCreateConversation(group.remoteNumber, number);
				if (!convId) continue;

				// Sort by date ascending
				group.msgs.sort(
					(a, b) => new Date(a.msg.dateCreated).getTime() - new Date(b.msg.dateCreated).getTime()
				);

				// Batch insert messages (100 at a time)
				const inserts = group.msgs.map(({ msg, direction }) => ({
					conversation_id: convId,
					direction,
					body: msg.body || '',
					from_number: msg.from,
					to_number: msg.to,
					twilio_sid: msg.sid,
					status: mapTwilioMsgStatus(msg.status),
					created_at: msg.dateCreated?.toISOString() || new Date().toISOString()
				}));

				for (let i = 0; i < inserts.length; i += 100) {
					const { error } = await supabaseAdmin.from('messages').insert(inserts.slice(i, i + 100));
					if (!error) newMessages += Math.min(100, inserts.length - i);
				}

				// Update conversation with latest message
				const latest = group.msgs[group.msgs.length - 1].msg;
				await supabaseAdmin
					.from('conversations')
					.update({
						last_message: (latest.body || '').substring(0, 200),
						last_at: latest.dateCreated?.toISOString() || new Date().toISOString()
					})
					.eq('id', convId);
			}

			// ── Sync Calls ──
			const [outboundCalls, inboundCalls] = await Promise.all([
				client.calls.list({ from: number, startTimeAfter: sinceDate, limit: 1000 }),
				client.calls.list({ to: number, startTimeAfter: sinceDate, limit: 1000 })
			]);

			const allCalls = [...outboundCalls, ...inboundCalls];
			totalCalls += allCalls.length;

			// Dedup calls
			const existingCallSids = new Set();
			const callSids = allCalls.map((c) => c.sid);
			for (let i = 0; i < callSids.length; i += 200) {
				const batch = callSids.slice(i, i + 200);
				const { data } = await supabaseAdmin
					.from('call_logs')
					.select('twilio_sid')
					.in('twilio_sid', batch);
				(data || []).forEach((r) => existingCallSids.add(r.twilio_sid));
			}

			// Insert new calls
			const callInserts = [];
			for (const call of allCalls) {
				if (existingCallSids.has(call.sid)) continue;

				const direction =
					call.from === number || call.from?.startsWith('client:') ? 'outbound' : 'inbound';
				const remoteNumber = direction === 'outbound' ? call.to : call.from;

				// Look up contact
				const { contactId, contactName } = await lookupContact(remoteNumber);

				const dur = parseInt(call.duration, 10) || 0;
				let disposition = null;
				if (call.status === 'completed' && dur > 0) disposition = 'answered';
				else if (call.status === 'completed' && dur === 0) disposition = 'missed';
				else if (call.status === 'no-answer') disposition = 'missed';
				else if (call.status === 'busy') disposition = 'missed';
				else if (call.status === 'failed' || call.status === 'canceled') disposition = 'abandoned';

				callInserts.push({
					twilio_sid: call.sid,
					direction,
					from_number: call.from || '',
					to_number: call.to || '',
					status: call.status || 'completed',
					duration: dur,
					disposition,
					caller_name: contactName || null,
					contact_id: contactId,
					twilio_number: number,
					started_at: call.startTime?.toISOString() || call.dateCreated?.toISOString(),
					ended_at: call.endTime?.toISOString() || null,
					metadata: { source: 'twilio_sync' }
				});
			}

			// Batch insert calls (100 at a time)
			for (let i = 0; i < callInserts.length; i += 100) {
				const { error } = await supabaseAdmin
					.from('call_logs')
					.insert(callInserts.slice(i, i + 100));
				if (!error) newCalls += Math.min(100, callInserts.length - i);
			}
		}

		return res.json({
			success: true,
			numbers: numbersToSync,
			totalMessages,
			newMessages,
			totalCalls,
			newCalls
		});
	} catch (err) {
		console.error('Twilio sync failed:', err.message);
		return res.status(500).json({ error: err.message });
	}
});

/**
 * Find or create a conversation for a remote number + twilio number pair.
 * @param {string} remoteNumber
 * @param {string} twilioNumber
 * @returns {Promise<string|null>}
 */
async function findOrCreateConversation(remoteNumber, twilioNumber) {
	// Check for existing conversation with this twilio number
	const { data: existing } = await supabaseAdmin
		.from('conversations')
		.select('id')
		.eq('phone_number', remoteNumber)
		.eq('twilio_number', twilioNumber)
		.maybeSingle();

	if (existing) return existing.id;

	// Check for legacy conversation without twilio_number
	const { data: legacy } = await supabaseAdmin
		.from('conversations')
		.select('id')
		.eq('phone_number', remoteNumber)
		.is('twilio_number', null)
		.maybeSingle();

	if (legacy) {
		await supabaseAdmin
			.from('conversations')
			.update({ twilio_number: twilioNumber })
			.eq('id', legacy.id);
		return legacy.id;
	}

	// Create new conversation with contact lookup
	const { contactId, contactName } = await lookupContact(remoteNumber);

	const { data: newConv } = await supabaseAdmin
		.from('conversations')
		.insert({
			phone_number: remoteNumber,
			twilio_number: twilioNumber,
			display_name: contactName,
			contact_id: contactId,
			unread_count: 0
		})
		.select('id')
		.single();

	return newConv?.id || null;
}

/**
 * Look up a contact by phone number using multiple format variants.
 * @param {string} phone
 * @returns {Promise<{contactId: string|null, contactName: string|null}>}
 */
async function lookupContact(phone) {
	if (!phone || phone.startsWith('client:')) {
		return { contactId: null, contactName: null };
	}

	const digits = phone.replace(/\D/g, '');
	if (!digits) return { contactId: null, contactName: null };

	const variants = [digits];
	if (digits.length === 11 && digits.startsWith('1')) variants.push(digits.slice(1));
	if (digits.length === 10) variants.push('1' + digits);
	variants.push(phone);

	const orFilter = variants.map((v) => `phone_normalized.eq.${v},phone.eq.${v}`).join(',');
	const { data: contact } = await supabaseAdmin
		.from('contacts')
		.select('id, full_name')
		.or(orFilter)
		.limit(1)
		.maybeSingle();

	return {
		contactId: contact?.id || null,
		contactName: contact?.full_name || null
	};
}

/**
 * Map Twilio message status to our status enum.
 * @param {string} status
 * @returns {string}
 */
function mapTwilioMsgStatus(status) {
	switch (status) {
		case 'delivered':
			return 'delivered';
		case 'sent':
			return 'sent';
		case 'failed':
		case 'undelivered':
			return 'failed';
		case 'received':
			return 'received';
		case 'queued':
		case 'accepted':
		case 'sending':
			return 'queued';
		case 'read':
			return 'read';
		default:
			return 'sent';
	}
}

export default router;
