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

	// Skip Content-Type for FormData (browser sets multipart boundary automatically)
	const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
	const callerSetContentType = isFormData || (options.headers && 'Content-Type' in options.headers);
	const res = await fetch(`${API_URL}${path}`, {
		...options,
		credentials: 'include',
		headers: {
			...(!callerSetContentType ? { 'Content-Type': 'application/json' } : {}),
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...options.headers
		}
	});

	if (!res.ok) {
		const body = await res.json().catch(() => ({ error: res.statusText }));
		throw new Error(body.error || body.message || `API Error: ${res.status}`);
	}

	if (res.status === 204) return null;
	return res.json();
}
