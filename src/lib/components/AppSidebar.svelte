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
		Zap,
		CalendarDays
	} from '@lucide/svelte';
	import { api } from '$lib/api/client.js';

	/**
	 * @typedef {{ href: string, label: string, icon: any, badgeKey?: string, color: string }} NavItem
	 * @typedef {{ label: string, items: NavItem[] }} NavGroup
	 */

	/** @type {NavGroup[]} */
	const navGroups = [
		{
			label: 'Communications',
			items: [
				{ href: '/softphone', label: 'Softphone', icon: Headset, color: 'grad-cyan' },
				{
					href: '/calls',
					label: 'Phone Log',
					icon: Phone,
					badgeKey: 'unheardVoicemails',
					color: 'grad-blue'
				},
				{
					href: '/messages',
					label: 'Messages',
					icon: MessageSquare,
					badgeKey: 'unreadMessages',
					color: 'grad-emerald'
				}
			]
		},
		{
			label: 'Operations',
			items: [
				{ href: '/appointments', label: 'Schedule', icon: CalendarDays, color: 'grad-amber' },
				{ href: '/contacts', label: 'Contacts', icon: Users, color: 'grad-rose' },
				{ href: '/services', label: 'Services', icon: Sparkles, color: 'grad-violet' },
				{ href: '/automation', label: 'Automation', icon: Zap, color: 'grad-orange' }
			]
		},
		{
			label: 'System',
			items: [{ href: '/settings', label: 'Settings', icon: Settings, color: 'grad-slate' }]
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
				class="flex h-9 w-9 items-center justify-center rounded-lg grad-gold text-white text-sm font-bold tracking-wider"
				style="font-family: 'Outfit', sans-serif;"
			>
				LM
			</div>
			<div class="flex flex-col">
				<span
					class="text-sm font-semibold tracking-wide text-text-primary"
					style="font-family: 'Outfit', sans-serif; font-variant: small-caps;"
					>LeMed Spa<span class="text-[8px] align-super text-text-tertiary">&reg;</span></span
				>
				<span class="text-[10px] uppercase tracking-[0.15em] text-text-tertiary">Operations</span>
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
								<a href={resolve('/dashboard')} {...props} class="flex items-center gap-3 w-full">
									<span class="icon-box grad-gold">
										<LayoutDashboard class="h-3.5 w-3.5 text-white" />
									</span>
									<span class="font-medium">Dashboard</span>
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
										<a
											href={resolve(item.href)}
											{...props}
											class="flex items-center justify-between w-full"
										>
											<span class="flex items-center gap-3">
												<span class="icon-box {item.color}">
													<item.icon class="h-3.5 w-3.5 text-white" />
												</span>
												<span class="font-medium">{item.label}</span>
											</span>
											{#if item.badgeKey && badges[item.badgeKey] > 0}
												<span
													class="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold {item.badgeKey ===
													'unheardVoicemails'
														? 'bg-vivid-rose/20 text-vivid-rose'
														: 'bg-vivid-emerald/20 text-vivid-emerald'}"
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
		<div class="px-3 py-3 border-t border-border-subtle">
			<span class="text-[10px] uppercase tracking-[0.12em] text-text-ghost">LM App v1.0</span>
		</div>
	</Sidebar.Footer>

	<Sidebar.Rail />
</Sidebar.Root>
