import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { supabaseAdmin } from '../services/supabase.js';

const router = Router();

// All voicemail routes require authentication
router.use(verifyToken);

/**
 * GET /api/voicemails
 * List voicemails with pagination and filtering.
 *
 * Query params:
 *   page (default 1), pageSize (default 25), is_new (true/false),
 *   mailbox (lea/clinical_md/accounts/care_team), search
 */
router.get('/', logAction('voicemails.list'), async (req, res) => {
	const page = Math.max(1, parseInt(req.query.page, 10) || 1);
	const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
	const offset = (page - 1) * pageSize;

	let query = supabaseAdmin
		.from('voicemails')
		.select('*, call_logs(from_number, to_number, started_at, caller_name, contact_id, metadata)', {
			count: 'exact'
		});

	// Filter by new/read status
	if (req.query.is_new === 'true') {
		query = query.eq('is_new', true);
	} else if (req.query.is_new === 'false') {
		query = query.eq('is_new', false);
	}

	// Filter by mailbox
	if (req.query.mailbox) {
		query = query.eq('mailbox', req.query.mailbox);
	}

	// Search by phone number or transcription
	if (req.query.search) {
		query = query.or(
			`from_number.ilike.%${req.query.search}%,transcription.ilike.%${req.query.search}%`
		);
	}

	// Sort newest first
	query = query.order('created_at', { ascending: false });

	// Pagination
	query = query.range(offset, offset + pageSize - 1);

	const { data, error, count } = await query;

	if (error) {
		console.error('Failed to fetch voicemails:', error.message);
		return res.status(500).json({ error: 'Failed to fetch voicemails' });
	}

	return res.json({
		data: data || [],
		count: count || 0,
		page,
		pageSize
	});
});

/**
 * GET /api/voicemails/stats
 * Voicemail mailbox counts (unheard per mailbox).
 */
router.get('/stats', logAction('voicemails.stats'), async (req, res) => {
	const { data, error } = await supabaseAdmin
		.from('voicemails')
		.select('mailbox, is_new')
		.eq('is_new', true);

	if (error) {
		console.error('Failed to fetch voicemail stats:', error.message);
		return res.status(500).json({ error: 'Failed to fetch voicemail stats' });
	}

	const counts = {
		total_unheard: data?.length || 0,
		lea: 0,
		clinical_md: 0,
		accounts: 0,
		care_team: 0,
		unassigned: 0
	};

	for (const vm of data || []) {
		if (vm.mailbox && counts[vm.mailbox] !== undefined) {
			counts[vm.mailbox]++;
		} else {
			counts.unassigned++;
		}
	}

	return res.json(counts);
});

/**
 * GET /api/voicemails/:id
 * Get a single voicemail by ID.
 */
router.get('/:id', logAction('voicemails.read'), async (req, res) => {
	const { id } = req.params;

	const { data, error } = await supabaseAdmin
		.from('voicemails')
		.select(
			'*, call_logs(from_number, to_number, started_at, direction, caller_name, contact_id, metadata)'
		)
		.eq('id', id)
		.single();

	if (error || !data) {
		return res.status(404).json({ error: 'Voicemail not found' });
	}

	return res.json({ data });
});

/**
 * GET /api/voicemails/:id/recording
 * Proxy the Twilio recording audio so the browser doesn't need Twilio credentials.
 * Streams the audio through our API with proper auth.
 */
router.get('/:id/recording', logAction('voicemails.playRecording'), async (req, res) => {
	const { id } = req.params;

	// Look up the voicemail to get the recording URL
	const { data: vm, error } = await supabaseAdmin
		.from('voicemails')
		.select('recording_url, recording_sid, storage_path')
		.eq('id', id)
		.single();

	if (error || !vm) {
		return res.status(404).json({ error: 'Voicemail not found' });
	}

	if (!vm.recording_url && !vm.recording_sid) {
		return res.status(404).json({ error: 'No recording available' });
	}

	// Check Supabase Storage first (preserved recordings)
	if (vm.storage_path) {
		try {
			const { data: fileData, error: dlErr } = await supabaseAdmin.storage
				.from('voicemails')
				.download(vm.storage_path);
			if (!dlErr && fileData) {
				const buffer = Buffer.from(await fileData.arrayBuffer());
				const ext = vm.storage_path.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
				res.set('Content-Type', ext);
				res.set('Content-Length', buffer.length.toString());
				res.set('Cache-Control', 'private, max-age=3600');
				return res.send(buffer);
			}
		} catch (e) {
			console.error('Storage download failed, falling back to Twilio:', e.message);
		}
	}

	try {
		// Build the Twilio recording URL (prefer .mp3 format)
		const accountSid = process.env.TWILIO_ACCOUNT_SID;
		const authToken = process.env.TWILIO_AUTH_TOKEN;
		let recordingUrl = vm.recording_url;

		// Ensure we're fetching the .mp3 version
		if (recordingUrl && !recordingUrl.endsWith('.mp3') && !recordingUrl.endsWith('.wav')) {
			recordingUrl = recordingUrl + '.mp3';
		}

		// If we only have a SID, build the URL
		if (!recordingUrl && vm.recording_sid) {
			recordingUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${vm.recording_sid}.mp3`;
		}

		// Fetch from Twilio with Basic Auth
		const twilioRes = await fetch(recordingUrl, {
			headers: {
				Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
			}
		});

		if (!twilioRes.ok) {
			console.error(`Twilio recording fetch failed: ${twilioRes.status} ${twilioRes.statusText}`);
			return res.status(502).json({ error: 'Failed to fetch recording from Twilio' });
		}

		// Stream the audio back to the client
		res.set('Content-Type', twilioRes.headers.get('content-type') || 'audio/mpeg');
		const contentLength = twilioRes.headers.get('content-length');
		if (contentLength) res.set('Content-Length', contentLength);
		res.set('Cache-Control', 'private, max-age=3600'); // Cache for 1 hour

		// Pipe the response body
		const reader = twilioRes.body.getReader();
		const pump = async () => {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					res.end();
					break;
				}
				res.write(value);
			}
		};
		await pump();
	} catch (e) {
		console.error('Recording proxy error:', e.message);
		if (!res.headersSent) {
			return res.status(500).json({ error: 'Failed to proxy recording' });
		}
	}
});

/**
 * PATCH /api/voicemails/:id/read
 * Mark a voicemail as read (is_new = false).
 */
router.patch('/:id/read', logAction('voicemails.markRead'), async (req, res) => {
	const { id } = req.params;

	const { data, error } = await supabaseAdmin
		.from('voicemails')
		.update({
			is_new: false,
			assigned_to: req.user.id
		})
		.eq('id', id)
		.select()
		.single();

	if (error) {
		console.error('Failed to mark voicemail as read:', error.message);
		return res.status(500).json({ error: 'Failed to mark voicemail as read' });
	}

	return res.json({ data });
});

/**
 * PATCH /api/voicemails/:id/unread
 * Mark a voicemail as unread (is_new = true).
 */
router.patch('/:id/unread', logAction('voicemails.markUnread'), async (req, res) => {
	const { id } = req.params;

	const { data, error } = await supabaseAdmin
		.from('voicemails')
		.update({ is_new: true })
		.eq('id', id)
		.select()
		.single();

	if (error) {
		console.error('Failed to mark voicemail as unread:', error.message);
		return res.status(500).json({ error: 'Failed to mark voicemail as unread' });
	}

	return res.json({ data });
});

/**
 * PATCH /api/voicemails/:id/save
 * Preserve a voicemail by downloading the recording to Supabase Storage.
 */
router.patch('/:id/save', logAction('voicemails.save'), async (req, res) => {
	const { id } = req.params;

	const { data: vm, error: fetchErr } = await supabaseAdmin
		.from('voicemails')
		.select('id, recording_url, recording_sid, preserved, storage_path')
		.eq('id', id)
		.single();

	if (fetchErr || !vm) {
		return res.status(404).json({ error: 'Voicemail not found' });
	}

	if (vm.preserved && vm.storage_path) {
		return res.json({ data: vm, message: 'Already preserved' });
	}

	const accountSid = process.env.TWILIO_ACCOUNT_SID;
	const authToken = process.env.TWILIO_AUTH_TOKEN;
	let recordingUrl = vm.recording_url;

	if (recordingUrl && !recordingUrl.endsWith('.mp3') && !recordingUrl.endsWith('.wav')) {
		recordingUrl = recordingUrl + '.mp3';
	}
	if (!recordingUrl && vm.recording_sid) {
		recordingUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${vm.recording_sid}.mp3`;
	}

	if (!recordingUrl) {
		return res.status(404).json({ error: 'No recording URL available' });
	}

	try {
		const twilioRes = await fetch(recordingUrl, {
			headers: {
				Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
			}
		});

		if (!twilioRes.ok) {
			return res.status(502).json({ error: 'Failed to download from Twilio' });
		}

		const audioBuffer = Buffer.from(await twilioRes.arrayBuffer());
		const contentType = twilioRes.headers.get('content-type') || 'audio/mpeg';
		const ext = contentType.includes('wav') ? 'wav' : 'mp3';
		const storagePath = `voicemails/${id}.${ext}`;

		const { error: uploadErr } = await supabaseAdmin.storage
			.from('voicemails')
			.upload(storagePath, audioBuffer, { contentType, upsert: true });

		if (uploadErr) {
			console.error('Supabase Storage upload failed:', uploadErr.message);
			return res.status(500).json({ error: 'Failed to upload to storage' });
		}

		const { data: updated, error: updateErr } = await supabaseAdmin
			.from('voicemails')
			.update({ preserved: true, storage_path: storagePath })
			.eq('id', id)
			.select()
			.single();

		if (updateErr) {
			console.error('Failed to update voicemail:', updateErr.message);
			return res.status(500).json({ error: 'Saved to storage but failed to update DB' });
		}

		return res.json({ data: updated });
	} catch (e) {
		console.error('Voicemail save error:', e.message);
		return res.status(500).json({ error: 'Failed to preserve voicemail' });
	}
});

/**
 * DELETE /api/voicemails/:id
 * Delete a voicemail from DB, Twilio, and Supabase Storage.
 */
router.delete('/:id', logAction('voicemails.delete'), async (req, res) => {
	const { id } = req.params;

	const { data: vm, error: fetchErr } = await supabaseAdmin
		.from('voicemails')
		.select('id, recording_sid, storage_path')
		.eq('id', id)
		.single();

	if (fetchErr || !vm) {
		return res.status(404).json({ error: 'Voicemail not found' });
	}

	if (vm.storage_path) {
		const { error: storageErr } = await supabaseAdmin.storage
			.from('voicemails')
			.remove([vm.storage_path]);
		if (storageErr) {
			console.error('Storage delete failed (continuing):', storageErr.message);
		}
	}

	if (vm.recording_sid) {
		try {
			const accountSid = process.env.TWILIO_ACCOUNT_SID;
			const authToken = process.env.TWILIO_AUTH_TOKEN;
			await fetch(
				`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${vm.recording_sid}`,
				{
					method: 'DELETE',
					headers: {
						Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
					}
				}
			);
		} catch (e) {
			console.error('Twilio recording delete failed (continuing):', e.message);
		}
	}

	const { error: deleteErr } = await supabaseAdmin.from('voicemails').delete().eq('id', id);

	if (deleteErr) {
		console.error('Failed to delete voicemail from DB:', deleteErr.message);
		return res.status(500).json({ error: 'Failed to delete voicemail' });
	}

	return res.json({ success: true });
});

export default router;
