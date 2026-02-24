/**
 * Bidirectional sync: write DB data back to the LeMed Contacts Google Sheet.
 *
 * Reads contacts from Supabase, matches to sheet rows by AR ID or phone,
 * and writes back:
 *   - TextMagic Phone, TextMagic Contact ID, TextMagic Notes (cols AE-AG)
 *   - Any DB-side enrichments (tags, lists, patient_status, etc.)
 *
 * Usage:
 *   node api/scripts/sync-sheet-writeback.mjs                  # full sync
 *   node api/scripts/sync-sheet-writeback.mjs --dry-run        # preview only
 *   node api/scripts/sync-sheet-writeback.mjs --sheet patients3  # specific tab
 *
 * Requires: Google service account key file in project root
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
for (const envFile of ['../.env', '../../.env-vars']) {
	const p = resolve(__dirname, envFile);
	if (existsSync(p)) {
		for (const line of readFileSync(p, 'utf-8').split('\n')) {
			const t = line.trim();
			if (!t || t.startsWith('#')) continue;
			const eq = t.indexOf('=');
			if (eq === -1) continue;
			if (!process.env[t.slice(0, eq)]) process.env[t.slice(0, eq)] = t.slice(eq + 1);
		}
	}
}

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { readSheet, batchWriteSheet } = await import('../services/google-sheets.js');

const dryRun = process.argv.includes('--dry-run');
const sheetArg = process.argv.find((a, i) => process.argv[i - 1] === '--sheet');
const SHEET_NAME = sheetArg || 'patients3';

// ── Column mapping for patients3 ──
// Headers have trailing numbers: "AR ID 1", "First Name 2", etc.
// Clean them the same way the read sync does.
function cleanHeader(h) {
	return h
		.trim()
		.toLowerCase()
		.replace(/\s+\d+\s*$/, '');
}

async function main() {
	console.log(`\n── Sheet Writeback Sync${dryRun ? ' (DRY RUN)' : ''} ──`);
	console.log(`Sheet: ${SHEET_NAME}\n`);

	// 1. Read current sheet data
	console.log('Reading sheet...');
	const { headers, rows } = await readSheet(SHEET_NAME);
	const cleanHeaders = headers.map(cleanHeader);

	// Find column indices
	const colIndex = {};
	const colNames = [
		'ar id',
		'phone',
		'email',
		'first name',
		'last name',
		'full name',
		'textmagic phone',
		'textmagic contact id',
		'textmagic notes',
		'lists',
		'tags',
		'contact type'
	];
	for (const name of colNames) {
		const idx = cleanHeaders.indexOf(name);
		if (idx !== -1) colIndex[name] = idx;
	}

	console.log('Column indices:', colIndex);
	console.log(`Sheet rows: ${rows.length}\n`);

	// Verify we have the write-target columns
	if (colIndex['textmagic phone'] === undefined) {
		console.error('ERROR: "TextMagic Phone" column not found in sheet');
		process.exit(1);
	}

	// 2. Fetch all contacts from DB
	console.log('Fetching contacts from Supabase...');
	const { data: contacts, error } = await supabase
		.from('contacts')
		.select(
			'id, source_id, phone, phone_normalized, email, first_name, last_name, full_name, tags, lists, patient_status, metadata'
		);

	if (error) {
		console.error('Failed to fetch contacts:', error.message);
		process.exit(1);
	}
	console.log(`  ${contacts.length} contacts in DB\n`);

	// Index contacts by AR ID and phone
	const byArId = new Map();
	const byPhone = new Map();
	for (const c of contacts) {
		if (c.source_id) byArId.set(c.source_id, c);
		if (c.phone_normalized) byPhone.set(c.phone_normalized, c);
	}

	// 3. Match sheet rows to DB contacts and build updates
	let matched = 0;
	let updated = 0;
	let noMatch = 0;
	const batchUpdates = [];

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const rowNum = i + 2; // 1-indexed + header row

		// Try matching by AR ID first, then by phone
		const arId = row[colIndex['ar id']]?.trim();
		const phone = row[colIndex['phone']]?.trim()?.replace(/\D/g, '');

		let contact = null;
		if (arId && arId !== '-1') contact = byArId.get(arId);
		if (!contact && phone) contact = byPhone.get(phone);

		if (!contact) {
			noMatch++;
			continue;
		}
		matched++;

		// Build values for TextMagic columns
		const meta = contact.metadata || {};
		const tmPhone = meta.textmagic_phone || contact.phone_normalized || '';
		const tmContactId = meta.textmagic_contact_id || '';

		// Build notes: sync status + key DB info
		const noteParts = [];
		noteParts.push(`synced:${new Date().toISOString().split('T')[0]}`);
		if (contact.tags?.length) noteParts.push(`tags:${contact.tags.join(',')}`);
		if (contact.lists?.length) noteParts.push(`lists:${contact.lists.join(',')}`);
		if (contact.patient_status) noteParts.push(`status:${contact.patient_status}`);
		if (meta.last_visited) noteParts.push(`visited:${meta.last_visited}`);
		const notes = noteParts.join(' | ');

		// Check what's currently in the sheet
		const currentTmPhone = row[colIndex['textmagic phone']]?.trim() || '';
		const currentTmId = row[colIndex['textmagic contact id']]?.trim() || '';
		const currentNotes = row[colIndex['textmagic notes']]?.trim() || '';

		// Only update if something changed
		const newTmPhone = tmPhone ? String(tmPhone) : currentTmPhone;
		const newTmId = tmContactId ? String(tmContactId) : currentTmId;

		if (newTmPhone === currentTmPhone && newTmId === currentTmId && notes === currentNotes) {
			continue; // No changes needed
		}

		// Also write back tags and lists if columns exist
		const rowUpdates = [];

		// TextMagic columns (AE, AF, AG — indices 30, 31, 32)
		const tmPhoneCol = colIndex['textmagic phone'];
		const tmIdCol = colIndex['textmagic contact id'];
		const tmNotesCol = colIndex['textmagic notes'];

		// Build a single row update covering the TextMagic columns
		const startCol = tmPhoneCol;
		const endCol = tmNotesCol;
		const colLetter = (idx) => String.fromCharCode(65 + idx); // A=0, B=1, ...AE=?
		// For columns > 25, need two-letter notation
		const toColLetter = (idx) => {
			if (idx < 26) return String.fromCharCode(65 + idx);
			return String.fromCharCode(64 + Math.floor(idx / 26)) + String.fromCharCode(65 + (idx % 26));
		};

		const startLetter = toColLetter(startCol);
		const endLetter = toColLetter(endCol);
		const range = `${startLetter}${rowNum}:${endLetter}${rowNum}`;

		// Build values array for the range [tmPhone, tmId, notes]
		const vals = [newTmPhone, newTmId, notes];

		if (dryRun) {
			if (updated < 5) {
				console.log(`  Row ${rowNum}: ${contact.full_name || phone}`);
				console.log(`    TM Phone: "${currentTmPhone}" -> "${newTmPhone}"`);
				console.log(`    TM ID: "${currentTmId}" -> "${newTmId}"`);
				console.log(`    Notes: "${notes}"`);
			}
		}

		batchUpdates.push({
			range: `'${SHEET_NAME}'!${range}`,
			values: [vals]
		});
		updated++;

		// Also update tags/lists columns if they exist and DB has richer data
		if (colIndex['tags'] !== undefined && contact.tags?.length) {
			const tagsCol = toColLetter(colIndex['tags']);
			batchUpdates.push({
				range: `'${SHEET_NAME}'!${tagsCol}${rowNum}`,
				values: [[contact.tags.join(', ')]]
			});
		}
		if (colIndex['lists'] !== undefined && contact.lists?.length) {
			const listsCol = toColLetter(colIndex['lists']);
			batchUpdates.push({
				range: `'${SHEET_NAME}'!${listsCol}${rowNum}`,
				values: [[contact.lists.join(', ')]]
			});
		}
	}

	console.log(`\nMatched: ${matched}, Updates needed: ${updated}, No match: ${noMatch}`);

	// 4. Write batch updates
	if (!dryRun && batchUpdates.length > 0) {
		// Google Sheets API allows max 100 ranges per batchUpdate
		const BATCH_SIZE = 100;
		for (let i = 0; i < batchUpdates.length; i += BATCH_SIZE) {
			const batch = batchUpdates.slice(i, i + BATCH_SIZE);
			await batchWriteSheet(batch);
			console.log(`  Wrote batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} ranges)`);
		}
		console.log(`\nDone! Updated ${updated} rows in "${SHEET_NAME}".`);
	} else if (dryRun) {
		console.log(`\n[DRY RUN] Would update ${updated} rows (${batchUpdates.length} cell ranges).`);
	} else {
		console.log('\nNo updates needed — sheet is already in sync.');
	}
}

main().catch((err) => {
	console.error('Fatal error:', err.message);
	process.exit(1);
});
