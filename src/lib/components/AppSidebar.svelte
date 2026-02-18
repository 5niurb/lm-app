<script>
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
	import {
		LayoutDashboard,
		Phone,
		Headset,
		MessageSquare,
		Users,
		Settings,
		Sparkles,
		Zap
	} from '@lucide/svelte';
	import { api } from '$lib/api/client.js';

	/** @type {Array<{ label: string, items: Array<{ href: string, label: string, icon: any, badgeKey?: string }> }>} */
	const navGroups = [
		{
			label: 'Communications',
			items: [
				{ href: '/softphone', label: 'Softphone', icon: Headset },
				{ href: '/calls', label: 'Phone Log', icon: Phone, badgeKey: 'unheardVoicemails' },
				{ href: '/messages', label: 'Messages', icon: MessageSquare, badgeKey: 'unreadMessages' }
			]
		},
		{
			label: 'Operations',
			items: [
				{ href: '/contacts', label: 'Contacts', icon: Users },
				{ href: '/services', label: 'Services', icon: Sparkles },
				{ href: '/automation', label: 'Automation', icon: Zap }
			]
		},
		{
			label: 'System',
			items: [{ href: '/settings', label: 'Settings', icon: Settings }]
		}
	];

	/** @type {{ unreadMessages: number, unheardVoicemails: number }} */
	let badges = $state({ unreadMessages: 0, unheardVoicemails: 0 });

	/** @type {number|null} */
	let badgeInterval = null;

	async function loadBadges() {
		try {
			const [msgStats, vmStats] = await Promise.all([
				api('/api/messages/stats').catch(() => ({ unreadConversations: 0 })),
				api('/api/voicemails/stats').catch(() => ({ unheard: 0 }))
			]);
			badges.unreadMessages = msgStats.unreadConversations || 0;
			badges.unheardVoicemails = vmStats.total_unheard || 0;
		} catch (_e) {
			// Silent — badges are non-critical
		}
	}

	$effect(() => {
		loadBadges();
		badgeInterval = setInterval(loadBadges, 15000);
		return () => {
			if (badgeInterval) clearInterval(badgeInterval);
		};
	});
</script>

<Sidebar.Root>
	<Sidebar.Header>
		<div class="flex items-center gap-3 px-3 py-4">
			<div
				class="flex h-9 w-9 items-center justify-center rounded bg-[#C5A55A] text-[#1A1A1A] text-sm font-semibold tracking-wider"
				style="font-family: 'Playfair Display', serif;"
			>
				LM
			</div>
			<div class="flex flex-col">
				<span
					class="text-sm font-medium tracking-wide text-[rgba(255,255,255,0.85)]"
					style="font-family: 'Playfair Display', serif;"
					>LEMEDSPA<span class="text-[8px] align-super text-[rgba(197,165,90,0.6)]">&reg;</span
					></span
				>
				<span class="text-[10px] uppercase tracking-[0.2em] text-[rgba(197,165,90,0.5)]"
					>Operations</span
				>
			</div>
		</div>
	</Sidebar.Header>

	<Sidebar.Content>
		<!-- Dashboard — standalone at top -->
		<Sidebar.Group>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton isActive={page.url.pathname === '/dashboard'}>
							{#snippet child({ props })}
								<a href={resolve('/dashboard')} {...props} class="flex items-center gap-2 w-full">
									<LayoutDashboard class="h-4 w-4" />
									<span>Dashboard</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>

		<!-- Grouped navigation sections -->
		{#each navGroups as group (group.label)}
			<Sidebar.Group>
				<Sidebar.GroupLabel class="section-label-gold px-3 pb-1 pt-3">
					{group.label}
				</Sidebar.GroupLabel>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each group.items as item (item.href)}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive={page.url.pathname.startsWith(item.href)}>
									{#snippet child({ props })}
										<a href={resolve(item.href)} {...props} class="flex items-center justify-between w-full">
											<span class="flex items-center gap-2">
												<item.icon class="h-4 w-4" />
												<span>{item.label}</span>
											</span>
											{#if item.badgeKey && badges[item.badgeKey] > 0}
												<span
													class="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold {item.badgeKey ===
													'unheardVoicemails'
														? 'bg-red-500/80 text-white'
														: 'bg-[#C5A55A] text-[#1A1A1A]'}"
												>
													{badges[item.badgeKey]}
												</span>
											{/if}
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		{/each}
	</Sidebar.Content>

	<Sidebar.Footer>
		<div class="px-3 py-3 border-t border-[rgba(197,165,90,0.1)]">
			<span class="text-[10px] uppercase tracking-[0.15em] text-[rgba(255,255,255,0.25)]"
				>LM App v1.0</span
			>
		</div>
	</Sidebar.Footer>

	<Sidebar.Rail />
</Sidebar.Root>
