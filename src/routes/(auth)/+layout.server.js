import { redirect } from '@sveltejs/kit';

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ locals }) {
	const { session, user } = await locals.safeGetSession();

	if (!session) {
		redirect(303, '/login');
	}

	return { session, user };
}
