<script>
	import { supabase } from '$lib/utils/supabase.js';
	import { goto } from '$app/navigation';
	import { session } from '$lib/stores/auth.js';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Label } from '$lib/components/ui/label/index.ts';
	import * as Card from '$lib/components/ui/card/index.ts';

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
			const { data, error: authError } = await supabase.auth.signInWithPassword({
				email,
				password
			});

			if (authError) {
				error = authError.message;
				return;
			}

			// Check for trusted device cookie
			// TODO: Implement trusted device check via API
			const trusted = false;

			// MVP: Skip OTP, go straight to dashboard
			// TODO: Implement trusted device check + OTP flow
			goto('/dashboard');
		} finally {
			submitting = false;
		}
	}

	async function handleOtp() {
		error = '';
		submitting = true;

		try {
			// TODO: Verify OTP via API and set trust cookie
			// For now, accept any 6-digit code
			if (otp.length === 6) {
				goto('/dashboard');
			} else {
				error = 'Please enter a valid 6-digit code';
			}
		} finally {
			submitting = false;
		}
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-muted p-4">
	<Card.Root class="w-full max-w-sm">
		<Card.Header class="text-center">
			<div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground text-lg font-bold">
				LM
			</div>
			<Card.Title class="text-2xl">
				{step === 'credentials' ? 'Sign in' : 'Verify identity'}
			</Card.Title>
			<Card.Description>
				{step === 'credentials'
					? 'Enter your credentials to access the dashboard'
					: 'Enter the verification code sent to your email'}
			</Card.Description>
		</Card.Header>

		<Card.Content>
			{#if error}
				<div class="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{error}
				</div>
			{/if}

			{#if step === 'credentials'}
				<form onsubmit={(e) => { e.preventDefault(); handleLogin(); }} class="space-y-4">
					<div class="space-y-2">
						<Label for="email">Email</Label>
						<Input
							id="email"
							type="email"
							placeholder="you@lemedspa.com"
							bind:value={email}
							required
						/>
					</div>
					<div class="space-y-2">
						<Label for="password">Password</Label>
						<Input
							id="password"
							type="password"
							bind:value={password}
							required
						/>
					</div>
					<Button type="submit" class="w-full" disabled={submitting}>
						{submitting ? 'Signing in...' : 'Sign in'}
					</Button>
				</form>
			{:else}
				<form onsubmit={(e) => { e.preventDefault(); handleOtp(); }} class="space-y-4">
					<div class="space-y-2">
						<Label for="otp">Verification code</Label>
						<Input
							id="otp"
							type="text"
							inputmode="numeric"
							maxlength={6}
							placeholder="000000"
							bind:value={otp}
							required
						/>
					</div>
					<Button type="submit" class="w-full" disabled={submitting}>
						{submitting ? 'Verifying...' : 'Verify'}
					</Button>
					<Button
						type="button"
						variant="ghost"
						class="w-full"
						onclick={() => { step = 'credentials'; error = ''; }}
					>
						Back to sign in
					</Button>
				</form>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
