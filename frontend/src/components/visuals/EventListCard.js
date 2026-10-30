import React from 'react';
import {
  ArrowRight, CalendarDays, CalendarPlus, ExternalLink, Footprints, MapPin,
} from '../icons';
import { downloadEventIcs } from '../../utils/ics';
import ContextLink from '../ContextLink';
import SaveButton from '../SaveButton';
import {
  dateParts, endLine, eventTime, hasPhysicalLocation, spokenDate,
} from '../../modules/campus';
import '../../styles/CourseVisuals.css';

/** /events?window=tonight&q=jazz, the page this card's search came from (14A). */
export function eventsPageLink(query) {
  const params = new URLSearchParams();
  if (query?.when) params.set('window', query.when);
  if (query?.keyword) params.set('q', query.keyword);
  const search = params.toString();
  return search ? `/events?${search}` : '/events';
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
          const parts = event.start ? dateParts(event.start, timezone) : null;
          const end = endLine(event, timezone);
          return (
            <li key={event.id || `${event.title}-${event.start}`} className="vc-evt">
              <div className="vc-time">
                {parts ? (
                  <span className="vc-date" aria-hidden="true">
                    <small>{parts.month}</small> <small>{parts.day}</small>
                  </span>
                ) : <CalendarDays size={18} />}
                <span>{eventTime(event, timezone)}</span>
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
