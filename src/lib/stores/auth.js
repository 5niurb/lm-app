import { writable, derived } from 'svelte/store';

/** @type {import('svelte/store').Writable<import('@supabase/supabase-js').Session | null>} */
export const session = writable(null);

/** @type {import('svelte/store').Writable<{id: string, email: string, full_name: string, role: string, avatar_url: string} | null>} */
export const profile = writable(null);

/** @type {import('svelte/store').Writable<boolean>} */
export const loading = writable(true);

export const isAuthenticated = derived(session, ($session) => !!$session);

export const isAdmin = derived(profile, ($profile) => $profile?.role === 'admin');
