import { Router } from 'express';
import twilio from 'twilio';
import { supabaseAdmin } from '../../services/supabase.js';
import {
	findConversation,
	lookupContactByPhone,
	normalizePhone
} from '../../services/phone-lookup.js';

/** Map form interest values to human-readable labels */
const INTEREST_LABELS = {
	aesthetics: 'Aesthetics / Skin',
	medical: 'Medical / Clinical',
	wellness: 'Wellness / Body',
	homecare: 'Home Care / Products',
	other: 'General Inquiry'
};

/**
 * Build the auto-SMS body for a contact form submission.
 * Exported for testing.
 */
export function buildContactFormSmsBody({ name, interested_in, message }) {
	const firstName = (name || '').trim().split(/\s+/)[0] || 'there';
	const lines = [`Hi ${firstName}, thank you for reaching out to LeMed Spa!`, ''];

	const details = [];
	if (interested_in) {
		details.push(`Interest: ${INTEREST_LABELS[interested_in] || interested_in}`);
	}
	if (message && message.trim()) {
		const excerpt =
			message.trim().length > 100 ? message.trim().slice(0, 100) + '...' : message.trim();
		details.push(`Message: "${excerpt}"`);
	}

	if (details.length > 0) {
		lines.push('We received your inquiry:');
		for (const d of details) {
			lines.push(`- ${d}`);
		}
		lines.push('');
	}

	lines.push(
		'Our care team will follow up shortly. If you need anything sooner, call us at (818) 463-3772.'
	);
	lines.push('');
	lines.push('-- LeMed Spa');

	return lines.join('\n');
}

/**
 * Send auto-acknowledgment SMS and create conversation thread.
 * Fire-and-forget — errors are logged but do not affect the form response.
 */
async function sendAutoSms({ phone, name, interested_in, message, contactId }) {
	const fromNumber =
		process.env.TWILIO_SMS_FROM_NUMBER ||
		process.env.TWILIO_TEST1_PHONE_NUMBER ||
		process.env.TWILIO_PHONE_NUMBER ||
		process.env.TWILIO_MAIN_PHONE_NUMBER;

	if (!fromNumber) {
		console.error('[contact-form] Auto-SMS skipped: no Twilio phone number configured');
		return;
	}

	const accountSid = process.env.TWILIO_ACCOUNT_SID;
	const authToken = process.env.TWILIO_AUTH_TOKEN;
	if (!accountSid || !authToken) {
		console.error('[contact-form] Auto-SMS skipped: Twilio credentials not configured');
		return;
	}

	const toNumber = normalizePhone(phone);
	const smsBody = buildContactFormSmsBody({ name, interested_in, message });

	// Send via Twilio
	const client = twilio(accountSid, authToken);
	const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.API_BASE_URL || '';
	const statusCallback = baseUrl ? `${baseUrl}/api/webhooks/sms/status` : undefined;

	const twilioMsg = await client.messages.create({
		to: toNumber,
		from: fromNumber,
		body: smsBody,
		...(statusCallback && { statusCallback })
	});

	// Find or create conversation thread
	const existingConv = await findConversation(toNumber);
	let convId;

	if (existingConv) {
		convId = existingConv.id;
	} else {
		let convContactId = contactId;
		let convContactName = name;
		if (!convContactId) {
			const lookup = await lookupContactByPhone(toNumber);
			convContactId = lookup.contactId;
			convContactName = lookup.contactName || name;
		}

		const { data: newConv } = await supabaseAdmin
			.from('conversations')
			.insert({
				phone_number: toNumber,
				twilio_number: fromNumber,
				display_name: convContactName,
				contact_id: convContactId,
				last_message: smsBody.substring(0, 200),
				last_at: new Date().toISOString(),
				unread_count: 0
			})
			.select('id')
			.single();

		convId = newConv?.id;
	}

	// Log the outbound message
	if (convId) {
		await supabaseAdmin.from('messages').insert({
			conversation_id: convId,
			direction: 'outbound',
			body: smsBody,
			from_number: fromNumber,
			to_number: toNumber,
			twilio_sid: twilioMsg.sid,
			status: twilioMsg.status || 'sent',
			metadata: { source: 'website_form_auto' }
		});

		await supabaseAdmin
			.from('conversations')
			.update({
				last_message: smsBody.substring(0, 200),
				last_at: new Date().toISOString(),
				status: 'active'
			})
			.eq('id', convId);
	}

	console.log(
		`[contact-form] Auto-SMS sent to ${toNumber}, twilio_sid=${twilioMsg.sid}, conv=${convId}`
	);
}

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

		// Auto-SMS for leads who prefer text
		if (preferred_contact === 'text' && phone) {
			sendAutoSms({
				phone,
				name: name.trim(),
				interested_in,
				message,
				contactId
			}).catch((err) => {
				console.error('[contact-form] Auto-SMS failed:', err.message);
			});
		}

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
