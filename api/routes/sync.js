/**
 * Contact sync endpoints
 *
 * POST /api/sync/textmagic   — Full TextMagic → contacts table sync
 * POST /api/sync/sheet        — Google Sheet (AR patients) → contacts + TextMagic
 * GET  /api/sync/status       — Last sync timestamp (no auth)
 *
 * All POST endpoints require: x-sync-key header matching SYNC_SECRET env var
 */
import { Router } from 'express';
import { supabaseAdmin } from '../services/supabase.js';
import { readSheet, batchWriteSheet } from '../services/google-sheets.js';

const router = Router();

const TM_API_KEY = process.env.TEXTMAGIC_API_KEY;
const TM_USERNAME = process.env.TEXTMAGIC_USERNAME;
const SYNC_SECRET = process.env.SYNC_SECRET;
const BASE_URL = 'https://rest.textmagic.com/api/v2';
const SHEET_CSV_URL = process.env.GOOGLE_SHEET_CSV_URL;

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
	if (!SYNC_SECRET) {
		return res.status(503).json({ error: 'SYNC_SECRET not configured' });
	}
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
			// Store the actual TM phone so writeback doesn't confuse it with AR phone
			metadata.textmagic_phone = tm.phone || null;
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
			if (!existing && tm.id) {
				const { data } = await supabaseAdmin
					.from('contacts')
					.select('id, source, metadata, tags, first_name, last_name, full_name, email')
					.eq('source', 'textmagic')
					.eq('source_id', tm.id.toString())
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
					console.error(`[sync] Update error for contact ${existing.id}:`, updateErr.message);
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
					console.error(
						`[sync] Insert error for ${fullName || phoneNormalized}:`,
						insertErr.message
					);
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

// ─────────────────────────────────────────────────────────────
// CSV parsing utilities (ported from api/scripts/sync-contacts.js)
// ─────────────────────────────────────────────────────────────

function parseCsvLine(line) {
	const values = [];
	let current = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (ch === ',' && !inQuotes) {
			values.push(current);
			current = '';
		} else {
			current += ch;
		}
	}
	values.push(current);
	return values;
}

function parseCsv(content) {
	// Normalize CRLF/CR line endings (Google Sheets exports CRLF)
	const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
	if (lines.length < 2) return [];

	// Clean headers: lowercase + strip trailing numbers ("First Name 2" → "first name")
	const rawHeaders = parseCsvLine(lines[0]);
	const headers = rawHeaders.map((h) =>
		h
			.trim()
			.toLowerCase()
			.replace(/\s+\d+\s*$/, '')
	);

	const records = [];
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;
		const values = parseCsvLine(line);
		const record = {};
		for (let j = 0; j < headers.length; j++) {
			record[headers[j]] = (values[j] || '').trim();
		}
		records.push(record);
	}
	return records;
}

/**
 * Map a Google Sheet row to a contacts table record.
 * The sheet has AR + GHL + TextMagic columns in a unified format.
 */
function mapSheetRow(raw) {
	const firstName = raw['first name'] || raw['first_name'] || '';
	const lastName = raw['last name'] || raw['last_name'] || '';
	const fullName =
		raw['full name'] ||
		(firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || '');
	const phone = raw['phone'] || raw['phone number'] || '';
	const email = raw['email'] || '';
	const arId = raw['ar id'] || '';
	const status = raw['contact type'] || raw['status'] || '';

	// Metadata from extra columns
	const metadata = {};
	const metaMap = {
		'total sales rel': 'total_sales',
		visited: 'last_visited',
		'nick name': 'nickname',
		'referral source': 'referral_source',
		dob: 'dob',
		'address line 1': 'address_line1',
		'address line 2': 'address_line2',
		city: 'city',
		state: 'state',
		zip: 'zip',
		country: 'country',
		'membership type': 'membership_type',
		'patient created date': 'patient_created_date',
		lists: 'lists',
		tags: 'tags',
		'ghl contact id': 'ghl_contact_id',
		'textmagic phone': 'textmagic_phone',
		'textmagic contact id': 'textmagic_contact_id'
	};
	for (const [csvKey, metaKey] of Object.entries(metaMap)) {
		if (raw[csvKey]?.trim()) metadata[metaKey] = raw[csvKey].trim();
	}
	// Store AR ID in metadata too for cross-reference
	if (arId) metadata.ar_id = arId;

	// Tags from sheet data
	const tags = ['patient']; // All AR contacts are patients
	const sheetTags = (raw['tags'] || '').toLowerCase();
	const sheetLists = (raw['lists'] || '').toLowerCase();
	if (sheetTags.includes('vip')) tags.push('vip');
	if (sheetTags.includes('friendfam')) tags.push('friendfam');
	if (sheetTags.includes('vendor')) tags.push('vendor');
	if (sheetLists.includes('partner')) tags.push('partner');
	if (sheetLists.includes('lm team')) tags.push('employee');

	// Lists from sheet data
	const lists = [];
	if (sheetLists.includes('patient')) lists.push('patients');
	if (sheetLists.includes('diamond')) lists.push('diamond');
	if (sheetLists.includes('partner')) lists.push('partners');
	if (sheetLists.includes('lm team')) lists.push('lm-team');
	if (sheetLists.includes('to book')) lists.push('to-book');
	if (sheetLists.includes('lead')) lists.push('leads');

	return {
		first_name: firstName || null,
		last_name: lastName || null,
		full_name: fullName || null,
		phone: phone || null,
		phone_normalized: normalizePhone(phone),
		email: email || null,
		source: 'aesthetic_record',
		source_id: arId || null,
		patient_status: status ? status.toLowerCase() : null,
		tags,
		lists: lists.length > 0 ? lists : [],
		metadata: Object.keys(metadata).length > 0 ? metadata : {},
		last_synced_at: new Date().toISOString()
	};
}

/**
 * TextMagic write helper — POST uses JSON, PUT uses form-encoded (TM API quirk)
 */
async function tmWrite(method, path, body = {}) {
	const isForm = method === 'PUT';
	const resp = await fetch(`${BASE_URL}${path}`, {
		method,
		headers: {
			'X-TM-Username': TM_USERNAME,
			'X-TM-Key': TM_API_KEY,
			'Content-Type': isForm ? 'application/x-www-form-urlencoded' : 'application/json',
			Accept: 'application/json'
		},
		body: isForm ? new URLSearchParams(body).toString() : JSON.stringify(body)
	});
	if (!resp.ok) {
		const text = await resp.text();
		throw new Error(`TextMagic ${method} ${path} ${resp.status}: ${text}`);
	}
	return resp.json();
}

/**
 * Look up the TextMagic "Patients" list ID. Cached for 1 hour.
 */
let cachedPatientsListId = null;
let cachedPatientsListAt = 0;
const TM_LIST_CACHE_TTL = 60 * 60 * 1000; // 1 hour
async function getTmPatientsListId() {
	if (cachedPatientsListId && Date.now() - cachedPatientsListAt < TM_LIST_CACHE_TTL) {
		return cachedPatientsListId;
	}
	const data = await tmFetch('/lists', { search: 'Patients', limit: 10 });
	const list = (data.resources || []).find((l) => l.name.toLowerCase() === 'patients');
	if (list) {
		cachedPatientsListId = list.id;
		cachedPatientsListAt = Date.now();
		return list.id;
	}
	cachedPatientsListId = null;
	return null;
}

/**
 * Search TextMagic contacts by email (exact match).
 * Returns the matching TM contact object or null.
 */
async function tmSearchByEmail(email) {
	if (!email) return null;
	try {
		const data = await tmFetch('/contacts', { search: email, limit: 10 });
		const resources = data.resources || [];
		return resources.find((c) => c.email && c.email.toLowerCase() === email.toLowerCase()) || null;
	} catch {
		return null;
	}
}

/**
 * Delete a TextMagic contact by ID.
 */
async function tmDeleteContact(contactId) {
	const resp = await fetch(`${BASE_URL}/contacts/${contactId}`, {
		method: 'DELETE',
		headers: {
			'X-TM-Username': TM_USERNAME,
			'X-TM-Key': TM_API_KEY
		}
	});
	if (!resp.ok && resp.status !== 404) {
		const text = await resp.text();
		throw new Error(`TextMagic DELETE /contacts/${contactId} ${resp.status}: ${text}`);
	}
}

/**
 * Sync a contact to TextMagic — create, update, or merge duplicates.
 *
 * Proactively looks up by both phone AND email. If the same person has
 * separate TM entries (one matched by phone, another by email), merges
 * them into one contact and deletes the duplicate.
 *
 * Returns { action: 'created'|'updated'|'merged'|'exists'|'skipped'|'error', tmId?, deletedTmId? }
 */
async function syncContactToTextMagic(contact, listId) {
	if (!contact.phone_normalized || !TM_API_KEY || !TM_USERNAME) {
		return { action: 'skipped' };
	}

	let tmPhone = contact.phone_normalized;
	if (tmPhone.length === 10) tmPhone = '1' + tmPhone;

	try {
		// Step 1: Look up by phone
		let phoneContact = null;
		try {
			phoneContact = await tmFetch(`/contacts/phone/${tmPhone}`);
		} catch (err) {
			if (!err.message.includes('404')) {
				console.error(`[sync-sheet] TM phone lookup error for ${tmPhone}:`, err.message);
			}
		}

		// Step 2: Look up by email
		let emailContact = null;
		if (contact.email) {
			emailContact = await tmSearchByEmail(contact.email);
		}

		// Step 3: Resolve duplicates — same person, two TM entries
		if (phoneContact && emailContact && phoneContact.id !== emailContact.id) {
			console.log(
				`[sync-sheet] Merging TM duplicates: phone TM#${phoneContact.id} + email TM#${emailContact.id} → keeping TM#${phoneContact.id}`
			);

			// Delete the email-only duplicate first (frees up the email address)
			await tmDeleteContact(emailContact.id);

			// Update the phone contact with merged data + AR data
			const updates = {
				firstName: contact.first_name || phoneContact.firstName || emailContact.firstName || '',
				lastName: contact.last_name || phoneContact.lastName || emailContact.lastName || '',
				email: contact.email || emailContact.email || ''
			};
			if (listId) updates.lists = listId.toString();

			try {
				await tmWrite('PUT', `/contacts/${phoneContact.id}`, updates);
			} catch (putErr) {
				if (putErr.message.includes('Email')) {
					delete updates.email;
					await tmWrite('PUT', `/contacts/${phoneContact.id}`, updates);
				} else {
					throw putErr;
				}
			}
			return { action: 'merged', tmId: phoneContact.id, deletedTmId: emailContact.id };
		}

		// Step 4a: Phone match only — update with AR data
		if (phoneContact) {
			const updates = {};
			if (contact.first_name && contact.first_name !== phoneContact.firstName)
				updates.firstName = contact.first_name;
			if (contact.last_name && contact.last_name !== phoneContact.lastName)
				updates.lastName = contact.last_name;
			if (contact.email && !phoneContact.email) updates.email = contact.email;

			if (Object.keys(updates).length > 0) {
				try {
					await tmWrite('PUT', `/contacts/${phoneContact.id}`, updates);
				} catch (putErr) {
					if (putErr.message.includes('Email')) {
						delete updates.email;
						if (Object.keys(updates).length > 0) {
							await tmWrite('PUT', `/contacts/${phoneContact.id}`, updates);
						}
					} else {
						throw putErr;
					}
				}
				return { action: 'updated', tmId: phoneContact.id };
			}
			return { action: 'exists', tmId: phoneContact.id };
		}

		// Step 4b: Email match only — update with phone + AR data
		if (emailContact) {
			console.log(
				`[sync-sheet] Found TM contact by email (TM#${emailContact.id}), adding phone ${tmPhone}`
			);
			const updates = {
				phone: tmPhone,
				firstName: contact.first_name || emailContact.firstName || '',
				lastName: contact.last_name || emailContact.lastName || ''
			};
			if (listId) updates.lists = listId.toString();

			try {
				await tmWrite('PUT', `/contacts/${emailContact.id}`, updates);
				return { action: 'updated', tmId: emailContact.id };
			} catch (putErr) {
				if (putErr.message.includes('Phone number already exists')) {
					delete updates.phone;
					await tmWrite('PUT', `/contacts/${emailContact.id}`, updates);
					return { action: 'updated', tmId: emailContact.id };
				}
				throw putErr;
			}
		}

		// Step 5: Neither found — create new
		if (!listId) return { action: 'skipped' };
		try {
			const result = await tmWrite('POST', '/contacts/normalized', {
				phone: tmPhone,
				firstName: contact.first_name || '',
				lastName: contact.last_name || '',
				email: contact.email || '',
				lists: listId.toString()
			});
			return { action: 'created', tmId: result.id };
		} catch (createErr) {
			if (createErr.message.includes('Email')) {
				try {
					const result = await tmWrite('POST', '/contacts/normalized', {
						phone: tmPhone,
						firstName: contact.first_name || '',
						lastName: contact.last_name || '',
						lists: listId.toString()
					});
					return { action: 'created', tmId: result.id };
				} catch (retryErr) {
					console.error(`[sync-sheet] TM create retry error for ${tmPhone}:`, retryErr.message);
					return { action: 'error' };
				}
			}
			console.error(`[sync-sheet] TM create error for ${tmPhone}:`, createErr.message);
			return { action: 'error' };
		}
	} catch (err) {
		console.error(`[sync-sheet] TM sync error for ${tmPhone}:`, err.message);
		return { action: 'error' };
	}
}

/**
 * Write TextMagic phone + contact ID back to the Google Sheet.
 * Reads the sheet, matches rows to Supabase contacts by AR ID or phone,
 * and batch-updates the TextMagic columns (AE-AG) for any rows with new data.
 *
 * @returns {Promise<number>} Number of sheet rows updated
 */
async function writebackTmDataToSheet() {
	const SHEET_NAME = 'patients3';

	const { headers, rows } = await readSheet(SHEET_NAME);
	const cleanHeaders = headers.map((h) =>
		h
			.trim()
			.toLowerCase()
			.replace(/\s+\d+\s*$/, '')
	);

	// Find column indices
	const colIndex = {};
	for (const name of ['ar id', 'phone', 'textmagic phone', 'textmagic contact id']) {
		const idx = cleanHeaders.indexOf(name);
		if (idx !== -1) colIndex[name] = idx;
	}

	if (colIndex['textmagic phone'] === undefined) {
		console.warn('[sync-sheet] Writeback skipped: "TextMagic Phone" column not found');
		return 0;
	}

	// Fetch contacts with TM data from DB
	const { data: contacts } = await supabaseAdmin
		.from('contacts')
		.select('source_id, phone_normalized, metadata')
		.not('metadata->textmagic_contact_id', 'is', null);

	if (!contacts?.length) return 0;

	const byArId = new Map();
	const byPhone = new Map();
	for (const c of contacts) {
		if (c.source_id) byArId.set(c.source_id, c);
		if (c.phone_normalized) byPhone.set(c.phone_normalized, c);
	}

	const toColLetter = (idx) => {
		if (idx < 26) return String.fromCharCode(65 + idx);
		return String.fromCharCode(64 + Math.floor(idx / 26)) + String.fromCharCode(65 + (idx % 26));
	};

	const batchUpdates = [];
	let updated = 0;

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const rowNum = i + 2;

		const arId = row[colIndex['ar id']]?.trim();
		const phone = row[colIndex['phone']]?.trim()?.replace(/\D/g, '');

		let contact = null;
		if (arId && arId !== '-1') contact = byArId.get(arId);
		if (!contact && phone) contact = byPhone.get(phone);
		if (!contact) continue;

		const meta = contact.metadata || {};
		const tmContactId = meta.textmagic_contact_id || '';
		if (!tmContactId) continue;

		// Use the actual phone stored in TextMagic, NOT the generic Supabase phone
		// (which could come from AR or another source).
		// If textmagic_phone key exists (even as null) → use it (clears false values).
		// If key doesn't exist → preserve existing sheet value (backward compat).
		const hasTmPhoneKey = 'textmagic_phone' in meta;
		const tmPhone = meta.textmagic_phone || '';

		const currentTmPhone = row[colIndex['textmagic phone']]?.trim() || '';
		const currentTmId = row[colIndex['textmagic contact id']]?.trim() || '';

		// Determine what to write
		const newTmPhone = hasTmPhoneKey ? tmPhone : currentTmPhone;
		const newTmId = tmContactId ? String(tmContactId) : currentTmId;
		if (newTmPhone === currentTmPhone && newTmId === currentTmId) continue;

		const startLetter = toColLetter(colIndex['textmagic phone']);
		const endLetter = toColLetter(colIndex['textmagic contact id']);
		batchUpdates.push({
			range: `'${SHEET_NAME}'!${startLetter}${rowNum}:${endLetter}${rowNum}`,
			values: [[newTmPhone, newTmId]]
		});
		updated++;
	}

	if (batchUpdates.length > 0) {
		const BATCH_SIZE = 100;
		for (let i = 0; i < batchUpdates.length; i += BATCH_SIZE) {
			await batchWriteSheet(batchUpdates.slice(i, i + BATCH_SIZE));
		}
		console.log(`[sync-sheet] Writeback: updated ${updated} rows in Google Sheet`);
	}

	return updated;
}

/**
 * POST /api/sync/sheet
 * Fetch AR patients from Google Sheet, insert/enrich in contacts DB,
 * then sync each new/updated contact to TextMagic.
 *
 * Query params:
 *   ?dry_run=true — log actions without writing to DB or TM
 */
router.post('/sheet', async (req, res) => {
	// Auth
	if (!SYNC_SECRET) {
		return res.status(503).json({ error: 'SYNC_SECRET not configured' });
	}
	const key = req.headers['x-sync-key'] || req.query.key;
	if (key !== SYNC_SECRET) {
		return res.status(401).json({ error: 'Invalid sync key' });
	}

	if (!SHEET_CSV_URL) {
		return res.status(500).json({ error: 'GOOGLE_SHEET_CSV_URL not configured' });
	}

	const dryRun = req.query.dry_run === 'true';
	const startTime = Date.now();

	try {
		// 1. Fetch Google Sheet CSV (follows redirects)
		console.log(`[sync-sheet] Fetching Google Sheet CSV${dryRun ? ' (dry run)' : ''}...`);
		const csvResp = await fetch(SHEET_CSV_URL, { redirect: 'follow' });
		if (!csvResp.ok) {
			throw new Error(`Google Sheet fetch failed: ${csvResp.status}`);
		}
		const csvText = await csvResp.text();
		const rows = parseCsv(csvText);
		console.log(`[sync-sheet] Parsed ${rows.length} rows from sheet`);

		// 2. Filter valid rows (AR ID must be a positive number)
		const validRows = rows.filter((r) => {
			const arId = r['ar id'];
			return arId && !isNaN(arId) && parseInt(arId, 10) > 0;
		});
		console.log(
			`[sync-sheet] ${validRows.length} valid AR contacts (skipped ${rows.length - validRows.length} junk rows)`
		);

		// 3. Get existing contacts for diffing
		const { data: existingByAr, error: arFetchErr } = await supabaseAdmin
			.from('contacts')
			.select('id, source_id, phone_normalized, tags, lists, metadata')
			.eq('source', 'aesthetic_record')
			.not('source_id', 'is', null);

		if (arFetchErr) {
			throw new Error(`Failed to fetch existing AR contacts: ${arFetchErr.message}`);
		}

		const arIdSet = new Set((existingByAr || []).map((c) => String(c.source_id)));

		// Also get all contacts indexed by phone for TM lead enrichment
		const { data: allContacts, error: allFetchErr } = await supabaseAdmin
			.from('contacts')
			.select(
				'id, source, source_id, phone_normalized, email, tags, lists, metadata, first_name, last_name, full_name'
			);

		if (allFetchErr) {
			throw new Error(`Failed to fetch contacts index: ${allFetchErr.message}`);
		}

		// Index contacts by phone/email — prefer aesthetic_record source on collision
		const phoneIndex = new Map();
		const emailIndex = new Map();
		for (const c of allContacts || []) {
			if (c.phone_normalized) {
				const existing = phoneIndex.get(c.phone_normalized);
				if (!existing || c.source === 'aesthetic_record') {
					phoneIndex.set(c.phone_normalized, c);
				}
			}
			if (c.email) {
				const existing = emailIndex.get(c.email.toLowerCase());
				if (!existing || c.source === 'aesthetic_record') {
					emailIndex.set(c.email.toLowerCase(), c);
				}
			}
		}

		// 4. Process each sheet row
		let inserted = 0;
		let enriched = 0;
		let unchanged = 0;
		let tmCreated = 0;
		let tmUpdated = 0;
		let tmExists = 0;
		let tmMerged = 0;
		let tmErrors = 0;
		let errors = 0;

		// Resolve TM "Patients" list ID once
		let tmListId = null;
		if (TM_API_KEY && TM_USERNAME && !dryRun) {
			try {
				tmListId = await getTmPatientsListId();
				if (!tmListId)
					console.warn(
						'[sync-sheet] TextMagic "Patients" list not found — new contacts will not be added to TM'
					);
			} catch (err) {
				console.warn('[sync-sheet] Could not fetch TM lists:', err.message);
			}
		}

		// Contacts that need TM sync (new or enriched)
		const tmSyncQueue = [];

		for (const row of validRows) {
			const mapped = mapSheetRow(row);
			const arId = mapped.source_id;

			// Already synced by AR ID?
			if (arIdSet.has(arId)) {
				unchanged++;
				continue;
			}

			// Match by phone (TM lead enrichment case)
			let existingContact = mapped.phone_normalized
				? phoneIndex.get(mapped.phone_normalized)
				: null;

			// Match by email fallback
			if (!existingContact && mapped.email) {
				existingContact = emailIndex.get(mapped.email.toLowerCase());
			}

			if (existingContact) {
				// Enrich existing contact with AR data
				if (dryRun) {
					console.log(
						`[sync-sheet] [dry-run] Would enrich ${mapped.full_name} (${existingContact.source} → AR ID ${arId})`
					);
					enriched++;
					continue;
				}

				const mergedTags = [
					...new Set([...(existingContact.tags || []).filter((t) => t !== 'lead'), ...mapped.tags])
				];
				const mergedLists = [...new Set([...(existingContact.lists || []), ...mapped.lists])];
				const mergedMeta = { ...(existingContact.metadata || {}), ...mapped.metadata };

				const update = {
					source: 'aesthetic_record',
					source_id: arId,
					tags: mergedTags,
					lists: mergedLists,
					metadata: mergedMeta,
					patient_status: mapped.patient_status || existingContact.patient_status,
					last_synced_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				};

				// Fill empty fields from sheet
				if (!existingContact.first_name && mapped.first_name) update.first_name = mapped.first_name;
				if (!existingContact.last_name && mapped.last_name) update.last_name = mapped.last_name;
				if (!existingContact.full_name && mapped.full_name) update.full_name = mapped.full_name;
				if (!existingContact.email && mapped.email) update.email = mapped.email;

				const { error } = await supabaseAdmin
					.from('contacts')
					.update(update)
					.eq('id', existingContact.id);

				if (error) {
					console.error(`[sync-sheet] Enrich error for ${mapped.full_name}:`, error.message);
					errors++;
				} else {
					enriched++;
					tmSyncQueue.push({ ...mapped, ...update, _dbId: existingContact.id });
				}
			} else {
				// New contact — insert
				if (dryRun) {
					console.log(`[sync-sheet] [dry-run] Would insert ${mapped.full_name} (AR ID ${arId})`);
					inserted++;
					continue;
				}

				const { data: insertedRow, error } = await supabaseAdmin
					.from('contacts')
					.insert(mapped)
					.select('id')
					.single();
				if (error) {
					console.error(`[sync-sheet] Insert error for ${mapped.full_name}:`, error.message);
					errors++;
				} else {
					inserted++;
					tmSyncQueue.push({ ...mapped, _dbId: insertedRow.id });
				}
			}
		}

		// 5. Sync new/enriched contacts to TextMagic
		if (!dryRun && tmSyncQueue.length > 0 && TM_API_KEY && TM_USERNAME) {
			console.log(`[sync-sheet] Syncing ${tmSyncQueue.length} contacts to TextMagic...`);
			for (const contact of tmSyncQueue) {
				const result = await syncContactToTextMagic(contact, tmListId);
				if (result.action === 'created') tmCreated++;
				else if (result.action === 'updated') tmUpdated++;
				else if (result.action === 'merged') tmMerged++;
				else if (result.action === 'exists') tmExists++;
				else if (result.action === 'error') tmErrors++;

				// Store TM contact ID in metadata if we got one
				if (result.tmId && contact._dbId) {
					await supabaseAdmin
						.from('contacts')
						.update({
							metadata: {
								...(contact.metadata || {}),
								textmagic_contact_id: result.tmId.toString()
							}
						})
						.eq('id', contact._dbId);
				}

				// Rate limit: 100ms between TM API calls
				await new Promise((r) => setTimeout(r, 100));
			}
		}

		// 6. Refresh conversation display_names for affected contacts
		let namesRefreshed = 0;
		if (!dryRun && (inserted > 0 || enriched > 0)) {
			const { data: convos } = await supabaseAdmin
				.from('conversations')
				.select('id, phone_number, display_name, contact_id');

			if (convos) {
				for (const convo of convos) {
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
							.update({ display_name: contact.full_name, contact_id: contact.id })
							.eq('id', convo.id);
						namesRefreshed++;
					} else if (contact && !convo.contact_id) {
						await supabaseAdmin
							.from('conversations')
							.update({ contact_id: contact.id })
							.eq('id', convo.id);
					}
				}
			}
		}

		// 7. Write TM data back to Google Sheet (fire-and-forget — don't block response)
		let sheetWriteback = 0;
		if (!dryRun && (tmCreated > 0 || tmUpdated > 0 || tmMerged > 0)) {
			try {
				sheetWriteback = await writebackTmDataToSheet();
			} catch (wbErr) {
				console.error('[sync-sheet] Writeback error (non-fatal):', wbErr.message);
			}
		}

		const duration = ((Date.now() - startTime) / 1000).toFixed(1);

		console.log(
			`[sync-sheet] Done: ${validRows.length} sheet rows — ${inserted} new, ${enriched} enriched, ${unchanged} unchanged, ${errors} errors | TM: ${tmCreated} created, ${tmUpdated} updated, ${tmMerged} merged, ${tmExists} existing, ${tmErrors} errors | ${namesRefreshed} names refreshed, ${sheetWriteback} sheet rows written back (${duration}s)${dryRun ? ' [DRY RUN]' : ''}`
		);

		res.json({
			ok: true,
			dryRun,
			sheetRows: validRows.length,
			inserted,
			enriched,
			unchanged,
			errors,
			textmagic: {
				created: tmCreated,
				updated: tmUpdated,
				merged: tmMerged,
				existing: tmExists,
				errors: tmErrors
			},
			namesRefreshed,
			sheetWriteback,
			duration: `${duration}s`
		});
	} catch (err) {
		console.error('[sync-sheet] Error:', err.message);
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
