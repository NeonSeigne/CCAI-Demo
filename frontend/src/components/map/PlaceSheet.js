import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Accessibility, Bookmark, ChevronLeft, ChevronRight, Footprints, Globe, MapPin, MessageSquare, Phone,
} from 'lucide-react';
import SaveButton from '../SaveButton';
import { CouldntLoad } from '../course/CoursePopup';
import { useEventList, usePlaceDetail } from '../../hooks/useCampusDetail';
import { groupedHours, weekdayIndex, weeklyHours } from '../../utils/osmHours';
import '../../styles/Popups.css';

/**
 * The map's place side sheet (r1-place-2; sparse r1-place-3): photo with its
 * Commons credit, name, category and operator, a 2×2 of Walk / Open / Floors
 * / Access, weekly hours with today marked, today's events here, address and
 * website, and pinned Directions / Save / Ask / Call. Anything the place
 * lacks is not rendered, so a sparse place gets a short sheet (D21).
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
 */

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

export function distanceText(metres) {
  if (typeof metres !== 'number' || Number.isNaN(metres)) return null;
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

function timeIn(iso, timezone) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const options = { hour: 'numeric', minute: '2-digit' };
  try {
    return date.toLocaleTimeString('en-US', { ...options, ...(timezone ? { timeZone: timezone } : {}) }).toLowerCase();
  } catch {
    return date.toLocaleTimeString('en-US', options).toLowerCase();
  }
}

function OpenRing({ open }) {
  return (
    <svg className={`ps-ring ${open ? 'is-open' : 'is-closed'}`} viewBox="0 0 36 36" width="34" height="34" aria-hidden="true">
      <circle className="ps-ring-track" cx="18" cy="18" r="14" />
      <circle className="ps-ring-arc" cx="18" cy="18" r="14" pathLength="100" strokeDasharray={open ? '70 100' : '0 100'} />
    </svg>
  );
}

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

function Tiles({ place, timezone }) {
  const tiles = [];
  if (place.walk_minutes != null) {
    tiles.push(
      <div key="walk" className="ps-tile">
        <span className="ps-tile-label">Walk</span>
        <span className="ps-tile-value ps-walk">{place.walk_minutes}<small> min</small></span>
        {distanceText(place.distance_m) && <span className="ps-tile-sub">{distanceText(place.distance_m)}</span>}
      </div>,
    );
  }
  if (place.open_now === true || place.open_now === false) {
    const until = place.open_now && place.open_until ? timeIn(place.open_until, timezone) : null;
    tiles.push(
      <div key="open" className="ps-tile">
        <span className="ps-tile-label">Open</span>
        <span className="ps-open">
          <OpenRing open={place.open_now} />
          <span>
            <strong className={place.open_now ? 'is-open' : 'is-closed'}>{place.open_now ? 'Open' : 'Closed'}</strong>
            {until && <span className="ps-tile-sub">{`until ${until}`}</span>}
          </span>
        </span>
      </div>,
    );
  }
  const levels = Number.parseInt(place.building_levels, 10);
  if (Number.isFinite(levels) && levels > 0) {
    tiles.push(
      <div key="floors" className="ps-tile">
        <span className="ps-tile-label">Floors</span>
        <span className="ps-tile-value">{levels}</span>
      </div>,
    );
  }
  const access = String(place.wheelchair || '').toLowerCase();
  if (['yes', 'limited', 'no', 'designated'].includes(access)) {
    const label = { yes: 'Wheelchair accessible', designated: 'Wheelchair accessible', limited: 'Limited wheelchair access', no: 'Not wheelchair accessible' }[access];
    tiles.push(
      <div key="access" className="ps-tile">
        <span className="ps-tile-label">Access</span>
        {access === 'no' ? (
          <span className="ps-tile-value ps-access-text">No<span className="sr-only">{`: ${label}`}</span></span>
        ) : (
          <span className={`ps-access ${access === 'limited' ? 'is-limited' : ''}`.trim()} role="img" aria-label={label} title={label}>
            <Accessibility size={18} aria-hidden="true" />
            {access === 'limited' && <span aria-hidden="true">Limited</span>}
          </span>
        )}
      </div>,
    );
  }
  if (!tiles.length) return null;
  return <div className={`ps-tiles ${tiles.length === 1 ? 'is-single' : ''}`.trim()}>{tiles}</div>;
}

function Hours({ place, timezone, now }) {
  const week = weeklyHours(place.hours);
  if (!week) return null;
  const today = weekdayIndex(now, timezone);
  const rows = groupedHours(week, today);
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

  const back = onClose && (
    <button type="button" className="ps-back" aria-label="Close" title="Close" onClick={onClose}>
      <ChevronLeft size={18} aria-hidden="true" />
    </button>
  );

  if (!place && detail.error) {
    return (
      <section className="pop-sheet ps" aria-labelledby={titleId}>
        <div className="ps-head">{back}<h2 id={titleId} className="sr-only">Place</h2></div>
        <div className="ps-scroll"><CouldntLoad onRetry={detail.retry} /></div>
      </section>
    );
  }

  if (!place) {
    return (
      <section className="pop-sheet ps" aria-labelledby={titleId} aria-busy="true">
        <div className="ps-head">{back}</div>
        <div className="ps-scroll">
          <h2 id={titleId} className="ps-name"><span className="sr-only">Place</span><span className="pop-skel pop-skel--title is-light" /></h2>
          <div className="ps-tiles is-single" aria-hidden="true">
            <div className="ps-tile"><span className="pop-skel pop-skel--label is-light" /><span className="pop-skel pop-skel--number is-light" /></div>
          </div>
        </div>
      </section>
    );
  }

  const item = { type: 'place', id: place.id, title: place.name };
  const category = CATEGORY_LABELS[place.category] || null;
  const photo = place.photo?.url ? place.photo : null;

  return (
    <section className="pop-sheet ps" aria-labelledby={titleId}>
      <div className="ps-scroll">
        <div className={`ps-head ${photo ? 'has-photo' : ''}`.trim()}>
          {back}
          <Photo photo={photo} />
        </div>
        <div className="ps-content">
          <h2 id={titleId} className="ps-name">{place.name}</h2>
          {(category || place.operator) && (
            <p className="ps-kind">
              {category && <span className={`ps-chip ps-chip--${place.category}`}>{category}</span>}
              {place.operator && <span className="ps-operator">{place.operator}</span>}
            </p>
          )}
          <Tiles place={place} timezone={timezone} />
          <Hours place={place} timezone={timezone} now={now} />
          <TodayEvents events={here} timezone={timezone} onOpenEvent={onOpenEvent} />
          {(place.address || place.website) && (
            <p className="ps-links">
              {place.address && (
                <span className="ps-link"><MapPin size={15} aria-hidden="true" /><span className="sr-only">Address: </span>{place.address}</span>
              )}
              {place.website && (
                <a className="ps-link" href={place.website} target="_blank" rel="noopener noreferrer">
                  <Globe size={15} aria-hidden="true" />{hostOf(place.website)}
                </a>
              )}
            </p>
          )}
        </div>
      </div>
      <div className="ps-actions">
        {onDirections ? (
          <button type="button" className="ps-directions" onClick={() => onDirections(place)}>
            <Footprints size={16} aria-hidden="true" /> Directions
          </button>
        ) : (
          <Link className="ps-directions" to={`/map?to=${encodeURIComponent(place.id)}`}>
            <Footprints size={16} aria-hidden="true" /> Directions
          </Link>
        )}
        {onSave ? (
          <button
            type="button"
            className="ps-icon-btn"
            aria-label={saved ? `Saved ${place.name}` : `Save ${place.name}`}
            aria-pressed={Boolean(saved)}
            title={saved ? 'Saved' : 'Save'}
            onClick={() => onSave(item)}
          >
            <Bookmark size={18} aria-hidden="true" />
          </button>
        ) : (
          <SaveButton className="ps-icon-btn" item={{ kind: 'place', key: place.id, display_name: place.name }} />
        )}
        {onAsk && (
          <button type="button" className="ps-icon-btn" aria-label={`Ask about ${place.name}`} title="Ask" onClick={() => onAsk(item)}>
            <MessageSquare size={18} aria-hidden="true" />
          </button>
        )}
        {place.phone && (
          <a className="ps-icon-btn" href={`tel:${place.phone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${place.name}`} title="Call">
            <Phone size={18} aria-hidden="true" />
          </a>
        )}
      </div>
    </section>
  );
}
