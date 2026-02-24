<script>
	import { Play, Pause, Square, Download } from '@lucide/svelte';
	import { PUBLIC_API_URL } from '$env/static/public';
	import { get } from 'svelte/store';
	import { session } from '$lib/stores/auth.js';

	/**
	 * @type {{
	 *   src: string,
	 *   duration?: number
	 * }}
	 */
	let { src, duration: initialDuration = 0 } = $props();

	const API_BASE = PUBLIC_API_URL || 'http://localhost:3001';

	/** @type {HTMLAudioElement|null} */
	let audioEl = $state(null);
	let playing = $state(false);
	let currentTime = $state(0);
	let duration = $state(initialDuration);
	let loading = $state(false);
	let speed = $state(1);
	/** @type {string|null} */
	let blobUrl = $state(null);

	const SPEEDS = [0.5, 1, 1.5, 2];

	/** Format seconds as m:ss */
	function fmt(s) {
		if (!s || isNaN(s)) return '0:00';
		const m = Math.floor(s / 60);
		const sec = Math.floor(s % 60);
		return `${m}:${sec.toString().padStart(2, '0')}`;
	}

	async function loadAudio() {
		if (blobUrl) return;
		loading = true;
		try {
			const token = get(session)?.access_token;
			const url = src.startsWith('http') ? src : `${API_BASE}${src}`;
			const res = await fetch(url, {
				headers: token ? { Authorization: `Bearer ${token}` } : {}
			});
			if (!res.ok) throw new Error('Failed to load audio');
			const blob = await res.blob();
			blobUrl = URL.createObjectURL(blob);
		} catch (e) {
			console.error('AudioPlayer load error:', e);
		} finally {
			loading = false;
		}
	}

	async function togglePlay() {
		if (!blobUrl) {
			await loadAudio();
			if (!blobUrl) return;
		}
		if (!audioEl) return;

		if (playing) {
			audioEl.pause();
			playing = false;
		} else {
			audioEl.playbackRate = speed;
			await audioEl.play();
			playing = true;
		}
	}

	function handleTimeUpdate() {
		if (audioEl) currentTime = audioEl.currentTime;
	}

	function handleLoadedMetadata() {
		if (audioEl && audioEl.duration && isFinite(audioEl.duration)) {
			duration = audioEl.duration;
		}
	}

	function handleEnded() {
		playing = false;
		currentTime = 0;
	}

	function seek(e) {
		const bar = e.currentTarget;
		const rect = bar.getBoundingClientRect();
		const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		if (audioEl && duration) {
			audioEl.currentTime = pct * duration;
			currentTime = audioEl.currentTime;
		}
	}

	function cycleSpeed() {
		const idx = SPEEDS.indexOf(speed);
		speed = SPEEDS[(idx + 1) % SPEEDS.length];
		if (audioEl) audioEl.playbackRate = speed;
	}

	function handleDownload() {
		if (!blobUrl) return;
		const a = document.createElement('a');
		a.href = blobUrl;
		a.download = 'recording.mp3';
		a.click();
	}

	let progress = $derived(duration > 0 ? (currentTime / duration) * 100 : 0);
</script>

<div class="flex items-center gap-2 rounded-lg bg-surface-subtle/50 px-3 py-2">
	{#if blobUrl}
		<audio
			bind:this={audioEl}
			src={blobUrl}
			ontimeupdate={handleTimeUpdate}
			onloadedmetadata={handleLoadedMetadata}
			onended={handleEnded}
			preload="metadata"
		></audio>
	{/if}

	<!-- Play/Pause -->
	<button
		type="button"
		class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-vivid-emerald/20 text-vivid-emerald hover:bg-vivid-emerald/30 transition-colors"
		onclick={togglePlay}
		disabled={loading}
		title={playing ? 'Pause' : 'Play'}
	>
		{#if loading}
			<div
				class="h-3 w-3 border-2 border-vivid-emerald border-t-transparent rounded-full animate-spin"
			></div>
		{:else if playing}
			<Pause class="h-3.5 w-3.5" />
		{:else}
			<Play class="h-3.5 w-3.5 ml-0.5" />
		{/if}
	</button>

	<!-- Progress bar -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="flex-1 h-1.5 rounded-full bg-surface-hover cursor-pointer relative" onclick={seek}>
		<div
			class="absolute inset-y-0 left-0 rounded-full bg-vivid-emerald transition-[width] duration-100"
			style="width: {progress}%"
		></div>
	</div>

	<!-- Time -->
	<span class="text-[10px] text-text-tertiary tabular-nums shrink-0 min-w-[60px] text-center">
		{fmt(currentTime)} / {fmt(duration)}
	</span>

	<!-- Speed -->
	<button
		type="button"
		class="text-[10px] font-bold text-text-tertiary hover:text-text-secondary px-1 shrink-0 transition-colors"
		onclick={cycleSpeed}
		title="Playback speed"
	>
		{speed}x
	</button>

	<!-- Download -->
	<button
		type="button"
		class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-colors"
		onclick={handleDownload}
		disabled={!blobUrl}
		title="Download recording"
	>
		<Download class="h-3 w-3" />
	</button>
</div>
