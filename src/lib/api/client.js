import { get } from 'svelte/store';
import { session } from '$lib/stores/auth.js';
import { PUBLIC_API_URL } from '$env/static/public';

const API_URL = PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Fetch wrapper that attaches auth token and handles JSON
 * @param {string} path - API path (e.g. '/api/calls')
 * @param {RequestInit} [options]
 * @returns {Promise<any>}
 */
export async function api(path, options = {}) {
	const currentSession = get(session);
	const token = currentSession?.access_token;

	const res = await fetch(`${API_URL}${path}`, {
		...options,
		credentials: 'include',
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...options.headers
		}
	});

	if (!res.ok) {
		const body = await res.json().catch(() => ({ error: res.statusText }));
		throw new Error(body.error || `API Error: ${res.status}`);
	}

	if (res.status === 204) return null;
	return res.json();
}
