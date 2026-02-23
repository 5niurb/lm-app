import { supabaseAdmin } from './supabase.js';

/**
 * Static tag values that don't require a database lookup.
 */
const STATIC_TAGS = {
	clinic_name: 'Le Med Spa',
	clinic_phone: '(818) 463-3772'
};

/**
 * Look up contact by contactId or phone number.
 * @param {{ phoneNumber?: string, contactId?: string }} opts
 * @returns {Promise<object|null>}
 */
async function lookupContact({ phoneNumber, contactId }) {
	if (contactId) {
		const { data } = await supabaseAdmin
			.from('contacts')
			.select('id, first_name, last_name, full_name, phone, email')
			.eq('id', contactId)
			.maybeSingle();
		if (data) return data;
	}

	if (phoneNumber) {
		const digits = phoneNumber.replace(/\D/g, '');
		const variants = [phoneNumber, digits];
		if (digits.length === 11 && digits.startsWith('1')) variants.push(digits.slice(1));
		if (digits.length === 10) variants.push('+1' + digits, '1' + digits);

		const orFilter = variants.map((v) => `phone_normalized.eq.${v},phone.eq.${v}`).join(',');
		// Fetch all matches and pick the most complete record (prefer one with last_name)
		const { data } = await supabaseAdmin
			.from('contacts')
			.select('id, first_name, last_name, full_name, phone, email')
			.or(orFilter)
			.limit(10);
		if (data?.length) {
			return data.reduce((best, c) => {
				const score = (c.last_name ? 2 : 0) + (c.full_name ? 1 : 0) + (c.email ? 1 : 0);
				const bestScore =
					(best.last_name ? 2 : 0) + (best.full_name ? 1 : 0) + (best.email ? 1 : 0);
				return score > bestScore ? c : best;
			});
		}
	}

	return null;
}

/**
 * Resolve `{{tag}}` placeholders in a message body.
 *
 * Priority:
 * 1. Contact record (first_name, last_name, full_name, phone, email)
 * 2. Static values (clinic_name, clinic_phone)
 * 3. Unresolved tags are stripped (brackets removed, tag name dropped)
 *
 * @param {string} body - Message body with {{tag}} placeholders
 * @param {{ phoneNumber?: string, contactId?: string, conversationId?: string }} context
 * @returns {Promise<string>} Resolved message body
 */
export async function resolveTags(body, context = {}) {
	if (!body || !body.includes('{{')) return body;

	// Look up contact data once
	let contact = null;
	if (context.contactId || context.phoneNumber) {
		try {
			contact = await lookupContact(context);
		} catch (e) {
			console.error('[tag-resolver] Contact lookup failed:', e.message);
		}
	}

	// If we have a conversationId but no contact yet, try via conversation's contact_id
	if (!contact && context.conversationId) {
		try {
			const { data: convo } = await supabaseAdmin
				.from('conversations')
				.select('contact_id')
				.eq('id', context.conversationId)
				.maybeSingle();
			if (convo?.contact_id) {
				contact = await lookupContact({ contactId: convo.contact_id });
			}
		} catch (e) {
			console.error('[tag-resolver] Conversation lookup failed:', e.message);
		}
	}

	// Build value map from contact + static tags
	const values = { ...STATIC_TAGS };

	if (contact) {
		let firstName = contact.first_name || '';
		let lastName = contact.last_name || '';
		let fullName = contact.full_name || '';

		// Derive missing name fields from what's available
		if (fullName && (!firstName || !lastName)) {
			const parts = fullName.trim().split(/\s+/);
			if (!firstName && parts.length >= 1) firstName = parts[0];
			if (!lastName && parts.length >= 2) lastName = parts.slice(1).join(' ');
		}
		if (!fullName && (firstName || lastName)) {
			fullName = [firstName, lastName].filter(Boolean).join(' ');
		}

		if (firstName) values.first_name = firstName;
		if (lastName) values.last_name = lastName;
		if (fullName) values.full_name = fullName;
		if (contact.phone) values.phone = contact.phone;
		if (contact.email) values.email = contact.email;
	}

	// Replace all {{tag}} occurrences
	return body.replace(/\{\{(\w+)\}\}/g, (match, tag) => {
		if (tag in values) return values[tag];
		// Unresolved tag — strip it completely so customers don't see {{raw}}
		return '';
	});
}
