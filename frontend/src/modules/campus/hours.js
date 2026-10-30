/**
 * How a place's hours read: "Open until 11:00 PM" from the live flags, and the
 * week grouped for the hours table with today on its own row.
 */
import { groupedHours, weekdayIndex, weeklyHours } from '../../utils/osmHours';
import { clockTime } from './time';

/**
 * The place's open state now: {open: true|false|null, until: "11:00 PM"|null}.
 * `open` is null when the place publishes no hours.
 */
export function openState(place, timezone) {
  if (place?.open_now === true) {
    const until = place.open_until ? clockTime(place.open_until, timezone) : null;
    return { open: true, until };
  }
  if (place?.open_now === false) return { open: false, until: null };
  return { open: null, until: null };
}

/** "Open until 11:00 PM", "Open now", "Closed now" or "Hours not listed". */
export function openUntil(place, timezone) {
  const state = openState(place, timezone);
  if (state.open === true) return state.until ? `Open until ${state.until}` : 'Open now';
  if (state.open === false) return 'Closed now';
  return 'Hours not listed';
}

/**
 * The week's rows for an OSM `opening_hours` string, Monday first, equal
 * neighbours grouped ("Mon–Fri"), today (in the campus zone at `now`) on its
 * own row and marked `today`. Null when the string isn't a simple form.
 */
export function weekHours(text, timezone, now = new Date()) {
  const week = weeklyHours(text);
  if (!week) return null;
  return groupedHours(week, weekdayIndex(now, timezone));
}
