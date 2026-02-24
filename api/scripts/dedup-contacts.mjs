/**
 * Deduplicate contacts by phone_normalized.
 *
 * Rules:
 *   - Contacts sharing the same phone_normalized are merged into one
 *   - Source priority: aesthetic_record > textmagic > website_form > google_sheet > inbound_call > manual
 *   - The highest-priority record becomes the "winner"; others are merged in and deleted
 *   - Metadata is deep-merged (winner's fields take precedence)
 *   - Tags are unioned, but lead is removed if patient is present
 *   - Foreign keys (call_logs.contact_id, conversations.contact_id) are repointed to winner
 *   - Contacts without a phone are left untouched
 *
 * Usage:
 *   node api/scripts/dedup-contacts.mjs          # dry run (default)
 *   node api/scripts/dedup-contacts.mjs --apply   # actually apply changes
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { computeMerge, sourcePriority } from '../services/contact-merge.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const dryRun = !process.argv.includes('--apply');

if (dryRun) console.log('=== DRY RUN (pass --apply to execute) ===\n');

// ── Fetch all contacts ───────────────────────────────────────────────────────
let all = [];
let from = 0;
while (true) {
	const { data } = await sb
		.from('contacts')
		.select('*')
		.range(from, from + 999);
	if (!data || data.length === 0) break;
	all = all.concat(data);
	if (data.length < 1000) break;
	from += 1000;
}
console.log(`Loaded ${all.length} contacts\n`);

// ── Group by phone_normalized ────────────────────────────────────────────────
const phoneGroups = {};
const noPhone = [];
for (const c of all) {
	if (c.phone_normalized) {
		if (!phoneGroups[c.phone_normalized]) phoneGroups[c.phone_normalized] = [];
		phoneGroups[c.phone_normalized].push(c);
	} else {
		noPhone.push(c);
	}
}

const dupeGroups = Object.entries(phoneGroups).filter(([, v]) => v.length > 1);
console.log(`Phone groups with duplicates: ${dupeGroups.length}`);
console.log(`Contacts without phone (untouched): ${noPhone.length}\n`);

// ── Merge logic (uses shared computeMerge) ───────────────────────────────────
let mergedCount = 0;
let deletedCount = 0;
let fkUpdates = 0;
let tagFixes = 0;

for (const [phone, contacts] of dupeGroups) {
	const merge = computeMerge(contacts);
	const winner = contacts.find((c) => c.id === merge.winnerId);
	const losers = contacts.filter((c) => merge.loserIds.includes(c.id));

	if (dryRun) {
		console.log(
			`MERGE +${phone}: keep ${winner.source}/${winner.full_name} (${winner.id.slice(0, 8)}), delete ${losers.length} dupes`
		);
	} else {
		// Update winner with merged data
		const { error: updateErr } = await sb
			.from('contacts')
			.update(merge.update)
			.eq('id', merge.winnerId);

		if (updateErr) {
			console.error(`  ERROR updating winner ${merge.winnerId}: ${updateErr.message}`);
			continue;
		}

		// Repoint foreign keys from losers to winner
		const { count: callCount } = await sb
			.from('call_logs')
			.update({ contact_id: merge.winnerId })
			.in('contact_id', merge.loserIds)
			.select('*', { count: 'exact', head: true });

		const { count: convoCount } = await sb
			.from('conversations')
			.update({ contact_id: merge.winnerId })
			.in('contact_id', merge.loserIds)
			.select('*', { count: 'exact', head: true });

		fkUpdates += (callCount || 0) + (convoCount || 0);

		// Delete losers
		const { error: delErr } = await sb.from('contacts').delete().in('id', merge.loserIds);

		if (delErr) {
			console.error(`  ERROR deleting losers for +${phone}: ${delErr.message}`);
		} else {
			deletedCount += losers.length;
			mergedCount++;
		}
	}
}

// ── Fix lead/patient exclusivity on remaining contacts ───────────────────────
console.log('\nFixing lead/patient tag exclusivity...');

const { data: bothTagContacts } = await sb
	.from('contacts')
	.select('id, tags')
	.contains('tags', ['lead', 'patient']);

if (bothTagContacts && bothTagContacts.length > 0) {
	console.log(`Found ${bothTagContacts.length} contacts with both lead+patient`);

	if (!dryRun) {
		for (const c of bothTagContacts) {
			const newTags = (c.tags || []).filter((t) => t !== 'lead');
			await sb
				.from('contacts')
				.update({ tags: newTags, updated_at: new Date().toISOString() })
				.eq('id', c.id);
			tagFixes++;
		}
	}
} else {
	console.log('No lead+patient conflicts found');
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n── Summary ──');
console.log(`  Phone groups merged: ${mergedCount}`);
console.log(`  Duplicate contacts deleted: ${deletedCount}`);
console.log(`  Foreign keys repointed: ${fkUpdates}`);
console.log(`  Lead tags removed (patient wins): ${tagFixes}`);

if (dryRun) {
	console.log(
		`\n  Would merge ${dupeGroups.length} groups, deleting ~${dupeGroups.reduce((n, [, v]) => n + v.length - 1, 0)} contacts`
	);
	console.log('  Run with --apply to execute');
}
