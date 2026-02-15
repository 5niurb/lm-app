<script>
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import {
		Phone,
		Search,
		PhoneIncoming,
		PhoneOutgoing,
		PhoneMissed,
		ChevronLeft,
		ChevronRight,
		Voicemail,
		Play,
		Pause,
		MessageSquare
	} from '@lucide/svelte';
	import { api } from '$lib/api/client.js';
	import {
		formatPhone,
		formatDuration,
		formatDate,
		formatRelativeDate
	} from '$lib/utils/formatters.js';

	// ─── State ───
	let search = $state('');
	let calls = $state(null);
	let totalCount = $state(0);
	let currentPage = $state(1);
	let pageSize = $state(25);
	let error = $state('');
	let filter = $state('all');

	// Audio playback for inline voicemail
	let playingId = $state(null);
	/** @type {HTMLAudioElement | null} */
	let audioEl = $state(null);

	// ─── Twilio number selector ───
	/** @type {Array<{sid: string, phoneNumber: string, friendlyName: string}>} */
	let twilioNumbers = $state([]);
	/** @type {string} Currently selected Twilio number filter ('' = all) */
	let selectedNumber = $state('');

	// Check URL params for ?filter= preset
	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		const preset = params.get('filter');
		if (preset && ['inbound', 'outbound', 'answered', 'missed', 'voicemail'].includes(preset)) {
			filter = preset;
		}
	});

	// Load Twilio numbers on mount
	$effect(() => {
		loadTwilioNumbers();
	});

	// ─── Load on mount ───
	$effect(() => {
		// Track selectedNumber to trigger reload
		const _num = selectedNumber;
		loadCalls();
	});

	async function loadTwilioNumbers() {
		try {
			const res = await api('/api/twilio-history/numbers');
			twilioNumbers = res.data || [];
		} catch (e) {
			console.error('Failed to load Twilio numbers:', e);
		}
	}

	async function loadCalls() {
		try {
			const params = new URLSearchParams({
				page: currentPage.toString(),
				pageSize: pageSize.toString()
			});

			if (search) params.set('search', search);
			if (filter === 'outbound') params.set('direction', 'outbound');
			if (filter === 'inbound') params.set('direction', 'inbound');
			if (filter === 'missed') params.set('disposition', 'missed');
			if (filter === 'voicemail') params.set('disposition', 'voicemail');
			if (filter === 'answered') params.set('disposition', 'answered');
			if (selectedNumber) params.set('twilioNumber', selectedNumber);

			const res = await api(`/api/calls?${params}`);
			calls = res.data;
			totalCount = res.count;
		} catch (e) {
			error = e.message;
		}
	}

	function handleSearch() {
		currentPage = 1;
		loadCalls();
	}

	function setFilter(f) {
		filter = f;
		currentPage = 1;
		loadCalls();
	}

	function nextPage() {
		if (currentPage * pageSize < totalCount) {
			currentPage++;
			loadCalls();
		}
	}
	function prevPage() {
		if (currentPage > 1) {
			currentPage--;
			loadCalls();
		}
	}

	const totalPages = $derived(Math.ceil(totalCount / pageSize) || 1);

	/**
	 * Build an inline action summary for a call row.
	 * Returns { text, color, icon } describing what happened.
	 */
	function getActionSummary(call) {
		const vm = call.voicemails?.[0]; // joined voicemail (if any)

		// Voicemail left — show transcription preview
		if (call.disposition === 'voicemail' && vm) {
			if (vm.transcription) {
				const preview =
					vm.transcription.length > 90
						? vm.transcription.slice(0, 90).trim() + '...'
						: vm.transcription;
				return {
					text: preview,
					type: 'voicemail',
					hasAudio: !!vm.recording_url,
					vmId: vm.id,
					vmIsNew: vm.is_new
				};
			}
			if (vm.transcription_status === 'pending') {
				return {
					text: 'Transcribing voicemail...',
					type: 'voicemail-pending',
					hasAudio: !!vm.recording_url,
					vmId: vm.id
				};
			}
			return {
				text: 'Voicemail left',
				type: 'voicemail',
				hasAudio: !!vm.recording_url,
				vmId: vm.id
			};
		}

		// Voicemail disposition but no voicemail record yet
		if (call.disposition === 'voicemail') {
			return { text: 'Voicemail left', type: 'voicemail' };
		}

		// Answered
		if (call.disposition === 'answered') {
			if (call.duration > 0) {
				return { text: `Answered \u00b7 ${formatDuration(call.duration)}`, type: 'answered' };
			}
			return { text: 'Answered', type: 'answered' };
		}

		// Missed
		if (call.disposition === 'missed') {
			return { text: 'Missed call', type: 'missed' };
		}

		// Abandoned / caller hung up
		if (call.disposition === 'abandoned') {
			return { text: 'Caller hung up', type: 'abandoned' };
		}

		// Status-based fallbacks
		if (call.status === 'busy') {
			return { text: 'Line busy', type: 'missed' };
		}
		if (call.status === 'no-answer') {
			return { text: 'No answer', type: 'missed' };
		}
		if (call.status === 'failed') {
			return { text: 'Call failed', type: 'failed' };
		}
		if (call.status === 'canceled') {
			return { text: 'Cancelled', type: 'abandoned' };
		}

		// Default
		if (call.duration > 0) {
			return { text: formatDuration(call.duration), type: 'default' };
		}
		return { text: call.status || call.disposition || '', type: 'default' };
	}

	/** Play/pause voicemail audio inline */
	async function togglePlay(vmId) {
		if (playingId === vmId) {
			audioEl?.pause();
			playingId = null;
			return;
		}
		if (audioEl) audioEl.pause();

		const proxyUrl = `${import.meta.env.PUBLIC_API_URL || 'http://localhost:3001'}/api/voicemails/${vmId}/recording`;
		const currentSession = (await import('$lib/stores/auth.js')).session;
		const { get } = await import('svelte/store');
		const token = get(currentSession)?.access_token;

		audioEl = new Audio();
		try {
			playingId = vmId;
			const res = await fetch(proxyUrl, {
				headers: token ? { Authorization: `Bearer ${token}` } : {}
			});
			if (!res.ok) throw new Error('Failed to load recording');
			const blob = await res.blob();
			audioEl.src = URL.createObjectURL(blob);
			audioEl.play();
			audioEl.onended = () => {
				playingId = null;
			};
		} catch (e) {
			console.error('Failed to play recording:', e);
			playingId = null;
		}
	}
</script>

<svelte:head>
	<title>Phone Log — Le Med Spa</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div>
		<h1 class="text-2xl tracking-wide">Phone Log</h1>
		<p class="text-sm text-muted-foreground mt-1">All calls, voicemails & activity at a glance.</p>
	</div>

	<!-- Error -->
	{#if error}
		<div class="rounded border border-red-500/30 bg-red-500/5 px-4 py-3">
			<p class="text-sm text-red-400">{error}</p>
		</div>
	{/if}

	<!-- Main list card -->
	<div class="rounded border border-[rgba(197,165,90,0.12)] overflow-hidden">
		<!-- Search + filters -->
		<div class="px-5 py-4 border-b border-[rgba(197,165,90,0.08)]">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
				<form
					class="relative flex-1"
					onsubmit={(e) => {
						e.preventDefault();
						handleSearch();
					}}
				>
					<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
					<Input placeholder="Search by name or phone number..." class="pl-8" bind:value={search} />
				</form>
				<div class="flex flex-wrap gap-1">
					<Button
						variant={filter === 'all' ? 'default' : 'outline'}
						size="sm"
						onclick={() => setFilter('all')}>All</Button
					>
					<Button
						variant={filter === 'inbound' ? 'default' : 'outline'}
						size="sm"
						onclick={() => setFilter('inbound')}
					>
						<PhoneIncoming class="h-3.5 w-3.5 mr-1" />Inbound
					</Button>
					<Button
						variant={filter === 'outbound' ? 'default' : 'outline'}
						size="sm"
						onclick={() => setFilter('outbound')}
					>
						<PhoneOutgoing class="h-3.5 w-3.5 mr-1" />Outbound
					</Button>
					<Button
						variant={filter === 'answered' ? 'default' : 'outline'}
						size="sm"
						onclick={() => setFilter('answered')}>Answered</Button
					>
					<Button
						variant={filter === 'missed' ? 'default' : 'outline'}
						size="sm"
						onclick={() => setFilter('missed')}>Missed</Button
					>
					<Button
						variant={filter === 'voicemail' ? 'default' : 'outline'}
						size="sm"
						onclick={() => setFilter('voicemail')}>Voicemail</Button
					>
				</div>
			</div>
			<!-- Twilio Number Selector -->
			{#if twilioNumbers.length > 1}
				<div class="flex flex-wrap gap-1 mt-3 pt-3 border-t border-[rgba(197,165,90,0.06)]">
					<button
						class="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200 {selectedNumber === ''
							? 'bg-[#C5A55A] text-[#1A1A1A]'
							: 'bg-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.5)] hover:bg-[rgba(255,255,255,0.1)]'
						}"
						onclick={() => { selectedNumber = ''; currentPage = 1; loadCalls(); }}
					>
						All Lines
					</button>
					{#each twilioNumbers as num}
						<button
							class="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-200 {selectedNumber === num.phoneNumber
								? 'bg-[#C5A55A] text-[#1A1A1A]'
								: 'bg-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.5)] hover:bg-[rgba(255,255,255,0.1)]'
							}"
							onclick={() => { selectedNumber = num.phoneNumber; currentPage = 1; loadCalls(); }}
							title={num.friendlyName || num.phoneNumber}
						>
							{num.friendlyName || formatPhone(num.phoneNumber)}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Call list -->
		<div class="p-5">
			{#if calls === null}
				<div class="space-y-3">
					{#each Array(10) as _}
						<Skeleton class="h-16 w-full" />
					{/each}
				</div>
			{:else if calls.length === 0}
				<div class="flex h-48 items-center justify-center text-muted-foreground">
					<div class="text-center">
						<Phone class="mx-auto mb-3 h-8 w-8 text-[rgba(197,165,90,0.2)]" />
						<p class="text-sm text-[rgba(255,255,255,0.35)]">No call records found.</p>
						{#if search || filter !== 'all'}
							<p class="text-xs text-[rgba(255,255,255,0.2)] mt-1">
								Try adjusting your search or filter.
							</p>
						{:else}
							<p class="text-xs text-[rgba(255,255,255,0.2)] mt-1">
								Calls will appear here once Twilio webhooks are connected.
							</p>
						{/if}
					</div>
				</div>
			{:else}
				<div class="space-y-0.5">
					{#each calls as call}
						{@const summary = getActionSummary(call)}
						{@const callPhone = call.direction === 'inbound' ? call.from_number : call.to_number}
						<div
							class="group flex items-start gap-3 rounded-md px-3 py-3 transition-all duration-200 hover:bg-[rgba(197,165,90,0.04)] border border-transparent hover:border-[rgba(197,165,90,0.1)]"
						>
							<!-- Direction icon -->
							<div class="mt-0.5 shrink-0">
								{#if call.disposition === 'missed' || call.disposition === 'abandoned'}
									<PhoneMissed class="h-4 w-4 text-red-400/70" />
								{:else if call.direction === 'inbound'}
									<PhoneIncoming
										class="h-4 w-4 text-blue-400/70 group-hover:text-blue-400 transition-colors"
									/>
								{:else}
									<PhoneOutgoing
										class="h-4 w-4 text-emerald-400/70 group-hover:text-emerald-400 transition-colors"
									/>
								{/if}
							</div>

							<!-- Content: name + action summary -->
							<div class="min-w-0 flex-1">
								<!-- Top line: name/number + quick actions + time -->
								<div class="flex items-center justify-between gap-2">
									<div class="flex items-center gap-1.5 min-w-0">
										<p class="text-sm font-medium truncate flex items-center gap-1.5">
											{#if call.contact_id && call.caller_name}
												<span class="text-[#C5A55A] text-[10px] shrink-0" title="Contact"
													>&#9670;</span
												>
												<span class="text-[rgba(255,255,255,0.9)]">{call.caller_name}</span>
											{:else if call.caller_name}
												<span class="text-[rgba(255,255,255,0.7)]">{call.caller_name}</span>
												<span
													class="text-[9px] uppercase tracking-wider px-1 py-px rounded bg-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.3)] leading-none shrink-0"
													>CID</span
												>
											{:else}
												<span class="text-[rgba(255,255,255,0.85)]">{formatPhone(callPhone)}</span>
											{/if}
										</p>
										<!-- Quick actions — right next to name, visible on hover -->
										{#if callPhone}
											<div
												class="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
											>
												<a
													href="/softphone?call={encodeURIComponent(callPhone)}"
													class="inline-flex items-center justify-center h-7 w-7 rounded-md border border-emerald-500/30 text-emerald-400/50 hover:bg-emerald-500/15 hover:text-emerald-400 hover:border-emerald-400 transition-all"
													title="Call back"
												>
													<PhoneOutgoing class="h-3.5 w-3.5" />
												</a>
												<a
													href="/messages?phone={encodeURIComponent(callPhone)}{call.caller_name
														? '&name=' + encodeURIComponent(call.caller_name)
														: ''}&new=true"
													class="inline-flex items-center justify-center h-7 w-7 rounded-md border border-blue-500/30 text-blue-400/50 hover:bg-blue-500/15 hover:text-blue-400 hover:border-blue-400 transition-all"
													title="Send message"
												>
													<MessageSquare class="h-3.5 w-3.5" />
												</a>
											</div>
										{/if}
									</div>
									<div class="flex items-center gap-2 shrink-0">
										{#if call.twilio_number && twilioNumbers.length > 1 && !selectedNumber}
											<span class="text-[9px] text-[rgba(197,165,90,0.5)] font-mono">
												{formatPhone(call.twilio_number)}
											</span>
										{/if}
										<span class="text-xs text-[rgba(255,255,255,0.3)] whitespace-nowrap">
											{formatRelativeDate(call.started_at)}
										</span>
									</div>
								</div>

								<!-- Second line: phone number (if name shown) -->
								{#if call.caller_name}
									<p class="text-xs text-[rgba(255,255,255,0.3)] mt-0.5">
										{formatPhone(call.direction === 'inbound' ? call.from_number : call.to_number)}
									</p>
								{/if}

								<!-- Action summary line -->
								<div class="flex items-center gap-2 mt-1">
									{#if summary.type === 'voicemail' || summary.type === 'voicemail-pending'}
										<Voicemail class="h-3.5 w-3.5 shrink-0 text-[#C5A55A]/70" />
										<span class="text-xs text-[rgba(255,255,255,0.45)] truncate italic"
											>{summary.text}</span
										>
										{#if summary.hasAudio}
											<button
												class="shrink-0 flex items-center gap-1 text-[10px] uppercase tracking-wider text-[#C5A55A]/60 hover:text-[#C5A55A] transition-colors"
												onclick={(e) => {
													e.stopPropagation();
													togglePlay(summary.vmId);
												}}
											>
												{#if playingId === summary.vmId}
													<Pause class="h-3 w-3" />
													<span>Stop</span>
												{:else}
													<Play class="h-3 w-3" />
													<span>Play</span>
												{/if}
											</button>
										{/if}
									{:else if summary.type === 'answered'}
										<span class="text-xs text-emerald-400/60">{summary.text}</span>
									{:else if summary.type === 'missed'}
										<span class="text-xs text-red-400/70">{summary.text}</span>
									{:else if summary.type === 'abandoned'}
										<span class="text-xs text-[rgba(255,255,255,0.3)]">{summary.text}</span>
									{:else if summary.type === 'failed'}
										<span class="text-xs text-red-400/50">{summary.text}</span>
									{:else}
										<span class="text-xs text-[rgba(255,255,255,0.3)]">{summary.text}</span>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>

				<!-- Pagination -->
				{#if totalCount > pageSize}
					<div class="flex items-center justify-between pt-4">
						<p class="text-sm text-muted-foreground">
							Showing {(currentPage - 1) * pageSize + 1}–{Math.min(
								currentPage * pageSize,
								totalCount
							)} of {totalCount}
						</p>
						<div class="flex gap-1">
							<Button variant="outline" size="sm" onclick={prevPage} disabled={currentPage <= 1}>
								<ChevronLeft class="h-4 w-4" />
							</Button>
							<span class="flex items-center px-2 text-sm text-muted-foreground"
								>{currentPage} / {totalPages}</span
							>
							<Button
								variant="outline"
								size="sm"
								onclick={nextPage}
								disabled={currentPage >= totalPages}
							>
								<ChevronRight class="h-4 w-4" />
							</Button>
						</div>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>
