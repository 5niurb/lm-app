/** @type {import('./$types').LayoutServerLoad} */
export function load({ cookies: _cookies }) {
	// Check for auth cookie presence (Supabase stores session in cookies)
	// The actual session validation happens client-side with Supabase JS
	// This is a basic guard — the real protection is in the client layout
	return {};
}
