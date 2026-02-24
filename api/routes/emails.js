import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { supabaseAdmin } from '../services/supabase.js';
import { sendEmail } from '../services/resend.js';
import { apiError } from '../utils/responses.js';

const router = Router();

router.use(verifyToken);

/**
 * POST /api/emails/send
 * Send an email from a conversation and store the record.
 *
 * Body: { conversationId, to, fromName?, fromAddress?, cc?, bcc?, subject, body }
 */
router.post('/send', logAction('emails.send'), async (req, res) => {
	const { conversationId, to, fromName, fromAddress, cc, bcc, subject, body } = req.body;

	if (!to || !subject || !body) {
		return apiError(res, 400, 'validation_error', '"to", "subject", and "body" are required');
	}

	// Basic email validation
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
		return apiError(res, 400, 'validation_error', 'Invalid email address');
	}

	try {
		// Send via Resend
		const result = await sendEmail({
			to,
			fromName: fromName || 'Le Med Spa',
			from: fromAddress || undefined,
			subject,
			text: body
		});

		if (!result.success) {
			return apiError(res, 502, 'email_failed', result.error || 'Failed to send email');
		}

		// Look up contact_id from conversation if provided
		let contactId = null;
		if (conversationId) {
			const { data: convo } = await supabaseAdmin
				.from('conversations')
				.select('contact_id')
				.eq('id', conversationId)
				.single();
			contactId = convo?.contact_id || null;
		}

		// Store email record
		const { data: emailRecord, error: insertErr } = await supabaseAdmin
			.from('emails')
			.insert({
				conversation_id: conversationId || null,
				contact_id: contactId,
				direction: 'outbound',
				from_address: fromAddress || 'noreply@updates.lemedspa.com',
				from_name: fromName || 'Le Med Spa',
				to_address: to,
				cc: cc || null,
				bcc: bcc || null,
				subject,
				body_text: body,
				resend_id: result.data?.id || null,
				status: 'sent',
				sent_by: req.user?.id || null
			})
			.select()
			.single();

		if (insertErr) {
			console.error('Failed to store email record:', insertErr.message);
			// Email was sent even if DB insert fails — don't return error
		}

		// Update conversation last_at
		if (conversationId) {
			await supabaseAdmin
				.from('conversations')
				.update({ last_at: new Date().toISOString() })
				.eq('id', conversationId);
		}

		return res.json({ data: emailRecord || { status: 'sent' } });
	} catch (err) {
		console.error('Email send error:', err.message);
		return apiError(res, 500, 'server_error', 'Failed to send email');
	}
});

/**
 * GET /api/emails/:id
 * Fetch a single email by ID.
 */
router.get('/:id', logAction('emails.read'), async (req, res) => {
	const { id } = req.params;

	const { data, error } = await supabaseAdmin.from('emails').select('*').eq('id', id).single();

	if (error || !data) {
		return apiError(res, 404, 'not_found', 'Email not found');
	}

	return res.json({ data });
});

export default router;
