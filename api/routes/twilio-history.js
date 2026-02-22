import { Router } from 'express';
import twilio from 'twilio';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { supabaseAdmin } from '../services/supabase.js';
import { findConversation, normalizePhone } from '../services/phone-lookup.js';

const router = Router();
router.use(verifyToken);

const TM_BASE = 'https://rest.textmagic.com/api/v2';

/**
 * GET /api/twilio-history/numbers
 * Returns the phone number configured for this environment.
 * Staging shows only the 213 number; production shows only the 818 number.
 */
router.get('/numbers', logAction('twilio.numbers'), async (req, res) => {
	try {
		const configuredNumber = normalizePhone(
			process.env.TWILIO_SMS_FROM_NUMBER ||
				process.env.TWILIO_PHONE_NUMBER ||
				process.env.TWILIO_MAIN_PHONE_NUMBER ||
				''
		);

		if (!configuredNumber) {
			return res.json({ data: [] });
		}

		const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
		const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: configuredNumber });

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

		// ── Sync TextMagic Messages ──
		let tmNewMessages = 0;
		try {
			tmNewMessages = await syncTextMagicMessages(sinceDate);
		} catch (tmErr) {
			console.error('TextMagic sync failed (non-fatal):', tmErr.message);
		}

		return res.json({
			success: true,
			numbers: numbersToSync,
			totalMessages,
			newMessages: newMessages + tmNewMessages,
			totalCalls,
			newCalls,
			tmNewMessages
		});
	} catch (err) {
		console.error('Twilio sync failed:', err.message);
		return res.status(500).json({ error: err.message });
	}
});

/**
 * Authenticated TextMagic API request.
 * @param {string} path
 * @param {Record<string, string>} [params]
 * @returns {Promise<any>}
 */
async function tmFetch(path, params = {}) {
	const apiKey = process.env.TEXTMAGIC_API_KEY;
	const username = process.env.TEXTMAGIC_USERNAME;
	if (!apiKey || !username) return null;

	const url = new URL(`${TM_BASE}${path}`);
	for (const [k, v] of Object.entries(params)) {
		url.searchParams.set(k, String(v));
	}
	const resp = await fetch(url, {
		headers: {
			'X-TM-Username': username,
			'X-TM-Key': apiKey,
			Accept: 'application/json'
		}
	});
	if (!resp.ok) {
		const body = await resp.text();
		throw new Error(`TextMagic API ${resp.status}: ${body}`);
	}
	return resp.json();
}

/**
 * Sync TextMagic message history (outbound + inbound) into the app DB.
 * Returns the count of new messages inserted.
 *
 * @param {Date} sinceDate - How far back to sync
 * @returns {Promise<number>}
 */
async function syncTextMagicMessages(sinceDate) {
	const apiKey = process.env.TEXTMAGIC_API_KEY;
	const username = process.env.TEXTMAGIC_USERNAME;
	if (!apiKey || !username) return 0;

	let newCount = 0;

	// ── Fetch outbound messages (paginated) ──
	let outboundMessages = [];
	let page = 1;
	let totalPages = 1;
	do {
		const data = await tmFetch('/messages', { page, limit: 100 });
		if (!data) break;
		const resources = data.resources || [];
		// Filter by date — TextMagic returns newest first
		let hitOld = false;
		for (const msg of resources) {
			const msgTime = new Date(msg.messageTime);
			if (msgTime < sinceDate) {
				hitOld = true;
				break;
			}
			outboundMessages.push(msg);
		}
		if (hitOld) break;
		totalPages = data.pageCount || 1;
		page++;
	} while (page <= totalPages);

	// ── Fetch inbound messages / replies (paginated) ──
	let inboundMessages = [];
	page = 1;
	totalPages = 1;
	do {
		const data = await tmFetch('/replies', { page, limit: 100 });
		if (!data) break;
		const resources = data.resources || [];
		let hitOld = false;
		for (const msg of resources) {
			const msgTime = new Date(msg.messageTime);
			if (msgTime < sinceDate) {
				hitOld = true;
				break;
			}
			inboundMessages.push(msg);
		}
		if (hitOld) break;
		totalPages = data.pageCount || 1;
		page++;
	} while (page <= totalPages);

	console.log(
		`[tm-sync] Fetched ${outboundMessages.length} outbound, ${inboundMessages.length} inbound from TextMagic`
	);

	// ── Dedup: check which TM IDs we already have ──
	const allTmSids = [
		...outboundMessages.map((m) => `tm_${m.id}`),
		...inboundMessages.map((m) => `tmr_${m.id}`)
	];
	const existingSids = new Set();
	for (let i = 0; i < allTmSids.length; i += 200) {
		const batch = allTmSids.slice(i, i + 200);
		const { data } = await supabaseAdmin
			.from('messages')
			.select('twilio_sid')
			.in('twilio_sid', batch);
		(data || []).forEach((r) => existingSids.add(r.twilio_sid));
	}

	// ── Process outbound messages ──
	for (const msg of outboundMessages) {
		const sid = `tm_${msg.id}`;
		if (existingSids.has(sid)) continue;

		const patientPhone = normalizePhone(msg.receiver || msg.phone || '');
		if (!patientPhone) continue;

		const convId = await findOrCreateConversationByPhone(patientPhone);
		if (!convId) continue;

		const fromNumber = normalizePhone(msg.sender || msg.fromNumber || '');
		const { error } = await supabaseAdmin.from('messages').insert({
			conversation_id: convId,
			direction: 'outbound',
			body: msg.text || '',
			from_number: fromNumber || '',
			to_number: patientPhone,
			twilio_sid: sid,
			status: mapTmStatus(msg.status),
			created_at: new Date(msg.messageTime).toISOString(),
			metadata: { source: 'textmagic_sync', sent_via: 'textmagic' }
		});
		if (!error) {
			newCount++;
			await supabaseAdmin
				.from('conversations')
				.update({
					last_message: (msg.text || '').substring(0, 200),
					last_at: new Date(msg.messageTime).toISOString(),
					status: 'active'
				})
				.eq('id', convId);
		}
	}

	// ── Process inbound messages (replies) ──
	for (const msg of inboundMessages) {
		const sid = `tmr_${msg.id}`;
		if (existingSids.has(sid)) continue;

		const patientPhone = normalizePhone(msg.sender || '');
		if (!patientPhone) continue;

		const convId = await findOrCreateConversationByPhone(patientPhone);
		if (!convId) continue;

		const toNumber = normalizePhone(msg.receiver || '');
		const { error } = await supabaseAdmin.from('messages').insert({
			conversation_id: convId,
			direction: 'inbound',
			body: msg.text || '',
			from_number: patientPhone,
			to_number: toNumber || '',
			twilio_sid: sid,
			status: 'received',
			created_at: new Date(msg.messageTime).toISOString(),
			metadata: { source: 'textmagic_sync' }
		});
		if (!error) {
			newCount++;
			await supabaseAdmin
				.from('conversations')
				.update({
					last_message: (msg.text || '').substring(0, 200),
					last_at: new Date(msg.messageTime).toISOString(),
					status: 'active'
				})
				.eq('id', convId);
		}
	}

	console.log(`[tm-sync] Inserted ${newCount} new TextMagic messages`);
	return newCount;
}

/**
 * Find or create a conversation by patient phone number (one thread per customer).
 * Uses the shared findConversation from phone-lookup.js for variant matching.
 *
 * @param {string} patientPhone
 * @returns {Promise<string|null>}
 */
async function findOrCreateConversationByPhone(patientPhone) {
	const existing = await findConversation(patientPhone);
	if (existing) return existing.id;

	const { contactId, contactName } = await lookupContact(patientPhone);

	const { data: newConv } = await supabaseAdmin
		.from('conversations')
		.insert({
			phone_number: patientPhone,
			display_name: contactName,
			contact_id: contactId,
			unread_count: 0
		})
		.select('id')
		.single();

	return newConv?.id || null;
}

/**
 * Map TextMagic message status to our status values.
 * @param {string} status
 * @returns {string}
 */
function mapTmStatus(status) {
	const s = (status || '').toLowerCase();
	if (s === 'd' || s === 'delivered') return 'delivered';
	if (s === 'e' || s === 'error' || s === 'f' || s === 'failed') return 'failed';
	if (s === 'r' || s === 'received') return 'received';
	if (s === 'j' || s === 'rejected') return 'failed';
	if (s === 'a' || s === 'accepted' || s === 'q' || s === 'queued') return 'queued';
	if (s === 's' || s === 'sent') return 'sent';
	return 'sent';
}

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
