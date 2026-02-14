<script>
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Label } from '$lib/components/ui/label/index.ts';
	import { Separator } from '$lib/components/ui/separator/index.ts';
	import { Clock, Phone, GitBranch, Shield } from '@lucide/svelte';
	import { isAdmin } from '$lib/stores/auth.js';
	import { api } from '$lib/api/client.js';
	import { toast } from 'svelte-sonner';

	const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
	const ACTION_TYPES = [
		{ value: 'ring_extension', label: 'Ring Extension' },
		{ value: 'ring_group', label: 'Ring Group' },
		{ value: 'voicemail', label: 'Send to Voicemail' },
		{ value: 'auto_attendant', label: 'Auto Attendant' },
		{ value: 'forward', label: 'Forward to Number' }
	];

	let activeTab = $state('hours');
	let loading = $state(true);
	let saving = $state(false);

	// Settings data
	let businessHours = $state({});
	let clinicTimezone = $state('America/Los_Angeles');
	let clinicPhone = $state('');

	// Phone extensions
	let extensions = $state([]);
	let showExtForm = $state(false);
	let editingExt = $state(null);
	let extForm = $state({ extension: '', forward_number: '', ring_timeout: 20, voicemail_enabled: true });

	// Routing rules
	let routingRules = $state([]);
	let showRuleForm = $state(false);
	let editingRule = $state(null);
	let ruleForm = $state({
		name: '', priority: 0, day_of_week: [], start_time: '', end_time: '',
		action_type: 'ring_extension', action_target: '', fallback_action: 'voicemail', is_active: true
	});

	// Security (read-only display for now)
	let allowedIps = $state([]);
	let mfaTrustDays = $state(30);

	const tabs = [
		{ id: 'hours', label: 'Business Hours', icon: Clock },
		{ id: 'phone', label: 'Phone System', icon: Phone },
		{ id: 'routing', label: 'Call Routing', icon: GitBranch },
		{ id: 'security', label: 'Security', icon: Shield }
	];

	async function loadSettings() {
		loading = true;
		try {
			const [settingsRes, extRes, routingRes] = await Promise.all([
				api('/api/settings'),
				api('/api/settings/extensions'),
				api('/api/settings/routing')
			]);

			// Unpack settings
			const s = settingsRes.data || {};
			businessHours = s.business_hours || {};
			clinicTimezone = s.clinic_timezone || 'America/Los_Angeles';
			clinicPhone = s.clinic_phone || '';
			allowedIps = s.allowed_ips || [];
			mfaTrustDays = s.mfa_trust_duration_days || 30;

			extensions = extRes.data || [];
			routingRules = routingRes.data || [];
		} catch (err) {
			console.error('Failed to load settings:', err);
			toast.error('Failed to load settings');
		} finally {
			loading = false;
		}
	}

	// Business Hours
	function toggleDay(dayKey) {
		if (businessHours[dayKey]) {
			businessHours[dayKey] = null;
		} else {
			businessHours[dayKey] = { open: '09:00', close: '18:00' };
		}
	}

	async function saveBusinessHours() {
		saving = true;
		try {
			await api('/api/settings', {
				method: 'PUT',
				body: JSON.stringify({
					settings: {
						business_hours: businessHours,
						clinic_timezone: clinicTimezone,
						clinic_phone: clinicPhone
					}
				})
			});
			toast.success('Business hours saved');
		} catch (err) {
			toast.error('Failed to save business hours');
		} finally {
			saving = false;
		}
	}

	// Extensions
	function resetExtForm() {
		extForm = { extension: '', forward_number: '', ring_timeout: 20, voicemail_enabled: true };
		editingExt = null;
		showExtForm = false;
	}

	function startEditExt(ext) {
		editingExt = ext.id;
		extForm = {
			extension: ext.extension,
			forward_number: ext.forward_number || '',
			ring_timeout: ext.ring_timeout || 20,
			voicemail_enabled: ext.voicemail_enabled !== false
		};
		showExtForm = true;
	}

	async function saveExtension() {
		saving = true;
		try {
			if (editingExt) {
				await api(`/api/settings/extensions/${editingExt}`, {
					method: 'PUT',
					body: JSON.stringify(extForm)
				});
				toast.success('Extension updated');
			} else {
				await api('/api/settings/extensions', {
					method: 'POST',
					body: JSON.stringify(extForm)
				});
				toast.success('Extension created');
			}
			resetExtForm();
			await loadSettings();
		} catch (err) {
			toast.error(err.message || 'Failed to save extension');
		} finally {
			saving = false;
		}
	}

	async function deleteExtension(id) {
		if (!confirm('Delete this extension?')) return;
		try {
			await api(`/api/settings/extensions/${id}`, { method: 'DELETE' });
			toast.success('Extension deleted');
			await loadSettings();
		} catch (err) {
			toast.error('Failed to delete extension');
		}
	}

	// Routing rules
	function resetRuleForm() {
		ruleForm = {
			name: '', priority: 0, day_of_week: [], start_time: '', end_time: '',
			action_type: 'ring_extension', action_target: '', fallback_action: 'voicemail', is_active: true
		};
		editingRule = null;
		showRuleForm = false;
	}

	function startEditRule(rule) {
		editingRule = rule.id;
		ruleForm = {
			name: rule.name,
			priority: rule.priority || 0,
			day_of_week: rule.day_of_week || [],
			start_time: rule.start_time || '',
			end_time: rule.end_time || '',
			action_type: rule.action_type,
			action_target: rule.action_target || '',
			fallback_action: rule.fallback_action || 'voicemail',
			is_active: rule.is_active !== false
		};
		showRuleForm = true;
	}

	function toggleRuleDay(dayIdx) {
		const idx = ruleForm.day_of_week.indexOf(dayIdx);
		if (idx >= 0) {
			ruleForm.day_of_week = ruleForm.day_of_week.filter(d => d !== dayIdx);
		} else {
			ruleForm.day_of_week = [...ruleForm.day_of_week, dayIdx].sort();
		}
	}

	async function saveRoutingRule() {
		saving = true;
		try {
			const body = { ...ruleForm };
			if (!body.start_time) body.start_time = null;
			if (!body.end_time) body.end_time = null;
			if (body.day_of_week.length === 0) body.day_of_week = null;

			if (editingRule) {
				await api(`/api/settings/routing/${editingRule}`, {
					method: 'PUT',
					body: JSON.stringify(body)
				});
				toast.success('Routing rule updated');
			} else {
				await api('/api/settings/routing', {
					method: 'POST',
					body: JSON.stringify(body)
				});
				toast.success('Routing rule created');
			}
			resetRuleForm();
			await loadSettings();
		} catch (err) {
			toast.error(err.message || 'Failed to save routing rule');
		} finally {
			saving = false;
		}
	}

	async function deleteRoutingRule(id) {
		if (!confirm('Delete this routing rule?')) return;
		try {
			await api(`/api/settings/routing/${id}`, { method: 'DELETE' });
			toast.success('Routing rule deleted');
			await loadSettings();
		} catch (err) {
			toast.error('Failed to delete routing rule');
		}
	}

	async function toggleRuleActive(rule) {
		try {
			await api(`/api/settings/routing/${rule.id}`, {
				method: 'PUT',
				body: JSON.stringify({ is_active: !rule.is_active })
			});
			await loadSettings();
		} catch (err) {
			toast.error('Failed to toggle rule');
		}
	}

	// Format day_of_week array for display
	function formatDays(days) {
		if (!days || days.length === 0) return 'Every day';
		if (days.length === 7) return 'Every day';
		return days.map(d => DAYS[d]?.slice(0, 3)).join(', ');
	}

	// Init
	$effect(() => {
		loadSettings();
	});
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl tracking-wide">Settings</h1>
		<p class="text-sm text-muted-foreground mt-1">Manage business hours, phone system, and routing.</p>
	</div>

	{#if !$isAdmin}
		<div class="rounded border border-[rgba(197,165,90,0.12)] bg-[rgba(197,165,90,0.03)] p-5">
			<p class="text-[rgba(255,255,255,0.5)]">Only administrators can modify settings.</p>
		</div>
	{:else if loading}
		<div class="flex items-center justify-center py-20">
			<div class="text-[rgba(255,255,255,0.4)] text-sm">Loading settings...</div>
		</div>
	{:else}
		<!-- Tab navigation -->
		<div class="flex gap-1 border-b border-[rgba(197,165,90,0.12)]">
			{#each tabs as tab}
				<button
					class="flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors relative {activeTab === tab.id
						? 'text-[#c5a55a]'
						: 'text-[rgba(255,255,255,0.4)] hover:text-[rgba(255,255,255,0.7)]'}"
					onclick={() => (activeTab = tab.id)}
				>
					<tab.icon class="h-4 w-4" />
					{tab.label}
					{#if activeTab === tab.id}
						<div class="absolute bottom-0 left-0 right-0 h-0.5 bg-[#c5a55a]"></div>
					{/if}
				</button>
			{/each}
		</div>

		<!-- Tab content -->
		<div class="mt-4">
			<!-- ===================== BUSINESS HOURS ===================== -->
			{#if activeTab === 'hours'}
				<div class="space-y-6">
					<!-- Clinic info -->
					<div class="rounded border border-[rgba(197,165,90,0.12)] overflow-hidden">
						<div class="px-5 py-4 border-b border-[rgba(197,165,90,0.08)]">
							<h2 class="text-base tracking-wide">Clinic Information</h2>
						</div>
						<div class="p-5 space-y-4">
							<div class="grid grid-cols-2 gap-4">
								<div>
									<Label class="text-xs text-[rgba(255,255,255,0.5)] mb-1.5">Phone Number</Label>
									<Input bind:value={clinicPhone} placeholder="818-463-3772" class="bg-[rgba(255,255,255,0.03)] border-[rgba(197,165,90,0.12)]" />
								</div>
								<div>
									<Label class="text-xs text-[rgba(255,255,255,0.5)] mb-1.5">Timezone</Label>
									<select
										bind:value={clinicTimezone}
										class="w-full h-9 px-3 rounded-md text-sm bg-[rgba(255,255,255,0.03)] border border-[rgba(197,165,90,0.12)] text-white"
									>
										<option value="America/Los_Angeles">Pacific (Los Angeles)</option>
										<option value="America/Denver">Mountain (Denver)</option>
										<option value="America/Chicago">Central (Chicago)</option>
										<option value="America/New_York">Eastern (New York)</option>
									</select>
								</div>
							</div>
						</div>
					</div>

					<!-- Weekly schedule -->
					<div class="rounded border border-[rgba(197,165,90,0.12)] overflow-hidden">
						<div class="px-5 py-4 border-b border-[rgba(197,165,90,0.08)]">
							<h2 class="text-base tracking-wide">Weekly Schedule</h2>
							<p class="text-xs text-[rgba(255,255,255,0.35)] mt-0.5">Set open/close hours for each day. Calls outside these hours go to voicemail.</p>
						</div>
						<div class="p-5">
							<div class="space-y-3">
								{#each DAY_KEYS as dayKey, i}
									{@const hours = businessHours[dayKey]}
									<div class="flex items-center gap-4 py-2 {i < 6 ? 'border-b border-[rgba(197,165,90,0.06)]' : ''}">
										<div class="w-28">
											<button
												class="flex items-center gap-2 text-sm cursor-pointer"
												onclick={() => toggleDay(dayKey)}
											>
												<div class="w-4 h-4 rounded border {hours ? 'bg-[#c5a55a] border-[#c5a55a]' : 'border-[rgba(255,255,255,0.2)]'} flex items-center justify-center">
													{#if hours}
														<svg class="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
															<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
														</svg>
													{/if}
												</div>
												<span class="{hours ? 'text-white' : 'text-[rgba(255,255,255,0.35)]'}">{DAYS[i]}</span>
											</button>
										</div>
										{#if hours}
											<div class="flex items-center gap-2">
												<input
													type="time"
													value={hours.open}
													oninput={(e) => { businessHours[dayKey].open = e.target.value; }}
													class="h-8 px-2 rounded text-sm bg-[rgba(255,255,255,0.05)] border border-[rgba(197,165,90,0.12)] text-white"
												/>
												<span class="text-xs text-[rgba(255,255,255,0.3)]">to</span>
												<input
													type="time"
													value={hours.close}
													oninput={(e) => { businessHours[dayKey].close = e.target.value; }}
													class="h-8 px-2 rounded text-sm bg-[rgba(255,255,255,0.05)] border border-[rgba(197,165,90,0.12)] text-white"
												/>
											</div>
										{:else}
											<span class="text-xs text-[rgba(255,255,255,0.25)]">Closed</span>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					</div>

					<div class="flex justify-end">
						<Button onclick={saveBusinessHours} disabled={saving} class="bg-[#c5a55a] text-black hover:bg-[#d4af37]">
							{saving ? 'Saving...' : 'Save Business Hours'}
						</Button>
					</div>
				</div>

			<!-- ===================== PHONE SYSTEM ===================== -->
			{:else if activeTab === 'phone'}
				<div class="space-y-6">
					<div class="rounded border border-[rgba(197,165,90,0.12)] overflow-hidden">
						<div class="px-5 py-4 border-b border-[rgba(197,165,90,0.08)] flex items-center justify-between">
							<div>
								<h2 class="text-base tracking-wide">Phone Extensions</h2>
								<p class="text-xs text-[rgba(255,255,255,0.35)] mt-0.5">Manage staff extensions for the Twilio phone system.</p>
							</div>
							{#if !showExtForm}
								<Button onclick={() => { resetExtForm(); showExtForm = true; }} variant="outline" class="border-[rgba(197,165,90,0.2)] text-[#c5a55a] hover:bg-[rgba(197,165,90,0.08)] text-xs">
									+ Add Extension
								</Button>
							{/if}
						</div>
						<div class="p-5">
							{#if showExtForm}
								<div class="rounded border border-[rgba(197,165,90,0.15)] bg-[rgba(197,165,90,0.03)] p-4 mb-4 space-y-4">
									<h3 class="text-sm font-medium">{editingExt ? 'Edit Extension' : 'New Extension'}</h3>
									<div class="grid grid-cols-2 gap-4">
										<div>
											<Label class="text-xs text-[rgba(255,255,255,0.5)] mb-1.5">Extension Number</Label>
											<Input bind:value={extForm.extension} placeholder="100" class="bg-[rgba(255,255,255,0.03)] border-[rgba(197,165,90,0.12)]" />
										</div>
										<div>
											<Label class="text-xs text-[rgba(255,255,255,0.5)] mb-1.5">Forward To</Label>
											<Input bind:value={extForm.forward_number} placeholder="+15551234567" class="bg-[rgba(255,255,255,0.03)] border-[rgba(197,165,90,0.12)]" />
										</div>
										<div>
											<Label class="text-xs text-[rgba(255,255,255,0.5)] mb-1.5">Ring Timeout (sec)</Label>
											<Input type="number" bind:value={extForm.ring_timeout} class="bg-[rgba(255,255,255,0.03)] border-[rgba(197,165,90,0.12)]" />
										</div>
										<div class="flex items-end gap-3">
											<button
												class="flex items-center gap-2 text-sm cursor-pointer mb-2"
												onclick={() => { extForm.voicemail_enabled = !extForm.voicemail_enabled; }}
											>
												<div class="w-4 h-4 rounded border {extForm.voicemail_enabled ? 'bg-[#c5a55a] border-[#c5a55a]' : 'border-[rgba(255,255,255,0.2)]'} flex items-center justify-center">
													{#if extForm.voicemail_enabled}
														<svg class="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
															<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
														</svg>
													{/if}
												</div>
												<span>Voicemail enabled</span>
											</button>
										</div>
									</div>
									<div class="flex gap-2 justify-end">
										<Button onclick={resetExtForm} variant="ghost" class="text-xs">Cancel</Button>
										<Button onclick={saveExtension} disabled={saving} class="bg-[#c5a55a] text-black hover:bg-[#d4af37] text-xs">
											{saving ? 'Saving...' : editingExt ? 'Update' : 'Create'}
										</Button>
									</div>
								</div>
							{/if}

							{#if extensions.length === 0}
								<div class="flex flex-col items-center py-8">
									<div class="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[rgba(197,165,90,0.05)] border border-[rgba(197,165,90,0.08)]">
										<Phone class="h-5 w-5 text-[rgba(197,165,90,0.2)]" />
									</div>
									<p class="text-sm text-[rgba(255,255,255,0.3)]">No extensions configured.</p>
									<p class="text-xs text-[rgba(255,255,255,0.15)] mt-0.5">Add staff extensions for the Twilio phone system.</p>
								</div>
							{:else}
								<div class="space-y-2">
									{#each extensions as ext}
										<div class="flex items-center justify-between py-3 px-4 rounded bg-[rgba(255,255,255,0.02)] border border-[rgba(197,165,90,0.06)]">
											<div class="flex items-center gap-4">
												<span class="text-[#c5a55a] font-mono font-medium">Ext {ext.extension}</span>
												{#if ext.user?.full_name}
													<span class="text-sm text-[rgba(255,255,255,0.6)]">{ext.user.full_name}</span>
												{/if}
												{#if ext.forward_number}
													<span class="text-xs text-[rgba(255,255,255,0.3)]">→ {ext.forward_number}</span>
												{/if}
											</div>
											<div class="flex items-center gap-3">
												<span class="text-xs {ext.voicemail_enabled ? 'text-green-400' : 'text-[rgba(255,255,255,0.2)]'}">
													{ext.voicemail_enabled ? 'VM on' : 'VM off'}
												</span>
												<span class="text-xs text-[rgba(255,255,255,0.3)]">{ext.ring_timeout}s ring</span>
												<button onclick={() => startEditExt(ext)} class="text-xs text-[rgba(255,255,255,0.4)] hover:text-white cursor-pointer">Edit</button>
												<button onclick={() => deleteExtension(ext.id)} class="text-xs text-red-400/50 hover:text-red-400 cursor-pointer">Delete</button>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				</div>

			<!-- ===================== CALL ROUTING ===================== -->
			{:else if activeTab === 'routing'}
				<div class="space-y-6">
					<div class="rounded border border-[rgba(197,165,90,0.12)] overflow-hidden">
						<div class="px-5 py-4 border-b border-[rgba(197,165,90,0.08)] flex items-center justify-between">
							<div>
								<h2 class="text-base tracking-wide">Call Routing Rules</h2>
								<p class="text-xs text-[rgba(255,255,255,0.35)] mt-0.5">Rules are evaluated in priority order (lowest number first). First matching rule wins.</p>
							</div>
							{#if !showRuleForm}
								<Button onclick={() => { resetRuleForm(); showRuleForm = true; }} variant="outline" class="border-[rgba(197,165,90,0.2)] text-[#c5a55a] hover:bg-[rgba(197,165,90,0.08)] text-xs">
									+ Add Rule
								</Button>
							{/if}
						</div>
						<div class="p-5">
							{#if showRuleForm}
								<div class="rounded border border-[rgba(197,165,90,0.15)] bg-[rgba(197,165,90,0.03)] p-4 mb-4 space-y-4">
									<h3 class="text-sm font-medium">{editingRule ? 'Edit Rule' : 'New Routing Rule'}</h3>
									<div class="grid grid-cols-2 gap-4">
										<div>
											<Label class="text-xs text-[rgba(255,255,255,0.5)] mb-1.5">Rule Name</Label>
											<Input bind:value={ruleForm.name} placeholder="Business Hours" class="bg-[rgba(255,255,255,0.03)] border-[rgba(197,165,90,0.12)]" />
										</div>
										<div>
											<Label class="text-xs text-[rgba(255,255,255,0.5)] mb-1.5">Priority (lower = first)</Label>
											<Input type="number" bind:value={ruleForm.priority} class="bg-[rgba(255,255,255,0.03)] border-[rgba(197,165,90,0.12)]" />
										</div>
									</div>

									<!-- Day selector -->
									<div>
										<Label class="text-xs text-[rgba(255,255,255,0.5)] mb-2 block">Active Days (none = every day)</Label>
										<div class="flex gap-1.5">
											{#each DAYS as day, i}
												<button
													class="px-2.5 py-1.5 rounded text-xs cursor-pointer transition-colors {ruleForm.day_of_week.includes(i) ? 'bg-[#c5a55a] text-black' : 'bg-[rgba(255,255,255,0.05)] text-[rgba(255,255,255,0.4)] hover:bg-[rgba(255,255,255,0.08)]'}"
													onclick={() => toggleRuleDay(i)}
												>
													{day.slice(0, 3)}
												</button>
											{/each}
										</div>
									</div>

									<!-- Time range -->
									<div class="grid grid-cols-2 gap-4">
										<div>
											<Label class="text-xs text-[rgba(255,255,255,0.5)] mb-1.5">Start Time (empty = any)</Label>
											<input
												type="time"
												bind:value={ruleForm.start_time}
												class="w-full h-9 px-3 rounded-md text-sm bg-[rgba(255,255,255,0.03)] border border-[rgba(197,165,90,0.12)] text-white"
											/>
										</div>
										<div>
											<Label class="text-xs text-[rgba(255,255,255,0.5)] mb-1.5">End Time (empty = any)</Label>
											<input
												type="time"
												bind:value={ruleForm.end_time}
												class="w-full h-9 px-3 rounded-md text-sm bg-[rgba(255,255,255,0.03)] border border-[rgba(197,165,90,0.12)] text-white"
											/>
										</div>
									</div>

									<!-- Action -->
									<div class="grid grid-cols-2 gap-4">
										<div>
											<Label class="text-xs text-[rgba(255,255,255,0.5)] mb-1.5">Action</Label>
											<select
												bind:value={ruleForm.action_type}
												class="w-full h-9 px-3 rounded-md text-sm bg-[rgba(255,255,255,0.03)] border border-[rgba(197,165,90,0.12)] text-white"
											>
												{#each ACTION_TYPES as at}
													<option value={at.value}>{at.label}</option>
												{/each}
											</select>
										</div>
										<div>
											<Label class="text-xs text-[rgba(255,255,255,0.5)] mb-1.5">Target (extension # or phone)</Label>
											<Input bind:value={ruleForm.action_target} placeholder="100" class="bg-[rgba(255,255,255,0.03)] border-[rgba(197,165,90,0.12)]" />
										</div>
									</div>

									<div class="grid grid-cols-2 gap-4">
										<div>
											<Label class="text-xs text-[rgba(255,255,255,0.5)] mb-1.5">Fallback Action</Label>
											<select
												bind:value={ruleForm.fallback_action}
												class="w-full h-9 px-3 rounded-md text-sm bg-[rgba(255,255,255,0.03)] border border-[rgba(197,165,90,0.12)] text-white"
											>
												<option value="voicemail">Voicemail</option>
												<option value="ring_extension">Ring Extension</option>
												<option value="forward">Forward</option>
											</select>
										</div>
										<div class="flex items-end gap-3">
											<button
												class="flex items-center gap-2 text-sm cursor-pointer mb-2"
												onclick={() => { ruleForm.is_active = !ruleForm.is_active; }}
											>
												<div class="w-4 h-4 rounded border {ruleForm.is_active ? 'bg-[#c5a55a] border-[#c5a55a]' : 'border-[rgba(255,255,255,0.2)]'} flex items-center justify-center">
													{#if ruleForm.is_active}
														<svg class="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
															<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
														</svg>
													{/if}
												</div>
												<span>Rule active</span>
											</button>
										</div>
									</div>

									<div class="flex gap-2 justify-end">
										<Button onclick={resetRuleForm} variant="ghost" class="text-xs">Cancel</Button>
										<Button onclick={saveRoutingRule} disabled={saving} class="bg-[#c5a55a] text-black hover:bg-[#d4af37] text-xs">
											{saving ? 'Saving...' : editingRule ? 'Update' : 'Create'}
										</Button>
									</div>
								</div>
							{/if}

							{#if routingRules.length === 0}
								<div class="flex flex-col items-center py-8">
									<div class="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[rgba(197,165,90,0.05)] border border-[rgba(197,165,90,0.08)]">
										<GitBranch class="h-5 w-5 text-[rgba(197,165,90,0.2)]" />
									</div>
									<p class="text-sm text-[rgba(255,255,255,0.3)]">No routing rules configured.</p>
									<p class="text-xs text-[rgba(255,255,255,0.15)] mt-0.5">Rules determine how incoming calls are handled.</p>
								</div>
							{:else}
								<div class="space-y-2">
									{#each routingRules as rule}
										<div class="flex items-center justify-between py-3 px-4 rounded bg-[rgba(255,255,255,0.02)] border border-[rgba(197,165,90,0.06)]">
											<div class="flex items-center gap-4">
												<span class="text-xs font-mono text-[rgba(255,255,255,0.3)]">#{rule.priority}</span>
												<span class="text-sm {rule.is_active ? 'text-white' : 'text-[rgba(255,255,255,0.3)] line-through'}">{rule.name}</span>
												<span class="text-xs text-[rgba(255,255,255,0.3)]">{formatDays(rule.day_of_week)}</span>
												{#if rule.start_time && rule.end_time}
													<span class="text-xs text-[rgba(255,255,255,0.3)]">{rule.start_time}–{rule.end_time}</span>
												{/if}
											</div>
											<div class="flex items-center gap-3">
												<span class="text-xs text-[#c5a55a]">{ACTION_TYPES.find(a => a.value === rule.action_type)?.label || rule.action_type}</span>
												{#if rule.action_target}
													<span class="text-xs text-[rgba(255,255,255,0.3)]">→ {rule.action_target}</span>
												{/if}
												<button onclick={() => toggleRuleActive(rule)} class="text-xs cursor-pointer {rule.is_active ? 'text-green-400' : 'text-[rgba(255,255,255,0.3)]'}">
													{rule.is_active ? 'Active' : 'Inactive'}
												</button>
												<button onclick={() => startEditRule(rule)} class="text-xs text-[rgba(255,255,255,0.4)] hover:text-white cursor-pointer">Edit</button>
												<button onclick={() => deleteRoutingRule(rule.id)} class="text-xs text-red-400/50 hover:text-red-400 cursor-pointer">Delete</button>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				</div>

			<!-- ===================== SECURITY ===================== -->
			{:else if activeTab === 'security'}
				<div class="space-y-6">
					<div class="rounded border border-[rgba(197,165,90,0.12)] overflow-hidden">
						<div class="px-5 py-4 border-b border-[rgba(197,165,90,0.08)]">
							<h2 class="text-base tracking-wide">Security Status</h2>
							<p class="text-xs text-[rgba(255,255,255,0.35)] mt-0.5">HIPAA-ready security infrastructure. Features are enabled progressively.</p>
						</div>
						<div class="p-5 space-y-4">
							<!-- Status checklist -->
							<div class="space-y-3">
								<div class="flex items-center gap-3 py-2">
									<div class="w-2 h-2 rounded-full bg-green-400"></div>
									<span class="text-sm">Email + password authentication</span>
									<span class="text-xs text-green-400 ml-auto">Active</span>
								</div>
								<div class="flex items-center gap-3 py-2">
									<div class="w-2 h-2 rounded-full bg-green-400"></div>
									<span class="text-sm">Domain restriction (@lemedspa.com)</span>
									<span class="text-xs text-green-400 ml-auto">Active</span>
								</div>
								<div class="flex items-center gap-3 py-2">
									<div class="w-2 h-2 rounded-full bg-green-400"></div>
									<span class="text-sm">Audit logging on all API actions</span>
									<span class="text-xs text-green-400 ml-auto">Active</span>
								</div>
								<div class="flex items-center gap-3 py-2">
									<div class="w-2 h-2 rounded-full bg-green-400"></div>
									<span class="text-sm">Row-Level Security (RLS) on all tables</span>
									<span class="text-xs text-green-400 ml-auto">Active</span>
								</div>
								<Separator class="bg-[rgba(197,165,90,0.08)]" />
								<div class="flex items-center gap-3 py-2">
									<div class="w-2 h-2 rounded-full bg-yellow-400"></div>
									<span class="text-sm">Two-factor authentication (OTP)</span>
									<span class="text-xs text-yellow-400 ml-auto">Ready — not enabled</span>
								</div>
								<div class="flex items-center gap-3 py-2">
									<div class="w-2 h-2 rounded-full bg-yellow-400"></div>
									<span class="text-sm">Trusted device management</span>
									<span class="text-xs text-yellow-400 ml-auto">Ready — not enabled</span>
								</div>
								<div class="flex items-center gap-3 py-2">
									<div class="w-2 h-2 rounded-full bg-yellow-400"></div>
									<span class="text-sm">IP allowlist</span>
									<span class="text-xs text-yellow-400 ml-auto">Ready — {allowedIps.length === 0 ? 'no IPs set' : `${allowedIps.length} IPs`}</span>
								</div>
								<div class="flex items-center gap-3 py-2">
									<div class="w-2 h-2 rounded-full bg-yellow-400"></div>
									<span class="text-sm">Business hours access control</span>
									<span class="text-xs text-yellow-400 ml-auto">Ready — not enabled</span>
								</div>
								<Separator class="bg-[rgba(197,165,90,0.08)]" />
								<div class="flex items-center gap-3 py-2">
									<div class="w-2 h-2 rounded-full bg-[rgba(255,255,255,0.15)]"></div>
									<span class="text-sm text-[rgba(255,255,255,0.4)]">HIPAA BAA (Supabase Teams)</span>
									<span class="text-xs text-[rgba(255,255,255,0.25)] ml-auto">Phase 5</span>
								</div>
							</div>
						</div>
					</div>

					<!-- MFA Settings (display only for now) -->
					<div class="rounded border border-[rgba(197,165,90,0.12)] overflow-hidden">
						<div class="px-5 py-4 border-b border-[rgba(197,165,90,0.08)]">
							<h2 class="text-base tracking-wide">MFA Configuration</h2>
						</div>
						<div class="p-5 space-y-3">
							<div class="flex items-center justify-between">
								<span class="text-sm text-[rgba(255,255,255,0.6)]">Device trust duration</span>
								<span class="text-sm">{mfaTrustDays} days</span>
							</div>
							<p class="text-xs text-[rgba(255,255,255,0.25)]">
								When 2FA is enabled, trusted devices won't need to re-verify for this many days.
								Configure this value when you're ready to enable 2FA.
							</p>
						</div>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
