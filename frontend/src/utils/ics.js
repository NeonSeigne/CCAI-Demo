/** One-event .ics files for "Add to calendar", shared by chat cards and pages. */

const icsStamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const icsText = (value = '') => String(value)
  .replace(/\\/g, '\\\\')
  .replace(/\r?\n|\r/g, '\\n')
  .replace(/,/g, '\\,')
  .replace(/;/g, '\\;');
const icsDay = (date) => date.toISOString().slice(0, 10).replace(/-/g, '');

/**
 * DTEND for an all-day event: iCalendar's end date is exclusive, the day after
 * the last day. The backend's `end` is already that exclusive end; without a
 * usable one the event covers its start day only.
 */
function allDayEnd(event) {
  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : null;
  if (end && !Number.isNaN(end.getTime()) && icsDay(end) > icsDay(start)) return icsDay(end);
  const next = new Date(start);
  next.setUTCDate(next.getUTCDate() + 1);
  return icsDay(next);
}

/**
 * A one-event .ics file; all-day events use DATE values so no clock time shows.
 * The UID is the event's feed id when it has one, so downloading an event again
 * updates the calendar entry instead of adding a second one.
 */
export function createEventIcs(event) {
  const timed = !event.all_day && event.start;
  const uid = event.id
    ? icsText(event.id)
    : `${icsStamp(event.start)}-${icsText(event.title).slice(0, 40)}@campus-companion`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Campus Companion//Events//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsStamp(Date.now())}`,
    timed ? `DTSTART:${icsStamp(event.start)}` : `DTSTART;VALUE=DATE:${icsDay(new Date(event.start))}`,
    ...(timed && event.end ? [`DTEND:${icsStamp(event.end)}`] : []),
    ...(timed ? [] : [`DTEND;VALUE=DATE:${allDayEnd(event)}`]),
    `SUMMARY:${icsText(event.title)}`,
    ...(event.location ? [`LOCATION:${icsText(event.location)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

/** "Jazz-Night.ics": the title with runs of non-word characters dashed. */
export function icsFilename(event) {
  return `${String(event.title || 'event').replace(/[^\w]+/g, '-').slice(0, 60)}.ics`;
}

/** Downloads the event's .ics file. */
export function downloadEventIcs(event) {
  const blob = new Blob([createEventIcs(event)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = icsFilename(event);
  anchor.click();
  // Revoking right away can cancel the download in Safari and Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
