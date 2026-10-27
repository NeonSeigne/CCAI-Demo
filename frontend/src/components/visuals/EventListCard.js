import React from 'react';
import { CalendarDays, ExternalLink, MapPin } from 'lucide-react';

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

function formatEventRange(event, timezone) {
  if (event.all_day || event.ongoing) return 'All day';
  const start = safeTime(event.start, timezone);
  return event.end && event.end !== event.start ? `${start} – ${safeTime(event.end, timezone)}` : start;
}

function dayLabel(event, timezone) {
  try {
    return new Date(event.start).toLocaleDateString([], {
      weekday: 'short', month: 'short', day: 'numeric', ...(timezone ? { timeZone: timezone } : {}),
    });
  } catch {
    return '';
  }
}

/** Events found by events_search, rendered from the tool result itself. */
export default function EventListCard({ visual, onAsk }) {
  const events = visual?.events || [];
  if (!events.length) return null;
  const timezone = visual.timezone;

  return (
    <section className="cc-card cc-events" aria-label="Events">
      <ul>
        {events.map((event) => (
          <li key={`${event.title}-${event.start}`} className="cc-event">
            <span className="cc-event-date" aria-hidden="true">
              <CalendarDays size={16} />
            </span>
            <div className="cc-event-body">
              <strong>{event.title}</strong>
              <span className="cc-event-meta">
                {dayLabel(event, timezone)} · {formatEventRange(event, timezone)}
              </span>
              {event.location && (
                <span className="cc-event-meta">
                  <MapPin size={13} aria-hidden="true" /> {event.location}
                </span>
              )}
            </div>
            <div className="cc-event-actions">
              {hasPhysicalLocation(event.location) && onAsk && (
                <button
                  type="button"
                  className="cc-chip-btn"
                  onClick={() => onAsk(`How do I get to ${event.location}?`)}
                >
                  Directions
                </button>
              )}
              {event.url && (
                <a className="cc-chip-btn" href={event.url} target="_blank" rel="noopener noreferrer">
                  Details <ExternalLink size={12} aria-hidden="true" />
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
      {visual.more > 0 && <p className="cc-card-foot">{visual.more} more on the calendar</p>}
    </section>
  );
}
