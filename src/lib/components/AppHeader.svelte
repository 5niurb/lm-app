<script>
	import { profile } from '$lib/stores/auth.js';
	import { supabase } from '$lib/utils/supabase.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { SidebarTrigger } from '$lib/components/ui/sidebar/index.ts';
	import { Separator } from '$lib/components/ui/separator/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.ts';
	import * as Avatar from '$lib/components/ui/avatar/index.ts';
	import { LogOut, Phone, Bell, Search, Command } from '@lucide/svelte';
	import { api } from '$lib/api/client.js';
	import ThemeSwitcher from '$lib/components/ThemeSwitcher.svelte';

	/** @type {{ onOpenCommandPalette?: () => void }} */
	let { onOpenCommandPalette } = $props();

	let clinicOpen = $state(null);
	let nextChange = $state('');

	// Notification state
	/** @type {Array<{ id: string, type: string, title: string, time: string, read: boolean }>} */
	let notifications = $state([]);
	let notifOpen = $state(false);
	/** IDs the user has already seen (dismissed by opening the dropdown) */
	let seenIds = new Set();

	let unreadCount = $derived(notifications.filter((n) => !n.read).length);

	// Mark all current notifications as seen when the dropdown is opened
	$effect(() => {
		if (notifOpen && notifications.length > 0) {
			for (const n of notifications) {
				seenIds.add(n.id);
			}
			notifications = notifications.map((n) => ({ ...n, read: true }));
		}
	});

	$effect(() => {
		loadClinicStatus();
		loadNotifications();
		const statusInterval = setInterval(loadClinicStatus, 60000);
		const notifInterval = setInterval(loadNotifications, 30000);
		return () => {
			clearInterval(statusInterval);
			clearInterval(notifInterval);
		};
	});

	async function loadNotifications() {
		try {
			const [callsRes, vmRes] = await Promise.all([
				api('/api/calls?direction=inbound&disposition=missed&pageSize=5').catch(() => ({
					data: []
				})),
				api('/api/voicemails?status=new&pageSize=5').catch(() => ({ data: [] }))
			]);

			/** @type {Array<{ id: string, type: string, title: string, time: string, read: boolean }>} */
			const items = [];

			if (callsRes.data) {
				for (const call of callsRes.data) {
					const nid = `call-${call.id}`;
					items.push({
						id: nid,
						type: 'missed_call',
						title: `Missed call from ${call.caller_name || call.from_number || 'Unknown'}`,
						time: call.created_at,
						read: seenIds.has(nid)
					});
				}
			}
			if (vmRes.data) {
				for (const vm of vmRes.data) {
					const nid = `vm-${vm.id}`;
					items.push({
						id: nid,
						type: 'voicemail',
						title: `New voicemail from ${vm.caller_name || vm.from_number || 'Unknown'}`,
						time: vm.created_at,
						read: seenIds.has(nid)
					});
				}
			}

			items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
			notifications = items.slice(0, 8);
		} catch {
			// Non-critical
		}
	}

	async function loadClinicStatus() {
		try {
			const res = await api('/api/settings');
			const hours = res.data?.business_hours;
			if (!hours) {
				clinicOpen = null;
				return;
			}

			const now = new Date();
			const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
			const today = days[now.getDay()];
			const todayHours = hours[today];

			if (!todayHours || todayHours.closed) {
				clinicOpen = false;
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
		goto(resolve('/login'));
	}

	/**
	 * @param {string} dateStr
	 */
	function timeAgo(dateStr) {
		if (!dateStr) return '';
		const diff = Date.now() - new Date(dateStr).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		return `${Math.floor(hours / 24)}d ago`;
	}
</script>

<header class="flex h-14 items-center gap-2 border-b border-border-subtle px-4">
	<SidebarTrigger />
	<Separator orientation="vertical" class="h-6" />

	<!-- Clinic status indicator -->
	{#if clinicOpen !== null}
		<div class="flex items-center gap-2 px-2">
			<div class="flex items-center gap-1.5">
				<div
					class="h-2 w-2 rounded-full {clinicOpen
						? 'bg-vivid-emerald shadow-[0_0_6px_rgba(16,185,129,0.5)]'
						: 'bg-text-ghost'}"
				></div>
				<span
					class="text-[11px] font-medium {clinicOpen ? 'text-vivid-emerald' : 'text-text-tertiary'}"
				>
					{clinicOpen ? 'Open' : 'Closed'}
				</span>
			</div>
			{#if nextChange}
				<span class="text-[10px] text-text-ghost">{nextChange}</span>
			{/if}
		</div>
	{/if}

	<div class="flex-1"></div>

	<!-- Cmd+K search trigger -->
	<Button
		variant="ghost"
		size="sm"
		class="h-8 gap-1.5 text-text-tertiary hover:text-text-secondary hidden sm:flex"
		onclick={() => onOpenCommandPalette?.()}
	>
		<Search class="h-3.5 w-3.5" />
		<span class="text-xs">Search</span>
		<kbd
			class="ml-1 inline-flex h-5 items-center gap-0.5 rounded border border-border-subtle bg-surface-subtle px-1.5 text-[10px] text-text-ghost"
		>
			<Command class="h-2.5 w-2.5" />K
		</kbd>
	</Button>

	<!-- Quick dial -->
	<Button
		variant="ghost"
		size="sm"
		class="h-8 gap-1.5 text-text-secondary hover:text-gold"
		onclick={() => goto(resolve('/softphone'))}
	>
		<Phone class="h-3.5 w-3.5" />
		<span class="text-xs hidden sm:inline">Dial</span>
	</Button>

	<!-- Notification bell -->
	<DropdownMenu.Root bind:open={notifOpen}>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button
					variant="ghost"
					size="sm"
					class="relative h-8 w-8 text-text-secondary hover:text-text-primary"
					{...props}
				>
					<Bell class="h-4 w-4" />
					{#if unreadCount > 0}
						<span
							class="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full grad-rose px-1 text-[9px] font-bold text-white"
						>
							{unreadCount > 9 ? '9+' : unreadCount}
						</span>
					{/if}
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>

		<DropdownMenu.Content align="end" class="w-80">
			<DropdownMenu.Label>
				<span class="text-sm font-semibold">Notifications</span>
			</DropdownMenu.Label>
			<DropdownMenu.Separator />
			{#if notifications.length === 0}
				<div class="py-6 text-center text-xs text-text-secondary">No new notifications</div>
			{:else}
				{#each notifications as notif (notif.id)}
					<DropdownMenu.Item
						class="flex flex-col items-start gap-0.5 py-2.5"
						onclick={() => {
							if (notif.type === 'missed_call') goto(resolve('/calls'));
							else if (notif.type === 'voicemail') goto(resolve('/calls'));
						}}
					>
						<div class="flex items-center gap-2">
							{#if !notif.read}
								<div class="h-1.5 w-1.5 rounded-full grad-indigo shrink-0"></div>
							{/if}
							<span class="text-xs leading-snug">{notif.title}</span>
						</div>
						<span class="text-[10px] text-text-secondary {!notif.read ? 'ml-3.5' : ''}"
							>{timeAgo(notif.time)}</span
						>
					</DropdownMenu.Item>
				{/each}
			{/if}
		</DropdownMenu.Content>
	</DropdownMenu.Root>

	<!-- Theme switcher -->
	<ThemeSwitcher />

	<Separator orientation="vertical" class="h-6" />

	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button variant="ghost" class="relative h-8 w-8 rounded-full" {...props}>
					<Avatar.Root class="h-8 w-8">
						{#if $profile?.avatar_url}
							<Avatar.Image src={$profile.avatar_url} alt={$profile.full_name} />
						{/if}
						<Avatar.Fallback class="grad-indigo text-white text-xs font-semibold">
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
					<span class="text-xs text-text-secondary">{$profile?.email}</span>
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
