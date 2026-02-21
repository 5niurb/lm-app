<script>
	import { supabase } from '$lib/utils/supabase.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';

	let error = $state('');

	onMount(async () => {
		try {
			// Handle the OAuth callback — Supabase may return:
			// 1. Hash fragment with access_token (implicit flow)
			// 2. Query param with code (PKCE flow)
			const hashParams = new URLSearchParams(window.location.hash.substring(1));
			const queryParams = new URLSearchParams(window.location.search);

			const accessToken = hashParams.get('access_token');
			const code = queryParams.get('code');
			const errorParam = queryParams.get('error') || hashParams.get('error');
			const errorDescription =
				queryParams.get('error_description') || hashParams.get('error_description');

			if (errorParam) {
				error = errorDescription || errorParam;
				return;
			}

			if (code) {
				// PKCE flow — exchange code for session
				const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
				if (exchangeError) {
					error = exchangeError.message;
					return;
				}
			} else if (accessToken) {
				// Implicit flow — session auto-detected by onAuthStateChange in root layout
				// Just wait a moment for the auth listener to pick it up
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			// Verify session was established
			const {
				data: { session }
			} = await supabase.auth.getSession();

			if (session) {
				// Validate domain restriction
				const email = session.user?.email || '';
				if (!email.endsWith('@lemedspa.com')) {
					await supabase.auth.signOut();
					error = 'Access restricted to @lemedspa.com accounts only.';
					return;
				}

				goto(resolve('/dashboard'));
			} else {
				error = 'Authentication failed. Please try again.';
			}
		} catch (err) {
			console.error('Auth callback error:', err);
			error = 'An unexpected error occurred during sign-in.';
		}
	});
</script>

<div class="flex min-h-screen items-center justify-center bg-background">
	<div class="text-center max-w-sm px-6">
		{#if error}
			<div class="mb-6">
				<div
					class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-red-500/20 bg-red-500/5"
				>
					<svg class="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</div>
				<h2
					class="text-xl font-light text-text-primary mb-2"
					style="font-family: 'Playfair Display', serif;"
				>
					Sign-in failed
				</h2>
				<p class="text-sm text-red-400 mb-6">{error}</p>
				<a
					href="{base}/login"
					class="inline-flex items-center gap-2 rounded-md bg-gold px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-gold/80 transition-colors"
				>
					Back to sign in
				</a>
			</div>
		{:else}
			<div class="flex flex-col items-center gap-4">
				<div
					class="h-8 w-8 animate-spin rounded-full border-2 border-text-tertiary border-t-gold"
				></div>
				<p class="text-sm text-text-tertiary">Completing sign-in...</p>
			</div>
		{/if}
	</div>
</div>
