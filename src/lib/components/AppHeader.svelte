<script>
	import { profile } from '$lib/stores/auth.js';
	import { supabase } from '$lib/utils/supabase.js';
	import { goto } from '$app/navigation';
	import { SidebarTrigger } from '$lib/components/ui/sidebar/index.ts';
	import { Separator } from '$lib/components/ui/separator/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.ts';
	import * as Avatar from '$lib/components/ui/avatar/index.ts';
	import { LogOut, Phone, Clock } from '@lucide/svelte';
	import { api } from '$lib/api/client.js';

	let clinicOpen = $state(null);
	let nextChange = $state('');

	$effect(() => {
		loadClinicStatus();
		const interval = setInterval(loadClinicStatus, 60000); // Check every minute
		return () => clearInterval(interval);
	});

	async function loadClinicStatus() {
		try {
			const res = await api('/api/settings');
			const hours = res.data?.business_hours;
			if (!hours) { clinicOpen = null; return; }

			const now = new Date();
			const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
			const today = days[now.getDay()];
			const todayHours = hours[today];

			if (!todayHours || todayHours.closed) {
				clinicOpen = false;
				// Find next open day
				for (let i = 1; i <= 7; i++) {
					const nextDay = days[(now.getDay() + i) % 7];
					const nextHours = hours[nextDay];
					if (nextHours && !nextHours.closed && nextHours.open) {
						nextChange = `Opens ${nextDay.charAt(0).toUpperCase() + nextDay.slice(1)} ${nextHours.open}`;
						return;
					}
				}
				nextChange = '';
			} else {
				const [openH, openM] = (todayHours.open || '09:00').split(':').map(Number);
				const [closeH, closeM] = (todayHours.close || '17:00').split(':').map(Number);
				const nowMins = now.getHours() * 60 + now.getMinutes();
				const openMins = openH * 60 + (openM || 0);
				const closeMins = closeH * 60 + (closeM || 0);

				if (nowMins >= openMins && nowMins < closeMins) {
					clinicOpen = true;
					const closeTime = todayHours.close || '17:00';
					nextChange = `Closes ${closeTime}`;
				} else if (nowMins < openMins) {
					clinicOpen = false;
					nextChange = `Opens ${todayHours.open}`;
				} else {
					clinicOpen = false;
					// Find next open day
					for (let i = 1; i <= 7; i++) {
						const nextDay = days[(now.getDay() + i) % 7];
						const nextHours = hours[nextDay];
						if (nextHours && !nextHours.closed && nextHours.open) {
							nextChange = `Opens ${nextDay.charAt(0).toUpperCase() + nextDay.slice(1)} ${nextHours.open}`;
							return;
						}
					}
					nextChange = '';
				}
			}
		} catch {
			clinicOpen = null;
		}
	}

	async function handleLogout() {
		await supabase.auth.signOut();
		goto('/login');
	}
</script>

<header class="flex h-14 items-center gap-2 border-b border-[rgba(197,165,90,0.08)] px-4">
	<SidebarTrigger />
	<Separator orientation="vertical" class="h-6" />

	<!-- Clinic status indicator -->
	{#if clinicOpen !== null}
		<div class="flex items-center gap-2 px-2">
			<div class="flex items-center gap-1.5">
				<div class="h-2 w-2 rounded-full {clinicOpen ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]' : 'bg-[rgba(255,255,255,0.15)]'}"></div>
				<span class="text-[11px] font-medium {clinicOpen ? 'text-emerald-400/80' : 'text-[rgba(255,255,255,0.3)]'}">
					{clinicOpen ? 'Open' : 'Closed'}
				</span>
			</div>
			{#if nextChange}
				<span class="text-[10px] text-[rgba(255,255,255,0.15)]">{nextChange}</span>
			{/if}
		</div>
	{/if}

	<div class="flex-1"></div>

	<!-- Quick dial -->
	<Button variant="ghost" size="sm" class="h-8 gap-1.5 text-[rgba(255,255,255,0.4)] hover:text-[#C5A55A]" onclick={() => goto('/softphone')}>
		<Phone class="h-3.5 w-3.5" />
		<span class="text-xs hidden sm:inline">Dial</span>
	</Button>

	<Separator orientation="vertical" class="h-6" />

	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button variant="ghost" class="relative h-8 w-8 rounded-full" {...props}>
					<Avatar.Root class="h-8 w-8">
						{#if $profile?.avatar_url}
							<Avatar.Image src={$profile.avatar_url} alt={$profile.full_name} />
						{/if}
						<Avatar.Fallback>
							{$profile?.full_name?.charAt(0)?.toUpperCase() || 'U'}
						</Avatar.Fallback>
					</Avatar.Root>
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>

		<DropdownMenu.Content align="end" class="w-48">
			<DropdownMenu.Label>
				<div class="flex flex-col">
					<span class="text-sm font-medium">{$profile?.full_name || 'User'}</span>
					<span class="text-xs text-muted-foreground">{$profile?.email}</span>
				</div>
			</DropdownMenu.Label>
			<DropdownMenu.Separator />
			<DropdownMenu.Item onclick={handleLogout}>
				<LogOut class="mr-2 h-4 w-4" />
				Log out
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</header>
