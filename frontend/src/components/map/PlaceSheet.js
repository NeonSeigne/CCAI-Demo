import React, { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../icons';
import SaveButton from '../SaveButton';
import PanelState from '../panel/PanelState';
import { BandSheet, SheetActions, SheetBand } from '../../modules/sheet';
import { useEventList, usePlaceDetail } from '../../hooks/useCampusDetail';
import {
  clockTime, endLine, hourText, walkParts, weekHours,
} from '../../modules/campus';
import '../../styles/PlaceSheet.css';

/**
 * The map's place card (DESIGN.md "Map", map.html): a band with the place's
 * type and name and tiles for Walk / Open until / Floors / Access; then
 * "Today here" and the week's hours with today marked; then Directions, Ask
 * and the bookmark. A tile or label the place lacks is left out (design Q5),
 * so a sparse place gets a short card. The frame is the band sheet's card
 * layout (modules/sheet), with the compact band.
 *
 * Props
 *   placeId, place        the id to load; `place` (a list row) shows while it loads
 *   from                  start place id, for walking minutes
 *   timezone, now         the school's zone; a fixed clock for tests
 *   onClose()             the close control; hidden without it
 *   onDirections(place)   Directions; without it, a link to /map?to=ID
 *   onAsk(item)           Ask; hidden without it
 *   onSave(item), saved   optional; without onSave the shared SaveButton is used
 *   onOpenEvent(event)    a row in Today here
 *   titleId               id for the name, for aria-labelledby
 *   autoFocus             move focus to the name when the sheet opens
 */

/** Material icon per category (pins, list rows, the card). */
export const CATEGORY_ICONS = {
  library: 'local_library',
  dining: 'restaurant',
  academic: 'school',
  housing: 'home',
  recreation: 'fitness_center',
  transit: 'directions_bus',
  health: 'local_hospital',
  arts: 'theater_comedy',
  landmark: 'account_balance',
  other: 'location_on',
};

/** OSM `wheelchair` (older place rows) -> the card's access value. */
const WHEELCHAIR = { yes: 'yes', designated: 'yes', limited: 'limited', no: 'no' };

const ACCESS = {
  yes: { icon: 'accessible', label: 'Wheelchair accessible' },
  limited: { icon: 'accessible', label: 'Limited wheelchair access', word: 'Limited' },
  no: { icon: 'not_accessible', label: 'Not wheelchair accessible' },
};

/** The place's floors: the card field, else OSM `building_levels`; null when unknown. */
function floorsOf(place) {
  const levels = Number.parseInt(place.floors ?? place.building_levels, 10);
  return Number.isFinite(levels) && levels > 0 ? levels : null;
}

/** 'yes' | 'limited' | 'no' | null. */
function accessOf(place) {
  if (ACCESS[place.access]) return place.access;
  return WHEELCHAIR[String(place.wheelchair || '').toLowerCase()] || null;
}

/**
 * The band's tiles in order Walk, Open until, Floors, Access; a tile the
 * place has no data for is left out (design Q5).
 */
export function placeTiles(place, timezone) {
  const tiles = [];
  const walk = walkParts(place.walk_minutes);
  if (walk) {
    tiles.push({
      key: 'walk', className: 'ps-tile--walk', label: 'Walk', value: walk.value, unit: walk.unit || null,
    });
  }
  const until = place.open_now === true ? hourText(place.open_until, timezone) : null;
  if (until) tiles.push({ key: 'open', className: 'ps-tile--open', label: 'Open until', value: until });
  const floors = floorsOf(place);
  if (floors) tiles.push({ key: 'floors', className: 'ps-tile--floors', label: 'Floors', value: floors });
  const access = accessOf(place);
  if (access) {
    const { icon, label, word } = ACCESS[access];
    tiles.push({
      key: 'access',
      className: 'ps-tile--access',
      label: 'Access',
      body: (
        <span className="ps-access" role="img" aria-label={label} title={label}>
          <Icon name={icon} size={20} />
          {word && <span aria-hidden="true">{word}</span>}
        </span>
      ),
    });
  }
  return tiles;
}

function Hours({ place, timezone, now }) {
  const rows = weekHours(place.hours, timezone, now);
  if (!rows) return null;
  return (
    <section className="ps-section" aria-labelledby="ps-hours-title">
      <h3 id="ps-hours-title" className="ps-section-title">Hours</h3>
      <table className="ps-hours">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className={row.today ? 'is-today' : ''} aria-current={row.today ? 'date' : undefined}>
              <th scope="row">{row.label}</th>
              <td>{row.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** "6:00" for the time column: the clock without its meridiem (the end line carries it). */
const startClock = (event, timezone) => (event.all_day
  ? 'All day'
  : (clockTime(event.start, timezone) || '').replace(/\s?[AP]M$/, ''));

/** Today's events at the place, or "Nothing listed today" (DESIGN.md "States"). */
function TodayHere({
  events, status, timezone, onOpenEvent, onRetry,
}) {
  let body;
  if (events.length) {
    body = (
      <ul className="ps-events">
        {events.map((event) => {
          const end = endLine(event, timezone);
          const inner = (
            <>
              <span className="ps-event-time">{startClock(event, timezone)}</span>
              <span className="ps-event-text">
                <span className="ps-event-title">{event.title}</span>
                {end && <span className="ps-event-end">{end}</span>}
              </span>
            </>
          );
          return (
            <li key={event.id || `${event.title}-${event.start}`}>
              {onOpenEvent
                ? <button type="button" className="ps-event" onClick={() => onOpenEvent(event)}>{inner}</button>
                : <div className="ps-event">{inner}</div>}
            </li>
          );
        })}
      </ul>
    );
  } else if (status === 'loading') {
    body = <PanelState status="loading" label="Loading today's events" rows={1} />;
  } else if (status === 'error') {
    body = <PanelState status="error" onRetry={onRetry} />;
  } else {
    body = <PanelState status="empty" />;
  }
  return (
    <section className="ps-section" aria-labelledby="ps-today-title">
      <h3 id="ps-today-title" className="ps-section-title">Today here</h3>
      {body}
    </section>
  );
}

export default function PlaceSheet({
  placeId,
  place: seed,
  from,
  timezone,
  now: fixedNow,
  onClose,
  onDirections,
  onAsk,
  onSave,
  saved,
  onOpenEvent,
  titleId = 'place-sheet-title',
  autoFocus = false,
}) {
  const id = placeId || seed?.id;
  const detail = usePlaceDetail(id, { from });
  // The list row carries walk minutes for the current start; keep them if the detail has none.
  const place = detail.data?.place ? { ...seed, ...detail.data.place } : seed || null;
  const now = useMemo(() => fixedNow || new Date(), [fixedNow]);
  const events = useEventList({ window: 'today', from, enabled: Boolean(place) });
  const here = (events.data?.events || [])
    .filter((event) => event.place_id && event.place_id === place?.id)
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  let eventsStatus = 'ready';
  if (events.error) eventsStatus = 'error';
  else if (events.loading) eventsStatus = 'loading';

  // Opening the sheet replaces what had focus (a list row or a pin), so focus
  // moves to the place's name; the page returns it when the sheet closes.
  const headingRef = useRef(null);
  useEffect(() => {
    if (autoFocus) headingRef.current?.focus();
  }, [autoFocus, id]);

  if (!place && detail.error) {
    return (
      <BandSheet
        kind="place"
        card
        titleId={titleId}
        status="error"
        error={{ onRetry: detail.retry }}
        band={<SheetBand compact titleId={titleId} titleRef={headingRef} titleLabel="Place" hideTitle onClose={onClose} />}
      />
    );
  }

  if (!place) {
    return (
      <BandSheet
        kind="place"
        card
        titleId={titleId}
        status="loading"
        loadingLabel="Loading place"
        band={<SheetBand compact titleId={titleId} titleRef={headingRef} titleLabel="Place" onClose={onClose} tiles={1} />}
      />
    );
  }

  const item = { type: 'place', id: place.id, title: place.name };

  const band = (
    <SheetBand
      compact
      eyebrow={place.type ? (
        <span className="ps-kind">
          <Icon name={CATEGORY_ICONS[place.category] || 'location_on'} size={18} />
          {place.type}
        </span>
      ) : null}
      title={place.name}
      titleId={titleId}
      titleRef={headingRef}
      onClose={onClose}
      tiles={placeTiles(place, timezone)}
    />
  );

  const actions = (
    <SheetActions>
      {onDirections ? (
        <button type="button" className="pop-btn pop-btn--primary" onClick={() => onDirections(place)}>
          <Icon name="directions_walk" size={20} /> Directions
        </button>
      ) : (
        <Link className="pop-btn pop-btn--primary" to={`/map?to=${encodeURIComponent(place.id)}`}>
          <Icon name="directions_walk" size={20} /> Directions
        </Link>
      )}
      {onAsk && (
        <button type="button" className="pop-btn" onClick={() => onAsk(item)}>
          <Icon name="forum" size={20} /> Ask
          <span className="sr-only">{` about ${place.name}`}</span>
        </button>
      )}
      {onSave ? (
        <button
          type="button"
          className="pop-btn pop-btn--icon"
          aria-label={saved ? `Saved ${place.name}` : `Save ${place.name}`}
          aria-pressed={Boolean(saved)}
          title={saved ? 'Saved' : 'Save'}
          onClick={() => onSave(item)}
        >
          <Icon name="bookmark" size={20} filled={Boolean(saved)} />
        </button>
      ) : (
        <SaveButton className="pop-save" item={{ kind: 'place', key: place.id, display_name: place.name }} />
      )}
    </SheetActions>
  );

  return (
    <BandSheet kind="place" card titleId={titleId} band={band} actions={actions}>
      <div className="ps-content">
        <TodayHere
          events={here}
          status={eventsStatus}
          timezone={timezone}
          onOpenEvent={onOpenEvent}
          onRetry={events.retry}
        />
        <Hours place={place} timezone={timezone} now={now} />
      </div>
    </BandSheet>
  );
}
