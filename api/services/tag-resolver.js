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
		const { data } = await supabaseAdmin
			.from('contacts')
			.select('id, first_name, last_name, full_name, phone, email')
			.or(orFilter)
			.limit(1)
			.maybeSingle();
		if (data) return data;
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
		if (contact.first_name) values.first_name = contact.first_name;
		if (contact.last_name) values.last_name = contact.last_name;
		if (contact.full_name) values.full_name = contact.full_name;
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
