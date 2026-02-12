<script>
	import { profile } from '$lib/stores/auth.js';
	import { supabase } from '$lib/utils/supabase.js';
	import { goto } from '$app/navigation';
	import { SidebarTrigger } from '$lib/components/ui/sidebar/index.ts';
	import { Separator } from '$lib/components/ui/separator/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.ts';
	import * as Avatar from '$lib/components/ui/avatar/index.ts';
	import { LogOut, User } from '@lucide/svelte';

	async function handleLogout() {
		await supabase.auth.signOut();
		goto('/login');
	}
</script>

<header class="flex h-14 items-center gap-2 border-b px-4">
	<SidebarTrigger />
	<Separator orientation="vertical" class="h-6" />

	<div class="flex-1"></div>

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
