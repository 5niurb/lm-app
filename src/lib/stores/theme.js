import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Available themes:
 * - 'midnight' — Dark + gold (signature LM look)
 * - 'dusk'     — Warm twilight (in-between)
 * - 'champagne' — Luxury light (cream + gold)
 * - 'auto'     — Follow system preference
 *
 * @typedef {'midnight' | 'dusk' | 'champagne' | 'auto'} ThemeChoice
 * @typedef {'midnight' | 'dusk' | 'champagne'} ResolvedTheme
 */

const STORAGE_KEY = 'lm-theme';

/** @type {ThemeChoice} */
const defaultChoice = 'auto';

/**
 * Read stored theme from localStorage
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
 * Detect system color-scheme preference
 * Maps: dark → midnight, light → champagne
 * @returns {ResolvedTheme}
 */
function getSystemTheme() {
	if (!browser) return 'midnight';
	const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
	return prefersDark ? 'midnight' : 'champagne';
}

/** The user's explicit theme choice (may be 'auto') */
export const themeChoice = writable(getStoredTheme());

// Listen for OS color scheme changes to re-trigger auto mode derivation
if (browser) {
	const mq = window.matchMedia('(prefers-color-scheme: dark)');
	mq.addEventListener('change', () => {
		// Nudge the store to re-derive when OS preference changes
		themeChoice.update((c) => c);
	});
}

/** The actual resolved theme after resolving 'auto' → system preference */
export const theme = derived(themeChoice, ($choice) => {
	if ($choice === 'auto') return getSystemTheme();
	return /** @type {ResolvedTheme} */ ($choice);
});

/**
 * Set the theme choice
 * @param {ThemeChoice} choice
 */
export function setTheme(choice) {
	themeChoice.set(choice);
	if (browser) {
		localStorage.setItem(STORAGE_KEY, choice);
	}
}

/**
 * Apply theme class to document.documentElement
 * Called from root layout's $effect
 * @param {ResolvedTheme} resolved
 */
export function applyTheme(resolved) {
	if (!browser) return;
	const html = document.documentElement;

	// Remove all theme classes
	html.classList.remove('theme-midnight', 'theme-dusk', 'theme-champagne');

	// Add current theme class
	html.classList.add(`theme-${resolved}`);

	// Update meta theme-color for mobile browsers
	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) {
		const colors = {
			midnight: '#000000',
			dusk: '#141210',
			champagne: '#fdfcf9'
		};
		meta.setAttribute('content', colors[resolved]);
	}

	// Update color-scheme for native form controls
	html.style.colorScheme = resolved === 'champagne' ? 'light' : 'dark';
}

/** Theme display info for the switcher UI */
export const themes = [
	{
		id: /** @type {const} */ ('midnight'),
		label: 'Midnight',
		description: 'Evening ambiance',
		colors: { bg: '#000000', sidebar: '#0f1e38', accent: '#d8b98f' }
	},
	{
		id: /** @type {const} */ ('dusk'),
		label: 'Dusk',
		description: 'Golden hour',
		colors: { bg: '#141210', sidebar: '#100e0c', accent: '#c8a87a' }
	},
	{
		id: /** @type {const} */ ('champagne'),
		label: 'Champagne',
		description: 'Morning light',
		colors: { bg: '#fdfcf9', sidebar: '#fdfcf9', accent: '#b89b76' }
	}
];
