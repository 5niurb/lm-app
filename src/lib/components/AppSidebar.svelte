<script>
	import { page } from '$app/state';
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
	import { LayoutDashboard, Phone, Headset, Voicemail, Users, Settings } from '@lucide/svelte';

	const navItems = [
		{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
		{ href: '/softphone', label: 'Softphone', icon: Headset },
		{ href: '/calls', label: 'Calls', icon: Phone },
		{ href: '/voicemails', label: 'Voicemails', icon: Voicemail },
		{ href: '/contacts', label: 'Contacts', icon: Users },
		{ href: '/settings', label: 'Settings', icon: Settings }
	];
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
									<a href={item.href} {...props}>
										<item.icon class="h-4 w-4" />
										<span>{item.label}</span>
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
