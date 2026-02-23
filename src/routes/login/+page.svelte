<script>
	import { supabase } from '$lib/utils/supabase.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Label } from '$lib/components/ui/label/index.ts';

	let email = $state('');
	let password = $state('');
	let otp = $state('');
	let error = $state('');
	let step = $state('credentials'); // 'credentials' | 'otp'
	let submitting = $state(false);

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

			const _trusted = false;
			goto(resolve('/dashboard'));
		} finally {
			submitting = false;
		}
	}

	async function handleOtp() {
		error = '';
		submitting = true;

		try {
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
		<!-- Gradient mesh background -->
		<div
			class="absolute inset-0"
			style="background:
				radial-gradient(ellipse at 20% 50%, rgba(212,168,67,0.06) 0%, transparent 50%),
				radial-gradient(ellipse at 80% 20%, rgba(212,168,67,0.04) 0%, transparent 50%),
				radial-gradient(ellipse at 60% 80%, rgba(212,168,67,0.03) 0%, transparent 50%);"
		></div>
		<!-- Noise texture -->
		<div
			class="absolute inset-0 opacity-[0.025]"
			style="background-image: url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E');"
		></div>
		<!-- Accent lines -->
		<div
			class="absolute top-0 right-0 w-px h-full"
			style="background: linear-gradient(180deg, transparent, rgba(212,168,67,0.12), rgba(212,168,67,0.06), transparent);"
		></div>
		<div
			class="absolute top-1/4 left-16 w-24 h-px"
			style="background: linear-gradient(90deg, rgba(212,168,67,0.15), transparent);"
		></div>
		<div
			class="absolute top-2/3 left-24 w-16 h-px"
			style="background: linear-gradient(90deg, rgba(212,168,67,0.1), transparent);"
		></div>

		<!-- Content -->
		<div class="relative z-10 flex flex-col justify-between p-12 w-full">
			<div>
				<!-- Logo mark -->
				<div class="flex items-center gap-4 mb-20">
					<div
						class="flex h-12 w-12 items-center justify-center rounded-xl grad-gold text-white text-lg font-bold tracking-wider"
						style="font-family: 'Outfit', sans-serif;"
					>
						LM
					</div>
					<div class="flex flex-col">
						<span
							class="text-base font-semibold tracking-wide text-text-primary"
							style="font-family: 'Outfit', sans-serif;">Le Med Spa</span
						>
						<span class="text-[10px] uppercase tracking-[0.2em] text-text-tertiary">Operations</span
						>
					</div>
				</div>

				<!-- Tagline -->
				<div class="max-w-sm">
					<h1
						class="text-4xl font-bold text-text-primary leading-tight mb-6"
						style="font-family: 'Outfit', sans-serif;"
					>
						Private. Intimate.<br />
						<span class="text-gradient-gold">Exclusive.</span>
					</h1>
					<p class="text-sm leading-relaxed text-text-tertiary">
						Your command center for patient communications, scheduling, and clinic management.
					</p>
				</div>
			</div>

			<div>
				<!-- Decorative element -->
				<div class="flex items-center gap-3 mb-6">
					<div
						class="h-px flex-1"
						style="background: linear-gradient(90deg, rgba(212,168,67,0.15), transparent);"
					></div>
					<div class="h-1.5 w-1.5 rotate-45 bg-gold/30"></div>
					<div class="h-px w-8 bg-gold/15"></div>
					<div class="h-1.5 w-1.5 rotate-45 bg-gold/30"></div>
					<div
						class="h-px flex-1"
						style="background: linear-gradient(270deg, rgba(236,72,153,0.12), transparent);"
					></div>
				</div>

				<p class="text-[10px] uppercase tracking-[0.15em] text-text-ghost text-center">
					LEMEDSPA<span class="text-text-tertiary">&reg;</span> &middot; 17414 Ventura Blvd &middot; Encino,
					CA
				</p>
			</div>
		</div>
	</div>

	<!-- Right panel — Login form -->
	<div class="flex-1 flex items-center justify-center bg-card p-6 relative">
		<!-- Radial glow -->
		<div
			class="absolute inset-0"
			style="background: radial-gradient(ellipse at center, rgba(99,102,241,0.04) 0%, transparent 70%);"
		></div>
		<!-- Noise texture -->
		<div
			class="absolute inset-0 opacity-[0.015]"
			style="background-image: url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E');"
		></div>

		<div class="relative z-10 w-full max-w-sm">
			<!-- Mobile logo -->
			<div class="flex items-center justify-center gap-3 mb-10 lg:hidden">
				<div
					class="flex h-10 w-10 items-center justify-center rounded-lg grad-gold text-white text-base font-bold tracking-wider"
					style="font-family: 'Outfit', sans-serif;"
				>
					LM
				</div>
				<div class="flex flex-col">
					<span
						class="text-sm font-semibold tracking-wide text-text-primary"
						style="font-family: 'Outfit', sans-serif;">Le Med Spa</span
					>
					<span class="text-[9px] uppercase tracking-[0.15em] text-text-tertiary">Operations</span>
				</div>
			</div>

			<div class="mb-8">
				<h2
					class="text-2xl font-bold text-text-primary mb-1"
					style="font-family: 'Outfit', sans-serif;"
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
					class="mb-5 rounded-lg border border-vivid-rose/20 bg-vivid-rose/5 px-4 py-3 text-sm text-vivid-rose"
				>
					{error}
				</div>
			{/if}

			{#if step === 'credentials'}
				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleLogin();
					}}
					class="space-y-5"
				>
					<div class="space-y-2">
						<Label for="email" class="text-xs font-medium text-text-secondary">Email</Label>
						<Input
							id="email"
							type="email"
							placeholder="you@lemedspa.com"
							bind:value={email}
							required
							class="h-11 bg-surface-subtle border-border transition-colors"
						/>
					</div>
					<div class="space-y-2">
						<Label for="password" class="text-xs font-medium text-text-secondary">Password</Label>
						<Input
							id="password"
							type="password"
							bind:value={password}
							required
							class="h-11 bg-surface-subtle border-border transition-colors"
						/>
					</div>
					<Button
						type="submit"
						class="w-full h-11 font-semibold tracking-wide transition-all duration-200 hover:shadow-lg"
						style="background: linear-gradient(135deg, #c49a2d, #d4a843); color: #09090b;"
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
						<Label for="otp" class="text-xs font-medium text-text-secondary"
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
						class="w-full h-11 font-semibold tracking-wide"
						style="background: linear-gradient(135deg, #c49a2d, #d4a843); color: #09090b;"
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
				<div
					class="h-px flex-1"
					style="background: linear-gradient(90deg, transparent, rgba(212,168,67,0.08));"
				></div>
				<div class="h-1 w-1 rotate-45 bg-vivid-indigo/15"></div>
				<div
					class="h-px flex-1"
					style="background: linear-gradient(270deg, transparent, rgba(212,168,67,0.08));"
				></div>
			</div>
			<p class="mt-4 text-center text-[10px] text-text-ghost uppercase tracking-[0.12em]">
				Secure access &middot; Staff only
			</p>
		</div>
	</div>
</div>
