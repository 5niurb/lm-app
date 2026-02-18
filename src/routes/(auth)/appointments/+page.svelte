<script>
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import {
		ChevronLeft,
		ChevronRight,
		Clock,
		User,
		X,
		MessageSquare,
		MapPin,
		CalendarDays,
		PhoneOutgoing,
	} from '@lucide/svelte';
	import { api } from '$lib/api/client.js';
	import { resolve } from '$app/paths';
	import { formatTime, formatDateHeader, getDurationMinutes } from '$lib/utils/formatters.js';

	// ─── State ───
	let selectedDate = $state(todayStr());
	let view = $state('day'); // 'day' | 'week'
	let appointments = $state(null);
	let error = $state('');
	let drawerOpen = $state(false);
	let selectedAppt = $state(null);

	// ─── Derived ───
	const formattedDate = $derived(formatDateHeader(selectedDate));
	const isToday = $derived(selectedDate === todayStr());
	const timeSlots = $derived(generateTimeSlots());
	const weekDays = $derived(getWeekDays(selectedDate));

	// Appointments for the current day view (filtered from loaded data)
	const dayAppointments = $derived(
		appointments
			? appointments.filter((a) => {
					const apptDate = new Date(a.start).toLocaleDateString('en-CA', {
						timeZone: 'America/Los_Angeles',
					});
					return apptDate === selectedDate;
				})
			: null
	);

	const allDayAppointments = $derived(
		dayAppointments ? dayAppointments.filter((a) => a.all_day) : []
	);

	const timedAppointments = $derived(
		dayAppointments ? dayAppointments.filter((a) => !a.all_day) : []
	);

	// Group appointments by day for week view
	const weekAppointments = $derived(() => {
		if (!appointments) return {};
		const grouped = {};
		for (const day of weekDays) {
			grouped[day.date] = appointments.filter((a) => {
				const apptDate = new Date(a.start).toLocaleDateString('en-CA', {
					timeZone: 'America/Los_Angeles',
				});
				return apptDate === day.date;
			});
		}
		return grouped;
	});

	// ─── Load data on mount and when date/view changes ───
	$effect(() => {
		const _date = selectedDate;
		const _view = view;
		loadAppointments();
	});

	async function loadAppointments() {
		try {
			error = '';
			let res;
			if (view === 'week') {
				const start = getMonday(selectedDate);
				const end = getSunday(selectedDate);
				res = await api(`/api/appointments?start=${start}&end=${end}`);
			} else {
				res = await api(`/api/appointments?date=${selectedDate}`);
			}
			appointments = res.data;
		} catch (e) {
			error = e.message;
		}
	}

	// ─── Navigation ───
	function goToday() {
		selectedDate = todayStr();
	}

	function goPrev() {
		if (view === 'week') {
			selectedDate = addDays(selectedDate, -7);
		} else {
			selectedDate = addDays(selectedDate, -1);
		}
	}

	function goNext() {
		if (view === 'week') {
			selectedDate = addDays(selectedDate, 7);
		} else {
			selectedDate = addDays(selectedDate, 1);
		}
	}

	function selectDay(dateStr) {
		selectedDate = dateStr;
		view = 'day';
	}

	// ─── Drawer ───
	function openDrawer(appt) {
		selectedAppt = appt;
		drawerOpen = true;
	}

	function closeDrawer() {
		drawerOpen = false;
		setTimeout(() => {
			if (!drawerOpen) {
				selectedAppt = null;
			}
		}, 220);
	}

	// ─── Status helpers ───
	function statusColor(status) {
		switch (status) {
			case 'confirmed':
				return 'border-l-gold bg-gold/5';
			case 'tentative':
				return 'border-l-amber-400 bg-amber-400/5';
			case 'cancelled':
				return 'border-l-red-400 bg-red-400/5';
			default:
				return 'border-l-gold bg-gold/5';
		}
	}

	function statusBadgeClasses(status) {
		switch (status) {
			case 'confirmed':
				return 'bg-gold/15 text-gold border-gold/30';
			case 'tentative':
				return 'bg-amber-400/15 text-amber-400 border-amber-400/30';
			case 'cancelled':
				return 'bg-red-400/15 text-red-400 border-red-400/30';
			default:
				return 'bg-gold/15 text-gold border-gold/30';
		}
	}

	// ─── Current time indicator ───
	let currentTimeTop = $state(0);
	let showTimeLine = $derived(isToday && view === 'day');

	function updateCurrentTime() {
		const now = new Date();
		const hours = now.getHours();
		const minutes = now.getMinutes();
		const totalMinutesFromStart = (hours - 9) * 60 + minutes;
		currentTimeTop = (totalMinutesFromStart / 30) * 48;
	}

	$effect(() => {
		if (showTimeLine) {
			updateCurrentTime();
			const interval = setInterval(updateCurrentTime, 60000);
			return () => clearInterval(interval);
		}
	});

	// ─── Date helpers ───
	function todayStr() {
		return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
	}

	function addDays(dateStr, n) {
		const d = new Date(dateStr + 'T12:00:00');
		d.setDate(d.getDate() + n);
		return d.toLocaleDateString('en-CA');
	}

	function getMonday(dateStr) {
		const d = new Date(dateStr + 'T12:00:00');
		const day = d.getDay();
		d.setDate(d.getDate() - ((day + 6) % 7));
		return d.toLocaleDateString('en-CA');
	}

	function getSunday(dateStr) {
		const monday = getMonday(dateStr);
		return addDays(monday, 6);
	}

	function generateTimeSlots() {
		const slots = [];
		for (let h = 9; h <= 19; h++) {
			slots.push({ hour: h, minute: 0, label: formatHour(h, 0) });
			if (h < 19) slots.push({ hour: h, minute: 30, label: formatHour(h, 30) });
		}
		return slots;
	}

	function formatHour(h, m) {
		const ampm = h >= 12 ? 'PM' : 'AM';
		const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
		return m === 0 ? `${hour} ${ampm}` : `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
	}

	function getTopOffset(startTime) {
		const d = new Date(startTime);
		const hours = d.getHours();
		const minutes = d.getMinutes();
		const totalMinutesFromStart = (hours - 9) * 60 + minutes;
		return (totalMinutesFromStart / 30) * 48;
	}

	function getBlockHeight(start, end) {
		const durationMin = getDurationMinutes(start, end);
		return Math.max((durationMin / 30) * 48, 24);
	}

	function getWeekDays(dateStr) {
		const monday = getMonday(dateStr);
		return Array.from({ length: 7 }, (_, i) => {
			const d = addDays(monday, i);
			const date = new Date(d + 'T12:00:00');
			return {
				date: d,
				label: date.toLocaleDateString('en-US', { weekday: 'short' }),
				dayNum: date.getDate(),
				isToday: d === todayStr(),
			};
		});
	}
</script>

<svelte:head>
	<title>Schedule — Le Med Spa</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl tracking-wide font-['Playfair_Display']">Schedule</h1>
			<p class="text-sm text-text-secondary mt-1">{formattedDate}</p>
		</div>

		<div class="flex items-center gap-3">
			<!-- Date navigation -->
			<div class="flex items-center gap-1">
				<Button variant="outline" size="sm" onclick={goPrev}>
					<ChevronLeft class="h-4 w-4" />
				</Button>
				<Button variant="outline" size="sm" onclick={goToday} disabled={isToday}>Today</Button>
				<Button variant="outline" size="sm" onclick={goNext}>
					<ChevronRight class="h-4 w-4" />
				</Button>
			</div>

			<!-- View toggle -->
			<div class="flex rounded-lg border border-border overflow-hidden">
				<button
					class="px-3 py-1.5 text-xs font-medium transition-all duration-200 {view === 'day'
						? 'bg-gold text-primary-foreground'
						: 'bg-surface-subtle text-text-secondary hover:text-text-primary'}"
					onclick={() => (view = 'day')}
				>
					Day
				</button>
				<button
					class="px-3 py-1.5 text-xs font-medium transition-all duration-200 {view === 'week'
						? 'bg-gold text-primary-foreground'
						: 'bg-surface-subtle text-text-secondary hover:text-text-primary'}"
					onclick={() => (view = 'week')}
				>
					Week
				</button>
			</div>
		</div>
	</div>

	<!-- Error -->
	{#if error}
		<div class="rounded border border-red-500/30 bg-red-500/5 px-4 py-3">
			<p class="text-sm text-red-400">{error}</p>
		</div>
	{/if}

	<!-- Loading -->
	{#if appointments === null}
		<div class="rounded border border-border p-5">
			<div class="space-y-2">
				{#each Array(8) as _, i (i)}
					<Skeleton class="h-14 w-full" />
				{/each}
			</div>
		</div>

		<!-- Day View -->
	{:else if view === 'day'}
		{#if dayAppointments && dayAppointments.length === 0}
			<!-- Empty state -->
			<div class="rounded border border-border p-5">
				<div class="flex h-64 items-center justify-center">
					<div class="text-center">
						<div
							class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-glow border border-border"
						>
							<CalendarDays class="h-6 w-6 empty-state-icon" />
						</div>
						<p
							class="text-sm font-light text-text-tertiary mb-1"
							style="font-family: 'Playfair Display', serif;"
						>
							No appointments scheduled
						</p>
						<p class="text-xs text-text-ghost">
							Appointments from Aesthetic Record will appear here.
						</p>
					</div>
				</div>
			</div>
		{:else}
			<!-- All-day events banner -->
			{#if allDayAppointments.length > 0}
				<div class="flex flex-wrap gap-2">
					{#each allDayAppointments as appt (appt.id)}
						<button
							class="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-all duration-200 hover:bg-gold-glow {statusColor(appt.status)}"
							onclick={() => openDrawer(appt)}
						>
							<CalendarDays class="h-3.5 w-3.5 text-gold-dim" />
							<span class="text-text-primary font-medium">{appt.patient_name}</span>
							<span class="text-text-tertiary">—</span>
							<span class="text-text-secondary text-xs">{appt.service}</span>
						</button>
					{/each}
				</div>
			{/if}

			<!-- Time grid -->
			<div class="rounded border border-border overflow-hidden">
				<div class="relative flex">
					<!-- Time labels column -->
					<div class="w-20 shrink-0 border-r border-border-subtle bg-surface-subtle">
						{#each timeSlots as slot (slot.hour * 60 + slot.minute)}
							<div
								class="h-12 flex items-start justify-end pr-3 pt-0.5 text-[11px] text-text-tertiary"
							>
								{#if slot.minute === 0}
									{slot.label}
								{/if}
							</div>
						{/each}
					</div>

					<!-- Appointments area -->
					<div class="flex-1 relative">
						<!-- Grid lines -->
						{#each timeSlots as slot, _i (slot.hour * 60 + slot.minute)}
							<div
								class="h-12 border-b {slot.minute === 0
									? 'border-border-subtle'
									: 'border-border-subtle/40'}"
							></div>
						{/each}

						<!-- Current time indicator -->
						{#if showTimeLine && currentTimeTop >= 0 && currentTimeTop <= timeSlots.length * 48}
							<div
								class="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
								style="top: {currentTimeTop}px;"
							>
								<div class="w-2.5 h-2.5 rounded-full bg-gold -ml-1.5 shrink-0"></div>
								<div class="flex-1 h-px bg-gold"></div>
							</div>
						{/if}

						<!-- Appointment blocks -->
						{#each timedAppointments as appt (appt.id)}
							{@const top = getTopOffset(appt.start)}
							{@const height = getBlockHeight(appt.start, appt.end)}
							{@const durationMin = getDurationMinutes(appt.start, appt.end)}
							<button
								class="absolute left-1 right-2 z-10 rounded-md border-l-[3px] px-3 py-1.5 text-left transition-all duration-200 hover:shadow-lg hover:scale-[1.01] overflow-hidden cursor-pointer {statusColor(appt.status)}"
								style="top: {top}px; height: {height}px;"
								onclick={() => openDrawer(appt)}
							>
								<p class="text-sm font-medium text-text-primary truncate leading-tight">
									{appt.patient_name}
								</p>
								{#if height >= 40}
									<p class="text-xs text-text-secondary truncate mt-0.5">
										{appt.service} · {durationMin} min
									</p>
								{/if}
								{#if height >= 64 && appt.provider}
									<p class="text-xs text-text-tertiary truncate mt-0.5">
										{appt.provider}
									</p>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			</div>
		{/if}

		<!-- Week View -->
	{:else if view === 'week'}
		{@const grouped = weekAppointments()}
		<div class="rounded border border-border overflow-hidden">
			<!-- Week header -->
			<div class="grid grid-cols-7 border-b border-border">
				{#each weekDays as day (day.date)}
					<button
						class="py-3 text-center border-r last:border-r-0 border-border-subtle transition-all duration-200 hover:bg-gold-glow {day.isToday
							? 'bg-gold/5'
							: ''}"
						onclick={() => selectDay(day.date)}
					>
						<p class="text-[10px] uppercase tracking-[0.15em] text-text-tertiary">
							{day.label}
						</p>
						<p
							class="text-lg font-light mt-0.5 {day.isToday
								? 'text-gold'
								: 'text-text-primary'}"
							style="font-family: 'Playfair Display', serif;"
						>
							{day.dayNum}
						</p>
					</button>
				{/each}
			</div>

			<!-- Week body -->
			<div class="grid grid-cols-7 min-h-[400px]">
				{#each weekDays as day (day.date)}
					{@const dayAppts = grouped[day.date] || []}
					<div
						class="border-r last:border-r-0 border-border-subtle p-1.5 space-y-1 {day.isToday
							? 'bg-gold/5'
							: ''}"
					>
						{#if dayAppts.length === 0}
							<div class="flex items-center justify-center h-16">
								<span class="text-[10px] text-text-ghost">No appts</span>
							</div>
						{:else}
							{#each dayAppts as appt (appt.id)}
								<button
									class="w-full text-left rounded border-l-2 px-1.5 py-1 text-xs transition-all duration-200 hover:shadow-md cursor-pointer {appt.status === 'confirmed'
										? 'border-l-gold bg-gold/5 hover:bg-gold/10'
										: appt.status === 'tentative'
											? 'border-l-amber-400 bg-amber-400/5 hover:bg-amber-400/10'
											: 'border-l-red-400 bg-red-400/5 hover:bg-red-400/10'}"
									onclick={() => openDrawer(appt)}
								>
									{#if !appt.all_day}
										<p class="text-text-tertiary text-[10px] leading-tight">
											{formatTime(appt.start)}
										</p>
									{:else}
										<p class="text-text-tertiary text-[10px] leading-tight">All day</p>
									{/if}
									<p class="text-text-primary font-medium truncate leading-tight mt-0.5">
										{appt.patient_name}
									</p>
								</button>
							{/each}
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<!-- Appointment Detail Slide-over Drawer -->
{#if selectedAppt !== null}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-40 transition-opacity duration-200 {drawerOpen
			? 'bg-black/60 opacity-100'
			: 'opacity-0 pointer-events-none'}"
		onclick={closeDrawer}
	></div>

	<div
		class="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-border bg-card shadow-2xl transform transition-transform duration-200 ease-out overflow-y-auto {drawerOpen
			? 'translate-x-0'
			: 'translate-x-full'}"
	>
		<!-- Drawer header -->
		<div class="sticky top-0 z-10 bg-card border-b border-border px-5 py-4">
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<h2
						class="text-xl font-medium text-text-primary truncate tracking-wide"
						style="font-family: 'Playfair Display', serif;"
					>
						{selectedAppt.patient_name}
					</h2>
					<div class="flex items-center gap-2 mt-1.5">
						<span
							class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize {statusBadgeClasses(selectedAppt.status)}"
						>
							{selectedAppt.status}
						</span>
						{#if selectedAppt.all_day}
							<span
								class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-surface-subtle text-text-secondary border-border"
							>
								All Day
							</span>
						{/if}
					</div>
				</div>
				<button
					class="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg border border-border text-text-tertiary hover:text-text-primary hover:border-border hover:bg-gold-glow transition-all"
					onclick={closeDrawer}
					title="Close"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Quick actions -->
			<div class="flex items-center gap-2 mt-3">
				<a
					href={resolve(`/softphone?call=${encodeURIComponent(selectedAppt.patient_name)}`)}
					class="flex-1 inline-flex items-center justify-center gap-2 h-9 rounded-lg border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/15 hover:border-emerald-400 transition-all text-sm font-medium"
				>
					<PhoneOutgoing class="h-4 w-4" />
					Call
				</a>
				<a
					href={resolve(`/messages?name=${encodeURIComponent(selectedAppt.patient_name)}&new=true`)}
					class="flex-1 inline-flex items-center justify-center gap-2 h-9 rounded-lg border border-blue-500/40 text-blue-400 hover:bg-blue-500/15 hover:border-blue-400 transition-all text-sm font-medium"
				>
					<MessageSquare class="h-4 w-4" />
					Message
				</a>
			</div>
		</div>

		<!-- Drawer body -->
		<div class="px-5 py-5 space-y-5">
			<!-- Appointment details -->
			<div class="card-elevated rounded-lg p-4">
				<p
					class="section-label text-xs font-medium text-text-tertiary mb-3 uppercase tracking-[0.1em]"
				>
					Appointment Details
				</p>
				<div class="grid gap-3 grid-cols-2">
					<!-- Date -->
					<div>
						<p class="text-xs text-text-tertiary mb-0.5">Date</p>
						<p class="text-sm text-text-primary">
							{formatDateHeader(
								new Date(selectedAppt.start).toLocaleDateString('en-CA', {
									timeZone: 'America/Los_Angeles',
								})
							)}
						</p>
					</div>

					<!-- Duration -->
					<div>
						<p class="text-xs text-text-tertiary mb-0.5">Duration</p>
						<p class="text-sm text-text-primary">
							{#if selectedAppt.all_day}
								All Day
							{:else}
								{getDurationMinutes(selectedAppt.start, selectedAppt.end)} minutes
							{/if}
						</p>
					</div>

					<!-- Time range -->
					{#if !selectedAppt.all_day}
						<div class="col-span-2">
							<p class="text-xs text-text-tertiary mb-0.5">Time</p>
							<p class="text-sm text-text-primary flex items-center gap-1.5">
								<Clock class="h-3.5 w-3.5 text-gold-dim" />
								{formatTime(selectedAppt.start)} — {formatTime(selectedAppt.end)}
							</p>
						</div>
					{/if}

					<!-- Service -->
					<div class="col-span-2">
						<p class="text-xs text-text-tertiary mb-0.5">Service</p>
						<p class="text-sm text-text-primary">{selectedAppt.service}</p>
					</div>

					<!-- Provider -->
					{#if selectedAppt.provider}
						<div>
							<p class="text-xs text-text-tertiary mb-0.5">Provider</p>
							<p class="text-sm text-text-primary flex items-center gap-1.5">
								<User class="h-3.5 w-3.5 text-gold-dim" />
								{selectedAppt.provider}
							</p>
						</div>
					{/if}

					<!-- Location -->
					{#if selectedAppt.location}
						<div>
							<p class="text-xs text-text-tertiary mb-0.5">Location</p>
							<p class="text-sm text-text-primary flex items-center gap-1.5">
								<MapPin class="h-3.5 w-3.5 text-gold-dim" />
								{selectedAppt.location}
							</p>
						</div>
					{/if}
				</div>
			</div>

			<!-- Notes / Description -->
			{#if selectedAppt.description}
				<div class="card-elevated rounded-lg p-4">
					<p
						class="section-label text-xs font-medium text-text-tertiary mb-2.5 uppercase tracking-[0.1em]"
					>
						Notes
					</p>
					<p class="text-sm text-text-secondary leading-relaxed">
						{selectedAppt.description}
					</p>
				</div>
			{/if}

			<!-- View contact link -->
			<div class="card-elevated rounded-lg p-4">
				<a
					href={resolve(`/contacts?search=${encodeURIComponent(selectedAppt.patient_name)}`)}
					class="flex items-center justify-between group"
				>
					<div class="flex items-center gap-3">
						<div
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-glow text-sm font-medium text-gold"
							style="font-family: 'Playfair Display', serif;"
						>
							{(selectedAppt.patient_name?.[0] || '?').toUpperCase()}
						</div>
						<div>
							<p class="text-sm font-medium text-text-primary group-hover:text-gold transition-colors">
								{selectedAppt.patient_name}
							</p>
							<p class="text-xs text-text-tertiary">View full contact record</p>
						</div>
					</div>
					<ChevronRight
						class="h-4 w-4 text-text-ghost group-hover:text-text-tertiary transition-colors"
					/>
				</a>
			</div>
		</div>
	</div>
{/if}
