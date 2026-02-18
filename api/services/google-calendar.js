import { google } from 'googleapis';

// Build JWT auth from env vars (no keyfile needed)
const auth =
	process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
		? new google.auth.JWT(
				process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
				null,
				process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
				['https://www.googleapis.com/auth/calendar.readonly']
			)
		: null;

const calendar = auth ? google.calendar({ version: 'v3', auth }) : null;

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const TIMEZONE = 'America/Los_Angeles';

// Simple in-memory TTL cache (5 min)
let cache = { key: null, data: null, expiresAt: 0 };
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Fetch raw events from Google Calendar API.
 * @param {string} timeMin - RFC3339 timestamp
 * @param {string} timeMax - RFC3339 timestamp
 * @returns {Promise<Array>} raw Google Calendar event objects
 */
export async function fetchEvents(timeMin, timeMax) {
	if (!calendar || !CALENDAR_ID) {
		console.warn('[gcal] Google Calendar not configured — missing credentials or calendar ID');
		return [];
	}

	const cacheKey = `${timeMin}|${timeMax}`;
	if (cache.key === cacheKey && Date.now() < cache.expiresAt) {
		return cache.data;
	}

	const res = await calendar.events.list({
		calendarId: CALENDAR_ID,
		timeMin,
		timeMax,
		singleEvents: true,
		orderBy: 'startTime',
		maxResults: 250,
		timeZone: TIMEZONE,
	});

	const events = (res.data.items || []).map(parseEvent);
	cache = { key: cacheKey, data: events, expiresAt: Date.now() + CACHE_TTL };
	return events;
}

/**
 * Extract patient name from AR event title.
 * AR typically formats as "Patient Name - Service" or "Patient Name: Service" or just the name.
 * @param {string} summary
 * @returns {string}
 */
function extractPatientName(summary) {
	if (!summary) return '';
	// Try common delimiters AR might use
	for (const delim of [' - ', ': ', ' | ', ' — ']) {
		const idx = summary.indexOf(delim);
		if (idx > 0) return summary.slice(0, idx).trim();
	}
	return summary.trim();
}

/**
 * Extract service name from AR event title.
 * @param {string} summary
 * @returns {string}
 */
function extractService(summary) {
	if (!summary) return '';
	for (const delim of [' - ', ': ', ' | ', ' — ']) {
		const idx = summary.indexOf(delim);
		if (idx > 0) return summary.slice(idx + delim.length).trim();
	}
	return '';
}

/**
 * Normalize a Google Calendar event into our appointment shape.
 * @param {object} gcalEvent
 * @returns {object}
 */
export function parseEvent(gcalEvent) {
	const isAllDay = !gcalEvent.start?.dateTime;
	const start = gcalEvent.start?.dateTime || gcalEvent.start?.date;
	const end = gcalEvent.end?.dateTime || gcalEvent.end?.date;
	const summary = gcalEvent.summary || '';

	return {
		id: gcalEvent.id,
		title: summary,
		start,
		end,
		patient_name: extractPatientName(summary),
		service: extractService(summary),
		provider: gcalEvent.organizer?.displayName || null,
		status: gcalEvent.status || 'confirmed',
		location: gcalEvent.location || null,
		description: gcalEvent.description || null,
		all_day: isAllDay,
	};
}

/**
 * Get the start and end of a day in LA timezone as ISO strings.
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {{ timeMin: string, timeMax: string }}
 */
function dayBounds(dateStr) {
	// Create start/end in LA timezone
	const timeMin = new Date(`${dateStr}T00:00:00-08:00`).toISOString();
	const timeMax = new Date(`${dateStr}T23:59:59-08:00`).toISOString();
	return { timeMin, timeMax };
}

/**
 * Get appointments for a specific day.
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {Promise<Array>}
 */
export async function getEventsForDay(dateStr) {
	const { timeMin, timeMax } = dayBounds(dateStr);
	return fetchEvents(timeMin, timeMax);
}

/**
 * Get appointments for a date range.
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Promise<Array>}
 */
export async function getEventsForRange(startDate, endDate) {
	const timeMin = new Date(`${startDate}T00:00:00-08:00`).toISOString();
	const timeMax = new Date(`${endDate}T23:59:59-08:00`).toISOString();
	return fetchEvents(timeMin, timeMax);
}

/**
 * Get today's date string in LA timezone.
 * @returns {string} YYYY-MM-DD
 */
export function todayLA() {
	return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}
