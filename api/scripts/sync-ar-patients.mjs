/**
 * Sync Aesthetic Record patient export into lm-app contacts table.
 *
 * Usage:
 *   node api/scripts/sync-ar-patients.mjs <path-to-xls>
 *
 * What it does:
 *   - Parses the AR .xls export
 *   - For each patient, upserts into contacts matching on source_id + source='aesthetic_record'
 *   - Stores extra fields (DOB, address, referral, visit date, sales) in metadata JSONB
 *   - Normalizes phone to digits-only for phone_normalized
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// xlsx is CJS-only, use createRequire
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const supabase = createClient(
	process.env.SUPABASE_URL,
	process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Parse XLS ────────────────────────────────────────────────────────────────

const xlsPath = process.argv[2];
if (!xlsPath) {
	console.error('Usage: node api/scripts/sync-ar-patients.mjs <path-to-xls>');
	process.exit(1);
}

console.log(`Reading: ${xlsPath}`);
const workbook = XLSX.readFile(xlsPath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

console.log(`Parsed ${rows.length} patients from AR export\n`);

// ── Normalize helpers ────────────────────────────────────────────────────────

/** Strip to digits only, ensure leading 1 for US numbers */
function normalizePhone(raw) {
	if (!raw) return null;
	const digits = String(raw).replace(/\D/g, '');
	if (!digits) return null;
	// If 10 digits, prepend 1 for US
	if (digits.length === 10) return '1' + digits;
	return digits;
}

/** Format phone as +1XXXXXXXXXX */
function formatE164(normalized) {
	if (!normalized) return null;
	return '+' + normalized;
}

// ── Upsert logic ─────────────────────────────────────────────────────────────

let updated = 0;
let inserted = 0;
let skipped = 0;
let errors = 0;

for (const row of rows) {
	const arId = String(row['ID'] || row['﻿"ID"'] || '').trim();
	if (!arId) {
		skipped++;
		continue;
	}

	const firstName = (row['First Name'] || '').trim();
	const lastName = (row['Last Name'] || '').trim();
	const fullName = [firstName, lastName].filter(Boolean).join(' ');
	const email = (row['Email'] || '').trim().toLowerCase() || null;
	const rawPhone = String(row['Phone'] || '').trim();
	const phoneNormalized = normalizePhone(rawPhone);
	const phoneE164 = formatE164(phoneNormalized);

	// Extra fields → metadata
	const metadata = {};
	if (row['DOB']) metadata.dob = row['DOB'];
	if (row['Referral Source']) metadata.referral_source = row['Referral Source'];
	if (row['Nick Name']) metadata.nickname = row['Nick Name'];
	if (row['Total Sales Relationship']) metadata.total_sales = Number(row['Total Sales Relationship']) || 0;
	if (row['Visited'] && row['Visited'] !== 'Never') metadata.last_visited = row['Visited'];
	if (row['user_image']) metadata.ar_image = row['user_image'];
	if (row['Patient Created Date']) metadata.ar_created_date = row['Patient Created Date'];

	// Address (coerce to string — some cells may be numeric)
	const addr1 = String(row['Address Line 1'] ?? '').trim();
	const addr2 = String(row['Address Line 2'] ?? '').trim();
	const city = String(row['City'] ?? '').trim();
	const state = String(row['State'] ?? '').trim();
	const zip = String(row['zipcode'] ?? '').trim();
	const country = String(row['Country'] ?? '').trim();
	if (addr1 || city || state || zip) {
		metadata.address = {
			...(addr1 && { line1: addr1 }),
			...(addr2 && { line2: addr2 }),
			...(city && { city }),
			...(state && { state }),
			...(zip && { zip }),
			...(country && { country })
		};
	}

	const contactData = {
		first_name: firstName || null,
		last_name: lastName || null,
		full_name: fullName || null,
		phone: phoneE164,
		phone_normalized: phoneNormalized,
		email,
		source: 'aesthetic_record',
		source_id: arId,
		tags: ['patient'],
		metadata,
		last_synced_at: new Date().toISOString(),
		updated_at: new Date().toISOString()
	};

	try {
		// Check if contact already exists with this AR ID
		const { data: existing } = await supabase
			.from('contacts')
			.select('id, tags')
			.eq('source', 'aesthetic_record')
			.eq('source_id', arId)
			.maybeSingle();

		if (existing) {
			// Merge tags (preserve existing, ensure 'patient' is present)
			const existingTags = existing.tags || [];
			const mergedTags = [...new Set([...existingTags, 'patient'])];
			const { error } = await supabase
				.from('contacts')
				.update({ ...contactData, tags: mergedTags })
				.eq('id', existing.id);

			if (error) {
				console.error(`  ERROR updating AR#${arId} (${fullName}): ${error.message}`);
				errors++;
			} else {
				updated++;
			}
		} else {
			// Insert new
			const { error } = await supabase
				.from('contacts')
				.insert(contactData);

			if (error) {
				console.error(`  ERROR inserting AR#${arId} (${fullName}): ${error.message}`);
				errors++;
			} else {
				inserted++;
			}
		}
	} catch (err) {
		console.error(`  EXCEPTION on AR#${arId} (${fullName}): ${err.message}`);
		errors++;
	}
}

console.log(`\n── Sync Complete ──`);
console.log(`  Updated:  ${updated}`);
console.log(`  Inserted: ${inserted}`);
console.log(`  Skipped:  ${skipped}`);
console.log(`  Errors:   ${errors}`);
console.log(`  Total:    ${rows.length}`);
