import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { supabaseAdmin } from '../services/supabase.js';
import { lookupContactByPhone } from '../services/phone-lookup.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { sanitizeSearch } from '../utils/sanitize.js';
import { apiError } from '../utils/responses.js';

const router = Router();

// All call routes require authentication
router.use(verifyToken);

/**
 * GET /api/calls
 * List call logs with pagination, filtering, and sorting.
 *
 * Query params:
 *   page (default 1), pageSize (default 25), direction, disposition, search, sort, order, twilioNumber
 */
router.get('/', logAction('calls.list'), async (req, res) => {
	const page = Math.max(1, parseInt(req.query.page, 10) || 1);
	const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
	const offset = (page - 1) * pageSize;

	let query = supabaseAdmin
		.from('call_logs')
		.select(
			'*, voicemails(id, transcription, transcription_status, is_new, recording_url, duration, mailbox, preserved, storage_path)',
			{ count: 'exact' }
		);

	// Filters
	if (req.query.direction) {
		query = query.eq('direction', req.query.direction);
	}
	if (req.query.disposition) {
		query = query.eq('disposition', req.query.disposition);
	}
	if (req.query.status) {
		query = query.eq('status', req.query.status);
	}
	if (req.query.search) {
		const s = sanitizeSearch(req.query.search);
		query = query.or(
			`from_number.ilike.%${s}%,to_number.ilike.%${s}%,notes.ilike.%${s}%,caller_name.ilike.%${s}%`
		);
	}
	// Filter by Twilio number
	if (req.query.twilioNumber) {
		query = query.eq('twilio_number', req.query.twilioNumber);
	}

	// Date range
	if (req.query.from) {
		query = query.gte('started_at', req.query.from);
	}
	if (req.query.to) {
		query = query.lte('started_at', req.query.to);
	}

	// Sorting (allowlist to prevent injection)
	const CALLS_SORT_ALLOWLIST = [
		'started_at',
		'duration',
		'direction',
		'disposition',
		'status',
		'caller_name'
	];
	const sortField = CALLS_SORT_ALLOWLIST.includes(req.query.sort) ? req.query.sort : 'started_at';
	const sortOrder = req.query.order === 'asc' ? true : false;
	query = query.order(sortField, { ascending: sortOrder });

	// Pagination
	query = query.range(offset, offset + pageSize - 1);

	const { data, error, count } = await query;

	if (error) {
		console.error('Failed to fetch call logs:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to fetch call logs');
	}

	// Enrich rows missing contact info with live contact lookup
	if (data?.length) {
		const needsLookup = data.filter((c) => !c.contact_id);
		for (const call of needsLookup) {
			const phone = call.direction === 'inbound' ? call.from_number : call.to_number;
			if (!phone) continue;
			const { contactId, contactName } = await lookupContactByPhone(phone);
			if (contactId) {
				call.contact_id = contactId;
				call.caller_name = contactName || call.caller_name;
			}
		}
	}

	return res.json({
		data: data || [],
		count: count || 0,
		page,
		pageSize
	});
});

/**
 * GET /api/calls/stats
 * Get call statistics for the dashboard.
 *
 * Query params: days (default 7)
 */
router.get('/stats', logAction('calls.stats'), async (req, res) => {
	const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 7));
	const since = new Date();
	since.setDate(since.getDate() - days);

	const { data, error } = await supabaseAdmin
		.from('call_logs')
		.select('disposition, duration, status')
		.gte('started_at', since.toISOString());

	if (error) {
		console.error('Failed to fetch call stats:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to fetch call stats');
	}

	const calls = data || [];
	const totalCalls = calls.length;
	const answered = calls.filter((c) => c.disposition === 'answered').length;
	const missed = calls.filter((c) => c.disposition === 'missed').length;
	const voicemail = calls.filter((c) => c.disposition === 'voicemail').length;
	const durations = calls.filter((c) => c.duration > 0).map((c) => c.duration);
	const avgDuration =
		durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

	// Get unheard voicemail count
	const { count: unheardCount } = await supabaseAdmin
		.from('voicemails')
		.select('id', { count: 'exact', head: true })
		.eq('is_new', true);

	return res.json({
		totalCalls,
		answered,
		missed,
		voicemail,
		avgDuration,
		unheardVoicemails: unheardCount || 0,
		days
	});
});

/**
 * GET /api/calls/stats/daily
 * Get daily call counts for the last N days (for charts).
 *
 * Query params: days (default 7)
 */
router.get('/stats/daily', logAction('calls.stats.daily'), async (req, res) => {
	const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 7));
	const since = new Date();
	since.setDate(since.getDate() - days);

	const { data, error } = await supabaseAdmin
		.from('call_logs')
		.select('started_at, disposition')
		.gte('started_at', since.toISOString())
		.order('started_at', { ascending: true });

	if (error) {
		console.error('Failed to fetch daily stats:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to fetch daily stats');
	}

	// Group by date
	const dailyMap = {};
	for (let i = 0; i < days; i++) {
		const d = new Date();
		d.setDate(d.getDate() - (days - 1 - i));
		const key = d.toISOString().split('T')[0];
		dailyMap[key] = { date: key, total: 0, answered: 0, missed: 0, voicemail: 0 };
	}

	for (const call of data || []) {
		const key = call.started_at?.split('T')[0];
		if (dailyMap[key]) {
			dailyMap[key].total++;
			if (call.disposition === 'answered') dailyMap[key].answered++;
			else if (call.disposition === 'missed') dailyMap[key].missed++;
			else if (call.disposition === 'voicemail') dailyMap[key].voicemail++;
		}
	}

	return res.json({ data: Object.values(dailyMap) });
});

/**
 * GET /api/calls/:id
 * Get a single call log by ID.
 */
router.get('/:id', logAction('calls.read'), async (req, res) => {
	const { id } = req.params;

	const { data, error } = await supabaseAdmin.from('call_logs').select('*').eq('id', id).single();

	if (error || !data) {
		return apiError(res, 404, 'not_found', 'Call log not found');
	}

	return res.json({ data });
});

/**
 * POST /api/calls
 * Create a manual call log entry (e.g. for outbound calls logged by staff).
 */
router.post('/', logAction('calls.create'), async (req, res) => {
	const { direction, from_number, to_number, notes, tags, disposition } = req.body;

	if (!from_number && !to_number) {
		return apiError(res, 400, 'validation_error', 'At least one phone number is required');
	}

	const { data, error } = await supabaseAdmin
		.from('call_logs')
		.insert({
			direction: direction || 'outbound',
			from_number: from_number || '',
			to_number: to_number || '',
			notes: notes || null,
			tags: tags || [],
			disposition: disposition || 'answered',
			status: 'completed',
			handled_by: req.user.id,
			started_at: new Date().toISOString()
		})
		.select()
		.single();

	if (error) {
		console.error('Failed to create call log:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to create call log');
	}

	return res.status(201).json({ data });
});

/**
 * PATCH /api/calls/:id
 * Update an existing call log entry (notes, tags, disposition).
 * Admin only.
 */
router.patch('/:id', requireAdmin, logAction('calls.update'), async (req, res) => {
	const { id } = req.params;
	const { notes, tags, disposition, handled_by } = req.body;

	// Build update object with only provided fields
	const update = {};
	if (notes !== undefined) update.notes = notes;
	if (tags !== undefined) update.tags = tags;
	if (disposition !== undefined) update.disposition = disposition;
	if (handled_by !== undefined) update.handled_by = handled_by;

	if (Object.keys(update).length === 0) {
		return apiError(res, 400, 'validation_error', 'No fields to update');
	}

	const { data, error } = await supabaseAdmin
		.from('call_logs')
		.update(update)
		.eq('id', id)
		.select()
		.single();

	if (error) {
		console.error('Failed to update call log:', error.message);
		return apiError(res, 500, 'server_error', 'Failed to update call log');
	}

	return res.json({ data });
});

/**
 * GET /api/calls/:id/recording
 * Proxy the Twilio call recording audio so the browser doesn't need Twilio credentials.
 * Mirrors the voicemail recording proxy pattern.
 */
router.get('/:id/recording', logAction('calls.playRecording'), async (req, res) => {
	const { id } = req.params;

	const { data: call, error } = await supabaseAdmin
		.from('call_logs')
		.select('recording_url, recording_sid')
		.eq('id', id)
		.single();

	if (error || !call) {
		return apiError(res, 404, 'not_found', 'Call log not found');
	}

	if (!call.recording_url && !call.recording_sid) {
		return apiError(res, 404, 'not_found', 'No recording available');
	}

	try {
		const accountSid = process.env.TWILIO_ACCOUNT_SID;
		const authToken = process.env.TWILIO_AUTH_TOKEN;
		let recordingUrl = call.recording_url;

		if (recordingUrl && !recordingUrl.endsWith('.mp3') && !recordingUrl.endsWith('.wav')) {
			recordingUrl = recordingUrl + '.mp3';
		}

		if (!recordingUrl && call.recording_sid) {
			recordingUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${call.recording_sid}.mp3`;
		}

		const twilioRes = await fetch(recordingUrl, {
			headers: {
				Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
			}
		});

		if (!twilioRes.ok) {
			console.error(`Twilio recording fetch failed: ${twilioRes.status} ${twilioRes.statusText}`);
			return apiError(res, 502, 'bad_gateway', 'Failed to fetch recording from Twilio');
		}

		res.set('Content-Type', twilioRes.headers.get('content-type') || 'audio/mpeg');
		const contentLength = twilioRes.headers.get('content-length');
		if (contentLength) res.set('Content-Length', contentLength);
		res.set('Cache-Control', 'private, max-age=3600');

		const reader = twilioRes.body.getReader();
		req.on('close', () => reader.cancel());
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				res.end();
				break;
			}
			res.write(value);
		}
	} catch (e) {
		console.error('Call recording proxy error:', e.message);
		if (!res.headersSent) {
			return apiError(res, 500, 'server_error', 'Failed to proxy recording');
		}
	}
});

export default router;
