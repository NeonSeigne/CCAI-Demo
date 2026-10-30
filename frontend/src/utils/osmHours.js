/**
 * Weekly hours from an OpenStreetMap `opening_hours` string, for the place
 * sheet. Reads the same simple forms the backend parser does
 * (`backend/app/sources/hours.py`): "24/7", "Mo-Fr 07:30-02:00; Sa 10:00-21:00",
 * "off". Anything else (holidays, months, week numbers) returns null, so the
 * sheet leaves the hours out rather than guessing.
 */

import { openingClock as clockText } from '../modules/campus/time';

export const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_RE = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/;
// The backend's time pattern (hours.py `_TIME`): 00:00 to 24:00. An end at or
// before the start runs past midnight ("07:30-02:00").
const TIME_RE = /^([01]\d|2[0-4]):([0-5]\d)\s*-\s*([01]\d|2[0-4]):([0-5]\d)$/;
const SELECTOR_RE = /^(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*$/;

function days(selector) {
  const out = [];
  for (const part of selector.split(',')) {
    const match = DAY_RE.exec(part);
    if (!match) return null;
    const first = DAYS.indexOf(match[1]);
    const last = match[2] ? DAYS.indexOf(match[2]) : first;
    for (let i = 0; i <= (last - first + 7) % 7; i += 1) out.push((first + i) % 7);
  }
  return out;
}

function times(text) {
  if (/^(off|closed)$/i.test(text)) return [];
  const out = [];
  for (const part of text.split(',')) {
    const match = TIME_RE.exec(part.trim());
    if (!match) return null;
    const start = Number(match[1]) * 60 + Number(match[2]);
    const end = Number(match[3]) * 60 + Number(match[4]);
    if (start >= 24 * 60 || end > 24 * 60) return null;
    if (start === 0 && end === 24 * 60) out.push('Open 24 hours');
    else out.push(`${clockText(match[1], match[2])} – ${clockText(match[3], match[4])}`);
  }
  return out;
}

/**
 * `[{day: 0..6, label: 'Mon', text: '7:30 am – 2 am' | 'Closed'}]` for the
 * week (Monday first), or null when the string isn't one of the simple forms.
 */
export function weeklyHours(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  const week = DAYS.map(() => null);
  if (value === '24/7') return DAYS.map((_, day) => ({ day, label: DAY_NAMES[day], text: 'Open 24 hours' }));
  const rules = value.split(/\s*;\s*|,\s+(?=(?:Mo|Tu|We|Th|Fr|Sa|Su)\b)/).filter(Boolean);
  for (const rule of rules) {
    const space = rule.indexOf(' ');
    const head = space > 0 ? rule.slice(0, space) : rule;
    let selected;
    let rest;
    if (SELECTOR_RE.test(head)) {
      selected = days(head);
      rest = rule.slice(space + 1).trim();
      if (space < 0) return null;
    } else {
      selected = DAYS.map((_, i) => i);
      rest = rule.trim();
    }
    const ranges = times(rest);
    if (!selected || ranges === null) return null;
    selected.forEach((day) => { week[day] = ranges; });
  }
  if (week.every((ranges) => ranges === null)) return null;
  return week.map((ranges, day) => ({
    day,
    label: DAY_NAMES[day],
    text: ranges && ranges.length ? ranges.join(', ') : 'Closed',
  }));
}

/**
 * Consecutive days with the same hours grouped ("Mon–Thu"), except `today`
 * (0..6, Monday first), which always gets its own row. A day on its own
 * reads in full ("Friday").
 */
export function groupedHours(week, today) {
  const rows = [];
  (week || []).forEach((entry) => {
    const last = rows[rows.length - 1];
    if (last && last.text === entry.text && !last.today && entry.day !== today) {
      last.to = entry.label;
      last.label = `${last.from}–${entry.label}`;
    } else {
      rows.push({ ...entry, from: entry.label, today: entry.day === today });
    }
  });
  return rows.map((row) => (row.to ? row : { ...row, label: DAY_FULL[row.day] || row.label }));
}

/** Monday-first weekday index (0..6) of `now` in `timezone`. */
export function weekdayIndex(now, timezone) {
  let name;
  try {
    name = now.toLocaleDateString('en-US', { weekday: 'short', ...(timezone ? { timeZone: timezone } : {}) });
  } catch {
    name = now.toLocaleDateString('en-US', { weekday: 'short' });
  }
  return DAY_NAMES.indexOf(name.slice(0, 3));
}
