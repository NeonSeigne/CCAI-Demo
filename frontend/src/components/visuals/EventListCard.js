import React from 'react';
import {
  ArrowRight, CalendarDays, CalendarPlus, ExternalLink, Footprints, MapPin,
} from '../icons';
import { downloadEventIcs } from '../../utils/ics';
import ContextLink from '../ContextLink';
import SaveButton from '../SaveButton';
import '../../styles/CourseVisuals.css';

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

/** "Tuesday, October 27": the date badge's words for screen readers. */
export function spokenDate(event, timezone) {
  if (!event?.start) return '';
  const options = { weekday: 'long', month: 'long', day: 'numeric' };
  try {
    return new Date(event.start).toLocaleDateString([], { ...options, ...(timezone ? { timeZone: timezone } : {}) });
  } catch {
    return new Date(event.start).toLocaleDateString([], options);
  }
}

/** /events?window=tonight&q=jazz, the page this card's search came from (14A). */
export function eventsPageLink(query) {
  const params = new URLSearchParams();
  if (query?.when) params.set('window', query.when);
  if (query?.keyword) params.set('q', query.keyword);
  const search = params.toString();
  return search ? `/events?${search}` : '/events';
}

/** "to 9:00 PM" under the start, or "Until Nov 30" for a run over several days. */
function endLine(event, timezone) {
  if (!event?.start || event.all_day || !event.end || event.end === event.start) return null;
  const range = formatEventRange(event, timezone);
  if (range.startsWith('Until')) return range;
  return `to ${safeTime(event.end, timezone)}`;
}

/** Events found by events_search, one row each, rendered from the tool result itself. */
export default function EventListCard({ visual, onAsk }) {
  const events = visual?.events || [];
  if (!events.length) return null;
  const timezone = visual.timezone;

  return (
    <section className="vc-card vc-events" aria-label="Events">
      <ul className="vc-events-list">
        {events.map((event) => {
          const parts = event.start ? dateParts(event, timezone) : null;
          const end = endLine(event, timezone);
          return (
            <li key={event.id || `${event.title}-${event.start}`} className="vc-evt">
              <div className="vc-time">
                {parts ? (
                  <span className="vc-date" aria-hidden="true">
                    <small>{parts.month}</small> <small>{parts.day}</small>
                  </span>
                ) : <CalendarDays size={18} />}
                <span>{formatEventTime(event, timezone)}</span>
                {end && <small>{end}</small>}
              </div>
              <div className="vc-what">
                {parts && <span className="sr-only">{spokenDate(event, timezone)}: </span>}
                <b>{event.title}</b>
                {event.location && (
                  <span>
                    <MapPin size={16} aria-hidden="true" />
                    <span>{event.location}</span>
                  </span>
                )}
                <div className="vc-evt-acts">
                  {event.start && (
                    <button type="button" className="vc-chip is-small" onClick={() => downloadEventIcs(event)}>
                      <CalendarPlus size={18} aria-hidden="true" />
                      Add to calendar
                    </button>
                  )}
                  {event.url && (
                    <a className="vc-chip is-small" href={event.url} target="_blank" rel="noopener noreferrer">
                      Event details <ExternalLink size={16} aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
              {hasPhysicalLocation(event.location) && onAsk ? (
                <button
                  type="button"
                  className="vc-walk"
                  onClick={() => onAsk(`How do I get to ${event.location}?`)}
                >
                  <Footprints size={18} aria-hidden="true" />
                  Directions
                </button>
              ) : <span />}
              <SaveButton
                className="vc-save"
                item={event.id ? {
                  kind: 'event',
                  key: event.id,
                  display_name: event.title,
                  event_start: event.start,
                  event_end: event.end,
                } : null}
              />
            </li>
          );
        })}
      </ul>
      {(visual.more > 0 || visual.query) && (
        <div className="vc-evt-more">
          {visual.more > 0 && <p>{visual.more} more on the calendar</p>}
          {visual.query && (
            <ContextLink className="vc-context-link" to={eventsPageLink(visual.query)}>
              See all on Events <ArrowRight size={16} aria-hidden="true" />
            </ContextLink>
          )}
        </div>
      )}
    </section>
  );
}
