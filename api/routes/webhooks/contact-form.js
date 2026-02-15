import { Router } from 'express';
import { supabaseAdmin } from '../../services/supabase.js';

const router = Router();

/**
 * POST /api/webhooks/contact-form
 * Public endpoint — no auth required.
 * Receives submissions from the lemedspa.com contact form.
 *
 * Creates a contact_form_submission record and auto-creates
 * a contact tagged as "lead" if one doesn't already exist.
 */
router.post('/', async (req, res) => {
	try {
		const {
			name,
			phone,
			email,
			preferred_contact,
			interested_in,
			referral_source,
			message,
			consent
		} = req.body;

		// Basic validation
		if (!name || (!phone && !email)) {
			return res.status(400).json({ error: 'Name and at least phone or email required' });
		}

		// Normalize phone for matching
		const phoneNormalized = phone ? phone.replace(/\D/g, '') : null;

		// Check if contact already exists (by phone or email)
		let contactId = null;
		if (phoneNormalized || email) {
			let matchQuery = supabaseAdmin.from('contacts').select('id, tags');

			if (phoneNormalized && email) {
				matchQuery = matchQuery.or(`phone_normalized.eq.${phoneNormalized},email.ilike.${email}`);
			} else if (phoneNormalized) {
				matchQuery = matchQuery.eq('phone_normalized', phoneNormalized);
			} else {
				matchQuery = matchQuery.ilike('email', email);
			}

			const { data: existing } = await matchQuery.limit(1).single();

			if (existing) {
				contactId = existing.id;
				// Add 'lead' tag if not already present
				const currentTags = existing.tags || [];
				if (!currentTags.includes('lead')) {
					await supabaseAdmin
						.from('contacts')
						.update({
							tags: [...currentTags, 'lead'],
							updated_at: new Date().toISOString()
						})
						.eq('id', contactId);
				}
			}
		}

		// If no existing contact, create one
		if (!contactId) {
			// Parse first/last name from full name
			const nameParts = name.trim().split(/\s+/);
			const firstName = nameParts[0] || null;
			const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

			const { data: newContact, error: createErr } = await supabaseAdmin
				.from('contacts')
				.insert({
					first_name: firstName,
					last_name: lastName,
					full_name: name.trim(),
					phone: phone || null,
					phone_normalized: phoneNormalized,
					email: email || null,
					source: 'website_form',
					tags: ['lead'],
					metadata: {
						preferred_contact: preferred_contact || null,
						interested_in: interested_in || null,
						referral_source: referral_source || null
					}
				})
				.select('id')
				.single();

			if (createErr) {
				console.error('Failed to create contact from form:', createErr.message);
			} else {
				contactId = newContact.id;
			}
		}

		// Store the form submission
		const { data: submission, error: submitErr } = await supabaseAdmin
			.from('contact_form_submissions')
			.insert({
				contact_id: contactId,
				name: name.trim(),
				phone: phone || null,
				email: email || null,
				preferred_contact: preferred_contact || null,
				interested_in: interested_in || null,
				referral_source: referral_source || null,
				message: message || null,
				consent: consent === true || consent === 'true' || consent === 'on',
				ip_address: req.headers['x-forwarded-for'] || req.ip || null,
				user_agent: req.headers['user-agent'] || null
			})
			.select('id')
			.single();

		if (submitErr) {
			console.error('Failed to save form submission:', submitErr.message);
			return res.status(500).json({ error: 'Failed to save submission' });
		}

		console.log(
			`[contact-form] New submission: ${name} (${phone || email}) → ${submission.id}${contactId ? ` → contact ${contactId}` : ''}`
		);

		return res.status(201).json({
			success: true,
			submission_id: submission.id,
			contact_id: contactId
		});
	} catch (e) {
		console.error('Contact form webhook error:', e.message);
		return res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;
