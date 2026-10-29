import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, ChevronRight, ExternalLink, Icon, X } from '../icons';
import SaveButton from '../SaveButton';
import {
  CouldntLoad, DragGrip, isNotFound, NotFound, usePopupDrag,
} from '../popup/PopupParts';
import MiniMap from '../map/MiniMap';
import { formatEventRange, hasPhysicalLocation } from '../visuals/EventListCard';
import { useEventDetail, useEventList, usePlaceDetail } from '../../hooks/useCampusDetail';
import { downloadEventIcs } from '../../utils/ics';
import '../../styles/Popups.css';

/**
 * The event pop-up's body (DESIGN.md "Event detail"): the band with the date
 * block, kind, title and tiles (starts in, time, walk, cost); then About and
 * Details beside Where and the related lists; then the actions. No Tonight
 * tile (eng R3). A field the feed lacks drops its tile, row or number (D7).
 *
 * Props
 *   eventId, event        the id to load; `event` (a list row) shows while it loads
 *   from                  start place id, for walking minutes
 *   timezone              the school's zone until the detail answers
 *   now                   a fixed clock (tests); otherwise it ticks every 30 s
 *   onAsk(item) / onClose()   callbacks; a missing one hides its button
 *   onSave(item), saved   optional; without onSave the shared SaveButton is used
 *   onOpenEvent(event)    a row in "Also at" / "More in"
 *   titleId               id for the title, for the host's aria-labelledby
 */

const LIST_MAX = 3;

function useNow(fixed) {
  const [now, setNow] = useState(() => fixed || new Date());
  useEffect(() => {
    if (fixed) { setNow(fixed); return undefined; }
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, [fixed]);
  return now;
}

function inZone(iso, timezone, options) {
  const date = new Date(iso);
  try {
    return date.toLocaleString('en-US', { ...options, ...(timezone ? { timeZone: timezone } : {}) });
  } catch {
    return date.toLocaleString('en-US', options);
  }
}

/** "38 min", "2h 05m", "3 days". */
export function spanText(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
  return `${Math.floor(hours / 24)} days`;
}

/** {label, value, live} for the first number, or null (all-day, multi-day, over). */
export function countdown(event, now) {
  if (!event?.start || event.all_day || event.ongoing) return null;
  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : null;
  if (Number.isNaN(start.getTime())) return null;
  if (start > now) return { label: 'Starts in', value: spanText(start - now), live: false };
  if (end && end > now) return { label: 'Ends in', value: spanText(end - now), live: true };
  return null;
}

function DateBlock({ event, timezone, small = false }) {
  if (!event?.start) return null;
  const month = inZone(event.start, timezone, { month: 'short' });
  const day = inZone(event.start, timezone, { day: 'numeric' });
  const weekday = inZone(event.start, timezone, { weekday: 'short' });
  return (
    <span className={`ep-date ${small ? 'ep-date--small' : ''}`.trim()} aria-hidden="true">
      {!small && <span className="ep-date-month">{month}</span>}
      <span className="ep-date-day">{day}</span>
      <span className="ep-date-week">{small ? month : weekday}</span>
    </span>
  );
}

function Stat({ label, children, className = '' }) {
  return (
    <div className={`pop-number ${className}`.trim()}>
      <span className="pop-number-label">{label}</span>
      <span className="pop-number-value">{children}</span>
    </div>
  );
}

function About({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > 420 || text.split('\n').length > 7;
  return (
    <section className="pop-tile ep-about" aria-labelledby="ep-about-title">
      <h3 id="ep-about-title" className="pop-tile-title">About</h3>
      <p className={`pop-clamp ep-about-text ${open ? '' : 'is-clamped'}`} style={{ '--pop-lines': 8 }}>{text}</p>
      {long && (
        <button type="button" className="pop-more pop-more--ink" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? 'Less' : 'More'}
        </button>
      )}
    </section>
  );
}

function Details({ details: given, url }) {
  const details = given || {};
  const rows = [];
  if (details.event_type) rows.push(['Event type', details.event_type]);
  const host = details.hosted_by || details.sponsor;
  if (host) rows.push(['Hosted by', host]);
  if (details.room) rows.push(['Room', details.room]);
  if (details.registration_url) {
    rows.push(['Registration', (
      <a href={details.registration_url} target="_blank" rel="noopener noreferrer">
        Register <ExternalLink size={13} aria-hidden="true" />
      </a>
    )]);
  }
  if (url) {
    rows.push(['Event page', (
      <a href={url} target="_blank" rel="noopener noreferrer">
        Open <ExternalLink size={13} aria-hidden="true" />
      </a>
    )]);
  }
  if (!rows.length) return null;
  return (
    <section className="pop-tile ep-details" aria-labelledby="ep-details-title">
      <h3 id="ep-details-title" className="pop-tile-title">Details</h3>
      <dl className="ep-dl">
        {rows.map(([term, value]) => (
          <div key={term} className="ep-dl-row">
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function MapTile({ event, place }) {
  const lat = place?.lat ?? event.geo?.lat;
  const lon = place?.lon ?? event.geo?.lon;
  const hasPoint = lat != null && lon != null;
  if (!event.place_id && !hasPoint) return null;
  const venue = place?.name || event.location;
  return (
    <section className="pop-tile ep-map" aria-label={venue ? `Map: ${venue}` : 'Map'}>
      <h3 className="pop-tile-title" aria-hidden="true">Where</h3>
      <div className="ep-map-box">
        {hasPoint && <MiniMap lat={lat} lon={lon} icon="event" />}
        {venue && <span className="ep-map-venue">{venue}</span>}
      </div>
    </section>
  );
}

function EventList({ title, events, timezone, onOpenEvent }) {
  if (!events.length) return null;
  return (
    <section className="pop-tile ep-list" aria-label={title}>
      <h3 className="pop-tile-title">{title}</h3>
      <ul>
        {events.map((item) => {
          const when = `${inZone(item.start, timezone, { weekday: 'short' })} · ${formatEventRange(item, timezone).split(' – ')[0]}`;
          const body = (
            <>
              <DateBlock event={item} timezone={timezone} small />
              <span className="ep-list-text">
                <strong>{item.title}</strong>
                <span>{when}</span>
              </span>
              {onOpenEvent && <ChevronRight size={16} aria-hidden="true" className="ep-list-chevron" />}
            </>
          );
          return (
            <li key={item.id || `${item.title}-${item.start}`}>
              {onOpenEvent
                ? <button type="button" className="ep-list-row" onClick={() => onOpenEvent(item)}>{body}</button>
                : <div className="ep-list-row">{body}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const byStart = (a, b) => new Date(a.start) - new Date(b.start);

/** Upcoming events at the same venue, and in the event's first category. */
export function relatedEvents(event, events, now) {
  const upcoming = (events || [])
    .filter((e) => e && e.id !== event.id && e.title !== event.title && e.start && new Date(e.end || e.start) >= now)
    .sort(byStart);
  const sameVenue = (e) => (event.place_id
    ? e.place_id === event.place_id
    : Boolean(event.location) && e.location === event.location);
  const atVenue = hasPhysicalLocation(event.location) ? upcoming.filter(sameVenue).slice(0, LIST_MAX) : [];
  const category = (event.categories || [])[0];
  const taken = new Set(atVenue.map((e) => e.id));
  const inCategory = category
    ? upcoming.filter((e) => !taken.has(e.id) && (e.categories || []).includes(category)).slice(0, LIST_MAX)
    : [];
  return { atVenue, category, inCategory };
}

export default function EventPopup({
  eventId,
  event: seed,
  from,
  timezone: zoneProp,
  now: fixedNow,
  onAsk,
  onSave,
  saved,
  onClose,
  onOpenEvent,
  titleId = 'event-popup-title',
}) {
  const id = eventId || seed?.id;
  const detail = useEventDetail(id, { from });
  const event = detail.data?.event || seed || null;
  const timezone = detail.data?.timezone || zoneProp;
  const now = useNow(fixedNow);
  const list = useEventList({ window: 'next_7_days', from, enabled: Boolean(event) });
  const placeId = event?.place_id && !event?.geo ? event.place_id : '';
  const place = usePlaceDetail(placeId);
  const [imageOk, setImageOk] = useState(true);

  useEffect(() => { setImageOk(true); }, [event?.image_url]);

  const related = useMemo(
    () => (event ? relatedEvents(event, list.data?.events, now) : { atVenue: [], inCategory: [] }),
    [event, list.data, now],
  );

  const drag = usePopupDrag({ type: 'event', id: event?.id, title: event?.title });

  const closeButton = onClose && (
    <button type="button" className="pop-icon-btn" aria-label="Close" title="Close" onClick={onClose}>
      <X size={18} aria-hidden="true" />
    </button>
  );

  if (!event && detail.error) {
    return (
      <article className="pop ep" aria-labelledby={titleId}>
        <header className="pop-band">
          <div className="pop-band-top">
            <h2 id={titleId} className="sr-only">Event</h2>
            <div className="pop-actions">{closeButton}</div>
          </div>
        </header>
        <div className="pop-body">
          {isNotFound(detail.error)
            ? <NotFound>Event not found</NotFound>
            : <CouldntLoad onRetry={detail.retry} />}
        </div>
      </article>
    );
  }

  if (!event) {
    return (
      <article className="pop ep" aria-labelledby={titleId} aria-busy="true">
        <header className="pop-band">
          <div className="pop-band-top">
            <span className="pop-skel ep-date-skel" aria-hidden="true" />
            <div className="pop-band-text">
              <h2 id={titleId} className="pop-title"><span className="sr-only">Event</span><span className="pop-skel pop-skel--title" /></h2>
            </div>
            <div className="pop-actions">{closeButton}</div>
          </div>
          <div className="pop-numbers" aria-hidden="true">
            {[0, 1, 2, 3].map((n) => (
              <div key={n} className="pop-number"><span className="pop-skel pop-skel--label" /><span className="pop-skel pop-skel--number" /></div>
            ))}
          </div>
        </header>
      </article>
    );
  }

  const physical = hasPhysicalLocation(event.location);
  const details = event.details || null;
  const timer = countdown(event, now);
  const item = { type: 'event', id: event.id, title: event.title };
  const numbers = [];
  if (timer) numbers.push(<Stat key="timer" label={timer.label} className="is-live">{timer.value}</Stat>);
  if (event.start) {
    const [from, to] = formatEventRange(event, timezone).split(' – ');
    // "5:00 to 6:00 PM": the start drops a meridiem the end repeats.
    const meridiem = /\s?[AP]M$/;
    const start = to && from.match(meridiem)?.[0].trim() === to.match(meridiem)?.[0].trim() ? from.replace(meridiem, '') : from;
    numbers.push(<Stat key="time" label="Time">{start}{to && <small>{` to ${to}`}</small>}</Stat>);
  }
  if (event.walk_minutes != null && physical) {
    numbers.push(<Stat key="walk" label="Walk">{event.walk_minutes}<small> min</small></Stat>);
  }
  if (details?.cost) numbers.push(<Stat key="cost" label="Cost">{details.cost}</Stat>);
  if (!details?.room && physical) numbers.push(<Stat key="room" label="Room">{event.location}</Stat>);

  const showImage = Boolean(event.image_url) && imageOk;
  const venueName = place.data?.place?.name || event.location;

  return (
    <article className="pop ep" aria-labelledby={titleId}>
      <header ref={drag.ref} className={`pop-band ${drag.className}`}>
        <div className="pop-band-top">
          {event.id && <DragGrip drag={drag} label={`Drag ${event.title}`} />}
          <DateBlock event={event} timezone={timezone} />
          <div className="pop-band-text">
            <p className="pop-eyebrow">
              {timer?.live && <span className="ep-live">Happening now</span>}
              {event.calendar && <span className="ep-kind"><span className="ep-dot" aria-hidden="true" />{event.calendar}</span>}
            </p>
            <h2 id={titleId} className="pop-title">{event.title}</h2>
            {event.categories?.length > 0 && (
              <ul className="pop-chips">
                {event.categories.map((name) => <li key={name} className="pop-chip pop-chip--event">{name}</li>)}
              </ul>
            )}
          </div>
          {closeButton && <div className="pop-actions pop-actions--close">{closeButton}</div>}
        </div>
        {numbers.length > 0 && <div className="pop-numbers">{numbers}</div>}
      </header>
      <div className="pop-body ep-body">
        <div className="ep-col">
          {showImage && (
            <figure className="pop-tile ep-image">
              <img src={event.image_url} alt="" onError={() => setImageOk(false)} />
            </figure>
          )}
          <About text={event.description} />
          <Details details={details} url={event.url} />
        </div>
        <div className="ep-col">
          <MapTile event={event} place={place.data?.place} />
          <EventList
            title={`Also at ${venueName}`}
            events={related.atVenue}
            timezone={timezone}
            onOpenEvent={onOpenEvent}
          />
          <EventList
            title={`More in ${related.category}`}
            events={related.inCategory}
            timezone={timezone}
            onOpenEvent={onOpenEvent}
          />
        </div>
      </div>
      <footer className="pop-foot">
        {event.start && (
          <button type="button" className="pop-btn pop-btn--primary" onClick={() => downloadEventIcs(event)}>
            <Icon name="calendar_add_on" size={20} /> Add to calendar
          </button>
        )}
        {event.place_id && (
          <Link className="pop-btn" to={`/map?to=${encodeURIComponent(event.place_id)}`}>
            <Icon name="directions_walk" size={20} /> Directions
          </Link>
        )}
        {onAsk && (
          <button type="button" className="pop-btn" onClick={() => onAsk(item)}>
            <Icon name="forum" size={20} /> Ask
          </button>
        )}
        {onSave ? (
          <button type="button" className="pop-btn" aria-pressed={Boolean(saved)} onClick={() => onSave(item)}>
            <Bookmark size={20} aria-hidden="true" /> {saved ? 'Saved' : 'Save'}
          </button>
        ) : (
          event.id && (
            <SaveButton
              className="pop-save"
              item={{
                kind: 'event', key: event.id, display_name: event.title, event_start: event.start, event_end: event.end,
              }}
            />
          )
        )}
      </footer>
    </article>
  );
}
