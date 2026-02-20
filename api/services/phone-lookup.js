import { supabaseAdmin } from './supabase.js';

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
