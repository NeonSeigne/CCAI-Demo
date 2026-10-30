import React, {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { Link } from 'react-router-dom';
import {
  Accessibility, Bookmark, ChevronRight, Footprints, Globe, Icon, MapPin, MessageSquare, Phone,
} from '../icons';
import SaveButton from '../SaveButton';
import { usePopupDrag } from '../popup/PopupParts';
import { BandSheet, SheetActions, SheetBand } from '../../modules/sheet';
import { useEventList, usePlaceDetail } from '../../hooks/useCampusDetail';
import {
  clockTime, distanceText, openState, walkParts, weekHours,
} from '../../modules/campus';
import '../../styles/PlaceSheet.css';

/**
 * The map's place card (DESIGN.md "Map"): a band with the category, name and
 * tiles for Walk / Open / Floors / Access; then the photo with its Commons
 * credit, today's events here, weekly hours with today marked, address and
 * website; then Directions / Save / Ask / Call. Anything the place lacks is
 * not rendered, so a sparse place gets a short card (D21). The frame is the
 * band sheet's card layout (modules/sheet), with the compact band.
 *
 * Props
 *   placeId, place        the id to load; `place` (a list row) shows while it loads
 *   from                  start place id, for walking minutes
 *   timezone, now         the school's zone; a fixed clock for tests
 *   onClose()             the back control; hidden without it
 *   onDirections(place)   Directions; without it, a link to /map?to=ID
 *   onAsk(item)           Ask; hidden without it
 *   onSave(item), saved   optional; without onSave the shared SaveButton is used
 *   onOpenEvent(event)    a row in Today
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

const CATEGORY_LABELS = {
  library: 'Library',
  dining: 'Dining',
  academic: 'Academic',
  housing: 'Housing',
  recreation: 'Recreation',
  transit: 'Bus stop',
  health: 'Health',
  arts: 'Arts',
  landmark: 'Landmark',
  other: 'Place',
};

/** "11:00 pm": the place card's lower-case clock. */
const timeIn = (iso, timezone) => clockTime(iso, timezone)?.toLowerCase() || null;

function Photo({ photo }) {
  const [ok, setOk] = useState(true);
  useEffect(() => { setOk(true); }, [photo?.url]);
  if (!photo?.url || !ok) return null;
  const credit = ['Photo:', [photo.author, photo.license].filter(Boolean).join(' · ')].join(' ');
  return (
    <figure className="ps-photo">
      <img src={photo.url} alt="" onError={() => setOk(false)} />
      {(photo.author || photo.license) && (
        <figcaption className="ps-credit">
          {photo.page
            ? <a href={photo.page} target="_blank" rel="noopener noreferrer">{credit}</a>
            : credit}
        </figcaption>
      )}
    </figure>
  );
}

/** The band's tiles: Walk, Open, Floors, Access; one the place lacks is left out. */
export function placeTiles(place, timezone) {
  const tiles = [];
  const walk = walkParts(place.walk_minutes);
  if (walk) {
    tiles.push({
      key: 'walk', label: 'Walk', value: walk.value, unit: walk.unit || null, sub: distanceText(place.distance_m) || null,
    });
  }
  const open = openState(place, timezone);
  if (open.open !== null) {
    const until = open.until ? open.until.toLowerCase() : null;
    tiles.push({
      key: 'open',
      label: 'Open',
      body: (
        <span className="ps-open">
          <strong className={place.open_now ? 'is-open' : 'is-closed'}>{place.open_now ? 'Open' : 'Closed'}</strong>
          {until && <span className="pop-number-sub">{`until ${until}`}</span>}
        </span>
      ),
    });
  }
  const levels = Number.parseInt(place.building_levels, 10);
  if (Number.isFinite(levels) && levels > 0) tiles.push({ key: 'floors', label: 'Floors', value: levels });
  const access = String(place.wheelchair || '').toLowerCase();
  if (['yes', 'limited', 'no', 'designated'].includes(access)) {
    const label = { yes: 'Wheelchair accessible', designated: 'Wheelchair accessible', limited: 'Limited wheelchair access', no: 'Not wheelchair accessible' }[access];
    tiles.push({
      key: 'access',
      label: 'Access',
      body: access === 'no' ? (
        <span className="pop-number-value ps-access-text">No<span className="sr-only">{`: ${label}`}</span></span>
      ) : (
        <span className={`ps-access ${access === 'limited' ? 'is-limited' : ''}`.trim()} role="img" aria-label={label} title={label}>
          <Accessibility size={22} aria-hidden="true" />
          {access === 'limited' && <span aria-hidden="true">Limited</span>}
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

function TodayEvents({ events, timezone, onOpenEvent }) {
  if (!events.length) return null;
  return (
    <section className="ps-section" aria-labelledby="ps-today-title">
      <h3 id="ps-today-title" className="ps-section-title">
        Today <span className="ps-count">{events.length}</span>
      </h3>
      <ul className="ps-events">
        {events.map((event) => {
          const time = event.all_day ? 'All day' : timeIn(event.start, timezone);
          const body = (
            <>
              <span className="ps-event-time">{time}</span>
              <span className="ps-event-title">{event.title}</span>
              {onOpenEvent && <ChevronRight size={16} aria-hidden="true" />}
            </>
          );
          return (
            <li key={event.id || `${event.title}-${event.start}`}>
              {onOpenEvent
                ? <button type="button" className="ps-event" onClick={() => onOpenEvent(event)}>{body}</button>
                : <div className="ps-event">{body}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

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

  const drag = usePopupDrag({ type: 'place', id: place?.id, title: place?.name });

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
  const category = CATEGORY_LABELS[place.category] || null;
  const photo = place.photo?.url ? place.photo : null;

  const band = (
    <SheetBand
      compact
      eyebrow={(category || place.operator) && (
        <>
          {category && (
            <span className={`ps-chip ps-chip--${place.category}`}>
              <Icon name={CATEGORY_ICONS[place.category] || 'location_on'} size={18} />
              {category}
            </span>
          )}
          {place.operator && <span className="ps-operator">{place.operator}</span>}
        </>
      )}
      title={place.name}
      titleId={titleId}
      titleRef={headingRef}
      drag={drag}
      dragLabel={`Drag ${place.name}`}
      onClose={onClose}
      tiles={placeTiles(place, timezone)}
    />
  );

  const actions = (
    <SheetActions>
      {onDirections ? (
        <button type="button" className="pop-btn pop-btn--primary" onClick={() => onDirections(place)}>
          <Footprints size={20} aria-hidden="true" /> Directions
        </button>
      ) : (
        <Link className="pop-btn pop-btn--primary" to={`/map?to=${encodeURIComponent(place.id)}`}>
          <Footprints size={20} aria-hidden="true" /> Directions
        </Link>
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
          <Bookmark size={20} aria-hidden="true" />
        </button>
      ) : (
        <SaveButton className="pop-save" item={{ kind: 'place', key: place.id, display_name: place.name }} />
      )}
      {onAsk && (
        <button type="button" className="pop-btn pop-btn--icon" aria-label={`Ask about ${place.name}`} title="Ask" onClick={() => onAsk(item)}>
          <MessageSquare size={20} aria-hidden="true" />
        </button>
      )}
      {place.phone && (
        <a className="pop-btn pop-btn--icon" href={`tel:${place.phone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${place.name}`} title="Call">
          <Phone size={20} aria-hidden="true" />
        </a>
      )}
    </SheetActions>
  );

  return (
    <BandSheet kind="place" card titleId={titleId} band={band} actions={actions}>
      <div className="ps-content">
        <Photo photo={photo} />
        <TodayEvents events={here} timezone={timezone} onOpenEvent={onOpenEvent} />
        <Hours place={place} timezone={timezone} now={now} />
        {(place.address || place.website) && (
          <p className="ps-links">
            {place.address && (
              <span className="ps-link"><MapPin size={18} aria-hidden="true" /><span className="sr-only">Address: </span>{place.address}</span>
            )}
            {place.website && (
              <a className="ps-link" href={place.website} target="_blank" rel="noopener noreferrer">
                <Globe size={18} aria-hidden="true" />{hostOf(place.website)}
              </a>
            )}
          </p>
        )}
      </div>
    </BandSheet>
  );
}
