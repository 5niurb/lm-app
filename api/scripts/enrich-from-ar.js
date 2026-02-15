/**
 * Enrich existing contacts with fresh data from an Aesthetic Record CSV export.
 *
 * Matches contacts by AR ID (stored in source_id or metadata.ar_id) against the
 * "ID" column in the AR export. Updates fields that are empty/missing in the
 * contacts table with data from AR.
 *
 * Usage:
 *   node api/scripts/enrich-from-ar.js --csv <ar-export.csv>
 *
 * Environment:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (from api/.env)
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from api/ directory
const envPath = resolve(__dirname, '..', '.env');
if (existsSync(envPath)) {
	for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
		const t = line.trim();
		if (!t || t.startsWith('#')) continue;
		const eq = t.indexOf('=');
		if (eq === -1) continue;
		if (!process.env[t.slice(0, eq)]) {
			process.env[t.slice(0, eq)] = t.slice(eq + 1);
		}
	}
}

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Parse CLI args
const args = process.argv.slice(2);
const csvIndex = args.indexOf('--csv');
const csvFile = csvIndex >= 0 ? args[csvIndex + 1] : null;

if (!csvFile) {
	console.error('Usage: node api/scripts/enrich-from-ar.js --csv <ar-export.csv>');
	process.exit(1);
}

/**
 * Normalize a phone number to digits only.
 */
function normalizePhone(phone) {
	if (!phone) return null;
	const digits = phone.replace(/\D/g, '');
	return digits || null;
}

/**
 * Parse CSV content handling quoted fields.
 */
function parseCsv(content) {
	const lines = content.split('\n');
	if (lines.length < 2) return [];

	const headers = parseCsvLine(lines[0]);
	const records = [];

	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;
		const values = parseCsvLine(line);
		const record = {};
		for (let j = 0; j < headers.length; j++) {
			record[headers[j].trim().toLowerCase()] = (values[j] || '').trim();
		}
		records.push(record);
	}

	return records;
}

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

async function main() {
	console.log(`Reading AR export: ${csvFile}`);
	const content = readFileSync(csvFile, 'utf-8');
	const arRecords = parseCsv(content);
	console.log(`Parsed ${arRecords.length} AR records`);

	if (arRecords.length === 0) {
		console.log('No records to process.');
		return;
	}

	// Show sample record
	console.log('Sample AR record:', JSON.stringify(arRecords[0], null, 2));

	// Fetch all existing contacts that came from the patients3 sheet
	// They have AR IDs stored in source_id or metadata
	console.log('\nFetching existing contacts from database...');
	const { data: existingContacts, error: fetchError } = await supabase
		.from('contacts')
		.select('*')
		.order('created_at');

	if (fetchError) {
		console.error('Failed to fetch contacts:', fetchError.message);
		process.exit(1);
	}

	console.log(`Found ${existingContacts.length} contacts in database`);

	// Build lookup maps: AR ID → contact, phone → contact, email → contact
	const byArId = new Map();
	const byPhone = new Map();
	const byEmail = new Map();

	for (const c of existingContacts) {
		// AR ID might be in source_id or metadata.ar_id
		const arId = c.source_id || c.metadata?.['ar id'] || c.metadata?.ar_id;
		if (arId) byArId.set(arId.toString(), c);
		if (c.phone_normalized) byPhone.set(c.phone_normalized, c);
		if (c.email) byEmail.set(c.email.toLowerCase(), c);
	}

	console.log(
		`Lookup maps: ${byArId.size} by AR ID, ${byPhone.size} by phone, ${byEmail.size} by email`
	);

	let matched = 0;
	let enriched = 0;
	let newInserted = 0;
	let noChange = 0;
	let errors = 0;

	for (let i = 0; i < arRecords.length; i++) {
		const ar = arRecords[i];
		const arId = ar['id'] || '';
		const arPhone = normalizePhone(ar['phone']);
		const arEmail = (ar['email'] || '').toLowerCase();

		// Find matching contact: prefer AR ID, then phone, then email
		let contact = null;
		let matchMethod = '';

		if (arId && byArId.has(arId)) {
			contact = byArId.get(arId);
			matchMethod = 'AR ID';
		} else if (arPhone && byPhone.has(arPhone)) {
			contact = byPhone.get(arPhone);
			matchMethod = 'phone';
		} else if (arEmail && byEmail.has(arEmail)) {
			contact = byEmail.get(arEmail);
			matchMethod = 'email';
		}

		if (!contact) {
			// New contact not in patients3 — insert it
			const firstName = ar['first name'] || '';
			const lastName = ar['last name'] || '';
			const fullName =
				firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || '';

			if (!fullName && !arPhone && !arEmail) continue; // skip empty rows

			const metadata = {};
			if (ar['total sales relationship']) metadata.total_sales = ar['total sales relationship'];
			if (ar['visited']) metadata.last_visited = ar['visited'];
			if (ar['nick name']) metadata.nickname = ar['nick name'];
			if (ar['referral source']) metadata.referral_source = ar['referral source'];
			if (ar['dob']) metadata.dob = ar['dob'];
			if (ar['address line 1']) metadata.address_line1 = ar['address line 1'];
			if (ar['address line 2']) metadata.address_line2 = ar['address line 2'];
			if (ar['city']) metadata.city = ar['city'];
			if (ar['state']) metadata.state = ar['state'];
			if (ar['zipcode'] && ar['zipcode'].trim()) metadata.zip = ar['zipcode'].trim();
			if (ar['country']) metadata.country = ar['country'];
			if (ar['patient created date']) metadata.patient_created_date = ar['patient created date'];

			const { error: insertErr } = await supabase.from('contacts').insert({
				first_name: firstName || null,
				last_name: lastName || null,
				full_name: fullName || null,
				phone: ar['phone'] || null,
				phone_normalized: arPhone,
				email: ar['email'] || null,
				source: 'aesthetic_record',
				source_id: arId || null,
				patient_status: 'patient',
				tags: ['patient'],
				metadata,
				last_synced_at: new Date().toISOString()
			});

			if (insertErr) {
				console.error(`  Error inserting ${fullName}: ${insertErr.message}`);
				errors++;
			} else {
				newInserted++;
			}
			continue;
		}

		matched++;

		// Build update with enrichment data from AR
		const update = {};
		const metaUpdate = { ...(contact.metadata || {}) };
		let hasChanges = false;

		// Enrich: fill in empty fields from AR
		if (!contact.first_name && ar['first name']) {
			update.first_name = ar['first name'];
			hasChanges = true;
		}
		if (!contact.last_name && ar['last name']) {
			update.last_name = ar['last name'];
			hasChanges = true;
		}
		if (!contact.email && ar['email']) {
			update.email = ar['email'];
			hasChanges = true;
		}
		if (!contact.phone && ar['phone']) {
			update.phone = ar['phone'];
			update.phone_normalized = arPhone;
			hasChanges = true;
		}

		// Always update source_id if we matched by AR ID and it's not set
		if (arId && !contact.source_id) {
			update.source_id = arId;
			hasChanges = true;
		}

		// Enrich metadata from AR (always overwrite with fresh AR data)
		const arMetaFields = {
			total_sales: ar['total sales relationship'],
			last_visited: ar['visited'],
			nickname: ar['nick name'],
			referral_source: ar['referral source'],
			dob: ar['dob'],
			address_line1: ar['address line 1'],
			address_line2: ar['address line 2'],
			city: ar['city'],
			state: ar['state'],
			zip: ar['zipcode']?.trim(),
			country: ar['country'],
			patient_created_date: ar['patient created date'],
			ar_id: arId
		};

		for (const [key, val] of Object.entries(arMetaFields)) {
			if (val && val.trim()) {
				const existing = metaUpdate[key];
				if (!existing || existing !== val.trim()) {
					metaUpdate[key] = val.trim();
					hasChanges = true;
				}
			}
		}

		if (!hasChanges) {
			noChange++;
			continue;
		}

		update.metadata = metaUpdate;
		update.updated_at = new Date().toISOString();
		update.last_synced_at = new Date().toISOString();

		// Ensure 'patient' tag is present for AR contacts, remove 'unknown'/'lead' if present
		const currentTags = contact.tags || [];
		let newTags = [...currentTags];
		if (!newTags.includes('patient')) newTags.push('patient');
		newTags = newTags.filter((t) => t !== 'unknown'); // Promote from unknown
		update.tags = newTags;

		const { error: updateErr } = await supabase
			.from('contacts')
			.update(update)
			.eq('id', contact.id);

		if (updateErr) {
			console.error(`  Error enriching ${contact.full_name}: ${updateErr.message}`);
			errors++;
		} else {
			enriched++;
		}

		if ((i + 1) % 100 === 0) {
			console.log(`  Processed ${i + 1} / ${arRecords.length}`);
		}
	}

	console.log(`  Processed ${arRecords.length} / ${arRecords.length}`);
	console.log(`\nEnrichment complete:`);
	console.log(`  Matched: ${matched}`);
	console.log(`  Enriched: ${enriched}`);
	console.log(`  No changes needed: ${noChange}`);
	console.log(`  New contacts inserted: ${newInserted}`);
	console.log(`  Errors: ${errors}`);
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
