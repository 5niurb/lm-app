<script>
	import { onMount } from 'svelte';
	import * as Card from '$lib/components/ui/card/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import { Phone, Search, PhoneIncoming, PhoneOutgoing, ChevronLeft, ChevronRight, Voicemail, Play, Pause, Mail, MailOpen } from '@lucide/svelte';
	import { api } from '$lib/api/client.js';
	import { formatPhone, formatDuration, formatDate, formatRelativeDate } from '$lib/utils/formatters.js';

	// ─── View toggle ───
	let activeView = $state('calls'); // 'calls' | 'voicemails'

	// Check URL params for ?view=voicemails
	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		if (params.get('view') === 'voicemails') activeView = 'voicemails';
	});

	// ─── Call log state ───
	let callSearch = $state('');
	let calls = $state(null);
	let callTotalCount = $state(0);
	let callPage = $state(1);
	let callPageSize = $state(25);
	let callError = $state('');
	let callFilter = $state('all');

	// ─── Voicemail state ───
	let vmSearch = $state('');
	let voicemails = $state(null);
	let vmStats = $state(null);
	let vmTotalCount = $state(0);
	let vmPage = $state(1);
	let vmPageSize = $state(25);
	let vmError = $state('');
	let mailboxFilter = $state('all');
	let statusFilter = $state('all');
	let expandedId = $state(null);
	let playingId = $state(null);

	/** @type {HTMLAudioElement | null} */
	let audioEl = $state(null);

	/** @type {Array<{key: string, label: string}>} */
	const mailboxes = [
		{ key: 'care_team', label: 'Main / Care' },
		{ key: 'lea', label: 'Lea' },
		{ key: 'accounts', label: 'Operations' },
		{ key: 'clinical_md', label: 'Clinical' }
	];

	const mailboxLabels = Object.fromEntries(mailboxes.map(m => [m.key, m.label]));

	// ─── Load both on mount ───
	$effect(() => {
		loadCalls();
		loadVoicemails();
		loadVmStats();
	});

	// ─── Call functions ───
	async function loadCalls() {
		try {
			const params = new URLSearchParams({
				page: callPage.toString(),
				pageSize: callPageSize.toString()
			});

			if (callSearch) params.set('search', callSearch);
			if (callFilter === 'outbound') params.set('direction', 'outbound');
			if (callFilter === 'inbound') params.set('direction', 'inbound');
			if (callFilter === 'missed') params.set('disposition', 'missed');
			if (callFilter === 'voicemail') params.set('disposition', 'voicemail');
			if (callFilter === 'answered') params.set('disposition', 'answered');

			const res = await api(`/api/calls?${params}`);
			calls = res.data;
			callTotalCount = res.count;
		} catch (e) {
			callError = e.message;
		}
	}

	function handleCallSearch() {
		callPage = 1;
		loadCalls();
	}

	function setCallFilter(f) {
		callFilter = f;
		callPage = 1;
		loadCalls();
	}

	function callNextPage() {
		if (callPage * callPageSize < callTotalCount) { callPage++; loadCalls(); }
	}
	function callPrevPage() {
		if (callPage > 1) { callPage--; loadCalls(); }
	}

	function dispositionColor(disposition) {
		switch (disposition) {
			case 'answered': return 'default';
			case 'missed': return 'destructive';
			case 'voicemail': return 'secondary';
			case 'abandoned': return 'outline';
			default: return 'outline';
		}
	}

	const callTotalPages = $derived(Math.ceil(callTotalCount / callPageSize) || 1);

	// ─── Voicemail functions ───
	async function loadVoicemails() {
		try {
			const params = new URLSearchParams({
				page: vmPage.toString(),
				pageSize: vmPageSize.toString()
			});

			if (vmSearch) params.set('search', vmSearch);
			if (mailboxFilter !== 'all') params.set('mailbox', mailboxFilter);
			if (statusFilter === 'new') params.set('is_new', 'true');
			if (statusFilter === 'read') params.set('is_new', 'false');

			const res = await api(`/api/voicemails?${params}`);
			voicemails = res.data;
			vmTotalCount = res.count;
		} catch (e) {
			vmError = e.message;
		}
	}

	async function loadVmStats() {
		try {
			vmStats = await api('/api/voicemails/stats');
		} catch (e) {
			console.error('Failed to load voicemail stats:', e);
		}
	}

	function handleVmSearch() {
		vmPage = 1;
		loadVoicemails();
	}

	function setMailbox(m) {
		mailboxFilter = m;
		vmPage = 1;
		loadVoicemails();
	}

	function setStatus(s) {
		statusFilter = s;
		vmPage = 1;
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
			loadVmStats();
		} catch (e) {
			console.error('Failed to toggle read status:', e);
		}
	}

	async function playRecording(vm) {
		if (playingId === vm.id) {
			audioEl?.pause();
			playingId = null;
			return;
		}
		if (audioEl) {
			audioEl.pause();
		}
		const proxyUrl = `${import.meta.env.PUBLIC_API_URL || 'http://localhost:3001'}/api/voicemails/${vm.id}/recording`;
		const currentSession = (await import('$lib/stores/auth.js')).session;
		const { get } = await import('svelte/store');
		const token = get(currentSession)?.access_token;

		audioEl = new Audio();
		try {
			playingId = vm.id;
			const res = await fetch(proxyUrl, {
				headers: token ? { 'Authorization': `Bearer ${token}` } : {}
			});
			if (!res.ok) throw new Error('Failed to load recording');
			const blob = await res.blob();
			audioEl.src = URL.createObjectURL(blob);
			audioEl.play();
			audioEl.onended = () => { playingId = null; };
		} catch (e) {
			console.error('Failed to play recording:', e);
			playingId = null;
			vmError = 'Failed to play recording';
		}

		if (vm.is_new) {
			toggleRead(vm);
		}
	}

	function vmNextPage() {
		if (vmPage * vmPageSize < vmTotalCount) { vmPage++; loadVoicemails(); }
	}
	function vmPrevPage() {
		if (vmPage > 1) { vmPage--; loadVoicemails(); }
	}

	const vmTotalPages = $derived(Math.ceil(vmTotalCount / vmPageSize) || 1);

	function switchView(view) {
		activeView = view;
		// Stop audio if switching away from voicemails
		if (view !== 'voicemails' && audioEl) {
			audioEl.pause();
			playingId = null;
		}
	}
</script>

<svelte:head>
	<title>Phone Log — Le Med Spa</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header + view toggle -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h1 class="text-2xl tracking-wide">Phone Log</h1>
			<p class="text-sm text-muted-foreground mt-1">Calls, voicemails & recordings in one place.</p>
		</div>
		<div class="flex rounded-lg border border-[rgba(197,165,90,0.2)] overflow-hidden">
			<button
				class="flex items-center gap-1.5 px-4 py-2 text-sm transition-all {activeView === 'calls' ? 'bg-[rgba(197,165,90,0.15)] text-[#C5A55A] font-medium' : 'text-[rgba(255,255,255,0.5)] hover:text-[rgba(255,255,255,0.7)] hover:bg-[rgba(197,165,90,0.05)]'}"
				onclick={() => switchView('calls')}
			>
				<Phone class="h-3.5 w-3.5" />
				Calls
			</button>
			<button
				class="flex items-center gap-1.5 px-4 py-2 text-sm border-l border-[rgba(197,165,90,0.2)] transition-all {activeView === 'voicemails' ? 'bg-[rgba(197,165,90,0.15)] text-[#C5A55A] font-medium' : 'text-[rgba(255,255,255,0.5)] hover:text-[rgba(255,255,255,0.7)] hover:bg-[rgba(197,165,90,0.05)]'}"
				onclick={() => switchView('voicemails')}
			>
				<Voicemail class="h-3.5 w-3.5" />
				Voicemails
				{#if vmStats?.total_unheard > 0}
					<span class="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C5A55A] px-1.5 text-[10px] font-bold text-[#1A1A1A]">
						{vmStats.total_unheard}
					</span>
				{/if}
			</button>
		</div>
	</div>

	<!-- ════════════════════════════════════════════ -->
	<!-- CALLS VIEW                                  -->
	<!-- ════════════════════════════════════════════ -->
	{#if activeView === 'calls'}
		{#if callError}
			<div class="rounded border border-red-500/30 bg-red-500/5 px-4 py-3">
				<p class="text-sm text-red-400">{callError}</p>
			</div>
		{/if}

		<div class="rounded border border-[rgba(197,165,90,0.12)] overflow-hidden">
			<div class="px-5 py-4 border-b border-[rgba(197,165,90,0.08)]">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
					<form class="relative flex-1" onsubmit={(e) => { e.preventDefault(); handleCallSearch(); }}>
						<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
						<Input
							placeholder="Search by name or phone number..."
							class="pl-8"
							bind:value={callSearch}
						/>
					</form>
					<div class="flex flex-wrap gap-1">
						<Button variant={callFilter === 'all' ? 'default' : 'outline'} size="sm" onclick={() => setCallFilter('all')}>All</Button>
						<Button variant={callFilter === 'inbound' ? 'default' : 'outline'} size="sm" onclick={() => setCallFilter('inbound')}>
							<PhoneIncoming class="h-3.5 w-3.5 mr-1" />Inbound
						</Button>
						<Button variant={callFilter === 'outbound' ? 'default' : 'outline'} size="sm" onclick={() => setCallFilter('outbound')}>
							<PhoneOutgoing class="h-3.5 w-3.5 mr-1" />Outbound
						</Button>
						<Button variant={callFilter === 'answered' ? 'default' : 'outline'} size="sm" onclick={() => setCallFilter('answered')}>Answered</Button>
						<Button variant={callFilter === 'missed' ? 'default' : 'outline'} size="sm" onclick={() => setCallFilter('missed')}>Missed</Button>
						<Button variant={callFilter === 'voicemail' ? 'default' : 'outline'} size="sm" onclick={() => setCallFilter('voicemail')}>Voicemail</Button>
					</div>
				</div>
			</div>
			<div class="p-5">
				{#if calls === null}
					<div class="space-y-3">
						{#each Array(10) as _}
							<Skeleton class="h-14 w-full" />
						{/each}
					</div>
				{:else if calls.length === 0}
					<div class="flex h-48 items-center justify-center text-muted-foreground">
						<div class="text-center">
							<Phone class="mx-auto mb-3 h-8 w-8 text-[rgba(197,165,90,0.2)]" />
							<p class="text-sm text-[rgba(255,255,255,0.35)]">No call records found.</p>
							{#if callSearch || callFilter !== 'all'}
								<p class="text-xs text-[rgba(255,255,255,0.2)] mt-1">Try adjusting your search or filter.</p>
							{:else}
								<p class="text-xs text-[rgba(255,255,255,0.2)] mt-1">Calls will appear here once Twilio webhooks are connected.</p>
							{/if}
						</div>
					</div>
				{:else}
					<div class="space-y-1">
						{#each calls as call}
							<div class="group flex items-center justify-between rounded p-3 transition-all duration-200 hover:bg-[rgba(197,165,90,0.04)] border border-transparent hover:border-[rgba(197,165,90,0.1)]">
								<div class="flex items-center gap-3">
									{#if call.direction === 'inbound'}
										<PhoneIncoming class="h-4 w-4 shrink-0 text-blue-400/70 group-hover:text-blue-400 transition-colors" />
									{:else}
										<PhoneOutgoing class="h-4 w-4 shrink-0 text-emerald-400/70 group-hover:text-emerald-400 transition-colors" />
									{/if}
									<div class="min-w-0">
										<p class="text-sm font-medium truncate flex items-center gap-1.5">
											{#if call.contact_id && call.caller_name}
												<span class="text-[#C5A55A] text-[10px]" title="Contact">◆</span>
												<span class="text-[rgba(255,255,255,0.9)]">{call.caller_name}</span>
											{:else if call.caller_name}
												<span class="text-[rgba(255,255,255,0.7)]">{call.caller_name}</span>
												<span class="text-[9px] uppercase tracking-wider px-1 py-px rounded bg-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.3)] leading-none">CID</span>
											{:else}
												<span class="text-[rgba(255,255,255,0.85)]">{formatPhone(call.direction === 'inbound' ? call.from_number : call.to_number)}</span>
											{/if}
										</p>
										<p class="text-xs text-[rgba(255,255,255,0.35)]">
											{#if call.caller_name}
												{formatPhone(call.direction === 'inbound' ? call.from_number : call.to_number)} &middot;
											{/if}
											{formatDate(call.started_at)}
										</p>
									</div>
								</div>
								<div class="flex items-center gap-3">
									{#if call.duration > 0}
										<span class="text-xs text-[rgba(255,255,255,0.3)] hidden sm:inline">
											{formatDuration(call.duration)}
										</span>
									{/if}
									<Badge variant={dispositionColor(call.disposition)}>
										{call.disposition || call.status}
									</Badge>
								</div>
							</div>
						{/each}
					</div>

					{#if callTotalCount > callPageSize}
						<div class="flex items-center justify-between pt-4">
							<p class="text-sm text-muted-foreground">
								Showing {(callPage - 1) * callPageSize + 1}–{Math.min(callPage * callPageSize, callTotalCount)} of {callTotalCount}
							</p>
							<div class="flex gap-1">
								<Button variant="outline" size="sm" onclick={callPrevPage} disabled={callPage <= 1}>
									<ChevronLeft class="h-4 w-4" />
								</Button>
								<span class="flex items-center px-2 text-sm text-muted-foreground">{callPage} / {callTotalPages}</span>
								<Button variant="outline" size="sm" onclick={callNextPage} disabled={callPage >= callTotalPages}>
									<ChevronRight class="h-4 w-4" />
								</Button>
							</div>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	{/if}

	<!-- ════════════════════════════════════════════ -->
	<!-- VOICEMAILS VIEW                             -->
	<!-- ════════════════════════════════════════════ -->
	{#if activeView === 'voicemails'}
		{#if vmError}
			<div class="rounded border border-red-500/30 bg-red-500/5 px-4 py-3">
				<p class="text-sm text-red-400">{vmError}</p>
			</div>
		{/if}

		<!-- Mailbox tabs -->
		{#if vmStats}
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
				<button
					class="group rounded border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 {mailboxFilter === 'all' ? 'border-[rgba(197,165,90,0.4)] bg-[rgba(197,165,90,0.08)]' : 'border-[rgba(197,165,90,0.12)] bg-[rgba(197,165,90,0.03)] hover:border-[rgba(197,165,90,0.25)] hover:bg-[rgba(197,165,90,0.06)]'}"
					onclick={() => setMailbox('all')}
				>
					<p class="text-xs uppercase tracking-[0.15em] {mailboxFilter === 'all' ? 'text-[#C5A55A]' : 'text-[rgba(255,255,255,0.4)]'}">All</p>
					<p class="text-2xl font-light mt-1 text-[rgba(255,255,255,0.9)]" style="font-family: 'Playfair Display', serif;">{vmStats.total_unheard}</p>
					<p class="text-[10px] uppercase tracking-[0.12em] text-[rgba(197,165,90,0.35)] mt-1">unheard</p>
				</button>
				{#each mailboxes as { key, label }}
					<button
						class="group rounded border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 {mailboxFilter === key ? 'border-[rgba(197,165,90,0.4)] bg-[rgba(197,165,90,0.08)]' : 'border-[rgba(197,165,90,0.12)] bg-[rgba(197,165,90,0.03)] hover:border-[rgba(197,165,90,0.25)] hover:bg-[rgba(197,165,90,0.06)]'}"
						onclick={() => setMailbox(key)}
					>
						<p class="text-xs uppercase tracking-[0.15em] {mailboxFilter === key ? 'text-[#C5A55A]' : 'text-[rgba(255,255,255,0.4)]'}">{label}</p>
						<p class="text-2xl font-light mt-1 text-[rgba(255,255,255,0.9)]" style="font-family: 'Playfair Display', serif;">{vmStats[key] || 0}</p>
						<p class="text-[10px] uppercase tracking-[0.12em] text-[rgba(197,165,90,0.35)] mt-1">unheard</p>
					</button>
				{/each}
			</div>
		{/if}

		<Card.Root>
			<Card.Header>
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
					<form class="relative flex-1" onsubmit={(e) => { e.preventDefault(); handleVmSearch(); }}>
						<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
						<Input placeholder="Search by phone or transcription..." class="pl-8" bind:value={vmSearch} />
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
							{#if vmSearch || mailboxFilter !== 'all' || statusFilter !== 'all'}
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
											<p class="text-sm font-medium truncate flex items-center gap-1.5">
												{#if vm.call_logs?.contact_id && vm.call_logs?.caller_name}
													<span class="text-[#C5A55A] text-[10px] shrink-0" title="Contact">◆</span>
													<span class="text-[rgba(255,255,255,0.9)] truncate">{vm.call_logs.caller_name}</span>
												{:else if vm.call_logs?.caller_name}
													<span class="text-[rgba(255,255,255,0.7)] truncate">{vm.call_logs.caller_name}</span>
													<span class="text-[9px] uppercase tracking-wider px-1 py-px rounded bg-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.3)] leading-none shrink-0">CID</span>
												{:else}
													<span>{formatPhone(vm.from_number)}</span>
												{/if}
											</p>
											<p class="text-xs text-muted-foreground">
												{#if vm.call_logs?.caller_name}
													{formatPhone(vm.from_number)} &middot;
												{/if}
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

					{#if vmTotalCount > vmPageSize}
						<div class="flex items-center justify-between pt-4">
							<p class="text-sm text-muted-foreground">
								Showing {(vmPage - 1) * vmPageSize + 1}–{Math.min(vmPage * vmPageSize, vmTotalCount)} of {vmTotalCount}
							</p>
							<div class="flex gap-1">
								<Button variant="outline" size="sm" onclick={vmPrevPage} disabled={vmPage <= 1}>
									<ChevronLeft class="h-4 w-4" />
								</Button>
								<span class="flex items-center px-2 text-sm text-muted-foreground">{vmPage} / {vmTotalPages}</span>
								<Button variant="outline" size="sm" onclick={vmNextPage} disabled={vmPage >= vmTotalPages}>
									<ChevronRight class="h-4 w-4" />
								</Button>
							</div>
						</div>
					{/if}
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
