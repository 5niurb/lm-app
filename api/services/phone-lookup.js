import { supabaseAdmin } from './supabase.js';

/**
 * Normalize a phone number to E.164 format (+1XXXXXXXXXX).
 * Handles: +13105551234, 13105551234, 3105551234, (310) 555-1234, etc.
 * @param {string} phone
 * @returns {string} E.164 formatted number, or original string if can't normalize
 */
export function normalizePhone(phone) {
	if (!phone) return phone;
	const digits = phone.replace(/\D/g, '');
	if (digits.length === 10) return '+1' + digits;
	if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
	if (phone.startsWith('+') && digits.length >= 10) return phone;
	return phone;
}

/**
 * Find an existing conversation by phone number.
 * Uses normalized phone + variant matching. Returns the conversation row or null.
 * Intentionally does NOT filter by twilio_number — one thread per customer.
 * @param {string} phone
 * @returns {Promise<{id: string, [key: string]: any} | null>}
 */
export async function findConversation(phone) {
	if (!phone) return null;
	const normalized = normalizePhone(phone);
	const digits = phone.replace(/\D/g, '');

	// Build variant list for matching existing conversations
	const variants = new Set([normalized, phone, digits]);
	if (digits.length === 11 && digits.startsWith('1')) variants.add('+' + digits);
	if (digits.length === 10) {
		variants.add('+1' + digits);
		variants.add('1' + digits);
	}

	const orFilter = [...variants].map((v) => `phone_number.eq.${v}`).join(',');
	const { data } = await supabaseAdmin
		.from('conversations')
		.select('*')
		.or(orFilter)
		.order('last_at', { ascending: false })
		.limit(1);

	return data?.[0] || null;
}

/**
 * Look up a contact by phone number, trying multiple format variants.
 * Returns { contactId, contactName } or nulls if not found.
 *
 * Handles: +13105551234, 13105551234, 3105551234, (310) 555-1234, etc.
 */
export async function lookupContactByPhone(phone) {
	if (!phone || phone.startsWith('client:')) return { contactId: null, contactName: null };

	const digits = phone.replace(/\D/g, '');
	if (!digits) return { contactId: null, contactName: null };

	// Build variants: +13106218356 → ['13106218356', '3106218356', '+13106218356']
	const variants = [digits];
	if (digits.length === 11 && digits.startsWith('1')) {
		variants.push(digits.slice(1)); // strip country code
	}
	if (digits.length === 10) {
		variants.push('1' + digits); // add country code
	}
	variants.push(phone); // original format with +

	// Query using OR across all variants
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
