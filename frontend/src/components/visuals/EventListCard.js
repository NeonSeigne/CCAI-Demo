import React from 'react';
import { Icon } from '../icons';
import { downloadEventIcs } from '../../utils/ics';
import { addDays, zoneName } from '../../utils/eventWindows';
import SaveButton from '../SaveButton';
import {
  campusDay, dateLabel, eventWhen, hasPhysicalLocation, isHere, walkText,
} from '../../modules/campus';
import '../../styles/CourseVisuals.css';

/** The domain dot for an event's kind (components.css `.kd`); null when the feed has none. */
const KIND_DOMAIN = {
  academic: 'academics',
  campus_life: 'life',
  arts: 'life',
  athletics: 'life',
  career: 'life',
};

/**
 * The events grouped by their campus date (design Q10): "Later today",
 * "Tomorrow", then "Saturday, Nov 1". Running and undated events sit with
 * today. Groups come in date order; rows keep the search's order.
 */
export function groupEvents(events, timezone, now = new Date()) {
  const today = campusDay(now, timezone);
  const tomorrow = addDays(today, 1);
  const groups = new Map();
  (events || []).forEach((event) => {
    let key = event?.start ? campusDay(event.start, timezone) : today;
    if (!key || event?.ongoing || key < today) key = today;
    if (!groups.has(key)) {
      let label;
      if (key === today) label = 'Later today';
      else if (key === tomorrow) label = 'Tomorrow';
      else label = dateLabel(event.start, timezone, { weekday: 'long', month: 'short', day: 'numeric' });
      groups.set(key, { key, label, events: [] });
    }
    groups.get(key).events.push(event);
  });
  return [...groups.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** "12:30" over "to 1:30 PM"; "7:00 PM" alone without an end; "All day". */
function timeLines(event, timezone, now) {
  const when = eventWhen(event, timezone, now);
  if (when.allDay) return { main: when.time, sub: null };
  if (when.multiDay) return { main: when.time, sub: when.endLine };
  return { main: when.start || when.time, sub: when.end ? `to ${when.end}` : null };
}

function EventRow({ event, timezone, now }) {
  const { main, sub } = timeLines(event, timezone, now);
  const domain = KIND_DOMAIN[event.kind] || null;
  const place = event.place_name || event.location;
  const walk = hasPhysicalLocation(event.location) ? walkText(event.walk_minutes) : null;
  return (
    <li className="vc-evt">
      <div className="vc-time">
        {main}
        {sub && <small>{sub}</small>}
      </div>
      <div className="vc-what">
        <b>{event.title}</b>
        {place && (
          <span>
            {domain && <i className={`vc-kd is-${domain}`} aria-hidden="true" />}
            <span>{place}</span>
          </span>
        )}
      </div>
      {walk ? (
        <span className="vc-walk">
          <Icon name="directions_walk" size={18} />
          {walk}
          {!isHere(event.walk_minutes) && <span className="sr-only"> walk</span>}
        </span>
      ) : <span />}
      <div className="vc-acts">
        {event.start && (
          <button
            type="button"
            className="vc-icon-btn"
            aria-label={`Add ${event.title} to calendar`}
            title="Add to calendar"
            onClick={() => downloadEventIcs(event)}
          >
            <Icon name="calendar_add_on" size={21} />
          </button>
        )}
        <SaveButton
          className="vc-icon-btn"
          item={event.id ? {
            kind: 'event',
            key: event.id,
            display_name: event.title,
            event_start: event.start,
            event_end: event.end,
          } : null}
        />
      </div>
    </li>
  );
}

/**
 * Events found by events_search (chat-campus): grouped by date in the
 * school's zone, one row each with the time, the place and its domain dot,
 * the walk when it's known, and calendar and bookmark buttons.
 *
 * `now` is for tests; the card reads the clock otherwise.
 */
export default function EventListCard({ visual, now }) {
  const events = visual?.events || [];
  if (!events.length) return null;
  const timezone = visual.timezone;
  const clock = now || new Date();
  const groups = groupEvents(events, timezone, clock);
  const zone = zoneName(timezone);

  return (
    <section className="vc-card vc-events" aria-label="Events">
      {groups.map((group, index) => (
        <div key={group.key} className="vc-evt-group">
          <div className="vc-head">
            {index === 0 && <Icon name="event" size={20} />}
            <h3>{group.label}</h3>
            {index === 0 && zone && <span className="vc-zone">{`Times in ${zone}`}</span>}
          </div>
          <ul className="vc-events-list" aria-label={group.label}>
            {group.events.map((event) => (
              <EventRow key={event.id || `${event.title}-${event.start}`} event={event} timezone={timezone} now={clock} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
