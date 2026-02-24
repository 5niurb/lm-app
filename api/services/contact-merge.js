/**
 * Shared contact merge logic.
 *
 * Used by both the CLI dedup script and the API merge endpoint.
 * Pure functions — no database calls, no side effects.
 */

/** Source priority: lower number = higher priority (wins merge) */
export const SOURCE_PRIORITY = {
	aesthetic_record: 0,
	textmagic: 1,
	website_form: 2,
	google_sheet: 3,
	inbound_call: 4,
	manual: 5
};

/**
 * Get numeric priority for a source string.
 * @param {string|null|undefined} source
 * @returns {number}
 */
export function sourcePriority(source) {
	return SOURCE_PRIORITY[source] ?? 99;
}

/**
 * Compute a merge plan for a group of duplicate contacts.
 * Picks a winner by source priority, merges fields from losers,
 * and returns the update payload — no DB calls.
 *
 * @param {any[]} contacts - Array of contact records sharing the same phone_normalized
 * @returns {{ winnerId: string, update: object, loserIds: string[] }}
 */
export function computeMerge(contacts) {
	// Sort by source priority (best first)
	const sorted = [...contacts].sort((a, b) => sourcePriority(a.source) - sourcePriority(b.source));

	const winner = sorted[0];
	const losers = sorted.slice(1);

	// Deep-merge metadata (winner takes precedence)
	let mergedMeta = { ...(winner.metadata || {}) };
	for (const loser of losers) {
		if (loser.metadata) {
			if (loser.metadata.address && !mergedMeta.address) {
				mergedMeta.address = loser.metadata.address;
			}
			for (const [k, v] of Object.entries(loser.metadata)) {
				if (k !== 'address' && mergedMeta[k] === undefined) {
					mergedMeta[k] = v;
				}
			}
		}
		// Track absorbed source_ids
		if (loser.source && loser.source_id) {
			if (!mergedMeta.absorbed_sources) mergedMeta.absorbed_sources = {};
			mergedMeta.absorbed_sources[loser.source] = loser.source_id;
		}
	}

	// Union tags, enforce lead/patient exclusivity
	const allTags = new Set(sorted.flatMap((c) => c.tags || []));
	if (allTags.has('patient')) allTags.delete('lead');
	const mergedTags = [...allTags];

	// Pick best non-null values (winner first, then losers in priority order)
	const mergedEmail = winner.email || losers.find((l) => l.email)?.email || null;
	const mergedFullName = winner.full_name || losers.find((l) => l.full_name)?.full_name || null;
	const mergedFirstName = winner.first_name || losers.find((l) => l.first_name)?.first_name || null;
	const mergedLastName = winner.last_name || losers.find((l) => l.last_name)?.last_name || null;
	const mergedNotes =
		[winner.notes, ...losers.map((l) => l.notes)].filter(Boolean).join('\n---\n') || null;

	return {
		winnerId: winner.id,
		update: {
			email: mergedEmail,
			full_name: mergedFullName,
			first_name: mergedFirstName,
			last_name: mergedLastName,
			tags: mergedTags,
			metadata: mergedMeta,
			notes: mergedNotes,
			updated_at: new Date().toISOString()
		},
		loserIds: losers.map((l) => l.id)
	};
}
