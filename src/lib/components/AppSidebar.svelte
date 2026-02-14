<script>
	import { page } from '$app/state';
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
	import { LayoutDashboard, Phone, Headset, MessageSquare, Users, Settings, Sparkles, Zap } from '@lucide/svelte';
	import { api } from '$lib/api/client.js';

	const navItems = [
		{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
		{ href: '/softphone', label: 'Softphone', icon: Headset },
		{ href: '/calls', label: 'Phone Log', icon: Phone, badgeKey: 'unheardVoicemails' },
		{ href: '/messages', label: 'Messages', icon: MessageSquare, badgeKey: 'unreadMessages' },
		{ href: '/contacts', label: 'Contacts', icon: Users },
		{ href: '/services', label: 'Services', icon: Sparkles },
		{ href: '/automation', label: 'Automation', icon: Zap },
		{ href: '/settings', label: 'Settings', icon: Settings }
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
		} catch (e) {
			// Silent — badges are non-critical
		}
	}

	$effect(() => {
		loadBadges();
		badgeInterval = setInterval(loadBadges, 15000); // Refresh badges every 15s
		return () => { if (badgeInterval) clearInterval(badgeInterval); };
	});
</script>

<Sidebar.Root>
	<Sidebar.Header>
		<div class="flex items-center gap-3 px-3 py-4">
			<div class="flex h-9 w-9 items-center justify-center rounded bg-[#C5A55A] text-[#1A1A1A] text-sm font-semibold tracking-wider" style="font-family: 'Playfair Display', serif;">
				LM
			</div>
			<div class="flex flex-col">
				<span class="text-sm font-medium tracking-wide text-[rgba(255,255,255,0.85)]" style="font-family: 'Playfair Display', serif;">Le Med Spa</span>
				<span class="text-[10px] uppercase tracking-[0.2em] text-[rgba(197,165,90,0.5)]">Operations</span>
			</div>
		</div>
	</Sidebar.Header>

	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					{#each navItems as item}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton
								isActive={page.url.pathname.startsWith(item.href)}
							>
								{#snippet child({ props })}
									<a href={item.href} {...props} class="flex items-center justify-between w-full">
										<span class="flex items-center gap-2">
											<item.icon class="h-4 w-4" />
											<span>{item.label}</span>
										</span>
										{#if item.badgeKey && badges[item.badgeKey] > 0}
											<span class="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold {item.badgeKey === 'unheardVoicemails' ? 'bg-red-500/80 text-white' : 'bg-[#C5A55A] text-[#1A1A1A]'}">
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
	</Sidebar.Content>

	<Sidebar.Footer>
		<div class="px-3 py-3 border-t border-[rgba(197,165,90,0.1)]">
			<span class="text-[10px] uppercase tracking-[0.15em] text-[rgba(255,255,255,0.25)]">LM App v1.0</span>
		</div>
	</Sidebar.Footer>

	<Sidebar.Rail />
</Sidebar.Root>
