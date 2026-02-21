<script>
	import { supabase } from '$lib/utils/supabase.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { session } from '$lib/stores/auth.js';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Label } from '$lib/components/ui/label/index.ts';
	import { onMount } from 'svelte';

	let email = $state('');
	let password = $state('');
	let otp = $state('');
	let error = $state('');
	let step = $state('credentials'); // 'credentials' | 'otp'
	let submitting = $state(false);
	let googleLoading = $state(false);

	// If already authenticated, redirect to dashboard
	onMount(() => {
		const unsub = session.subscribe((s) => {
			if (s) goto(resolve('/dashboard'));
		});
		return unsub;
	});

	async function handleLogin() {
		error = '';
		submitting = true;

		try {
			const { data: _data, error: authError } = await supabase.auth.signInWithPassword({
				email,
				password
			});

			if (authError) {
				error = authError.message;
				return;
			}

			// Check for trusted device cookie
			// TODO: Implement trusted device check via API
			const _trusted = false;

			// MVP: Skip OTP, go straight to dashboard
			// TODO: Implement trusted device check + OTP flow
			goto(resolve('/dashboard'));
		} finally {
			submitting = false;
		}
	}

	async function handleGoogleLogin() {
		error = '';
		googleLoading = true;

		try {
			const { error: authError } = await supabase.auth.signInWithOAuth({
				provider: 'google',
				options: {
					redirectTo: `${window.location.origin}/auth/callback`,
					queryParams: {
						hd: 'lemedspa.com'
					}
				}
			});

			if (authError) {
				error = authError.message;
				googleLoading = false;
			}
			// If no error, browser will redirect to Google — don't reset googleLoading
		} catch (_err) {
			error = 'Failed to connect to Google. Please try again.';
			googleLoading = false;
		}
	}

	async function handleOtp() {
		error = '';
		submitting = true;

		try {
			// TODO: Verify OTP via API and set trust cookie
			// For now, accept any 6-digit code
			if (otp.length === 6) {
				goto(resolve('/dashboard'));
			} else {
				error = 'Please enter a valid 6-digit code';
			}
		} finally {
			submitting = false;
		}
	}
</script>

<div class="relative flex min-h-screen">
	<!-- Left panel — Brand / Visual -->
	<div class="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-background">
		<!-- Decorative gradient background -->
		<div class="absolute inset-0 bg-gradient-to-br from-gold/8 via-transparent to-gold/4"></div>
		<!-- Subtle noise overlay -->
		<div
			class="absolute inset-0 opacity-[0.03]"
			style="background-image: url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E');"
		></div>
		<!-- Gold accent lines -->
		<div
			class="absolute top-0 right-0 w-px h-full bg-gradient-to-b from-transparent via-gold/20 to-transparent"
		></div>
		<div
			class="absolute top-1/4 left-16 w-24 h-px bg-gradient-to-r from-gold/30 to-transparent"
		></div>
		<div
			class="absolute top-2/3 left-24 w-16 h-px bg-gradient-to-r from-gold/20 to-transparent"
		></div>

		<!-- Content -->
		<div class="relative z-10 flex flex-col justify-between p-12 w-full">
			<div>
				<!-- Logo mark -->
				<div class="flex items-center gap-4 mb-20">
					<div
						class="flex h-12 w-12 items-center justify-center rounded bg-gold text-primary-foreground text-lg font-semibold tracking-wider"
						style="font-family: 'Playfair Display', serif;"
					>
						LM
					</div>
					<div class="flex flex-col">
						<span
							class="text-base font-medium tracking-wide text-text-primary"
							style="font-family: 'Playfair Display', serif;">Le Med Spa</span
						>
						<span class="text-[10px] uppercase tracking-[0.25em] text-gold-dim">Operations</span>
					</div>
				</div>

				<!-- Tagline -->
				<div class="max-w-sm">
					<h1
						class="text-4xl font-light text-text-primary leading-tight mb-6"
						style="font-family: 'Playfair Display', serif;"
					>
						Private. Intimate.<br />
						<span class="text-gold">Exclusive.</span>
					</h1>
					<p class="text-sm leading-relaxed text-text-tertiary">
						Your command center for patient communications, scheduling, and clinic management.
					</p>
				</div>
			</div>

			<div>
				<!-- Decorative gold ornament -->
				<div class="flex items-center gap-3 mb-6">
					<div class="h-px flex-1 bg-gradient-to-r from-gold/20 to-transparent"></div>
					<div class="h-1.5 w-1.5 rotate-45 bg-gold/30"></div>
					<div class="h-px w-8 bg-gold/20"></div>
					<div class="h-1.5 w-1.5 rotate-45 bg-gold/30"></div>
					<div class="h-px flex-1 bg-gradient-to-l from-gold/20 to-transparent"></div>
				</div>

				<p class="text-[10px] uppercase tracking-[0.2em] text-text-ghost text-center">
					LEMEDSPA<span class="text-gold-dim">&reg;</span> &middot; 17414 Ventura Blvd &middot; Encino,
					CA
				</p>
			</div>
		</div>
	</div>

	<!-- Right panel — Login form -->
	<div class="flex-1 flex items-center justify-center bg-card p-6 relative">
		<!-- Subtle radial glow -->
		<div
			class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--gold-glow)_0%,_transparent_70%)]"
		></div>
		<!-- Noise texture -->
		<div
			class="absolute inset-0 opacity-[0.02]"
			style="background-image: url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E');"
		></div>

		<div class="relative z-10 w-full max-w-sm">
			<!-- Mobile logo (hidden on lg+) -->
			<div class="flex items-center justify-center gap-3 mb-10 lg:hidden">
				<div
					class="flex h-10 w-10 items-center justify-center rounded bg-gold text-primary-foreground text-base font-semibold tracking-wider"
					style="font-family: 'Playfair Display', serif;"
				>
					LM
				</div>
				<div class="flex flex-col">
					<span
						class="text-sm font-medium tracking-wide text-text-primary"
						style="font-family: 'Playfair Display', serif;">Le Med Spa</span
					>
					<span class="text-[9px] uppercase tracking-[0.2em] text-gold-dim">Operations</span>
				</div>
			</div>

			<div class="mb-8">
				<h2
					class="text-2xl font-light text-text-primary mb-1"
					style="font-family: 'Playfair Display', serif;"
				>
					{step === 'credentials' ? 'Welcome back' : 'Verify identity'}
				</h2>
				<p class="text-sm text-text-tertiary">
					{step === 'credentials'
						? 'Sign in to your operations dashboard'
						: 'Enter the verification code sent to your email'}
				</p>
			</div>

			{#if error}
				<div
					class="mb-5 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400"
				>
					{error}
				</div>
			{/if}

			{#if step === 'credentials'}
				<!-- Google Sign-In -->
				<button
					onclick={handleGoogleLogin}
					disabled={googleLoading}
					class="w-full h-11 flex items-center justify-center gap-3 rounded-md border border-border bg-surface-subtle hover:bg-surface-raised/50 text-text-primary font-medium tracking-wide transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mb-5"
				>
					{#if googleLoading}
						<div
							class="h-4 w-4 animate-spin rounded-full border-2 border-text-tertiary border-t-gold"
						></div>
						<span class="text-sm">Redirecting...</span>
					{:else}
						<svg class="h-5 w-5" viewBox="0 0 24 24">
							<path
								d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
								fill="#4285F4"
							/>
							<path
								d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
								fill="#34A853"
							/>
							<path
								d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
								fill="#FBBC05"
							/>
							<path
								d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
								fill="#EA4335"
							/>
						</svg>
						<span class="text-sm">Sign in with Google</span>
					{/if}
				</button>

				<!-- Divider -->
				<div class="flex items-center gap-3 mb-5">
					<div class="h-px flex-1 bg-border"></div>
					<span class="text-xs uppercase tracking-[0.1em] text-text-ghost">or</span>
					<div class="h-px flex-1 bg-border"></div>
				</div>

				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleLogin();
					}}
					class="space-y-5"
				>
					<div class="space-y-2">
						<Label for="email" class="text-xs uppercase tracking-[0.1em] text-text-tertiary"
							>Email</Label
						>
						<Input
							id="email"
							type="email"
							placeholder="you@lemedspa.com"
							bind:value={email}
							required
							class="h-11 bg-surface-subtle border-border focus:border-gold transition-colors"
						/>
					</div>
					<div class="space-y-2">
						<Label for="password" class="text-xs uppercase tracking-[0.1em] text-text-tertiary"
							>Password</Label
						>
						<Input
							id="password"
							type="password"
							bind:value={password}
							required
							class="h-11 bg-surface-subtle border-border focus:border-gold transition-colors"
						/>
					</div>
					<Button
						type="submit"
						class="w-full h-11 bg-gold hover:bg-gold/80 text-primary-foreground font-medium tracking-wide transition-all duration-200 hover:shadow-lg hover:shadow-gold/15"
						disabled={submitting}
					>
						{submitting ? 'Signing in...' : 'Sign in'}
					</Button>
				</form>
			{:else}
				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleOtp();
					}}
					class="space-y-5"
				>
					<div class="space-y-2">
						<Label for="otp" class="text-xs uppercase tracking-[0.1em] text-text-tertiary"
							>Verification code</Label
						>
						<Input
							id="otp"
							type="text"
							inputmode="numeric"
							maxlength={6}
							placeholder="000000"
							bind:value={otp}
							required
							class="h-11 text-center text-xl tracking-[0.5em] font-mono bg-surface-subtle border-border"
						/>
					</div>
					<Button
						type="submit"
						class="w-full h-11 bg-gold hover:bg-gold/80 text-primary-foreground font-medium tracking-wide"
						disabled={submitting}
					>
						{submitting ? 'Verifying...' : 'Verify'}
					</Button>
					<Button
						type="button"
						variant="ghost"
						class="w-full text-text-tertiary hover:text-text-secondary"
						onclick={() => {
							step = 'credentials';
							error = '';
						}}
					>
						Back to sign in
					</Button>
				</form>
			{/if}

			<!-- Bottom ornament -->
			<div class="mt-12 flex items-center gap-3">
				<div class="h-px flex-1 bg-gradient-to-r from-transparent to-gold/12"></div>
				<div class="h-1 w-1 rotate-45 bg-gold/20"></div>
				<div class="h-px flex-1 bg-gradient-to-l from-transparent to-gold/12"></div>
			</div>
			<p class="mt-4 text-center text-[10px] text-text-ghost uppercase tracking-[0.15em]">
				Secure access &middot; Staff only
			</p>
		</div>
	</div>
</div>
