<script>
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import { Voicemail, Search, Play, Pause, ChevronLeft, ChevronRight, Mail, MailOpen } from '@lucide/svelte';
	import { api } from '$lib/api/client.js';
	import { formatPhone, formatDuration, formatRelativeDate } from '$lib/utils/formatters.js';

	let search = $state('');
	let voicemails = $state(null);
	let stats = $state(null);
	let totalCount = $state(0);
	let page = $state(1);
	let pageSize = $state(25);
	let error = $state('');
	let mailboxFilter = $state('all');
	let statusFilter = $state('all');
	let expandedId = $state(null);
	let playingId = $state(null);

	/** @type {HTMLAudioElement | null} */
	let audioEl = $state(null);

	const mailboxLabels = {
		lea: 'Lea',
		clinical_md: 'Clinical MD',
		accounts: 'Accounts',
		care_team: 'Care Team'
	};

	$effect(() => {
		loadVoicemails();
		loadStats();
	});

	async function loadVoicemails() {
		try {
			const params = new URLSearchParams({
				page: page.toString(),
				pageSize: pageSize.toString()
			});

			if (search) params.set('search', search);
			if (mailboxFilter !== 'all') params.set('mailbox', mailboxFilter);
			if (statusFilter === 'new') params.set('is_new', 'true');
			if (statusFilter === 'read') params.set('is_new', 'false');

			const res = await api(`/api/voicemails?${params}`);
			voicemails = res.data;
			totalCount = res.count;
		} catch (e) {
			error = e.message;
		}
	}

	async function loadStats() {
		try {
			stats = await api('/api/voicemails/stats');
		} catch (e) {
			console.error('Failed to load voicemail stats:', e);
		}
	}

	function handleSearch() {
		page = 1;
		loadVoicemails();
	}

	function setMailbox(m) {
		mailboxFilter = m;
		page = 1;
		loadVoicemails();
	}

	function setStatus(s) {
		statusFilter = s;
		page = 1;
		loadVoicemails();
	}

	function toggleExpand(id) {
		expandedId = expandedId === id ? null : id;
	}

	async function toggleRead(vm) {
		try {
			if (vm.is_new) {
				await api(`/api/voicemails/${vm.id}/read`, { method: 'PATCH' });
				vm.is_new = false;
			} else {
				await api(`/api/voicemails/${vm.id}/unread`, { method: 'PATCH' });
				vm.is_new = true;
			}
			loadStats();
		} catch (e) {
			console.error('Failed to toggle read status:', e);
		}
	}

	function playRecording(vm) {
		if (playingId === vm.id) {
			audioEl?.pause();
			playingId = null;
			return;
		}
		if (audioEl) {
			audioEl.pause();
		}
		audioEl = new Audio(vm.recording_url);
		audioEl.play();
		playingId = vm.id;
		audioEl.onended = () => { playingId = null; };
	}

	function nextPage() {
		if (page * pageSize < totalCount) { page++; loadVoicemails(); }
	}
	function prevPage() {
		if (page > 1) { page--; loadVoicemails(); }
	}

	const totalPages = $derived(Math.ceil(totalCount / pageSize) || 1);
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Voicemails</h1>
			<p class="text-muted-foreground">Listen to and manage voicemail messages.</p>
		</div>
	</div>

	{#if error}
		<Card.Root>
			<Card.Content class="py-4">
				<p class="text-sm text-destructive">{error}</p>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- Mailbox tabs -->
	{#if stats}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
			<button
				class="rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 {mailboxFilter === 'all' ? 'border-primary bg-muted/30' : ''}"
				onclick={() => setMailbox('all')}
			>
				<p class="text-sm font-medium">All</p>
				<p class="text-2xl font-bold">{stats.total_unheard}</p>
				<p class="text-xs text-muted-foreground">unheard</p>
			</button>
			{#each Object.entries(mailboxLabels) as [key, label]}
				<button
					class="rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 {mailboxFilter === key ? 'border-primary bg-muted/30' : ''}"
					onclick={() => setMailbox(key)}
				>
					<p class="text-sm font-medium">{label}</p>
					<p class="text-2xl font-bold">{stats[key] || 0}</p>
					<p class="text-xs text-muted-foreground">unheard</p>
				</button>
			{/each}
		</div>
	{/if}

	<Card.Root>
		<Card.Header>
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
				<form class="relative flex-1" onsubmit={(e) => { e.preventDefault(); handleSearch(); }}>
					<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
					<Input placeholder="Search by phone or transcription..." class="pl-8" bind:value={search} />
				</form>
				<div class="flex gap-1">
					<Button variant={statusFilter === 'all' ? 'default' : 'outline'} size="sm" onclick={() => setStatus('all')}>All</Button>
					<Button variant={statusFilter === 'new' ? 'default' : 'outline'} size="sm" onclick={() => setStatus('new')}>New</Button>
					<Button variant={statusFilter === 'read' ? 'default' : 'outline'} size="sm" onclick={() => setStatus('read')}>Read</Button>
				</div>
			</div>
		</Card.Header>
		<Card.Content>
			{#if voicemails === null}
				<div class="space-y-3">
					{#each Array(5) as _}
						<Skeleton class="h-16 w-full" />
					{/each}
				</div>
			{:else if voicemails.length === 0}
				<div class="flex h-48 items-center justify-center text-muted-foreground">
					<div class="text-center">
						<Voicemail class="mx-auto mb-3 h-10 w-10 opacity-50" />
						<p>No voicemails found.</p>
						{#if search || mailboxFilter !== 'all' || statusFilter !== 'all'}
							<p class="text-sm">Try adjusting your search or filters.</p>
						{:else}
							<p class="text-sm">Voicemails will appear here once Twilio webhooks are connected.</p>
						{/if}
					</div>
				</div>
			{:else}
				<div class="space-y-1">
					{#each voicemails as vm}
						<div
							class="rounded-md border transition-colors {vm.is_new ? 'bg-muted/30 border-primary/20' : ''}"
						>
							<button
								class="flex w-full items-center justify-between p-3 text-left"
								onclick={() => toggleExpand(vm.id)}
							>
								<div class="flex items-center gap-3">
									{#if vm.is_new}
										<Mail class="h-4 w-4 shrink-0 text-primary" />
									{:else}
										<MailOpen class="h-4 w-4 shrink-0 text-muted-foreground" />
									{/if}
									<div class="min-w-0">
										<p class="text-sm font-medium truncate">
											{formatPhone(vm.from_number)}
										</p>
										<p class="text-xs text-muted-foreground">
											{formatRelativeDate(vm.created_at)} &middot; {formatDuration(vm.duration)}
											{#if vm.mailbox}
												&middot; {mailboxLabels[vm.mailbox] || vm.mailbox}
											{/if}
										</p>
									</div>
								</div>
								<div class="flex items-center gap-2">
									{#if vm.transcription_status === 'completed'}
										<Badge variant="secondary">Transcribed</Badge>
									{:else if vm.transcription_status === 'pending'}
										<Badge variant="outline">Pending</Badge>
									{/if}
								</div>
							</button>

							{#if expandedId === vm.id}
								<div class="border-t px-3 py-3 space-y-3">
									<!-- Audio player -->
									{#if vm.recording_url}
										<div class="flex items-center gap-2">
											<Button
												variant="outline"
												size="sm"
												onclick={() => playRecording(vm)}
											>
												{#if playingId === vm.id}
													<Pause class="h-3 w-3 mr-1" /> Pause
												{:else}
													<Play class="h-3 w-3 mr-1" /> Play
												{/if}
											</Button>
											<span class="text-xs text-muted-foreground">{formatDuration(vm.duration)}</span>
										</div>
									{/if}

									<!-- Transcription -->
									{#if vm.transcription}
										<div>
											<p class="text-xs font-medium text-muted-foreground mb-1">Transcription</p>
											<p class="text-sm leading-relaxed bg-muted/50 rounded-md p-2">{vm.transcription}</p>
										</div>
									{:else if vm.transcription_status === 'pending'}
										<p class="text-sm text-muted-foreground italic">Transcription in progress...</p>
									{:else if vm.transcription_status === 'failed'}
										<p class="text-sm text-destructive">Transcription failed.</p>
									{/if}

									<!-- Actions -->
									<div class="flex gap-2">
										<Button variant="outline" size="sm" onclick={() => toggleRead(vm)}>
											{vm.is_new ? 'Mark as Read' : 'Mark as Unread'}
										</Button>
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>

				{#if totalCount > pageSize}
					<div class="flex items-center justify-between pt-4">
						<p class="text-sm text-muted-foreground">
							Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount}
						</p>
						<div class="flex gap-1">
							<Button variant="outline" size="sm" onclick={prevPage} disabled={page <= 1}>
								<ChevronLeft class="h-4 w-4" />
							</Button>
							<span class="flex items-center px-2 text-sm text-muted-foreground">{page} / {totalPages}</span>
							<Button variant="outline" size="sm" onclick={nextPage} disabled={page >= totalPages}>
								<ChevronRight class="h-4 w-4" />
							</Button>
						</div>
					</div>
				{/if}
			{/if}
		</Card.Content>
	</Card.Root>
</div>
