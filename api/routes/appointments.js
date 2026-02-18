import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { logAction } from '../middleware/auditLog.js';
import { getEventsForDay, getEventsForRange, todayLA } from '../services/google-calendar.js';

const router = Router();

// All appointment routes require authentication
router.use(verifyToken);

/**
 * GET /api/appointments
 * List appointments from Google Calendar.
 *
 * Query params:
 *   date     - YYYY-MM-DD (returns that day's appointments)
 *   start    - YYYY-MM-DD (range start, used with end)
 *   end      - YYYY-MM-DD (range end, used with start)
 *   provider - filter by provider name
 *
 * Default: today's appointments.
 */
router.get('/', logAction('appointments.list'), async (req, res) => {
	try {
		const { date, start, end, provider } = req.query;
		let events;

		if (date) {
			events = await getEventsForDay(date);
		} else if (start && end) {
			events = await getEventsForRange(start, end);
		} else {
			events = await getEventsForDay(todayLA());
		}

		if (provider) {
			events = events.filter((e) => e.provider === provider);
		}

		res.json({ data: events, count: events.length });
	} catch (err) {
		console.error('[appointments] fetch failed:', err.message);
		res.status(500).json({ error: 'Failed to fetch appointments' });
	}
});

/**
 * GET /api/appointments/today
 * Convenience: returns today's appointments sorted by start time.
 */
router.get('/today', logAction('appointments.today'), async (req, res) => {
	try {
		const events = await getEventsForDay(todayLA());
		res.json({ data: events, count: events.length });
	} catch (err) {
		console.error('[appointments] today fetch failed:', err.message);
		res.status(500).json({ error: 'Failed to fetch appointments' });
	}
});

/**
 * GET /api/appointments/stats
 * Summary counts for dashboard widget.
 * Returns: { today, thisWeek, nextAppointment }
 */
router.get('/stats', logAction('appointments.stats'), async (req, res) => {
	try {
		const today = todayLA();

		// Calculate Monday-Sunday of current week
		const now = new Date();
		const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
		const monday = new Date(now);
		monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
		const sunday = new Date(monday);
		sunday.setDate(monday.getDate() + 6);

		const mondayStr = monday.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
		const sundayStr = sunday.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

		const [todayEvents, weekEvents] = await Promise.all([
			getEventsForDay(today),
			getEventsForRange(mondayStr, sundayStr),
		]);

		// Find next upcoming appointment (today, after now)
		const nowMs = Date.now();
		const upcoming = todayEvents.find((e) => new Date(e.start).getTime() > nowMs);

		res.json({
			today: todayEvents.length,
			thisWeek: weekEvents.length,
			nextAppointment: upcoming || null,
		});
	} catch (err) {
		console.error('[appointments] stats failed:', err.message);
		res.status(500).json({ error: 'Failed to fetch appointment stats' });
	}
});

export default router;
