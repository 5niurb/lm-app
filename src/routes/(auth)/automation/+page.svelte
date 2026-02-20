<script>
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import {
		Zap,
		Play,
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
		Link2,
		Eye,
		ShieldX,
		ClipboardCheck
	} from '@lucide/svelte';
	import { api } from '$lib/api/client.js';
	import { isAdmin } from '$lib/stores/auth.js';
	import { resolve } from '$app/paths';

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

	// Consents
	/** @type {any[]} */
	let consents = $state([]);
	let consentsLoading = $state(true);
	let consentsCount = $state(0);
	let consentsPage = $state(1);
	let consentStatusFilter = $state('');
	let consentServiceFilter = $state('');
	/** @type {any} */
	let selectedConsent = $state(null);
	let consentDetailLoading = $state(false);

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

	const _channelIcons = {
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
		if (activeTab === 'consents') {
			loadConsents();
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

	function channelBadgeColor(ch) {
		switch (ch) {
			case 'sms':
				return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
			case 'email':
				return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
			case 'both':
				return 'bg-gold/10 text-gold border-border';
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

	function consentStatusBadge(status) {
		switch (status) {
			case 'completed':
				return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
			case 'voided':
				return 'bg-red-500/10 text-red-400 border-red-500/20';
			case 'expired':
				return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
			case 'pending':
				return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
			default:
				return 'bg-white/5 text-white/50 border-white/10';
		}
	}

	// --- Consents ---

	async function loadConsents() {
		consentsLoading = true;
		try {
			let url = `/api/automation/consents?page=${consentsPage}&pageSize=25`;
			if (consentStatusFilter) url += `&status=${consentStatusFilter}`;
			if (consentServiceFilter) url += `&service_id=${consentServiceFilter}`;
			const res = await api(url);
			consents = res.data || [];
			consentsCount = res.count || 0;
		} catch {
			consents = [];
		} finally {
			consentsLoading = false;
		}
	}

	async function openConsentDetail(consent) {
		selectedConsent = consent;
		consentDetailLoading = true;
		try {
			const res = await api(`/api/automation/consents/${consent.id}`);
			selectedConsent = res.data;
		} catch {
			// Keep the list-level data
		} finally {
			consentDetailLoading = false;
		}
	}

	async function voidConsent(consent) {
		if (
			!confirm(
				`Void this consent from ${consent.client?.full_name || 'Unknown'}?\n\nThis action marks it as invalid and cannot be easily undone.`
			)
		)
			return;
		try {
			const res = await api(`/api/automation/consents/${consent.id}`, {
				method: 'PATCH',
				body: JSON.stringify({ status: 'voided' })
			});
			selectedConsent = res.data;
			showToast('Consent voided');
			await loadConsents();
		} catch (e) {
			showToast(e.message, 'error');
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
						class="flex items-center gap-2 px-3 py-2 rounded text-sm border border-border text-text-secondary hover:text-gold hover:border-border transition-colors"
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
						class="flex items-center gap-2 px-4 py-2 rounded text-sm bg-gold text-primary-foreground hover:bg-gold/80 transition-colors font-medium"
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
			<div class="rounded border border-border bg-gold-glow p-4">
				<span class="text-[10px] uppercase tracking-[0.12em] text-text-tertiary"
					>Total Sent (30d)</span
				>
				<div
					class="text-2xl font-light text-text-primary mt-1"
					style="font-family: 'Playfair Display', serif;"
				>
					{stats.total}
				</div>
			</div>
			<div class="rounded border border-border bg-gold-glow p-4">
				<span class="text-[10px] uppercase tracking-[0.12em] text-text-tertiary">Delivery Rate</span
				>
				<div
					class="text-2xl font-light text-text-primary mt-1"
					style="font-family: 'Playfair Display', serif;"
				>
					{stats.deliveryRate}%
				</div>
			</div>
			<div class="rounded border border-border bg-gold-glow p-4">
				<span class="text-[10px] uppercase tracking-[0.12em] text-text-tertiary">Open Rate</span>
				<div
					class="text-2xl font-light text-text-primary mt-1"
					style="font-family: 'Playfair Display', serif;"
				>
					{stats.openRate}%
				</div>
			</div>
			<div class="rounded border border-border bg-gold-glow p-4">
				<span class="text-[10px] uppercase tracking-[0.12em] text-text-tertiary">Failed</span>
				<div
					class="text-2xl font-light {stats.failed > 0 ? 'text-red-400' : 'text-text-primary'} mt-1"
					style="font-family: 'Playfair Display', serif;"
				>
					{stats.failed}
				</div>
			</div>
		</div>
	{/if}

	<!-- Tabs + Content Card -->
	<div class="rounded border border-border overflow-hidden bg-card">
	<div class="flex gap-1 border-b border-border-subtle">
		<button
			onclick={() => (activeTab = 'sequences')}
			class="px-4 py-2.5 text-sm transition-colors relative {activeTab === 'sequences'
				? 'text-gold'
				: 'text-text-tertiary hover:text-text-secondary'}"
		>
			Sequences
			{#if activeTab === 'sequences'}
				<div class="absolute bottom-0 left-0 right-0 h-0.5 bg-gold"></div>
			{/if}
		</button>
		<button
			onclick={() => (activeTab = 'log')}
			class="px-4 py-2.5 text-sm transition-colors relative {activeTab === 'log'
				? 'text-gold'
				: 'text-text-tertiary hover:text-text-secondary'}"
		>
			Execution Log
			{#if activeTab === 'log'}
				<div class="absolute bottom-0 left-0 right-0 h-0.5 bg-gold"></div>
			{/if}
		</button>
		<button
			onclick={() => (activeTab = 'consents')}
			class="px-4 py-2.5 text-sm transition-colors relative {activeTab === 'consents'
				? 'text-gold'
				: 'text-text-tertiary hover:text-text-secondary'}"
		>
			Consents
			{#if activeTab === 'consents'}
				<div class="absolute bottom-0 left-0 right-0 h-0.5 bg-gold"></div>
			{/if}
		</button>
	</div>

	<!-- Sequence Form -->
	{#if showForm}
		<div class="rounded border border-border bg-gold-glow p-6 space-y-4">
			<div class="flex items-center justify-between">
				<h2 class="text-base tracking-wide">{editingSeq ? 'Edit Sequence' : 'New Sequence'}</h2>
				<button
					onclick={() => (showForm = false)}
					class="text-text-tertiary hover:text-white transition-colors"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label class="text-xs uppercase tracking-[0.12em] text-text-tertiary mb-1 block"
						>Name *</label
					>
					<input
						type="text"
						bind:value={formName}
						placeholder="e.g. Day-Before Reminder"
						class="w-full px-3 py-2 rounded border border-border-default bg-surface-subtle text-sm focus:border-gold focus:outline-none transition-colors"
					/>
				</div>

				<div>
					<label class="text-xs uppercase tracking-[0.12em] text-text-tertiary mb-1 block"
						>Trigger Event *</label
					>
					<select
						bind:value={formTrigger}
						class="w-full px-3 py-2 rounded border border-border-default bg-surface-subtle text-sm focus:border-gold focus:outline-none transition-colors"
					>
						{#each triggerEvents as t (t.value)}
							<option value={t.value}>{t.icon} {t.label}</option>
						{/each}
					</select>
				</div>

				<div>
					<label class="text-xs uppercase tracking-[0.12em] text-text-tertiary mb-1 block"
						>Timing Offset *</label
					>
					<input
						type="text"
						bind:value={formTiming}
						placeholder="-3 days, +1 day, 0 seconds"
						class="w-full px-3 py-2 rounded border border-border-default bg-surface-subtle text-sm font-mono focus:border-gold focus:outline-none transition-colors"
					/>
					<p class="text-[10px] text-text-ghost mt-0.5">
						Negative = before event, positive = after. Use PostgreSQL interval syntax.
					</p>
				</div>

				<div>
					<label class="text-xs uppercase tracking-[0.12em] text-text-tertiary mb-1 block"
						>Channel</label
					>
					<select
						bind:value={formChannel}
						class="w-full px-3 py-2 rounded border border-border-default bg-surface-subtle text-sm focus:border-gold focus:outline-none transition-colors"
					>
						<option value="both">Both (SMS + Email)</option>
						<option value="sms">SMS only</option>
						<option value="email">Email only</option>
					</select>
				</div>

				<div>
					<label class="text-xs uppercase tracking-[0.12em] text-text-tertiary mb-1 block"
						>Template Type *</label
					>
					<select
						bind:value={formTemplate}
						class="w-full px-3 py-2 rounded border border-border-default bg-surface-subtle text-sm focus:border-gold focus:outline-none transition-colors"
					>
						{#each templateTypes as t (t.value)}
							<option value={t.value}>{t.label}</option>
						{/each}
					</select>
				</div>

				<div>
					<label class="text-xs uppercase tracking-[0.12em] text-text-tertiary mb-1 block"
						>Service (optional)</label
					>
					<select
						bind:value={formServiceId}
						class="w-full px-3 py-2 rounded border border-border-default bg-surface-subtle text-sm focus:border-gold focus:outline-none transition-colors"
					>
						<option value="">All Services (Global)</option>
						{#each services as s (s.id)}
							<option value={s.id}>{s.name}</option>
						{/each}
					</select>
				</div>
			</div>

			<!-- Content Block Link (only when service selected) -->
			{#if formServiceId}
				<div class="rounded border border-border-subtle bg-gold-glow p-4">
					<div class="flex items-center gap-2 mb-2">
						<Link2 class="h-3.5 w-3.5 text-gold" />
						<label class="text-xs uppercase tracking-[0.12em] text-gold-dim"
							>Link Content Block</label
						>
					</div>
					{#if serviceContentBlocks.length > 0}
						<select
							bind:value={formContentRef}
							class="w-full px-3 py-2 rounded border border-border-default bg-surface-subtle text-sm focus:border-gold focus:outline-none transition-colors"
						>
							<option value="">No linked content (use custom body)</option>
							{#each serviceContentBlocks as block (block.id)}
								<option value={block.id}
									>[{contentTypeLabel(block.content_type)}] {block.title}</option
								>
							{/each}
						</select>
						{#if formContentRef}
							{@const linked = serviceContentBlocks.find((b) => b.id === formContentRef)}
							{#if linked?.summary}
								<p class="text-[10px] text-text-ghost mt-1.5 leading-relaxed">
									<span class="text-gold-dim">SMS preview:</span>
									{linked.summary}
								</p>
							{/if}
						{/if}
					{:else}
						<p class="text-xs text-text-ghost">
							No content blocks for this service. <a
								href={resolve('/services')}
								class="text-gold hover:underline">Create content →</a
							>
						</p>
					{/if}
				</div>
			{/if}

			<div>
				<label class="text-xs uppercase tracking-[0.12em] text-text-tertiary mb-1 block"
					>Email Subject (optional)</label
				>
				<input
					type="text"
					bind:value={formSubject}
					placeholder="Auto-generated if blank"
					class="w-full px-3 py-2 rounded border border-border-default bg-surface-subtle text-sm focus:border-gold focus:outline-none transition-colors"
				/>
			</div>

			<div>
				<label class="text-xs uppercase tracking-[0.12em] text-text-tertiary mb-1 block"
					>Custom SMS Body (optional)</label
				>
				<textarea
					bind:value={formBody}
					rows="2"
					placeholder="Leave blank to use service content summary"
					class="w-full px-3 py-2 rounded border border-border-default bg-surface-subtle text-sm focus:border-gold focus:outline-none transition-colors resize-none"
				></textarea>
			</div>

			<div class="flex items-center gap-6">
				<label class="flex items-center gap-2 cursor-pointer">
					<input type="checkbox" bind:checked={formActive} class="accent-gold" />
					<span class="text-sm text-text-secondary">Active</span>
				</label>
				<div class="flex-1"></div>
				<button
					onclick={() => (showForm = false)}
					class="px-4 py-2 text-sm text-text-secondary hover:text-white transition-colors"
					>Cancel</button
				>
				<button
					onclick={saveSequence}
					disabled={formSaving}
					class="px-4 py-2 rounded text-sm bg-gold text-primary-foreground hover:bg-gold/80 transition-colors font-medium disabled:opacity-50"
				>
					{formSaving ? 'Saving...' : editingSeq ? 'Update' : 'Create'}
				</button>
			</div>
		</div>
	{/if}

	<div class="p-5">
	<!-- SEQUENCES TAB -->
	{#if activeTab === 'sequences'}
		{#if seqError}
			<div class="rounded border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
				Failed to load sequences: {seqError}
			</div>
		{:else if seqLoading}
			<div class="space-y-3">
				{#each Array(5) as _, i (i)}
					<Skeleton class="h-14 w-full" />
				{/each}
			</div>
		{:else if sequences.length === 0}
			<div class="flex flex-col items-center justify-center h-48 text-center">
				<Zap class="h-10 w-10 text-gold-dim mb-3" />
				<p class="text-sm text-text-tertiary">No automation sequences yet.</p>
				<p class="text-xs text-text-ghost mt-1">
					Run the Phase 1C schema migration to seed default sequences.
				</p>
			</div>
		{:else}
			<!-- Grouped by trigger event -->
			{#each groupedSequences as group (group.value)}
				<div>
					<button
						onclick={() => (expandedTrigger = expandedTrigger === group.value ? '' : group.value)}
						class="flex items-center gap-2 mb-2 w-full text-left group"
					>
						{#if expandedTrigger === group.value}
							<ChevronDown class="h-3.5 w-3.5 text-text-ghost" />
						{:else}
							<ChevronRight class="h-3.5 w-3.5 text-text-ghost" />
						{/if}
						<span class="text-sm">{group.icon}</span>
						<span
							class="text-xs uppercase tracking-[0.12em] text-text-secondary group-hover:text-text-secondary transition-colors"
						>
							{group.label}
						</span>
						<span class="text-[10px] text-text-ghost">{group.sequences.length}</span>
						<div class="flex-1 border-b border-border-subtle"></div>
					</button>

					{#if expandedTrigger === group.value || expandedTrigger === ''}
						<div class="space-y-1 ml-5 mb-4">
							{#each group.sequences as seq (seq.id)}
								<div
									class="flex items-center gap-3 px-3 py-2.5 rounded border border-border-subtle hover:border-border transition-colors group/row"
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
											<div class="w-2 h-2 rounded-full bg-surface-raised"></div>
										{/if}
									</button>

									<!-- Name + timing + content link -->
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2 flex-wrap">
											<span
												class="text-sm {seq.is_active ? 'text-text-primary' : 'text-text-tertiary'}"
												>{seq.name}</span
											>
											{#if seq.service?.name}
												<span
													class="text-[10px] px-1.5 py-0.5 rounded border border-border-subtle text-gold-dim"
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
											<Clock class="h-3 w-3 text-text-ghost" />
											<span class="text-[10px] text-text-tertiary font-mono">
												{formatTiming(seq.timing_offset)}
												{formatTimingDirection(seq.timing_offset)}
											</span>
											{#if seq.content?.summary}
												<span
													class="text-[10px] text-text-ghost hidden lg:inline truncate max-w-xs"
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
									<span class="text-[10px] text-text-ghost w-24 text-right"
										>{seq.template_type}</span
									>

									<!-- Actions -->
									{#if $isAdmin}
										<div
											class="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity"
										>
											<button
												onclick={() => openTestSend(seq)}
												class="p-1 rounded text-text-ghost hover:text-emerald-400 transition-colors"
												title="Test send"
											>
												<Send class="h-3.5 w-3.5" />
											</button>
											<button
												onclick={() => openEditForm(seq)}
												class="p-1 rounded text-text-ghost hover:text-gold transition-colors"
												title="Edit"
											>
												<Pencil class="h-3.5 w-3.5" />
											</button>
											<button
												onclick={() => deleteSequence(seq)}
												class="p-1 rounded text-text-ghost hover:text-red-400 transition-colors"
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
			<div class="flex items-center gap-4 pt-3 border-t border-border-subtle">
				<span class="text-xs text-text-ghost"
					>{sequences.length} sequence{sequences.length !== 1 ? 's' : ''}</span
				>
				<span class="text-xs text-emerald-400/50"
					>{sequences.filter((s) => s.is_active).length} active</span
				>
				<span class="text-xs text-text-ghost"
					>{sequences.filter((s) => !s.is_active).length} paused</span
				>
			</div>
		{/if}
	{/if}

	<!-- LOG TAB -->
	{#if activeTab === 'log'}
		{#if logLoading}
			<div class="space-y-2">
				{#each Array(8) as _, i (i)}
					<Skeleton class="h-10 w-full" />
				{/each}
			</div>
		{:else if logEntries.length === 0}
			<div class="flex flex-col items-center justify-center h-48 text-center">
				<Clock class="h-10 w-10 text-gold-dim mb-3" />
				<p class="text-sm text-text-tertiary">No automation messages sent yet.</p>
				<p class="text-xs text-text-ghost mt-1">
					Messages will appear here once automation sequences fire.
				</p>
			</div>
		{:else}
			<!-- Log table -->
			<div class="rounded border border-border-subtle overflow-hidden bg-card">
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr
								class="border-b border-border-subtle text-[10px] uppercase tracking-[0.12em] text-text-tertiary"
							>
								<th class="text-left px-4 py-2.5 font-normal">Client</th>
								<th class="text-left px-4 py-2.5 font-normal">Sequence</th>
								<th class="text-left px-4 py-2.5 font-normal">Channel</th>
								<th class="text-left px-4 py-2.5 font-normal">Status</th>
								<th class="text-left px-4 py-2.5 font-normal">Sent</th>
							</tr>
						</thead>
						<tbody>
							{#each logEntries as entry (entry.id)}
								<tr class="border-b border-border-subtle hover:bg-gold-glow transition-colors">
									<td class="px-4 py-2.5">
										<span class="text-text-secondary">{entry.client?.full_name || '—'}</span>
										{#if entry.client?.phone}
											<span class="text-[10px] text-text-ghost ml-1">{entry.client.phone}</span>
										{/if}
									</td>
									<td class="px-4 py-2.5 text-text-secondary">
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
									<td class="px-4 py-2.5 text-xs text-text-tertiary">
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
					<span class="text-xs text-text-ghost">{logCount} total entries</span>
					<div class="flex gap-2">
						<button
							onclick={() => {
								logPage = Math.max(1, logPage - 1);
								loadLog();
							}}
							disabled={logPage === 1}
							class="px-3 py-1 rounded text-xs border border-border-default text-text-tertiary hover:text-white disabled:opacity-30 transition-colors"
						>
							Prev
						</button>
						<span class="px-3 py-1 text-xs text-text-tertiary">
							Page {logPage} of {Math.ceil(logCount / 25)}
						</span>
						<button
							onclick={() => {
								logPage++;
								loadLog();
							}}
							disabled={logPage >= Math.ceil(logCount / 25)}
							class="px-3 py-1 rounded text-xs border border-border-default text-text-tertiary hover:text-white disabled:opacity-30 transition-colors"
						>
							Next
						</button>
					</div>
				</div>
			{/if}
		{/if}
	{/if}

	<!-- CONSENTS TAB -->
	{#if activeTab === 'consents'}
		<!-- Filters -->
		<div class="flex items-center gap-3 mb-4">
			<select
				bind:value={consentStatusFilter}
				onchange={() => {
					consentsPage = 1;
					loadConsents();
				}}
				class="px-3 py-1.5 rounded border border-border-default bg-surface-subtle text-sm focus:border-gold focus:outline-none transition-colors"
			>
				<option value="">All Statuses</option>
				<option value="completed">Completed</option>
				<option value="voided">Voided</option>
				<option value="expired">Expired</option>
				<option value="pending">Pending</option>
			</select>
			<select
				bind:value={consentServiceFilter}
				onchange={() => {
					consentsPage = 1;
					loadConsents();
				}}
				class="px-3 py-1.5 rounded border border-border-default bg-surface-subtle text-sm focus:border-gold focus:outline-none transition-colors"
			>
				<option value="">All Services</option>
				{#each services as s (s.id)}
					<option value={s.id}>{s.name}</option>
				{/each}
			</select>
			<span class="text-xs text-text-ghost ml-auto"
				>{consentsCount} submission{consentsCount !== 1 ? 's' : ''}</span
			>
		</div>

		{#if consentsLoading}
			<div class="space-y-2">
				{#each Array(6) as _, i (i)}
					<Skeleton class="h-10 w-full" />
				{/each}
			</div>
		{:else if consents.length === 0}
			<div class="flex flex-col items-center justify-center h-48 text-center">
				<ClipboardCheck class="h-10 w-10 text-gold-dim mb-3" />
				<p class="text-sm text-text-tertiary">No consent submissions yet.</p>
				<p class="text-xs text-text-ghost mt-1">
					Submissions will appear here when patients sign consent forms.
				</p>
			</div>
		{:else}
			<div class="rounded border border-border-subtle overflow-hidden bg-card">
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr
								class="border-b border-border-subtle text-[10px] uppercase tracking-[0.12em] text-text-tertiary"
							>
								<th class="text-left px-4 py-2.5 font-normal">Patient</th>
								<th class="text-left px-4 py-2.5 font-normal">Form</th>
								<th class="text-left px-4 py-2.5 font-normal">Service</th>
								<th class="text-left px-4 py-2.5 font-normal">Status</th>
								<th class="text-left px-4 py-2.5 font-normal">Signed</th>
								<th class="text-right px-4 py-2.5 font-normal w-16"></th>
							</tr>
						</thead>
						<tbody>
							{#each consents as consent (consent.id)}
								<tr
									class="border-b border-border-subtle hover:bg-gold-glow transition-colors cursor-pointer"
									onclick={() => openConsentDetail(consent)}
								>
									<td class="px-4 py-2.5">
										<span class="text-text-secondary">{consent.client?.full_name || 'Walk-in'}</span
										>
									</td>
									<td class="px-4 py-2.5 text-text-secondary">
										{consent.form?.title || '—'}
									</td>
									<td class="px-4 py-2.5">
										{#if consent.service?.name}
											<span
												class="text-[10px] px-1.5 py-0.5 rounded border border-border-subtle text-gold-dim"
											>
												{consent.service.name}
											</span>
										{:else}
											<span class="text-text-ghost">—</span>
										{/if}
									</td>
									<td class="px-4 py-2.5">
										<span
											class="px-2 py-0.5 rounded text-[10px] border {consentStatusBadge(
												consent.status
											)}"
										>
											{consent.status}
										</span>
									</td>
									<td class="px-4 py-2.5 text-xs text-text-tertiary">
										{formatDate(consent.signed_at)}
									</td>
									<td class="px-4 py-2.5 text-right">
										<button
											onclick={(e) => {
												e.stopPropagation();
												openConsentDetail(consent);
											}}
											class="p-1 rounded text-text-ghost hover:text-gold transition-colors"
											title="View details"
										>
											<Eye class="h-3.5 w-3.5" />
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>

			<!-- Pagination -->
			{#if consentsCount > 25}
				<div class="flex items-center justify-between pt-2">
					<span class="text-xs text-text-ghost">{consentsCount} total submissions</span>
					<div class="flex gap-2">
						<button
							onclick={() => {
								consentsPage = Math.max(1, consentsPage - 1);
								loadConsents();
							}}
							disabled={consentsPage === 1}
							class="px-3 py-1 rounded text-xs border border-border-default text-text-tertiary hover:text-white disabled:opacity-30 transition-colors"
						>
							Prev
						</button>
						<span class="px-3 py-1 text-xs text-text-tertiary">
							Page {consentsPage} of {Math.ceil(consentsCount / 25)}
						</span>
						<button
							onclick={() => {
								consentsPage++;
								loadConsents();
							}}
							disabled={consentsPage >= Math.ceil(consentsCount / 25)}
							class="px-3 py-1 rounded text-xs border border-border-default text-text-tertiary hover:text-white disabled:opacity-30 transition-colors"
						>
							Next
						</button>
					</div>
				</div>
			{/if}
		{/if}
	{/if}

	<!-- CONSENT DETAIL DRAWER -->
	{#if selectedConsent}
		<div
			class="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
			onclick={(e) => {
				if (e.target === e.currentTarget) selectedConsent = null;
			}}
		>
			<div class="w-full max-w-lg bg-card border-l border-border shadow-2xl overflow-y-auto">
				<div class="p-6 space-y-5">
					<!-- Header -->
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<ClipboardCheck class="h-4 w-4 text-gold" />
							<h2 class="text-base tracking-wide text-white">Consent Submission</h2>
						</div>
						<button
							onclick={() => (selectedConsent = null)}
							class="text-text-tertiary hover:text-white transition-colors"
						>
							<X class="h-4 w-4" />
						</button>
					</div>

					<!-- Status + Void -->
					<div class="flex items-center gap-3">
						<span
							class="px-2.5 py-1 rounded text-xs font-medium border {consentStatusBadge(
								selectedConsent.status
							)}"
						>
							{selectedConsent.status}
						</span>
						{#if $isAdmin && selectedConsent.status === 'completed'}
							<button
								onclick={() => voidConsent(selectedConsent)}
								class="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border border-red-500/20 text-red-400/70 hover:text-red-400 hover:border-red-500/40 transition-colors"
							>
								<ShieldX class="h-3 w-3" />
								Void Consent
							</button>
						{/if}
					</div>

					<!-- Patient Info -->
					<div class="rounded border border-border-subtle bg-gold-glow p-4 space-y-2">
						<span class="text-[10px] uppercase tracking-[0.12em] text-text-tertiary">Patient</span>
						<div class="text-sm text-text-primary font-medium">
							{selectedConsent.client?.full_name || 'Walk-in Patient'}
						</div>
						{#if selectedConsent.client?.phone}
							<div class="flex items-center gap-2 text-xs text-text-secondary">
								<MessageSquare class="h-3 w-3 text-text-ghost" />
								{selectedConsent.client.phone}
							</div>
						{/if}
						{#if selectedConsent.client?.email}
							<div class="flex items-center gap-2 text-xs text-text-secondary">
								<Mail class="h-3 w-3 text-text-ghost" />
								{selectedConsent.client.email}
							</div>
						{/if}
					</div>

					<!-- Form + Service -->
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="rounded border border-border-subtle p-3">
							<span class="text-[10px] uppercase tracking-[0.12em] text-text-tertiary block mb-1"
								>Form</span
							>
							<span class="text-sm text-text-secondary">{selectedConsent.form?.title || '—'}</span>
						</div>
						<div class="rounded border border-border-subtle p-3">
							<span class="text-[10px] uppercase tracking-[0.12em] text-text-tertiary block mb-1"
								>Service</span
							>
							<span class="text-sm text-text-secondary">{selectedConsent.service?.name || '—'}</span
							>
						</div>
					</div>

					<!-- Questionnaire Responses -->
					{#if selectedConsent.responses && Object.keys(selectedConsent.responses).length > 0}
						<div class="rounded border border-border-subtle p-4 space-y-3">
							<span class="text-[10px] uppercase tracking-[0.12em] text-text-tertiary"
								>Questionnaire Responses</span
							>
							{#each Object.entries(selectedConsent.responses) as [question, answer] (question)}
								<div class="border-b border-border-subtle pb-2 last:border-0 last:pb-0">
									<p class="text-xs text-text-secondary font-medium">{question}</p>
									<p class="text-xs text-text-tertiary mt-0.5">
										{#if typeof answer === 'boolean'}
											<span class={answer ? 'text-emerald-400' : 'text-red-400'}
												>{answer ? '✓ Yes' : '✗ No'}</span
											>
										{:else}
											{answer}
										{/if}
									</p>
								</div>
							{/each}
						</div>
					{/if}

					<!-- Signature -->
					{#if selectedConsent.signature_data}
						<div class="rounded border border-border-subtle p-4 space-y-2">
							<span class="text-[10px] uppercase tracking-[0.12em] text-text-tertiary"
								>Signature</span
							>
							<div class="rounded bg-background border border-border-subtle p-2">
								<img
									src={selectedConsent.signature_data}
									alt="Patient signature"
									class="w-full h-auto max-h-32 object-contain rounded"
								/>
							</div>
						</div>
					{/if}

					<!-- Metadata -->
					<div class="rounded border border-border-subtle p-4 space-y-2 text-xs text-text-ghost">
						<span class="text-[10px] uppercase tracking-[0.12em] text-text-tertiary block"
							>Details</span
						>
						<div class="grid gap-1">
							<div class="flex justify-between">
								<span>Signed At</span>
								<span class="text-text-tertiary"
									>{selectedConsent.signed_at
										? new Date(selectedConsent.signed_at).toLocaleString()
										: '—'}</span
								>
							</div>
							{#if selectedConsent.ip_address}
								<div class="flex justify-between">
									<span>IP Address</span>
									<span class="text-text-tertiary font-mono">{selectedConsent.ip_address}</span>
								</div>
							{/if}
							{#if selectedConsent.user_agent}
								<div class="flex justify-between">
									<span>User Agent</span>
									<span
										class="text-text-tertiary truncate max-w-[250px]"
										title={selectedConsent.user_agent}>{selectedConsent.user_agent}</span
									>
								</div>
							{/if}
							<div class="flex justify-between">
								<span>Submission ID</span>
								<span class="text-text-tertiary font-mono text-[10px]">{selectedConsent.id}</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- TEST SEND MODAL -->
	{#if showTestSend}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
			onclick={(e) => {
				if (e.target === e.currentTarget) showTestSend = false;
			}}
		>
			<div class="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-2xl space-y-4">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<Send class="h-4 w-4 text-emerald-400" />
						<h2 class="text-base tracking-wide text-white">Test Send</h2>
					</div>
					<button
						onclick={() => (showTestSend = false)}
						class="text-text-tertiary hover:text-white transition-colors"
					>
						<X class="h-4 w-4" />
					</button>
				</div>

				<p class="text-xs text-text-tertiary">
					Send a real SMS/email to a contact using an automation sequence. This will actually
					deliver the message.
				</p>

				<!-- Sequence select -->
				<div>
					<label class="text-xs uppercase tracking-[0.12em] text-text-tertiary mb-1 block"
						>Sequence</label
					>
					<select
						bind:value={testSeqId}
						class="w-full px-3 py-2 rounded border border-border-default bg-surface-subtle text-sm focus:border-gold focus:outline-none transition-colors"
					>
						<option value="">Select a sequence...</option>
						{#each sequences as seq (seq.id)}
							<option value={seq.id}>{seq.name} ({seq.channel})</option>
						{/each}
					</select>
				</div>

				<!-- Contact search -->
				<div>
					<label class="text-xs uppercase tracking-[0.12em] text-text-tertiary mb-1 block"
						>Recipient</label
					>
					<input
						type="text"
						bind:value={testClientSearch}
						oninput={onTestClientSearch}
						placeholder="Search contacts by name or phone..."
						class="w-full px-3 py-2 rounded border border-border-default bg-surface-subtle text-sm focus:border-gold focus:outline-none transition-colors"
					/>

					{#if testSearching}
						<p class="text-[10px] text-text-ghost mt-1">Searching...</p>
					{/if}

					{#if testClientResults.length > 0}
						<div
							class="mt-1 rounded border border-border-default bg-background max-h-40 overflow-y-auto"
						>
							{#each testClientResults as c (c.id)}
								<button
									onclick={() => selectTestClient(c)}
									class="w-full text-left px-3 py-2 text-sm hover:bg-gold-glow transition-colors flex items-center justify-between"
								>
									<span class="text-text-secondary">{c.full_name || 'Unknown'}</span>
									<span class="text-[10px] text-text-ghost">{c.phone || c.email || ''}</span>
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
								<MessageSquare class="h-3 w-3 text-text-ghost" />
								<span class="text-text-tertiary">{testClient.phone}</span>
							</div>
						{/if}
						{#if testClient.email}
							<div class="flex items-center gap-2 text-[10px]">
								<Mail class="h-3 w-3 text-text-ghost" />
								<span class="text-text-tertiary">{testClient.email}</span>
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
								<p class="text-[10px] text-text-ghost mt-1">
									SMS SID: {testResult.sms.twilioSid}
								</p>
							{/if}
							{#if testResult.email?.resendId}
								<p class="text-[10px] text-text-ghost mt-1">
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
						class="px-4 py-2 text-sm text-text-secondary hover:text-white transition-colors"
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
	</div>
</div>
