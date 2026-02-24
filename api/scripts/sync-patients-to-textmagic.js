/**
 * Sync AR patient data FROM our contacts DB → TO TextMagic.
 *
 * For each aesthetic_record contact:
 *   - If we already have a textmagic_contact_id → PUT to update TM contact
 *   - If not → search TM contacts by phone number
 *     - If found → PUT to update, save textmagic_contact_id to our DB
 *     - If not found → POST to create, save textmagic_contact_id to our DB
 *
 * Usage:
 *   node api/scripts/sync-patients-to-textmagic.js              # full sync
 *   node api/scripts/sync-patients-to-textmagic.js --dry-run    # preview without writing
 *   node api/scripts/sync-patients-to-textmagic.js --phone 8586107100  # sync one contact
 *
 * Environment:
 *   TEXTMAGIC_API_KEY, TEXTMAGIC_USERNAME (from api/.env)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (from api/.env)
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env files
for (const envFile of ['../.env', '../../.env-vars']) {
	const p = resolve(__dirname, envFile);
	if (existsSync(p)) {
		for (const line of readFileSync(p, 'utf-8').split('\n')) {
			const t = line.trim();
			if (!t || t.startsWith('#')) continue;
			const eq = t.indexOf('=');
			if (eq === -1) continue;
			if (!process.env[t.slice(0, eq)]) {
				process.env[t.slice(0, eq)] = t.slice(eq + 1);
			}
		}
	}
}

// Validate required env vars
const TM_API_KEY = process.env.TEXTMAGIC_API_KEY;
const TM_USERNAME = process.env.TEXTMAGIC_USERNAME;

if (!TM_API_KEY) {
	console.error('Missing TEXTMAGIC_API_KEY. Set it in api/.env');
	process.exit(1);
}
if (!TM_USERNAME) {
	console.error('Missing TEXTMAGIC_USERNAME. Set it in api/.env');
	process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Parse CLI args
const dryRun = process.argv.includes('--dry-run');
const phoneIdx = process.argv.indexOf('--phone');
const singlePhone = phoneIdx >= 0 ? process.argv[phoneIdx + 1] : null;

const BASE_URL = 'https://rest.textmagic.com/api/v2';

// ── TextMagic API helpers ──────────────────────────────────────────────────

async function tmFetch(path, params = {}) {
	const url = new URL(`${BASE_URL}${path}`);
	for (const [k, v] of Object.entries(params)) {
		url.searchParams.set(k, String(v));
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
		throw new Error(`TM GET ${path} ${resp.status}: ${body}`);
	}
	return resp.json();
}

async function tmPost(path, body) {
	const resp = await fetch(`${BASE_URL}${path}`, {
		method: 'POST',
		headers: {
			'X-TM-Username': TM_USERNAME,
			'X-TM-Key': TM_API_KEY,
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json'
		},
		body: new URLSearchParams(body).toString()
	});
	if (!resp.ok) {
		const text = await resp.text();
		throw new Error(`TM POST ${path} ${resp.status}: ${text}`);
	}
	return resp.json();
}

async function tmPut(path, body) {
	const resp = await fetch(`${BASE_URL}${path}`, {
		method: 'PUT',
		headers: {
			'X-TM-Username': TM_USERNAME,
			'X-TM-Key': TM_API_KEY,
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json'
		},
		body: new URLSearchParams(body).toString()
	});
	if (!resp.ok) {
		const text = await resp.text();
		throw new Error(`TM PUT ${path} ${resp.status}: ${text}`);
	}
	return resp.json();
}

// ── Phone normalization ──────────────────────────────────────────────────────

function normalizeDigits(phone) {
	if (!phone) return null;
	const digits = String(phone).replace(/\D/g, '');
	if (!digits) return null;
	// US numbers: ensure 11 digits with leading 1
	if (digits.length === 10) return '1' + digits;
	return digits;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	console.log('=== AR Patient → TextMagic Sync ===');
	if (dryRun) console.log('(DRY RUN — no writes to TextMagic or Supabase)\n');
	if (singlePhone) console.log(`Single contact mode: ${singlePhone}\n`);

	// Step 1: Ensure a "Patients" list exists in TextMagic
	console.log('Fetching TextMagic lists...');
	let patientsListId = null;
	const listsData = await tmFetch('/lists', { limit: 100 });
	const lists = listsData.resources || [];
	for (const list of lists) {
		if (list.name.toLowerCase() === 'patients' || list.name.toLowerCase() === 'patient') {
			patientsListId = list.id;
			break;
		}
	}
	if (!patientsListId) {
		// Also check for "All" or "All Contacts" list as fallback
		for (const list of lists) {
			if (list.name.toLowerCase().includes('all')) {
				patientsListId = list.id;
				break;
			}
		}
	}
	if (!patientsListId && !dryRun) {
		console.log('  Creating "Patients" list in TextMagic...');
		const newList = await tmPost('/lists', { name: 'Patients' });
		patientsListId = newList.id;
	}
	console.log(`  Using list ID: ${patientsListId || '(dry-run, skipped)'}`);

	// Step 2: Fetch/create custom fields for AR-specific data
	console.log('\nFetching TextMagic custom fields...');
	/** @type {Record<string, number>} name → id */
	const customFieldIds = {};
	let cfPage = 1;
	let cfTotalPages = 1;
	do {
		const cfData = await tmFetch('/customfields', { page: cfPage, limit: 100 });
		const existingFields = cfData.resources || [];
		for (const cf of existingFields) {
			customFieldIds[cf.name.toLowerCase()] = cf.id;
		}
		cfTotalPages = cfData.pageCount || 1;
		cfPage++;
	} while (cfPage <= cfTotalPages);
	console.log(`  Found ${Object.keys(customFieldIds).length} existing custom fields`);

	const requiredFields = ['AR ID', 'AR Created Date', 'DOB', 'Last Visited', 'Referral Source'];
	for (const fieldName of requiredFields) {
		if (!customFieldIds[fieldName.toLowerCase()]) {
			if (dryRun) {
				console.log(`  [dry-run] Would create custom field: ${fieldName}`);
			} else {
				try {
					const created = await tmPost('/customfields', { name: fieldName });
					customFieldIds[fieldName.toLowerCase()] = created.id;
					console.log(`  Created custom field: ${fieldName} (ID: ${created.id})`);
				} catch (err) {
					if (err.message.includes('already exists')) {
						console.log(
							`  Custom field "${fieldName}" already exists (different casing) — skipping`
						);
					} else {
						throw err;
					}
				}
			}
		} else {
			console.log(
				`  Custom field exists: ${fieldName} (ID: ${customFieldIds[fieldName.toLowerCase()]})`
			);
		}
	}

	// Step 3: Fetch all TM contacts and build phone → contact lookup
	console.log('\nFetching all TextMagic contacts...');
	/** @type {Map<string, any>} normalized phone → TM contact */
	const tmByPhone = new Map();
	/** @type {Map<number, any>} TM ID → TM contact */
	const tmById = new Map();
	let page = 1;
	let totalPages = 1;
	let tmTotal = 0;
	do {
		const data = await tmFetch('/contacts', { page, limit: 100 });
		const resources = data.resources || [];
		for (const c of resources) {
			const norm = normalizeDigits(c.phone);
			if (norm) tmByPhone.set(norm, c);
			tmById.set(c.id, c);
		}
		tmTotal += resources.length;
		totalPages = data.pageCount || 1;
		page++;
	} while (page <= totalPages);
	console.log(`  Loaded ${tmTotal} TextMagic contacts`);

	// Step 4: Fetch AR patients from our contacts table
	console.log('\nFetching AR patients from Supabase...');
	let query = supabase
		.from('contacts')
		.select('*')
		.eq('source', 'aesthetic_record')
		.order('full_name');

	if (singlePhone) {
		const norm = normalizeDigits(singlePhone);
		query = query.or(`phone_normalized.eq.${norm},phone.ilike.%${singlePhone}%`);
	}

	const { data: patients, error: fetchErr } = await query;
	if (fetchErr) {
		console.error('Failed to fetch patients:', fetchErr.message);
		process.exit(1);
	}
	console.log(`  Found ${patients.length} AR patients`);

	// Step 5: Sync each patient to TextMagic
	let created = 0;
	let updated = 0;
	let skipped = 0;
	let errors = 0;

	for (let i = 0; i < patients.length; i++) {
		const patient = patients[i];
		const phoneNorm = normalizeDigits(patient.phone || patient.phone_normalized);

		if (!phoneNorm) {
			skipped++;
			continue;
		}

		const meta = patient.metadata || {};
		const tmContactId = meta.textmagic_contact_id ? parseInt(meta.textmagic_contact_id, 10) : null;

		// Find TM contact: by saved ID, then by phone
		let tmContact = null;
		if (tmContactId && tmById.has(tmContactId)) {
			tmContact = tmById.get(tmContactId);
		}
		if (!tmContact) {
			tmContact = tmByPhone.get(phoneNorm) || null;
		}

		// Build update payload
		const payload = {
			phone: phoneNorm,
			firstName: patient.first_name || '',
			lastName: patient.last_name || '',
			email: patient.email || ''
		};
		if (patientsListId) {
			payload.lists = String(patientsListId);
		}

		// Custom field values to set after create/update
		const customValues = {};
		if (patient.source_id) customValues['ar id'] = patient.source_id;
		if (meta.ar_created_date) customValues['ar created date'] = meta.ar_created_date;
		if (meta.dob) customValues['dob'] = meta.dob;
		if (meta.last_visited) customValues['last visited'] = meta.last_visited;
		if (meta.referral_source) customValues['referral source'] = meta.referral_source;

		try {
			if (tmContact) {
				// Update existing TM contact
				if (dryRun) {
					console.log(
						`  [dry-run] Would UPDATE TM#${tmContact.id}: ${patient.full_name} (${phoneNorm})`
					);
				} else {
					try {
						await tmPut(`/contacts/${tmContact.id}`, payload);
					} catch (putErr) {
						// Retry without email if TM says email already exists on another contact
						if (putErr.message.includes('Email address already exists')) {
							const { email: _dropped, ...payloadNoEmail } = payload;
							await tmPut(`/contacts/${tmContact.id}`, payloadNoEmail);
						} else {
							throw putErr;
						}
					}
				}
				updated++;

				// Save TM contact ID to our DB if we didn't have it
				if (!tmContactId && !dryRun) {
					await supabase
						.from('contacts')
						.update({
							metadata: { ...meta, textmagic_contact_id: String(tmContact.id) },
							updated_at: new Date().toISOString()
						})
						.eq('id', patient.id);
				}

				// Set custom fields
				if (!dryRun) {
					for (const [fieldName, value] of Object.entries(customValues)) {
						const cfId = customFieldIds[fieldName];
						if (cfId && value) {
							try {
								await tmPut(`/customfields/${cfId}/update`, {
									contactId: String(tmContact.id),
									value: String(value)
								});
							} catch (cfErr) {
								// Non-fatal — log and continue
								console.error(
									`    Custom field "${fieldName}" failed for TM#${tmContact.id}: ${cfErr.message}`
								);
							}
						}
					}
				}
			} else {
				// Create new TM contact
				if (dryRun) {
					console.log(`  [dry-run] Would CREATE: ${patient.full_name} (${phoneNorm})`);
				} else {
					let newContact;
					try {
						newContact = await tmPost('/contacts', payload);
					} catch (postErr) {
						if (
							postErr.message.includes('Email address already exists') ||
							postErr.message.includes('valid email')
						) {
							const { email: _dropped, ...payloadNoEmail } = payload;
							newContact = await tmPost('/contacts', payloadNoEmail);
						} else if (postErr.message.includes('valid phone')) {
							console.error(`  SKIP ${patient.full_name}: invalid phone ${phoneNorm}`);
							skipped++;
							continue;
						} else {
							throw postErr;
						}
					}
					const newId = newContact.id;

					// Save TM contact ID to our DB
					await supabase
						.from('contacts')
						.update({
							metadata: { ...meta, textmagic_contact_id: String(newId) },
							updated_at: new Date().toISOString()
						})
						.eq('id', patient.id);

					// Set custom fields on new contact
					for (const [fieldName, value] of Object.entries(customValues)) {
						const cfId = customFieldIds[fieldName];
						if (cfId && value) {
							try {
								await tmPut(`/customfields/${cfId}/update`, {
									contactId: String(newId),
									value: String(value)
								});
							} catch (cfErr) {
								console.error(
									`    Custom field "${fieldName}" failed for new TM#${newId}: ${cfErr.message}`
								);
							}
						}
					}
				}
				created++;
			}
		} catch (err) {
			console.error(`  ERROR ${patient.full_name} (${phoneNorm}): ${err.message}`);
			errors++;
		}

		if ((i + 1) % 25 === 0) {
			console.log(`  Processed ${i + 1} / ${patients.length}`);
		}

		// Rate limit: 100ms between TM API calls
		await new Promise((r) => setTimeout(r, 100));
	}

	console.log(`\n── Sync Complete ──`);
	console.log(`  Created in TM: ${created}`);
	console.log(`  Updated in TM: ${updated}`);
	console.log(`  Skipped (no phone): ${skipped}`);
	console.log(`  Errors: ${errors}`);
	console.log(`  Total processed: ${patients.length}`);
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
