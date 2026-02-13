<script>
	import { page } from '$app/state';
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
	import { LayoutDashboard, Phone, Voicemail, Settings } from '@lucide/svelte';

	const navItems = [
		{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
		{ href: '/calls', label: 'Calls', icon: Phone },
		{ href: '/voicemails', label: 'Voicemails', icon: Voicemail },
		{ href: '/settings', label: 'Settings', icon: Settings }
	];
</script>

<Sidebar.Root>
	<Sidebar.Header>
		<div class="flex items-center gap-2 px-2 py-3">
			<div class="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
				LM
			</div>
			<span class="text-lg font-semibold">Le Med Spa</span>
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
		<div class="px-2 py-2 text-xs text-muted-foreground">
			LM App v1.0
		</div>
	</Sidebar.Footer>

	<Sidebar.Rail />
</Sidebar.Root>
