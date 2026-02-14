import { supabaseAdmin } from '../services/supabase.js';

// Default business hours: Mon-Sat, 9am-6pm Pacific
const DEFAULT_HOURS = {
  0: null,                // Sunday — closed
  1: { open: 9, close: 18 }, // Monday
  2: { open: 9, close: 18 }, // Tuesday
  3: { open: 9, close: 18 }, // Wednesday
  4: { open: 9, close: 18 }, // Thursday
  5: { open: 9, close: 18 }, // Friday
  6: { open: 9, close: 18 }, // Saturday
};

const TIMEZONE = 'America/Los_Angeles';

/**
 * Express middleware that restricts access to business hours.
 * Admins always pass through. Non-admin users receive 403 outside business hours.
 */
export async function checkBusinessHours(req, res, next) {
  // Admins always pass through
  if (req.user && req.user.role === 'admin') {
    return next();
  }

  let hours = DEFAULT_HOURS;

  // Try to read business hours from the settings table
  try {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'business_hours')
      .single();

    if (!error && data && data.value) {
      hours = data.value;
    }
  } catch (err) {
    // If settings table doesn't exist or query fails, fall back to defaults
    console.warn('Could not read business hours from settings, using defaults:', err.message);
  }

  // Get current time in Pacific timezone
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short'
  });

  const parts = formatter.formatToParts(now);
  const hourPart = parts.find(p => p.type === 'hour');
  const minutePart = parts.find(p => p.type === 'minute');
  const currentHour = parseInt(hourPart.value, 10);
  const currentMinute = parseInt(minutePart.value, 10);
  const currentTime = currentHour + currentMinute / 60;

  // Get the day of week in the target timezone
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'long'
  });
  const dayName = dayFormatter.format(now);
  const dayMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
  const dayOfWeek = dayMap[dayName];

  const todayHours = hours[dayOfWeek];

  // Closed today
  if (!todayHours) {
    return res.status(403).json({
      error: 'Outside business hours',
      message: 'The system is only available during business hours (Mon-Sat, 9am-6pm Pacific).'
    });
  }

  // Check if current time is within open/close range
  if (currentTime < todayHours.open || currentTime >= todayHours.close) {
    return res.status(403).json({
      error: 'Outside business hours',
      message: `The system is available ${todayHours.open}:00 - ${todayHours.close}:00 Pacific today.`
    });
  }

  next();
}
