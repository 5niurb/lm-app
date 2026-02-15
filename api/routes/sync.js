/**
 * Contact sync endpoints — TextMagic → contacts table
 *
 * POST /api/sync/textmagic   — Run full TextMagic contact sync
 *   Requires: x-sync-key header matching SYNC_SECRET env var
 *   Called by pg_cron every 15 minutes
 *
 * GET  /api/sync/status       — Last sync timestamp (no auth)
 */
import { Router } from 'express';
import { supabaseAdmin } from '../services/supabase.js';

const router = Router();

const TM_API_KEY = process.env.TEXTMAGIC_API_KEY;
const TM_USERNAME = process.env.TEXTMAGIC_USERNAME;
const SYNC_SECRET = process.env.SYNC_SECRET || 'lm-sync-2026';
const BASE_URL = 'https://rest.textmagic.com/api/v2';

/**
 * Authenticated TextMagic API request
 */
async function tmFetch(path, params = {}) {
	const url = new URL(`${BASE_URL}${path}`);
	for (const [k, v] of Object.entries(params)) {
		url.searchParams.set(k, v);
	}
	const resp = await fetch(url, {
		headers: {
			'X-TM-Username': TM_USERNAME,
			'X-TM-Key': TM_API_KEY,
			Accept: 'application/json'
		}
	});
	if (!resp.ok) {
		const body = await resp.text();
		throw new Error(`TextMagic API ${resp.status}: ${body}`);
	}
	return resp.json();
}

/**
 * Normalize phone to digits only
 */
function normalizePhone(phone) {
	if (!phone) return null;
	const digits = phone.replace(/\D/g, '');
	return digits || null;
}

/**
 * POST /api/sync/textmagic
 * Syncs all TextMagic contacts into our contacts table.
 * Updates existing names if TextMagic has a newer/different name.
 */
router.post('/textmagic', async (req, res) => {
	// Simple auth — pg_cron sends this header
	const key = req.headers['x-sync-key'] || req.query.key;
	if (key !== SYNC_SECRET) {
		return res.status(401).json({ error: 'Invalid sync key' });
	}

	if (!TM_API_KEY || !TM_USERNAME) {
		return res.status(500).json({ error: 'TextMagic credentials not configured' });
	}

	const startTime = Date.now();

	try {
		// Fetch all contacts with pagination
		let allContacts = [];
		let currentPage = 1;
		let totalPages;

		do {
			const data = await tmFetch('/contacts', { page: currentPage, limit: 100 });
			const resources = data.resources || [];
			allContacts = allContacts.concat(resources);
			totalPages = data.pageCount || 1;
			currentPage++;
		} while (currentPage <= totalPages);

		let inserted = 0;
		let updated = 0;
		let skipped = 0;
		let errors = 0;

		for (const tm of allContacts) {
			const phone = tm.phone || '';
			const phoneNormalized = normalizePhone(phone);
			const firstName = tm.firstName || '';
			const lastName = tm.lastName || '';
			const fullName =
				firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || '';
			const email = tm.email || null;

			if (!fullName && !phoneNormalized && !email) {
				skipped++;
				continue;
			}

			// Build metadata
			const metadata = {};
			if (tm.id) metadata.textmagic_contact_id = tm.id.toString();
			if (tm.companyName) metadata.company = tm.companyName;
			if (tm.country?.id) metadata.country = tm.country.name || tm.country.id;
			if (tm.customFieldValues && Array.isArray(tm.customFieldValues)) {
				for (const cf of tm.customFieldValues) {
					if (cf.value) {
						const fieldName = cf.name || `custom_${cf.id}`;
						metadata[`tm_${fieldName.toLowerCase().replace(/\s+/g, '_')}`] = cf.value;
					}
				}
			}

			// Check if contact exists
			let existing = null;
			if (phoneNormalized) {
				const { data } = await supabaseAdmin
					.from('contacts')
					.select('id, source, metadata, tags, first_name, last_name, full_name, email')
					.eq('phone_normalized', phoneNormalized)
					.limit(1)
					.maybeSingle();
				existing = data;
			}
			if (!existing && email) {
				const { data } = await supabaseAdmin
					.from('contacts')
					.select('id, source, metadata, tags, first_name, last_name, full_name, email')
					.eq('email', email)
					.limit(1)
					.maybeSingle();
				existing = data;
			}

			if (existing) {
				const mergedMeta = { ...(existing.metadata || {}), ...metadata };
				const existingTags = existing.tags || [];
				const hasRicherTag = existingTags.some((t) =>
					['patient', 'partner', 'employee'].includes(t)
				);
				const mergedTags = hasRicherTag
					? [...new Set([...existingTags])]
					: [...new Set([...existingTags, 'lead'])];

				const update = {
					metadata: mergedMeta,
					tags: mergedTags,
					last_synced_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				};

				// Update name if TextMagic has one and it's different
				if (firstName && firstName !== existing.first_name) update.first_name = firstName;
				if (lastName && lastName !== existing.last_name) update.last_name = lastName;
				if (fullName && fullName !== existing.full_name) update.full_name = fullName;
				if (email && !existing.email) update.email = email;

				const { error: updateErr } = await supabaseAdmin
					.from('contacts')
					.update(update)
					.eq('id', existing.id);

				if (updateErr) {
					errors++;
				} else {
					updated++;
				}
			} else {
				const contactData = {
					first_name: firstName || null,
					last_name: lastName || null,
					full_name: fullName || null,
					phone: phone || null,
					phone_normalized: phoneNormalized,
					email,
					source: 'textmagic',
					source_id: tm.id ? tm.id.toString() : null,
					tags: ['lead'],
					metadata,
					last_synced_at: new Date().toISOString()
				};

				const { error: insertErr } = await supabaseAdmin.from('contacts').insert(contactData);
				if (insertErr) {
					errors++;
				} else {
					inserted++;
				}
			}
		}

		// Auto-tag contacts with AR ID as 'patient'
		const { data: arContacts } = await supabaseAdmin
			.from('contacts')
			.select('id, tags, metadata')
			.not('metadata->ar_id', 'is', null);

		let arTagged = 0;
		if (arContacts) {
			for (const c of arContacts) {
				const tags = c.tags || [];
				if (!tags.includes('patient')) {
					const newTags = [...new Set([...tags.filter((t) => t !== 'lead'), 'patient'])];
					await supabaseAdmin.from('contacts').update({ tags: newTags }).eq('id', c.id);
					arTagged++;
				}
			}
		}

		// Refresh conversation display_names from contacts table
		// This keeps chat names in sync when contacts are updated
		const { data: staleConvos } = await supabaseAdmin
			.from('conversations')
			.select('id, phone_number, display_name, contact_id');

		let namesRefreshed = 0;
		if (staleConvos) {
			for (const convo of staleConvos) {
				// Find matching contact by phone
				const phoneDigits = convo.phone_number?.replace(/\D/g, '');
				if (!phoneDigits) continue;

				const { data: contact } = await supabaseAdmin
					.from('contacts')
					.select('id, full_name')
					.eq('phone_normalized', phoneDigits)
					.limit(1)
					.maybeSingle();

				if (contact && contact.full_name && contact.full_name !== convo.display_name) {
					await supabaseAdmin
						.from('conversations')
						.update({
							display_name: contact.full_name,
							contact_id: contact.id
						})
						.eq('id', convo.id);
					namesRefreshed++;
				} else if (contact && !convo.contact_id) {
					// Link contact even if name hasn't changed
					await supabaseAdmin
						.from('conversations')
						.update({ contact_id: contact.id })
						.eq('id', convo.id);
				}
			}
		}

		const duration = ((Date.now() - startTime) / 1000).toFixed(1);

		// Log the sync result
		console.log(
			`[sync] TextMagic: ${allContacts.length} contacts — ${inserted} new, ${updated} updated, ${skipped} skipped, ${errors} errors, ${arTagged} AR-tagged, ${namesRefreshed} names refreshed (${duration}s)`
		);

		res.json({
			ok: true,
			total: allContacts.length,
			inserted,
			updated,
			skipped,
			errors,
			arTagged,
			namesRefreshed,
			duration: `${duration}s`
		});
	} catch (err) {
		console.error('[sync] TextMagic error:', err.message);
		res.status(500).json({ error: err.message });
	}
});

/**
 * GET /api/sync/status — last sync info (no auth)
 */
router.get('/status', async (req, res) => {
	const { data } = await supabaseAdmin
		.from('contacts')
		.select('last_synced_at')
		.not('last_synced_at', 'is', null)
		.order('last_synced_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	res.json({
		lastSync: data?.last_synced_at || null
	});
});

export default router;
