/**
 * Date-window helpers for the Events page, all in the campus time zone.
 *
 * Days are handled as 'YYYY-MM-DD' keys in the campus zone, so a 23:30 event
 * stays on its campus day whatever the browser's zone is. The window names
 * and their day spans mirror backend/app/sources/ical_events.window_bounds.
 */

export const WINDOWS = [
  { id: 'today', label: 'Today' },
  { id: 'tonight', label: 'Tonight' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'this_weekend', label: 'This weekend' },
  { id: 'this_week', label: 'This week' },
  { id: 'next_7_days', label: 'Next 7 days' },
];

export const WINDOW_IDS = WINDOWS.map((w) => w.id);

export const windowLabel = (id) => WINDOWS.find((w) => w.id === id)?.label || 'Today';

const zoneOption = (timezone) => (timezone ? { timeZone: timezone } : {});

/** toLocale* with the campus zone, falling back to the browser's zone if the name is bad. */
function inZone(fn, timezone) {
  try {
    return fn(zoneOption(timezone));
  } catch {
    return fn({});
  }
}

/** 'YYYY-MM-DD' of an instant on the campus calendar. */
export function dayKey(value, timezone) {
  const date = value instanceof Date ? value : new Date(value);
  return inZone((zone) => date.toLocaleDateString('en-CA', zone), timezone);
}

/** Minutes after campus midnight for an instant. */
export function minutesOfDay(value, timezone) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = inZone(
    (zone) => new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...zone })
      .formatToParts(date),
    timezone,
  );
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return (get('hour') % 24) * 60 + get('minute');
}

const noon = (key) => new Date(`${key}T12:00:00Z`);

export function addDays(key, count) {
  const date = noon(key);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday. */
export const weekdayOf = (key) => noon(key).getUTCDay();

/** Formats a day key, e.g. {weekday: 'short', month: 'short', day: 'numeric'} → "Wed, Oct 28". */
export const formatDay = (key, options) => noon(key).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });

const shortDate = (key) => formatDay(key, { month: 'short', day: 'numeric' });

/** The campus days a window covers, first to last. */
export function windowDays(window, todayKey) {
  const span = (from, count) => Array.from({ length: count }, (_, i) => addDays(from, i));
  const weekday = weekdayOf(todayKey);
  switch (window) {
    case 'tomorrow':
      return [addDays(todayKey, 1)];
    case 'this_weekend':
      if (weekday === 6) return span(todayKey, 2);
      if (weekday === 0) return [todayKey];
      return span(addDays(todayKey, 6 - weekday), 2);
    case 'this_week':
      return span(todayKey, ((7 - weekday) % 7) + 1);
    case 'next_7_days':
      return span(todayKey, 7);
    default: // today, tonight
      return [todayKey];
  }
}

/** "Oct 27 – Nov 2", or one date when the span is a single day. */
export function rangeLabel(days) {
  if (!days.length) return '';
  const first = shortDate(days[0]);
  const last = shortDate(days[days.length - 1]);
  return first === last ? first : `${first} – ${last}`;
}

/** The results heading for a window (8A): "Today", "Tonight", "This weekend", "Oct 27 – Nov 2". */
export function windowHeading(window, todayKey) {
  if (window === 'this_week' || window === 'next_7_days') return rangeLabel(windowDays(window, todayKey));
  return windowLabel(window);
}

/** "today", "tonight", "this weekend", "Oct 27 – Nov 2": the window inside a sentence. */
export function windowPhrase(window, todayKey) {
  if (window === 'this_week' || window === 'next_7_days') return rangeLabel(windowDays(window, todayKey));
  return windowLabel(window).toLowerCase();
}

/** "Today", "Tomorrow" or "Thu, Oct 29" for a day key. */
export function relativeDay(key, todayKey) {
  if (key === todayKey) return 'Today';
  if (key === addDays(todayKey, 1)) return 'Tomorrow';
  return formatDay(key, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "Central Time" for America/Chicago; the zone id when the browser can't name it. */
export function zoneName(timezone) {
  if (!timezone) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longGeneric' })
      .formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value || timezone;
  } catch {
    return timezone;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True for events drawn in the all-day row: all-day, already running (multi-day
 * runs the feed marks `ongoing`), or lasting a day or more. A 10 PM - 1 AM
 * event stays a timed block.
 */
export function isAllDayLike(event) {
  if (event.all_day || event.ongoing || !event.start) return true;
  return Boolean(event.end) && new Date(event.end) - new Date(event.start) >= DAY_MS;
}

/** The campus days an event covers (all-day ends are exclusive, as in iCalendar). */
/** [first, last] day keys the event covers; an end at midnight doesn't count that day. */
export function eventSpan(event, timezone) {
  const first = dayKey(event.start, timezone);
  if (!event.end) return [first, first];
  let last = dayKey(event.end, timezone);
  if (event.all_day || minutesOfDay(event.end, timezone) === 0) last = addDays(last, -1);
  return [first, last < first ? first : last];
}

/** Whether the event runs on day *key*, however long it runs (exhibitions span months). */
export function coversDay(event, key, timezone) {
  const [first, last] = eventSpan(event, timezone);
  return first <= key && key <= last;
}

/** The day an event is listed under within the window's days. */
export function listingDay(event, days, timezone) {
  return days.find((key) => coversDay(event, key, timezone)) || eventSpan(event, timezone)[0];
}
