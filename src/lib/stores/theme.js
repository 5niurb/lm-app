import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Available themes:
 * - 'midnight' — Vivid Dark (near-black + multi-color accents)
 * - 'dusk'     — Warm Dark (warm-toned dark + violet accents)
 * - 'champagne' — Light (clean white + colorful accents)
 * - 'auto'     — Follow system preference
 *
 * @typedef {'midnight' | 'dusk' | 'champagne' | 'auto'} ThemeChoice
 * @typedef {'midnight' | 'dusk' | 'champagne'} ResolvedTheme
 */

const STORAGE_KEY = 'lm-theme';

/** @type {ThemeChoice} */
const defaultChoice = 'auto';

/**
 * @returns {ThemeChoice}
 */
function getStoredTheme() {
	if (!browser) return defaultChoice;
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === 'midnight' || stored === 'dusk' || stored === 'champagne' || stored === 'auto') {
		return stored;
	}
	return defaultChoice;
}

/**
 * @returns {ResolvedTheme}
 */
function getSystemTheme() {
	if (!browser) return 'midnight';
	const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
	return prefersDark ? 'midnight' : 'champagne';
}

export const themeChoice = writable(getStoredTheme());

if (browser) {
	const mq = window.matchMedia('(prefers-color-scheme: dark)');
	mq.addEventListener('change', () => {
		themeChoice.update((c) => c);
	});
}

export const theme = derived(themeChoice, ($choice) => {
	if ($choice === 'auto') return getSystemTheme();
	return /** @type {ResolvedTheme} */ ($choice);
});

/**
 * @param {ThemeChoice} choice
 */
export function setTheme(choice) {
	themeChoice.set(choice);
	if (browser) {
		localStorage.setItem(STORAGE_KEY, choice);
	}
}

/**
 * @param {ResolvedTheme} resolved
 */
export function applyTheme(resolved) {
	if (!browser) return;
	const html = document.documentElement;

	html.classList.remove('theme-midnight', 'theme-dusk', 'theme-champagne');
	html.classList.add(`theme-${resolved}`);

	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) {
		const colors = {
			midnight: '#09090b',
			dusk: '#0c0a09',
			champagne: '#fafafa'
		};
		meta.setAttribute('content', colors[resolved]);
	}

	html.style.colorScheme = resolved === 'champagne' ? 'light' : 'dark';
}

/** Theme display info for the switcher UI */
export const themes = [
	{
		id: /** @type {const} */ ('midnight'),
		label: 'Midnight',
		description: 'Vivid dark',
		colors: { bg: '#09090b', sidebar: '#0c0c0e', accent: '#d4a843' }
	},
	{
		id: /** @type {const} */ ('dusk'),
		label: 'Dusk',
		description: 'Warm dark',
		colors: { bg: '#0c0a09', sidebar: '#0a0908', accent: '#c9a24e' }
	},
	{
		id: /** @type {const} */ ('champagne'),
		label: 'Champagne',
		description: 'Clean light',
		colors: { bg: '#fafafa', sidebar: '#ffffff', accent: '#a0882e' }
	}
];
