/**
 * Sync contacts from TextMagic API into the contacts table.
 *
 * Fetches all contacts from TextMagic and upserts them into our
 * contacts database, matching by phone number.
 *
 * Usage:
 *   node api/scripts/sync-textmagic.js
 *   node api/scripts/sync-textmagic.js --dry-run    # preview without writing
 *
 * Environment:
 *   TEXTMAGIC_API_KEY        — TextMagic API key
 *   TEXTMAGIC_USERNAME       — TextMagic account username
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
	console.error('Missing TEXTMAGIC_API_KEY. Set it in api/.env or .env-vars');
	process.exit(1);
}
if (!TM_USERNAME) {
	console.error('Missing TEXTMAGIC_USERNAME. Set it in api/.env or .env-vars');
	console.error('This is your TextMagic account username (not email).');
	console.error('Find it at: https://my.textmagic.com/online/api/rest-api/keys');
	process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const dryRun = process.argv.includes('--dry-run');
const BASE_URL = 'https://rest.textmagic.com/api/v2';

/**
 * Make an authenticated TextMagic API request.
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
 * Normalize a phone number to digits only.
 */
function normalizePhone(phone) {
	if (!phone) return null;
	const digits = phone.replace(/\D/g, '');
	return digits || null;
}

async function main() {
	console.log('Fetching contacts from TextMagic API...');
	if (dryRun) console.log('(DRY RUN — no database writes)\n');

	// Fetch all contacts with pagination
	let allContacts = [];
	let currentPage = 1;
	let totalPages;

	do {
		const data = await tmFetch('/contacts', { page: currentPage, limit: 100 });
		const resources = data.resources || [];
		allContacts = allContacts.concat(resources);

		totalPages = data.pageCount || 1;
		console.log(`  Fetched page ${currentPage}/${totalPages} (${resources.length} contacts)`);
		currentPage++;
	} while (currentPage <= totalPages);

	console.log(`\nTotal TextMagic contacts: ${allContacts.length}`);

	if (allContacts.length === 0) {
		console.log('No contacts to sync.');
		return;
	}

	// Show sample contact
	console.log('\nSample TextMagic contact:', JSON.stringify(allContacts[0], null, 2));

	let inserted = 0;
	let updated = 0;
	let skipped = 0;
	let errors = 0;

	for (let i = 0; i < allContacts.length; i++) {
		const tm = allContacts[i];

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

		// Build metadata from TextMagic-specific fields
		const metadata = {};
		if (tm.id) metadata.textmagic_contact_id = tm.id.toString();
		// Store the actual TM phone so writeback doesn't confuse it with AR phone
		metadata.textmagic_phone = tm.phone || null;
		if (tm.companyName) metadata.company = tm.companyName;
		if (tm.country?.id) metadata.country = tm.country.name || tm.country.id;
		// Custom fields
		if (tm.customFieldValues && Array.isArray(tm.customFieldValues)) {
			for (const cf of tm.customFieldValues) {
				if (cf.value) {
					const fieldName = cf.name || `custom_${cf.id}`;
					metadata[`tm_${fieldName.toLowerCase().replace(/\s+/g, '_')}`] = cf.value;
				}
			}
		}

		const contactData = {
			first_name: firstName || null,
			last_name: lastName || null,
			full_name: fullName || null,
			phone: phone || null,
			phone_normalized: phoneNormalized,
			email: email,
			source: 'textmagic',
			source_id: tm.id ? tm.id.toString() : null,
			tags: ['lead'], // TextMagic-only contacts default to 'lead'
			metadata,
			last_synced_at: new Date().toISOString()
		};

		if (dryRun) {
			console.log(`  [dry-run] Would upsert: ${fullName} (${phone})`);
			inserted++;
			continue;
		}

		// Check if contact exists by phone
		let existing = null;

		if (phoneNormalized) {
			const { data } = await supabase
				.from('contacts')
				.select('id, source, metadata, tags, first_name, last_name, email')
				.eq('phone_normalized', phoneNormalized)
				.limit(1)
				.maybeSingle();
			existing = data;
		}

		if (!existing && email) {
			const { data } = await supabase
				.from('contacts')
				.select('id, source, metadata, tags, first_name, last_name, email')
				.eq('email', email)
				.limit(1)
				.maybeSingle();
			existing = data;
		}

		if (existing) {
			// Merge TextMagic metadata into existing metadata
			const mergedMeta = { ...(existing.metadata || {}), ...metadata };

			// Merge tags — don't overwrite existing tags, just ensure 'lead' is there if no richer tags
			const existingTags = existing.tags || [];
			const hasRicherTag = existingTags.some((t) => ['patient', 'partner', 'employee'].includes(t));
			const mergedTags = hasRicherTag
				? [...new Set([...existingTags])] // Keep existing tags, don't add 'lead'
				: [...new Set([...existingTags, 'lead'])]; // Add 'lead' if no richer tag

			// Only update TextMagic-specific fields, don't overwrite source if it's already from a richer source
			const update = {
				metadata: mergedMeta,
				tags: mergedTags,
				last_synced_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			};

			// Fill in empty fields
			if (!existing.first_name && firstName) update.first_name = firstName;
			if (!existing.last_name && lastName) update.last_name = lastName;
			if (!existing.email && email) update.email = email;

			const { error: updateErr } = await supabase
				.from('contacts')
				.update(update)
				.eq('id', existing.id);

			if (updateErr) {
				console.error(`  Error updating ${fullName}: ${updateErr.message}`);
				errors++;
			} else {
				updated++;
			}
		} else {
			// Insert new contact
			const { error: insertErr } = await supabase.from('contacts').insert(contactData);

			if (insertErr) {
				console.error(`  Error inserting ${fullName}: ${insertErr.message}`);
				errors++;
			} else {
				inserted++;
			}
		}

		if ((i + 1) % 50 === 0) {
			console.log(`  Processed ${i + 1} / ${allContacts.length}`);
		}
	}

	console.log(`  Processed ${allContacts.length} / ${allContacts.length}`);
	console.log(`\nSync complete:`);
	console.log(`  Inserted: ${inserted}`);
	console.log(`  Updated: ${updated}`);
	console.log(`  Skipped (empty): ${skipped}`);
	console.log(`  Errors: ${errors}`);
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
