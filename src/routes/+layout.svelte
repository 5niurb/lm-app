<script>
	import '../app.css';
	import { supabase } from '$lib/utils/supabase.js';
	import { session, profile, loading } from '$lib/stores/auth.js';
	import { onMount } from 'svelte';
	import { Toaster } from '$lib/components/ui/sonner/index.ts';

	let { children } = $props();

	onMount(() => {
		// Get initial session
		supabase.auth.getSession().then(({ data: { session: s } }) => {
			session.set(s);
			if (s) loadProfile(s.user.id);
			else loading.set(false);
		});

		// Listen for auth changes
		const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
			session.set(s);
			if (s) loadProfile(s.user.id);
			else {
				profile.set(null);
				loading.set(false);
			}
		});

		return () => subscription.unsubscribe();
	});

	async function loadProfile(/** @type {string} */ userId) {
		const { data } = await supabase
			.from('profiles')
			.select('id, email, full_name, role, avatar_url')
			.eq('id', userId)
			.single();
		profile.set(data);
		loading.set(false);
	}
</script>

<svelte:head>
	<title>LM App - Le Med Spa</title>
</svelte:head>

{@render children()}
<Toaster />
