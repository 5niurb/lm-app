<script>
	import '../app.css';
	import { supabase } from '$lib/utils/supabase.js';
	import { session, profile, loading } from '$lib/stores/auth.js';
	import { theme, themeChoice, applyTheme } from '$lib/stores/theme.js';
	import { onMount } from 'svelte';
	import { Toaster } from '$lib/components/ui/sonner/index.ts';

	let { children } = $props();

	// Apply theme class to <html> whenever theme changes
	$effect(() => {
		applyTheme($theme);
	});

	// Listen for system preference changes (for 'auto' mode)
	onMount(() => {
		const mql = window.matchMedia('(prefers-color-scheme: dark)');
		const handler = () => {
			// Re-trigger derived store recalculation by nudging the choice
			themeChoice.update((v) => v);
		};
		mql.addEventListener('change', handler);

		// Get initial session
		supabase.auth.getSession().then(({ data: { session: s } }) => {
			session.set(s);
			if (s) loadProfile(s.user.id);
			else loading.set(false);
		});

		// Listen for auth changes
		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange((_event, s) => {
			session.set(s);
			if (s) loadProfile(s.user.id);
			else {
				profile.set(null);
				loading.set(false);
			}
		});

		return () => {
			subscription.unsubscribe();
			mql.removeEventListener('change', handler);
		};
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
	<title>LeMedSpa App</title>
</svelte:head>

{@render children()}
<Toaster />
