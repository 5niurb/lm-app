/**
 * Strip characters that could inject additional filter clauses in Supabase .or() queries.
 * PostgREST uses commas, parens, and brackets as filter operators — removing them
 * prevents user input from altering the query structure.
 *
 * @param {string} input - Raw user search input
 * @returns {string} Sanitized string safe for use in .ilike / .or filters
 */
export function sanitizeSearch(input) {
	return String(input)
		.slice(0, 200)
		.replace(/[,.()[\]{}%_]/g, '');
}
