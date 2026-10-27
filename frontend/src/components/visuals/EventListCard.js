import React from 'react';
import { CalendarDays, ExternalLink } from 'lucide-react';

const timeOptions = (timezone) => ({
  hour: 'numeric',
  minute: '2-digit',
  ...(timezone ? { timeZone: timezone } : {}),
});

const safeTime = (iso, timezone) => {
  try {
    return new Date(iso).toLocaleTimeString([], timeOptions(timezone));
  } catch {
    return new Date(iso).toLocaleTimeString([], timeOptions());
  }
};

/** False for "(Online)", "Zoom" and the like: nowhere to walk to. */
export function hasPhysicalLocation(location) {
  return Boolean(location) && !/\b(online|virtual|zoom|webinar|teams|livestream)\b/i.test(location);
}

/** "7:00 PM", or "All day" for all-day and multi-day (ongoing) events. */
export function formatEventTime(event, timezone) {
  if (!event?.start || event.all_day || event.ongoing) return 'All day';
  return safeTime(event.start, timezone);
}

const dayKey = (iso, timezone) => {
  try {
    return new Date(iso).toLocaleDateString('en-CA', timezone ? { timeZone: timezone } : {});
  } catch {
    return new Date(iso).toLocaleDateString('en-CA');
  }
};

/** "8:30 AM – 4:15 PM"; a run over several days reads "Until Nov 30". */
export function formatEventRange(event, timezone) {
  if (!event?.start || event.all_day) return 'All day';
  if (event.end && dayKey(event.end, timezone) !== dayKey(event.start, timezone)) {
    const until = new Date(event.end).toLocaleDateString([], {
      month: 'short', day: 'numeric', ...(timezone ? { timeZone: timezone } : {}),
    });
    return `Until ${until}`;
  }
  const start = safeTime(event.start, timezone);
  return event.end && event.end !== event.start ? `${start} – ${safeTime(event.end, timezone)}` : start;
}

function dateParts(event, timezone) {
  try {
    const date = new Date(event.start);
    const zone = timezone ? { timeZone: timezone } : {};
    return {
      month: date.toLocaleDateString([], { month: 'short', ...zone }).toUpperCase(),
      day: date.toLocaleDateString([], { day: 'numeric', ...zone }),
    };
  } catch {
    return null;
  }
}

const icsStamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const icsText = (value = '') => String(value)
  .replace(/\\/g, '\\\\')
  .replace(/\r?\n|\r/g, '\\n')
  .replace(/,/g, '\\,')
  .replace(/;/g, '\\;');

/** A one-event .ics file; all-day events use DATE values so no clock time shows. */
export function createEventIcs(event) {
  const timed = !event.all_day && event.start;
  const day = (iso) => new Date(iso).toISOString().slice(0, 10).replace(/-/g, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Campus Companion//Events//EN',
    'BEGIN:VEVENT',
    `UID:${icsStamp(event.start)}-${icsText(event.title).slice(0, 40)}@campus-companion`,
    `DTSTAMP:${icsStamp(Date.now())}`,
    timed ? `DTSTART:${icsStamp(event.start)}` : `DTSTART;VALUE=DATE:${day(event.start)}`,
    ...(timed && event.end ? [`DTEND:${icsStamp(event.end)}`] : []),
    `SUMMARY:${icsText(event.title)}`,
    ...(event.location ? [`LOCATION:${icsText(event.location)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

function downloadIcs(event) {
  const blob = new Blob([createEventIcs(event)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${String(event.title || 'event').replace(/[^\w]+/g, '-').slice(0, 60)}.ics`;
  anchor.click();
  // Revoking right away can cancel the download in Safari and Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Events found by events_search, one card each, rendered from the tool result itself. */
export default function EventListCard({ visual, onAsk }) {
  const events = visual?.events || [];
  if (!events.length) return null;
  const timezone = visual.timezone;

  return (
    <section className={`cc-events ${events.length > 1 ? 'cc-span' : ''}`} aria-label="Events">
      <ul>
        {events.map((event) => {
          const parts = event.start ? dateParts(event, timezone) : null;
          return (
            <li key={`${event.title}-${event.start}`} className="cc-card cc-event">
              <div className="cc-event-top">
                <span className="cc-event-date" aria-hidden="true">
                  {parts ? (
                    <>
                      <small>{parts.month}</small>
                      <b>{parts.day}</b>
                    </>
                  ) : <CalendarDays size={18} />}
                </span>
                <div className="cc-event-body">
                  <strong>{event.title}</strong>
                  <span className="cc-event-meta">
                    {[formatEventRange(event, timezone), event.location].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </div>
              <div className="cc-event-actions">
                {event.start && (
                  <button type="button" className="cc-ink-btn" onClick={() => downloadIcs(event)}>
                    Add to calendar
                  </button>
                )}
                {event.url && (
                  <a className="cc-soft-btn" href={event.url} target="_blank" rel="noopener noreferrer">
                    Event details <ExternalLink size={12} aria-hidden="true" />
                  </a>
                )}
                {hasPhysicalLocation(event.location) && onAsk && (
                  <button
                    type="button"
                    className="cc-soft-btn"
                    onClick={() => onAsk(`How do I get to ${event.location}?`)}
                  >
                    Directions
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {visual.more > 0 && <p className="cc-more">{visual.more} more on the calendar</p>}
    </section>
  );
}
