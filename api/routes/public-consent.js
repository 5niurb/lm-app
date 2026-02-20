/**
 * Public consent API — no authentication required.
 * Used by patient-facing consent form pages.
 * Patients access these via unique URLs sent in automation messages.
 */
import { Router } from 'express';
import { supabaseAdmin } from '../services/supabase.js';

const router = Router();

/**
 * GET /api/public/consent/:slug
 * Get a consent form by its page_slug. Includes service info.
 */
router.get('/:slug', async (req, res) => {
	try {
		const { data, error } = await supabaseAdmin
			.from('service_content')
			.select(
				`
        id,
        content_type,
        title,
        summary,
        page_slug,
        content_json,
        is_active,
        version,
        service:services(id, name, slug, category, description)
      `
			)
			.eq('page_slug', req.params.slug)
			.eq('content_type', 'consent_form')
			.eq('is_active', true)
			.single();

		if (error || !data) {
			return res.status(404).json({ error: 'Consent form not found' });
		}

		res.json({ data });
	} catch (err) {
		console.error('Public consent fetch error:', err.message);
		res.status(500).json({ error: 'Failed to load consent form' });
	}
});

/**
 * POST /api/public/consent/:slug/submit
 * Submit a signed consent form.
 *
 * Body:
 * - client_id (UUID, required) — from the URL token or lookup
 * - client_name (string, optional) — for new/walk-in patients
 * - client_email (string, optional)
 * - client_phone (string, optional)
 * - responses (object) — questionnaire answers
 * - signature_data (string) — base64 PNG from signature pad
 * - form_id (UUID, optional) — service_content ID
 * - service_id (UUID, optional) — service ID
 */
router.post('/:slug/submit', async (req, res) => {
	try {
		const {
			client_name,
			client_email,
			client_phone,
			responses,
			signature_data,
			form_id,
			service_id
		} = req.body;
		// NOTE: client_id is intentionally NOT accepted from the public endpoint
		// to prevent anonymous callers from submitting consent as arbitrary patients.

		// Validate required fields
		if (!signature_data) {
			return res.status(400).json({ error: 'Signature is required' });
		}

		// Look up the form by slug to get IDs if not provided
		let resolvedFormId = form_id;
		let resolvedServiceId = service_id;

		if (!resolvedFormId) {
			const { data: formData } = await supabaseAdmin
				.from('service_content')
				.select('id, service_id')
				.eq('page_slug', req.params.slug)
				.eq('content_type', 'consent_form')
				.eq('is_active', true)
				.single();

			if (formData) {
				resolvedFormId = formData.id;
				resolvedServiceId = resolvedServiceId || formData.service_id;
			}
		}

		// Resolve or create client — always from identifying info, never from body client_id
		let resolvedClientId = null;

		if (client_name || client_email || client_phone) {
			// Try to find existing contact by email or phone
			let existingContact = null;

			if (client_email) {
				const { data } = await supabaseAdmin
					.from('contacts')
					.select('id')
					.eq('email', client_email.toLowerCase().trim())
					.limit(1)
					.single();
				existingContact = data;
			}

			if (!existingContact && client_phone) {
				const digits = client_phone.replace(/\D/g, '');
				// Match digits-only format used by the rest of the codebase
				const normalized =
					digits.length === 10 ? '1' + digits : digits;
				const { data } = await supabaseAdmin
					.from('contacts')
					.select('id')
					.eq('phone_normalized', normalized)
					.limit(1)
					.maybeSingle();
				existingContact = data;
			}

			if (existingContact) {
				resolvedClientId = existingContact.id;
			} else {
				// Create a new contact for walk-in patients
				const nameParts = (client_name || '').trim().split(' ');
				const firstName = nameParts[0] || '';
				const lastName = nameParts.slice(1).join(' ') || '';
				const phoneNorm = client_phone ? client_phone.replace(/\D/g, '') : null;

				const { data: newContact, error: contactErr } = await supabaseAdmin
					.from('contacts')
					.insert({
						first_name: firstName,
						last_name: lastName,
						full_name: client_name || 'Walk-in Patient',
						email: client_email?.toLowerCase().trim() || null,
						phone: client_phone || null,
						phone_normalized: phoneNorm
							? phoneNorm.length === 10
								? '1' + phoneNorm
								: phoneNorm
							: null,
						source: 'manual',
						patient_status: 'new',
						tags: ['consent-form'],
						notes: 'Created from consent form submission'
					})
					.select('id')
					.single();

				if (contactErr) {
					console.error('Failed to create contact:', contactErr.message);
					return res.status(500).json({ error: 'Failed to process consent form' });
				}

				resolvedClientId = newContact.id;
			}
		}

		if (!resolvedClientId) {
			return res.status(400).json({ error: 'Patient identification is required' });
		}

		// Get IP and user agent
		const ipAddress =
			req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || null;
		const userAgent = req.headers['user-agent'] || null;

		// Insert consent submission
		const { data: submission, error: submitErr } = await supabaseAdmin
			.from('consent_submissions')
			.insert({
				client_id: resolvedClientId,
				form_id: resolvedFormId,
				service_id: resolvedServiceId,
				responses: responses || {},
				signature_data,
				signed_at: new Date().toISOString(),
				ip_address: ipAddress,
				user_agent: userAgent,
				status: 'completed'
			})
			.select('id, status, signed_at')
			.single();

		if (submitErr) {
			console.error('Consent submission error:', submitErr.message);
			return res.status(500).json({ error: 'Failed to save consent form' });
		}

		// Log it
		console.log(
			`[consent] Submission ${submission.id} from client ${resolvedClientId} for form ${resolvedFormId}`
		);

		res.json({
			success: true,
			data: {
				id: submission.id,
				status: submission.status,
				signed_at: submission.signed_at
			}
		});
	} catch (err) {
		console.error('Public consent submit error:', err.message);
		res.status(500).json({ error: 'Failed to process consent form' });
	}
});

export default router;
