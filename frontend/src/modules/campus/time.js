/**
 * How the app writes campus times: event times and ranges, countdowns, dates,
 * class meeting clocks and opening-hours clocks. Every function takes the
 * school's time zone (a bad or missing zone falls back to the browser's) and,
 * where the answer depends on the clock, an injected `now`, so tests and the
 * screenshot check share one fixed date.
 */

const LOCALE = 'en-US';
const DAY_MS = 24 * 60 * 60 * 1000;

const toDate = (value) => (value instanceof Date ? value : new Date(value));
const valid = (date) => !Number.isNaN(date.getTime());

/**
 * `date.toLocale{Time,Date,}String(LOCALE, options)` in the campus zone,
 * retried without the zone when the browser doesn't know it.
 */
export function formatIn(value, timezone, options, method = 'toLocaleString') {
  const date = toDate(value);
  try {
    return date[method](LOCALE, { ...options, ...(timezone ? { timeZone: timezone } : {}) });
  } catch {
    return date[method](LOCALE, options);
  }
}

/** "7:00 PM" for an instant in the campus zone; null when it isn't a date. */
export function clockTime(value, timezone) {
  if (value == null || value === '') return null;
  const date = toDate(value);
  if (!valid(date)) return null;
  return formatIn(date, timezone, { hour: 'numeric', minute: '2-digit' }, 'toLocaleTimeString');
}

/** 'YYYY-MM-DD' of an instant on the campus calendar. */
export function campusDay(value, timezone) {
  const date = toDate(value);
  try {
    return date.toLocaleDateString('en-CA', timezone ? { timeZone: timezone } : {});
  } catch {
    return date.toLocaleDateString('en-CA');
  }
}

/** "Wednesday, Oct 29" (or any `options`) for a date in the campus zone. */
export function dateLabel(value, timezone, options = { weekday: 'long', month: 'short', day: 'numeric' }) {
  const date = toDate(value);
  if (!valid(date)) return '';
  return formatIn(date, timezone, options, 'toLocaleDateString');
}

/** {month: "OCT", day: "29"} for a date badge; null when it isn't a date. */
export function dateParts(value, timezone) {
  const date = toDate(value);
  if (!valid(date)) return null;
  return {
    month: dateLabel(date, timezone, { month: 'short' }).toUpperCase(),
    day: dateLabel(date, timezone, { day: 'numeric' }),
  };
}

/** "Tuesday, October 27": a date badge's words for screen readers. */
export function spokenDate(event, timezone) {
  if (!event?.start) return '';
  return dateLabel(event.start, timezone, { weekday: 'long', month: 'long', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Events

/** True for an event drawn without a clock: all-day, already running (`ongoing`), or no start. */
export const isAllDay = (event) => !event?.start || Boolean(event.all_day) || Boolean(event.ongoing);

/** True when the event runs past the campus day it starts on. */
export function isMultiDay(event, timezone) {
  if (!event?.start || !event.end || event.all_day) return false;
  return campusDay(event.end, timezone) !== campusDay(event.start, timezone);
}

/** "7:00 PM", or "All day" for all-day and multi-day (ongoing) events. */
export function eventTime(event, timezone) {
  if (isAllDay(event)) return 'All day';
  return clockTime(event.start, timezone) || 'All day';
}

/** "8:30 AM – 4:15 PM"; a run over several days reads "Until Nov 30"; no end gives the start alone. */
export function eventRange(event, timezone) {
  if (!event?.start || event.all_day) return 'All day';
  if (isMultiDay(event, timezone)) return `Until ${dateLabel(event.end, timezone, { month: 'short', day: 'numeric' })}`;
  const start = clockTime(event.start, timezone);
  return event.end && event.end !== event.start ? `${start} – ${clockTime(event.end, timezone)}` : start;
}

/** "to 9:00 PM" under a start time, or "Until Nov 30" for a run over several days; null without an end. */
export function endLine(event, timezone) {
  if (!event?.start || event.all_day || !event.end || event.end === event.start) return null;
  const range = eventRange(event, timezone);
  if (range.startsWith('Until')) return range;
  return `to ${clockTime(event.end, timezone)}`;
}

const MERIDIEM = /\s?[AP]M$/;

/**
 * The two halves of a range with the start's meridiem dropped when the end
 * repeats it: {start: "12:00", end: "1:00 PM"}; {start: "11:00 AM", end: "1:00 PM"}.
 */
export function rangeParts(event, timezone) {
  const range = eventRange(event, timezone);
  const [from, to] = range.split(' – ');
  if (!to) return { start: from, end: null };
  const same = from.match(MERIDIEM)?.[0].trim() === to.match(MERIDIEM)?.[0].trim();
  return { start: same ? from.replace(MERIDIEM, '') : from, end: to };
}

/** Today's countdown wording: "38 min", "2h 05m", "3 days". */
export function spanText(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
  return `${Math.floor(hours / 24)} days`;
}

/** The mockups' countdown wording: "Now", "38 min", "2 h 40 m", "3 days". */
export function durationText(ms) {
  if (ms <= 0) return 'Now';
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return minutes % 60 ? `${hours} h ${minutes % 60} m` : `${hours} h`;
  return `${Math.floor(hours / 24)} days`;
}

/**
 * {label, value, ms, live} for an event's first number: "Starts in" before it
 * starts, "Ends in" while it runs. Null for all-day, multi-day runs, an event
 * that's over, or a start that isn't a date. `value` is today's wording
 * (`spanText`); `durationText(ms)` gives the mockups'.
 */
export function countdown(event, now = new Date()) {
  if (isAllDay(event)) return null;
  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : null;
  if (!valid(start)) return null;
  const clock = toDate(now);
  if (start > clock) return { label: 'Starts in', ms: start - clock, value: spanText(start - clock), live: false };
  if (end && end > clock) return { label: 'Ends in', ms: end - clock, value: spanText(end - clock), live: true };
  return null;
}

/**
 * Everything a screen says about when an event is, in the campus zone:
 *
 *   allDay     all-day, ongoing, or no start
 *   multiDay   runs past its first campus day
 *   day        'YYYY-MM-DD' of the start (null without one)
 *   time       "7:00 PM" or "All day"
 *   range      "8:30 AM – 4:15 PM", "Until Nov 30" or "All day"
 *   start/end  the range's halves, start's meridiem dropped when shared ("12:00", "1:00 PM")
 *   endLine    "to 9:00 PM" / "Until Nov 30" / null
 *   countdown  see `countdown`
 *   live       running now
 *   over       ended (or started, with no end) before `now`
 */
export function eventWhen(event, timezone, now = new Date()) {
  const allDay = isAllDay(event);
  const multiDay = isMultiDay(event, timezone);
  const clock = toDate(now);
  const timer = countdown(event, clock);
  const parts = event?.start && !allDay && !multiDay ? rangeParts(event, timezone) : { start: null, end: null };
  const lastMoment = event?.end || event?.start;
  return {
    allDay,
    multiDay,
    day: event?.start ? campusDay(event.start, timezone) : null,
    time: eventTime(event, timezone),
    range: eventRange(event, timezone),
    start: parts.start,
    end: parts.end,
    endLine: endLine(event, timezone),
    countdown: timer,
    live: Boolean(timer?.live),
    over: Boolean(lastMoment) && !timer && valid(new Date(lastMoment)) && new Date(lastMoment) <= clock && !allDay,
  };
}

/** True when an event lasts a day or more (Events' all-day row). */
export const lastsADay = (event) => Boolean(event?.end) && new Date(event.end) - new Date(event.start) >= DAY_MS;

// ---------------------------------------------------------------------------
// Clock strings

const hhmm = (time) => {
  const [h, m] = String(time || '').split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

/** A class meeting's "13:05" -> "1:05" (the week grid and section rows). */
export function meetingClock(time) {
  const total = hhmm(time);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`;
}

/** Opening hours' "07:30" -> "7:30 am", "24:00" -> "12 am", "12:00" -> "12 pm". */
export function openingClock(hours, minutes) {
  const h = Number(hours) % 24;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return Number(minutes) ? `${h12}:${String(minutes).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}
