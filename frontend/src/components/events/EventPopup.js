import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, ExternalLink, Icon } from '../icons';
import SaveButton from '../SaveButton';
import { isNotFound } from '../popup/PopupParts';
import PanelState from '../panel/PanelState';
import { BandSheet, SheetActions, SheetBand } from '../../modules/sheet';
import MiniMap from '../map/MiniMap';
import {
  campusDay, dateLabel, durationText, eventWhen, hasPhysicalLocation, walkParts,
} from '../../modules/campus';
import { useEventDetail, useEventList, usePlaceDetail } from '../../hooks/useCampusDetail';
import { downloadEventIcs } from '../../utils/ics';
import {
  KindDot, kindHostLine, placeName, roomOf,
} from './eventKind';
import '../../styles/EventPopup.css';

/**
 * The event pop-up's body (DESIGN.md "Event detail"): the band with the date
 * block, "Kind · Host", the title and up to four tiles (Starts in, Time,
 * Walk, Cost); then About and Details beside Where and "Also at"; then the
 * actions. A tile, row or eyebrow part the feed lacks is left out (design
 * Q5, D7). The frame is the band sheet's (modules/sheet).
 *
 * Props
 *   eventId, event        the id to load; `event` (a list row) shows while it loads
 *   from                  start place id, for walking minutes
 *   timezone              the school's zone until the detail answers
 *   now                   a fixed clock (tests); otherwise it ticks every 30 s
 *   onAsk(item) / onClose()   callbacks; a missing one hides its button
 *   onSave(item), saved   optional; without onSave the shared SaveButton is used
 *   onOpenEvent(event)    a row in "Also at"
 *   titleId               id for the title, for the host's aria-labelledby
 */

function useNow(fixed) {
  const [now, setNow] = useState(() => fixed || new Date());
  useEffect(() => {
    if (fixed) { setNow(fixed); return undefined; }
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, [fixed]);
  return now;
}

function DateBlock({ event, timezone }) {
  if (!event?.start) return null;
  return (
    <span className="ep-date" aria-hidden="true">
      <span className="ep-date-month">{dateLabel(event.start, timezone, { month: 'short' })}</span>
      <span className="ep-date-day">{dateLabel(event.start, timezone, { day: 'numeric' })}</span>
      <span className="ep-date-week">{dateLabel(event.start, timezone, { weekday: 'short' })}</span>
    </span>
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

/** Place, Room, Hosted by (the mockup's rows), then the feed's links. */
function Details({ event, physical }) {
  const details = event.details || {};
  const rows = [];
  const place = physical ? placeName(event) : '';
  if (place) rows.push(['Place', place]);
  const room = physical ? roomOf(event) : null;
  if (room) rows.push(['Room', room]);
  const host = event.host || details.hosted_by || details.sponsor;
  if (host) rows.push(['Hosted by', host]);
  if (details.registration_url) {
    rows.push(['Registration', (
      <a href={details.registration_url} target="_blank" rel="noopener noreferrer">
        Register <ExternalLink size={13} aria-hidden="true" />
      </a>
    )]);
  }
  if (event.url) {
    rows.push(['Event page', (
      <a href={event.url} target="_blank" rel="noopener noreferrer">
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
  if (lat == null || lon == null) return null;
  const venue = place?.name || placeName(event);
  return (
    <section className="pop-tile ep-map" aria-label={venue ? `Map: ${venue}` : 'Map'}>
      <h3 className="pop-tile-title" aria-hidden="true">Where</h3>
      <div className="ep-map-box">
        <MiniMap lat={lat} lon={lon} icon="event" />
      </div>
    </section>
  );
}

/** "Also at {place}": the place's other events that day, as time, title and "to {end}". */
function AlsoAt({
  title, events, timezone, onOpenEvent, now,
}) {
  return (
    <section className="pop-tile ep-list" aria-labelledby="ep-also-title">
      <h3 id="ep-also-title" className="pop-tile-title">{title}</h3>
      {events.length ? (
        <ul>
          {events.map((item) => {
            const when = eventWhen(item, timezone, now);
            const start = when.allDay ? 'All day' : (when.start || when.time);
            const end = when.end ? `to ${when.end}` : when.endLine;
            const body = (
              <>
                <span className="ep-list-time">{start}</span>
                <span className="ep-list-text">
                  <strong>{item.title}</strong>
                  {end && <span>{end}</span>}
                </span>
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
      ) : <PanelState status="empty" message="Nothing else today" />}
    </section>
  );
}

const byStart = (a, b) => new Date(a.start) - new Date(b.start);

/**
 * The other events at the event's place on its campus day, not yet over, in
 * start order. Empty for an event with no physical place.
 */
export function alsoAt(event, events, timezone, now = new Date()) {
  if (!event?.start || !hasPhysicalLocation(event.location)) return [];
  const day = campusDay(event.start, timezone);
  const samePlace = (e) => (event.place_id
    ? e.place_id === event.place_id
    : Boolean(event.location) && e.location === event.location);
  return (events || [])
    .filter((e) => e && e.start && e.id !== event.id && e.title !== event.title)
    .filter((e) => samePlace(e) && campusDay(e.start, timezone) === day)
    .filter((e) => new Date(e.end || e.start) >= now)
    .sort(byStart);
}

/**
 * The band's tiles, in the mockup's order: Starts in (signal; "Now" while it
 * runs), Time, Walk, Cost. A tile without data is left out (design Q5):
 * there is no "Starts in" once it's over or for an all-day event, no Walk
 * without a measured walk (never "0 min"), no Cost unless the feed gives one.
 */
export function eventTiles(event, timezone, now) {
  const when = eventWhen(event, timezone, now);
  const tiles = [];
  if (when.countdown) {
    const value = when.live ? 'Now' : durationText(when.countdown.ms);
    tiles.push({ key: 'starts', label: 'Starts in', value, className: 'is-live' });
  }
  if (event.start) {
    if (when.allDay) tiles.push({ key: 'time', label: 'Time', value: 'All day' });
    else if (when.multiDay) tiles.push({ key: 'time', label: 'Time', value: when.time, unit: when.endLine });
    else tiles.push({ key: 'time', label: 'Time', value: when.start, unit: when.end ? `to ${when.end}` : null });
  }
  const walk = hasPhysicalLocation(event.location) ? walkParts(event.walk_minutes) : null;
  if (walk) tiles.push({ key: 'walk', label: 'Walk', value: walk.value, unit: walk.unit });
  const cost = event.cost || event.details?.cost;
  if (cost) tiles.push({ key: 'cost', label: 'Cost', value: cost });
  return tiles;
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
  const physical = hasPhysicalLocation(event?.location);
  const list = useEventList({ window: 'next_7_days', from, enabled: Boolean(event) && physical });
  const placeId = event?.place_id && !event?.geo ? event.place_id : '';
  const place = usePlaceDetail(placeId);
  const [imageOk, setImageOk] = useState(true);

  useEffect(() => { setImageOk(true); }, [event?.image_url]);

  const others = useMemo(
    () => (event ? alsoAt(event, list.data?.events, timezone, now) : []),
    [event, list.data, timezone, now],
  );

  if (!event && detail.error) {
    return (
      <BandSheet
        kind="event"
        titleId={titleId}
        status="error"
        error={isNotFound(detail.error) ? { message: 'Event not found' } : { onRetry: detail.retry }}
        band={<SheetBand titleId={titleId} titleLabel="Event" hideTitle onClose={onClose} />}
      />
    );
  }

  if (!event) {
    return (
      <BandSheet
        kind="event"
        titleId={titleId}
        status="loading"
        loadingLabel="Loading event"
        band={(
          <SheetBand
            titleId={titleId}
            titleLabel="Event"
            lead={<span className="pop-skel ep-date-skel" aria-hidden="true" />}
            onClose={onClose}
            tiles={4}
          />
        )}
      />
    );
  }

  const item = { type: 'event', id: event.id, title: event.title };
  const eyebrow = kindHostLine(event);
  const showImage = Boolean(event.image_url) && imageOk;
  const venue = place.data?.place?.name || placeName(event);
  const showAlso = physical && Boolean(venue) && Boolean(list.data);

  const band = (
    <SheetBand
      eyebrow={eyebrow ? <span className="ep-kind"><KindDot event={event} />{eyebrow}</span> : null}
      title={event.title}
      titleId={titleId}
      lead={<DateBlock event={event} timezone={timezone} />}
      onClose={onClose}
      tiles={eventTiles(event, timezone, now)}
    />
  );

  const actions = (
    <SheetActions>
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
          <Icon name="forum" size={20} /> Ask about this
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
    </SheetActions>
  );

  return (
    <BandSheet kind="event" titleId={titleId} band={band} actions={actions}>
      <div className="pop-body ep-body">
        <div className="ep-col">
          {showImage && (
            <figure className="pop-tile ep-image">
              <img src={event.image_url} alt="" onError={() => setImageOk(false)} />
            </figure>
          )}
          <About text={event.description} />
          <Details event={event} physical={physical} />
        </div>
        <div className="ep-col">
          <MapTile event={event} place={place.data?.place} />
          {showAlso && (
            <AlsoAt
              title={`Also at ${venue}`}
              events={others}
              timezone={timezone}
              onOpenEvent={onOpenEvent}
              now={now}
            />
          )}
        </div>
      </div>
    </BandSheet>
  );
}
