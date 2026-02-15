<script>
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import {
		Zap,
		Play,
		Pause,
		Plus,
		Pencil,
		Trash2,
		Clock,
		Mail,
		MessageSquare,
		Send,
		X,
		ChevronDown,
		ChevronRight,
		FileText,
		Link2
	} from '@lucide/svelte';
	import { api } from '$lib/api/client.js';
	import { isAdmin } from '$lib/stores/auth.js';

	// Tab state
	let activeTab = $state('sequences');

	// Sequences
	/** @type {any[]} */
	let sequences = $state([]);
	let seqLoading = $state(true);
	let seqError = $state('');

	// Log
	/** @type {any[]} */
	let logEntries = $state([]);
	let logLoading = $state(true);
	let logCount = $state(0);
	let logPage = $state(1);

	// Stats
	/** @type {any} */
	let stats = $state(null);

	// Form
	let showForm = $state(false);
	/** @type {any} */
	let editingSeq = $state(null);
	let formName = $state('');
	let formTrigger = $state('booking_confirmed');
	let formTiming = $state('0 seconds');
	let formChannel = $state('both');
	let formTemplate = $state('confirmation');
	let formServiceId = $state('');
	let formContentRef = $state('');
	let formSubject = $state('');
	let formBody = $state('');
	let formActive = $state(true);
	let formSaving = $state(false);

	// Services (for dropdown)
	/** @type {any[]} */
	let services = $state([]);

	// Content blocks for selected service (for content_ref dropdown)
	/** @type {any[]} */
	let serviceContentBlocks = $state([]);

	// Toast
	let toast = $state('');
	let toastType = $state('success');

	// Expanded group
	let expandedTrigger = $state('');

	// Test Send modal
	let showTestSend = $state(false);
	let testSeqId = $state('');
	let testClientSearch = $state('');
	/** @type {any[]} */
	let testClientResults = $state([]);
	/** @type {any} */
	let testClient = $state(null);
	let testSending = $state(false);
	/** @type {any} */
	let testResult = $state(null);
	let testSearching = $state(false);

	const triggerEvents = [
		{ value: 'booking_confirmed', label: 'Booking Confirmed', icon: '📅' },
		{ value: 'pre_appointment', label: 'Pre-Appointment', icon: '⏰' },
		{ value: 'post_treatment', label: 'Post-Treatment', icon: '✅' },
		{ value: 'lead_nurture', label: 'Lead Nurture', icon: '🌱' },
		{ value: 'no_show', label: 'No-Show', icon: '❌' },
		{ value: 'rebooking', label: 'Rebooking', icon: '🔄' },
		{ value: 'consent_reminder', label: 'Consent Reminder', icon: '📋' },
		{ value: 'check_in', label: 'Check-In', icon: '👋' }
	];

	const templateTypes = [
		{ value: 'confirmation', label: 'Confirmation' },
		{ value: 'pre_instructions', label: 'Pre-Instructions' },
		{ value: 'reminder', label: 'Reminder' },
		{ value: 'post_care', label: 'Post-Care' },
		{ value: 'check_in', label: 'Check-In' },
		{ value: 'rebooking', label: 'Rebooking' },
		{ value: 'consent_request', label: 'Consent Request' },
		{ value: 'custom', label: 'Custom' }
	];

	const channelIcons = {
		sms: MessageSquare,
		email: Mail,
		both: Send
	};

	$effect(() => {
		loadSequences();
		loadStats();
		loadServices();
	});

	$effect(() => {
		if (activeTab === 'log') {
			loadLog();
		}
	});

	// Load content blocks when service changes in form
	$effect(() => {
		if (formServiceId) {
			loadServiceContent(formServiceId);
		} else {
			serviceContentBlocks = [];
			formContentRef = '';
		}
	});

	async function loadSequences() {
		seqLoading = true;
		try {
			const res = await api('/api/automation/sequences');
			sequences = res.data || [];
		} catch (e) {
			seqError = e.message;
		} finally {
			seqLoading = false;
		}
	}

	async function loadLog() {
		logLoading = true;
		try {
			const res = await api(`/api/automation/log?page=${logPage}&pageSize=25`);
			logEntries = res.data || [];
			logCount = res.count || 0;
		} catch {
			logEntries = [];
		} finally {
			logLoading = false;
		}
	}

	async function loadStats() {
		try {
			const res = await api('/api/automation/stats?days=30');
			stats = res;
		} catch {
			stats = null;
		}
	}

	async function loadServices() {
		try {
			const res = await api('/api/services');
			services = res.data || [];
		} catch {
			services = [];
		}
	}

	async function loadServiceContent(serviceId) {
		try {
			const res = await api(`/api/services/${serviceId}/content`);
			serviceContentBlocks = res.data || [];
		} catch {
			serviceContentBlocks = [];
		}
	}

	function contentTypeLabel(type) {
		const labels = {
			pre_instructions: 'Pre-Treatment',
			post_instructions: 'Post-Treatment',
			faq: 'FAQ',
			consent_form: 'Consent',
			promo: 'Promotion'
		};
		return labels[type] || type;
	}

	function showToast(msg, type = 'success') {
		toast = msg;
		toastType = type;
		setTimeout(() => {
			toast = '';
		}, 3000);
	}

	function triggerLabel(val) {
		return triggerEvents.find((t) => t.value === val)?.label || val;
	}

	function triggerIcon(val) {
		return triggerEvents.find((t) => t.value === val)?.icon || '⚡';
	}

	function channelBadgeColor(ch) {
		switch (ch) {
			case 'sms':
				return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
			case 'email':
				return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
			case 'both':
				return 'bg-[rgba(197,165,90,0.1)] text-[#c5a55a] border-[rgba(197,165,90,0.2)]';
			default:
				return 'bg-white/5 text-white/50 border-white/10';
		}
	}

	function statusColor(status) {
		switch (status) {
			case 'sent':
			case 'delivered':
				return 'default';
			case 'opened':
			case 'clicked':
				return 'secondary';
			case 'scheduled':
				return 'outline';
			case 'failed':
				return 'destructive';
			default:
				return 'outline';
		}
	}

	function formatTiming(offset) {
		if (!offset) return '—';
		// PostgreSQL interval string like "-3 days" or "+1 day" or "0 seconds"
		const str = offset.toString();
		if (str.includes('00:00:00') || str === '0') return 'Immediately';
		return str.replace(/^-/, '').replace(/^\+/, '+');
	}

	function formatTimingDirection(offset) {
		if (!offset) return '';
		const str = offset.toString();
		if (str.includes('00:00:00') || str === '0') return '';
		return str.startsWith('-') ? 'before' : 'after';
	}

	// Group sequences by trigger event
	let groupedSequences = $derived(
		triggerEvents
			.map((trigger) => ({
				...trigger,
				sequences: sequences.filter((s) => s.trigger_event === trigger.value)
			}))
			.filter((g) => g.sequences.length > 0)
	);

	function openCreateForm() {
		editingSeq = null;
		formName = '';
		formTrigger = 'booking_confirmed';
		formTiming = '0 seconds';
		formChannel = 'both';
		formTemplate = 'confirmation';
		formServiceId = '';
		formContentRef = '';
		formSubject = '';
		formBody = '';
		formActive = true;
		serviceContentBlocks = [];
		showForm = true;
	}

	function openEditForm(seq) {
		editingSeq = seq;
		formName = seq.name;
		formTrigger = seq.trigger_event;
		formTiming = seq.timing_offset || '0 seconds';
		formChannel = seq.channel;
		formTemplate = seq.template_type;
		formServiceId = seq.service_id || '';
		formContentRef = seq.content_ref || '';
		formSubject = seq.subject_line || '';
		formBody = seq.message_body || '';
		formActive = seq.is_active;
		showForm = true;
		// Content blocks will load via the $effect when formServiceId changes
	}

	async function saveSequence() {
		if (!formName || !formTrigger || !formTiming || !formTemplate) {
			showToast('Name, trigger, timing, and template type are required', 'error');
			return;
		}
		formSaving = true;
		try {
			const body = {
				name: formName,
				trigger_event: formTrigger,
				timing_offset: formTiming,
				channel: formChannel,
				template_type: formTemplate,
				service_id: formServiceId || null,
				content_ref: formContentRef || null,
				subject_line: formSubject || null,
				message_body: formBody || null,
				is_active: formActive
			};

			if (editingSeq) {
				await api(`/api/automation/sequences/${editingSeq.id}`, {
					method: 'PUT',
					body: JSON.stringify(body)
				});
				showToast('Sequence updated');
			} else {
				await api('/api/automation/sequences', {
					method: 'POST',
					body: JSON.stringify(body)
				});
				showToast('Sequence created');
			}
			showForm = false;
			await loadSequences();
		} catch (e) {
			showToast(e.message, 'error');
		} finally {
			formSaving = false;
		}
	}

	async function toggleActive(seq) {
		try {
			await api(`/api/automation/sequences/${seq.id}`, {
				method: 'PUT',
				body: JSON.stringify({ is_active: !seq.is_active })
			});
			await loadSequences();
		} catch (e) {
			showToast(e.message, 'error');
		}
	}

	async function deleteSequence(seq) {
		if (!confirm(`Delete "${seq.name}"?`)) return;
		try {
			await api(`/api/automation/sequences/${seq.id}`, { method: 'DELETE' });
			showToast('Sequence deleted');
			await loadSequences();
		} catch (e) {
			showToast(e.message, 'error');
		}
	}

	function formatDate(d) {
		if (!d) return '—';
		return new Date(d).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	// --- Test Send ---

	function openTestSend(seq) {
		testSeqId = seq?.id || '';
		testClientSearch = '';
		testClientResults = [];
		testClient = null;
		testSending = false;
		testResult = null;
		showTestSend = true;
	}

	let searchTimeout;
	function onTestClientSearch() {
		clearTimeout(searchTimeout);
		if (testClientSearch.length < 2) {
			testClientResults = [];
			return;
		}
		searchTimeout = setTimeout(async () => {
			testSearching = true;
			try {
				const res = await api(
					`/api/contacts/search?q=${encodeURIComponent(testClientSearch)}&limit=8`
				);
				testClientResults = res.data || [];
			} catch {
				testClientResults = [];
			} finally {
				testSearching = false;
			}
		}, 300);
	}

	function selectTestClient(c) {
		testClient = c;
		testClientSearch = c.full_name || c.phone || '';
		testClientResults = [];
	}

	async function executeTrigger() {
		if (!testSeqId || !testClient) {
			showToast('Select a sequence and a contact', 'error');
			return;
		}
		testSending = true;
		testResult = null;
		try {
			const res = await api('/api/automation/trigger', {
				method: 'POST',
				body: JSON.stringify({
					sequence_id: testSeqId,
					client_id: testClient.id
				})
			});
			testResult = res;
			showToast(res.message || 'Sent!');
			// Refresh log if on that tab
			if (activeTab === 'log') loadLog();
			loadStats();
		} catch (e) {
			testResult = { error: e.message };
			showToast(e.message, 'error');
		} finally {
			testSending = false;
		}
	}

	async function processQueue() {
		try {
			const res = await api('/api/automation/process', { method: 'POST' });
			showToast(res.message || `Processed ${res.processed} entries`);
			loadStats();
			if (activeTab === 'log') loadLog();
		} catch (e) {
			showToast(e.message, 'error');
		}
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl tracking-wide">Automation</h1>
			<p class="text-sm text-muted-foreground mt-1">
				Automated message sequences for patient journey.
			</p>
		</div>
		{#if $isAdmin}
			<div class="flex items-center gap-2">
				{#if activeTab === 'log'}
					<button
						onclick={processQueue}
						class="flex items-center gap-2 px-3 py-2 rounded text-sm border border-[rgba(197,165,90,0.2)] text-[rgba(255,255,255,0.5)] hover:text-[#c5a55a] hover:border-[rgba(197,165,90,0.4)] transition-colors"
						title="Process all scheduled entries"
					>
						<Play class="h-3.5 w-3.5" />
						Process Queue
					</button>
				{/if}
				<button
					onclick={() => openTestSend(null)}
					class="flex items-center gap-2 px-3 py-2 rounded text-sm border border-emerald-500/20 text-emerald-400/70 hover:text-emerald-400 hover:border-emerald-500/40 transition-colors"
				>
					<Send class="h-3.5 w-3.5" />
					Test Send
				</button>
				{#if activeTab === 'sequences'}
					<button
						onclick={openCreateForm}
						class="flex items-center gap-2 px-4 py-2 rounded text-sm bg-[#c5a55a] text-[#0a0a0c] hover:bg-[#d4af37] transition-colors font-medium"
					>
						<Plus class="h-4 w-4" />
						Add Sequence
					</button>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Toast -->
	{#if toast}
		<div
			class="fixed top-4 right-4 z-50 px-4 py-3 rounded border text-sm {toastType === 'error'
				? 'bg-red-500/10 border-red-500/30 text-red-400'
				: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}"
		>
			{toast}
		</div>
	{/if}

	<!-- Stats cards -->
	{#if stats}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<div class="rounded border border-[rgba(197,165,90,0.12)] bg-[rgba(197,165,90,0.03)] p-4">
				<span class="text-[10px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.35)]"
					>Total Sent (30d)</span
				>
				<div
					class="text-2xl font-light text-[rgba(255,255,255,0.9)] mt-1"
					style="font-family: 'Playfair Display', serif;"
				>
					{stats.total}
				</div>
			</div>
			<div class="rounded border border-[rgba(197,165,90,0.12)] bg-[rgba(197,165,90,0.03)] p-4">
				<span class="text-[10px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.35)]"
					>Delivery Rate</span
				>
				<div
					class="text-2xl font-light text-[rgba(255,255,255,0.9)] mt-1"
					style="font-family: 'Playfair Display', serif;"
				>
					{stats.deliveryRate}%
				</div>
			</div>
			<div class="rounded border border-[rgba(197,165,90,0.12)] bg-[rgba(197,165,90,0.03)] p-4">
				<span class="text-[10px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.35)]"
					>Open Rate</span
				>
				<div
					class="text-2xl font-light text-[rgba(255,255,255,0.9)] mt-1"
					style="font-family: 'Playfair Display', serif;"
				>
					{stats.openRate}%
				</div>
			</div>
			<div class="rounded border border-[rgba(197,165,90,0.12)] bg-[rgba(197,165,90,0.03)] p-4">
				<span class="text-[10px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.35)]"
					>Failed</span
				>
				<div
					class="text-2xl font-light {stats.failed > 0
						? 'text-red-400'
						: 'text-[rgba(255,255,255,0.9)]'} mt-1"
					style="font-family: 'Playfair Display', serif;"
				>
					{stats.failed}
				</div>
			</div>
		</div>
	{/if}

	<!-- Tabs -->
	<div class="flex gap-1 border-b border-[rgba(197,165,90,0.08)]">
		<button
			onclick={() => (activeTab = 'sequences')}
			class="px-4 py-2.5 text-sm transition-colors relative {activeTab === 'sequences'
				? 'text-[#c5a55a]'
				: 'text-[rgba(255,255,255,0.4)] hover:text-[rgba(255,255,255,0.6)]'}"
		>
			Sequences
			{#if activeTab === 'sequences'}
				<div class="absolute bottom-0 left-0 right-0 h-0.5 bg-[#c5a55a]"></div>
			{/if}
		</button>
		<button
			onclick={() => (activeTab = 'log')}
			class="px-4 py-2.5 text-sm transition-colors relative {activeTab === 'log'
				? 'text-[#c5a55a]'
				: 'text-[rgba(255,255,255,0.4)] hover:text-[rgba(255,255,255,0.6)]'}"
		>
			Execution Log
			{#if activeTab === 'log'}
				<div class="absolute bottom-0 left-0 right-0 h-0.5 bg-[#c5a55a]"></div>
			{/if}
		</button>
	</div>

	<!-- Sequence Form -->
	{#if showForm}
		<div
			class="rounded border border-[rgba(197,165,90,0.2)] bg-[rgba(197,165,90,0.03)] p-6 space-y-4"
		>
			<div class="flex items-center justify-between">
				<h2 class="text-base tracking-wide">{editingSeq ? 'Edit Sequence' : 'New Sequence'}</h2>
				<button
					onclick={() => (showForm = false)}
					class="text-[rgba(255,255,255,0.3)] hover:text-white transition-colors"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label class="text-xs uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-1 block"
						>Name *</label
					>
					<input
						type="text"
						bind:value={formName}
						placeholder="e.g. Day-Before Reminder"
						class="w-full px-3 py-2 rounded border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-sm focus:border-[#c5a55a] focus:outline-none transition-colors"
					/>
				</div>

				<div>
					<label class="text-xs uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-1 block"
						>Trigger Event *</label
					>
					<select
						bind:value={formTrigger}
						class="w-full px-3 py-2 rounded border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-sm focus:border-[#c5a55a] focus:outline-none transition-colors"
					>
						{#each triggerEvents as t}
							<option value={t.value}>{t.icon} {t.label}</option>
						{/each}
					</select>
				</div>

				<div>
					<label class="text-xs uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-1 block"
						>Timing Offset *</label
					>
					<input
						type="text"
						bind:value={formTiming}
						placeholder="-3 days, +1 day, 0 seconds"
						class="w-full px-3 py-2 rounded border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-sm font-mono focus:border-[#c5a55a] focus:outline-none transition-colors"
					/>
					<p class="text-[10px] text-[rgba(255,255,255,0.2)] mt-0.5">
						Negative = before event, positive = after. Use PostgreSQL interval syntax.
					</p>
				</div>

				<div>
					<label class="text-xs uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-1 block"
						>Channel</label
					>
					<select
						bind:value={formChannel}
						class="w-full px-3 py-2 rounded border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-sm focus:border-[#c5a55a] focus:outline-none transition-colors"
					>
						<option value="both">Both (SMS + Email)</option>
						<option value="sms">SMS only</option>
						<option value="email">Email only</option>
					</select>
				</div>

				<div>
					<label class="text-xs uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-1 block"
						>Template Type *</label
					>
					<select
						bind:value={formTemplate}
						class="w-full px-3 py-2 rounded border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-sm focus:border-[#c5a55a] focus:outline-none transition-colors"
					>
						{#each templateTypes as t}
							<option value={t.value}>{t.label}</option>
						{/each}
					</select>
				</div>

				<div>
					<label class="text-xs uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-1 block"
						>Service (optional)</label
					>
					<select
						bind:value={formServiceId}
						class="w-full px-3 py-2 rounded border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-sm focus:border-[#c5a55a] focus:outline-none transition-colors"
					>
						<option value="">All Services (Global)</option>
						{#each services as s}
							<option value={s.id}>{s.name}</option>
						{/each}
					</select>
				</div>
			</div>

			<!-- Content Block Link (only when service selected) -->
			{#if formServiceId}
				<div class="rounded border border-[rgba(197,165,90,0.1)] bg-[rgba(197,165,90,0.02)] p-4">
					<div class="flex items-center gap-2 mb-2">
						<Link2 class="h-3.5 w-3.5 text-[#c5a55a]" />
						<label class="text-xs uppercase tracking-[0.12em] text-[rgba(197,165,90,0.6)]"
							>Link Content Block</label
						>
					</div>
					{#if serviceContentBlocks.length > 0}
						<select
							bind:value={formContentRef}
							class="w-full px-3 py-2 rounded border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-sm focus:border-[#c5a55a] focus:outline-none transition-colors"
						>
							<option value="">No linked content (use custom body)</option>
							{#each serviceContentBlocks as block}
								<option value={block.id}
									>[{contentTypeLabel(block.content_type)}] {block.title}</option
								>
							{/each}
						</select>
						{#if formContentRef}
							{@const linked = serviceContentBlocks.find((b) => b.id === formContentRef)}
							{#if linked?.summary}
								<p class="text-[10px] text-[rgba(255,255,255,0.25)] mt-1.5 leading-relaxed">
									<span class="text-[rgba(197,165,90,0.4)]">SMS preview:</span>
									{linked.summary}
								</p>
							{/if}
						{/if}
					{:else}
						<p class="text-xs text-[rgba(255,255,255,0.25)]">
							No content blocks for this service. <a
								href="/services"
								class="text-[#c5a55a] hover:underline">Create content →</a
							>
						</p>
					{/if}
				</div>
			{/if}

			<div>
				<label class="text-xs uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-1 block"
					>Email Subject (optional)</label
				>
				<input
					type="text"
					bind:value={formSubject}
					placeholder="Auto-generated if blank"
					class="w-full px-3 py-2 rounded border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-sm focus:border-[#c5a55a] focus:outline-none transition-colors"
				/>
			</div>

			<div>
				<label class="text-xs uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-1 block"
					>Custom SMS Body (optional)</label
				>
				<textarea
					bind:value={formBody}
					rows="2"
					placeholder="Leave blank to use service content summary"
					class="w-full px-3 py-2 rounded border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-sm focus:border-[#c5a55a] focus:outline-none transition-colors resize-none"
				></textarea>
			</div>

			<div class="flex items-center gap-6">
				<label class="flex items-center gap-2 cursor-pointer">
					<input type="checkbox" bind:checked={formActive} class="accent-[#c5a55a]" />
					<span class="text-sm text-[rgba(255,255,255,0.6)]">Active</span>
				</label>
				<div class="flex-1"></div>
				<button
					onclick={() => (showForm = false)}
					class="px-4 py-2 text-sm text-[rgba(255,255,255,0.5)] hover:text-white transition-colors"
					>Cancel</button
				>
				<button
					onclick={saveSequence}
					disabled={formSaving}
					class="px-4 py-2 rounded text-sm bg-[#c5a55a] text-[#0a0a0c] hover:bg-[#d4af37] transition-colors font-medium disabled:opacity-50"
				>
					{formSaving ? 'Saving...' : editingSeq ? 'Update' : 'Create'}
				</button>
			</div>
		</div>
	{/if}

	<!-- SEQUENCES TAB -->
	{#if activeTab === 'sequences'}
		{#if seqLoading}
			<div class="space-y-3">
				{#each Array(5) as _}
					<Skeleton class="h-14 w-full" />
				{/each}
			</div>
		{:else if sequences.length === 0}
			<div class="flex flex-col items-center justify-center h-48 text-center">
				<Zap class="h-10 w-10 text-[rgba(197,165,90,0.2)] mb-3" />
				<p class="text-sm text-[rgba(255,255,255,0.35)]">No automation sequences yet.</p>
				<p class="text-xs text-[rgba(255,255,255,0.2)] mt-1">
					Run the Phase 1C schema migration to seed default sequences.
				</p>
			</div>
		{:else}
			<!-- Grouped by trigger event -->
			{#each groupedSequences as group}
				<div>
					<button
						onclick={() => (expandedTrigger = expandedTrigger === group.value ? '' : group.value)}
						class="flex items-center gap-2 mb-2 w-full text-left group"
					>
						{#if expandedTrigger === group.value}
							<ChevronDown class="h-3.5 w-3.5 text-[rgba(255,255,255,0.25)]" />
						{:else}
							<ChevronRight class="h-3.5 w-3.5 text-[rgba(255,255,255,0.25)]" />
						{/if}
						<span class="text-sm">{group.icon}</span>
						<span
							class="text-xs uppercase tracking-[0.12em] text-[rgba(255,255,255,0.5)] group-hover:text-[rgba(255,255,255,0.7)] transition-colors"
						>
							{group.label}
						</span>
						<span class="text-[10px] text-[rgba(255,255,255,0.2)]">{group.sequences.length}</span>
						<div class="flex-1 border-b border-[rgba(255,255,255,0.04)]"></div>
					</button>

					{#if expandedTrigger === group.value || expandedTrigger === ''}
						<div class="space-y-1 ml-5 mb-4">
							{#each group.sequences as seq}
								<div
									class="flex items-center gap-3 px-3 py-2.5 rounded border border-[rgba(197,165,90,0.06)] hover:border-[rgba(197,165,90,0.12)] transition-colors group/row"
								>
									<!-- Active toggle -->
									<button
										onclick={() => toggleActive(seq)}
										class="p-0.5"
										title={seq.is_active ? 'Disable' : 'Enable'}
									>
										{#if seq.is_active}
											<div class="w-2 h-2 rounded-full bg-emerald-400"></div>
										{:else}
											<div class="w-2 h-2 rounded-full bg-[rgba(255,255,255,0.15)]"></div>
										{/if}
									</button>

									<!-- Name + timing + content link -->
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2 flex-wrap">
											<span
												class="text-sm {seq.is_active
													? 'text-[rgba(255,255,255,0.85)]'
													: 'text-[rgba(255,255,255,0.35)]'}">{seq.name}</span
											>
											{#if seq.service?.name}
												<span
													class="text-[10px] px-1.5 py-0.5 rounded border border-[rgba(197,165,90,0.1)] text-[rgba(197,165,90,0.5)]"
													>{seq.service.name}</span
												>
											{/if}
											{#if seq.content}
												<span
													class="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/15 text-emerald-400/60 bg-emerald-500/5"
												>
													<FileText class="h-2.5 w-2.5" />
													{seq.content.title}
												</span>
											{/if}
										</div>
										<div class="flex items-center gap-2 mt-0.5">
											<Clock class="h-3 w-3 text-[rgba(255,255,255,0.15)]" />
											<span class="text-[10px] text-[rgba(255,255,255,0.3)] font-mono">
												{formatTiming(seq.timing_offset)}
												{formatTimingDirection(seq.timing_offset)}
											</span>
											{#if seq.content?.summary}
												<span
													class="text-[10px] text-[rgba(255,255,255,0.15)] hidden lg:inline truncate max-w-xs"
												>
													· SMS: {seq.content.summary.slice(0, 60)}...
												</span>
											{/if}
										</div>
									</div>

									<!-- Channel badge -->
									<span
										class="px-2 py-0.5 rounded text-[10px] border {channelBadgeColor(seq.channel)}"
									>
										{seq.channel === 'both' ? 'SMS + Email' : seq.channel.toUpperCase()}
									</span>

									<!-- Template type -->
									<span class="text-[10px] text-[rgba(255,255,255,0.25)] w-24 text-right"
										>{seq.template_type}</span
									>

									<!-- Actions -->
									{#if $isAdmin}
										<div
											class="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity"
										>
											<button
												onclick={() => openTestSend(seq)}
												class="p-1 rounded text-[rgba(255,255,255,0.2)] hover:text-emerald-400 transition-colors"
												title="Test send"
											>
												<Send class="h-3.5 w-3.5" />
											</button>
											<button
												onclick={() => openEditForm(seq)}
												class="p-1 rounded text-[rgba(255,255,255,0.2)] hover:text-[#c5a55a] transition-colors"
												title="Edit"
											>
												<Pencil class="h-3.5 w-3.5" />
											</button>
											<button
												onclick={() => deleteSequence(seq)}
												class="p-1 rounded text-[rgba(255,255,255,0.2)] hover:text-red-400 transition-colors"
												title="Delete"
											>
												<Trash2 class="h-3.5 w-3.5" />
											</button>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}

			<!-- Summary -->
			<div class="flex items-center gap-4 pt-3 border-t border-[rgba(197,165,90,0.06)]">
				<span class="text-xs text-[rgba(255,255,255,0.25)]"
					>{sequences.length} sequence{sequences.length !== 1 ? 's' : ''}</span
				>
				<span class="text-xs text-emerald-400/50"
					>{sequences.filter((s) => s.is_active).length} active</span
				>
				<span class="text-xs text-[rgba(255,255,255,0.15)]"
					>{sequences.filter((s) => !s.is_active).length} paused</span
				>
			</div>
		{/if}
	{/if}

	<!-- LOG TAB -->
	{#if activeTab === 'log'}
		{#if logLoading}
			<div class="space-y-2">
				{#each Array(8) as _}
					<Skeleton class="h-10 w-full" />
				{/each}
			</div>
		{:else if logEntries.length === 0}
			<div class="flex flex-col items-center justify-center h-48 text-center">
				<Clock class="h-10 w-10 text-[rgba(197,165,90,0.2)] mb-3" />
				<p class="text-sm text-[rgba(255,255,255,0.35)]">No automation messages sent yet.</p>
				<p class="text-xs text-[rgba(255,255,255,0.2)] mt-1">
					Messages will appear here once automation sequences fire.
				</p>
			</div>
		{:else}
			<!-- Log table -->
			<div class="rounded border border-[rgba(197,165,90,0.08)] overflow-hidden">
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr
								class="border-b border-[rgba(197,165,90,0.08)] text-[10px] uppercase tracking-[0.12em] text-[rgba(255,255,255,0.3)]"
							>
								<th class="text-left px-4 py-2.5 font-normal">Client</th>
								<th class="text-left px-4 py-2.5 font-normal">Sequence</th>
								<th class="text-left px-4 py-2.5 font-normal">Channel</th>
								<th class="text-left px-4 py-2.5 font-normal">Status</th>
								<th class="text-left px-4 py-2.5 font-normal">Sent</th>
							</tr>
						</thead>
						<tbody>
							{#each logEntries as entry}
								<tr
									class="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(197,165,90,0.02)] transition-colors"
								>
									<td class="px-4 py-2.5">
										<span class="text-[rgba(255,255,255,0.7)]"
											>{entry.client?.full_name || '—'}</span
										>
										{#if entry.client?.phone}
											<span class="text-[10px] text-[rgba(255,255,255,0.2)] ml-1"
												>{entry.client.phone}</span
											>
										{/if}
									</td>
									<td class="px-4 py-2.5 text-[rgba(255,255,255,0.5)]">
										{entry.sequence?.name || '—'}
									</td>
									<td class="px-4 py-2.5">
										<span
											class="px-1.5 py-0.5 rounded text-[10px] border {channelBadgeColor(
												entry.channel
											)}"
										>
											{entry.channel.toUpperCase()}
										</span>
									</td>
									<td class="px-4 py-2.5">
										<Badge variant={statusColor(entry.status)}>{entry.status}</Badge>
									</td>
									<td class="px-4 py-2.5 text-xs text-[rgba(255,255,255,0.3)]">
										{formatDate(entry.sent_at || entry.scheduled_at)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>

			<!-- Pagination -->
			{#if logCount > 25}
				<div class="flex items-center justify-between pt-2">
					<span class="text-xs text-[rgba(255,255,255,0.25)]">{logCount} total entries</span>
					<div class="flex gap-2">
						<button
							onclick={() => {
								logPage = Math.max(1, logPage - 1);
								loadLog();
							}}
							disabled={logPage === 1}
							class="px-3 py-1 rounded text-xs border border-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.4)] hover:text-white disabled:opacity-30 transition-colors"
						>
							Prev
						</button>
						<span class="px-3 py-1 text-xs text-[rgba(255,255,255,0.3)]">
							Page {logPage} of {Math.ceil(logCount / 25)}
						</span>
						<button
							onclick={() => {
								logPage++;
								loadLog();
							}}
							disabled={logPage >= Math.ceil(logCount / 25)}
							class="px-3 py-1 rounded text-xs border border-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.4)] hover:text-white disabled:opacity-30 transition-colors"
						>
							Next
						</button>
					</div>
				</div>
			{/if}
		{/if}
	{/if}

	<!-- TEST SEND MODAL -->
	{#if showTestSend}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
			onclick={(e) => {
				if (e.target === e.currentTarget) showTestSend = false;
			}}
		>
			<div
				class="w-full max-w-md rounded-lg border border-[rgba(197,165,90,0.2)] bg-[#111113] p-6 shadow-2xl space-y-4"
			>
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<Send class="h-4 w-4 text-emerald-400" />
						<h2 class="text-base tracking-wide text-white">Test Send</h2>
					</div>
					<button
						onclick={() => (showTestSend = false)}
						class="text-[rgba(255,255,255,0.3)] hover:text-white transition-colors"
					>
						<X class="h-4 w-4" />
					</button>
				</div>

				<p class="text-xs text-[rgba(255,255,255,0.3)]">
					Send a real SMS/email to a contact using an automation sequence. This will actually
					deliver the message.
				</p>

				<!-- Sequence select -->
				<div>
					<label class="text-xs uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-1 block"
						>Sequence</label
					>
					<select
						bind:value={testSeqId}
						class="w-full px-3 py-2 rounded border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-sm focus:border-[#c5a55a] focus:outline-none transition-colors"
					>
						<option value="">Select a sequence...</option>
						{#each sequences as seq}
							<option value={seq.id}>{seq.name} ({seq.channel})</option>
						{/each}
					</select>
				</div>

				<!-- Contact search -->
				<div>
					<label class="text-xs uppercase tracking-[0.12em] text-[rgba(255,255,255,0.4)] mb-1 block"
						>Recipient</label
					>
					<input
						type="text"
						bind:value={testClientSearch}
						oninput={onTestClientSearch}
						placeholder="Search contacts by name or phone..."
						class="w-full px-3 py-2 rounded border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-sm focus:border-[#c5a55a] focus:outline-none transition-colors"
					/>

					{#if testSearching}
						<p class="text-[10px] text-[rgba(255,255,255,0.2)] mt-1">Searching...</p>
					{/if}

					{#if testClientResults.length > 0}
						<div
							class="mt-1 rounded border border-[rgba(255,255,255,0.1)] bg-[#0a0a0c] max-h-40 overflow-y-auto"
						>
							{#each testClientResults as c}
								<button
									onclick={() => selectTestClient(c)}
									class="w-full text-left px-3 py-2 text-sm hover:bg-[rgba(197,165,90,0.05)] transition-colors flex items-center justify-between"
								>
									<span class="text-[rgba(255,255,255,0.7)]">{c.full_name || 'Unknown'}</span>
									<span class="text-[10px] text-[rgba(255,255,255,0.25)]"
										>{c.phone || c.email || ''}</span
									>
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Selected contact info -->
				{#if testClient}
					<div class="rounded border border-emerald-500/15 bg-emerald-500/5 p-3 space-y-1">
						<div class="flex items-center gap-2">
							<span class="text-sm text-emerald-400">{testClient.full_name || 'Unknown'}</span>
						</div>
						{#if testClient.phone}
							<div class="flex items-center gap-2 text-[10px]">
								<MessageSquare class="h-3 w-3 text-[rgba(255,255,255,0.2)]" />
								<span class="text-[rgba(255,255,255,0.4)]">{testClient.phone}</span>
							</div>
						{/if}
						{#if testClient.email}
							<div class="flex items-center gap-2 text-[10px]">
								<Mail class="h-3 w-3 text-[rgba(255,255,255,0.2)]" />
								<span class="text-[rgba(255,255,255,0.4)]">{testClient.email}</span>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Result -->
				{#if testResult}
					<div
						class="rounded border p-3 text-sm {testResult.error
							? 'border-red-500/20 bg-red-500/5 text-red-400'
							: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'}"
					>
						{#if testResult.error}
							<span>Error: {testResult.error}</span>
						{:else}
							<span>{testResult.message}</span>
							{#if testResult.sms?.twilioSid}
								<p class="text-[10px] text-[rgba(255,255,255,0.25)] mt-1">
									SMS SID: {testResult.sms.twilioSid}
								</p>
							{/if}
							{#if testResult.email?.resendId}
								<p class="text-[10px] text-[rgba(255,255,255,0.25)] mt-1">
									Email ID: {testResult.email.resendId}
								</p>
							{/if}
						{/if}
					</div>
				{/if}

				<!-- Actions -->
				<div class="flex items-center justify-end gap-2 pt-2">
					<button
						onclick={() => (showTestSend = false)}
						class="px-4 py-2 text-sm text-[rgba(255,255,255,0.5)] hover:text-white transition-colors"
					>
						{testResult ? 'Close' : 'Cancel'}
					</button>
					{#if !testResult}
						<button
							onclick={executeTrigger}
							disabled={!testSeqId || !testClient || testSending}
							class="flex items-center gap-2 px-4 py-2 rounded text-sm bg-emerald-600 text-white hover:bg-emerald-500 transition-colors font-medium disabled:opacity-30"
						>
							{#if testSending}
								Sending...
							{:else}
								<Send class="h-3.5 w-3.5" />
								Send Now
							{/if}
						</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>
