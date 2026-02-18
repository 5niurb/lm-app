/**
 * Format a phone number as (XXX) XXX-XXXX
 * @param {string} phone
 * @returns {string}
 */
export function formatPhone(phone) {
	if (!phone) return '';
	const digits = phone.replace(/\D/g, '');
	// Strip leading 1 for US numbers
	const num = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
	if (num.length !== 10) return phone;
	return `(${num.slice(0, 3)}) ${num.slice(3, 6)}-${num.slice(6)}`;
}

/**
 * Format seconds into MM:SS or H:MM:SS
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
	if (!seconds || seconds <= 0) return '0:00';
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	const pad = (/** @type {number} */ n) => n.toString().padStart(2, '0');
	return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Format a date string relative to now (e.g. "2 hours ago", "Yesterday")
 * @param {string | Date} date
 * @returns {string}
 */
export function formatRelativeDate(date) {
	const d = new Date(date);
	const now = new Date();
	const diffMs = now.getTime() - d.getTime();
	const diffMin = Math.floor(diffMs / 60000);
	const diffHr = Math.floor(diffMs / 3600000);
	const diffDay = Math.floor(diffMs / 86400000);

	if (diffMin < 1) return 'Just now';
	if (diffMin < 60) return `${diffMin}m ago`;
	if (diffHr < 24) return `${diffHr}h ago`;
	if (diffDay === 1) return 'Yesterday';
	if (diffDay < 7) return `${diffDay}d ago`;
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format a date for display
 * @param {string | Date} date
 * @returns {string}
 */
export function formatDate(date) {
	return new Date(date).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
}

/**
 * Format a time for appointment display (e.g. "10:30 AM")
 * @param {string | Date} dateTime
 * @returns {string}
 */
export function formatTime(dateTime) {
	return new Date(dateTime).toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
	});
}

/**
 * Format a date for the appointments page header (e.g. "Tuesday, February 18")
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string}
 */
export function formatDateHeader(dateStr) {
	const d = new Date(dateStr + 'T12:00:00');
	return d.toLocaleDateString('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
	});
}

/**
 * Calculate duration in minutes between two datetime strings
 * @param {string} start
 * @param {string} end
 * @returns {number}
 */
export function getDurationMinutes(start, end) {
	return Math.round((new Date(end) - new Date(start)) / 60000);
}
