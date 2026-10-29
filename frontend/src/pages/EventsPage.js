import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Icon, RefreshCw, X } from '../components/icons';
import AppDialog from '../components/AppDialog';
import CampusRail from '../components/CampusRail';
import EventPopup from '../components/events/EventPopup';
import { usePopupContainer } from '../components/shell/PageColumnContext';
import usePopupAsk from '../hooks/usePopupAsk';
import {
  EVENT_PARAM, useCloseOnce, useCloseParam, useOpenParam,
} from '../utils/openCourse';
import SaveButton from '../components/SaveButton';
import SettingsModal from '../components/SettingsModal';
import { formatEventRange, formatEventTime, hasPhysicalLocation } from '../components/visuals/EventListCard';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { getCampusOrigin, listEvents, listPlaces, setCampusOrigin } from '../api/campus';
import { downloadEventIcs } from '../utils/ics';
import {
  WINDOWS, WINDOW_IDS, addDays, dayKey, formatDay, isAllDayLike, listingDay, minutesOfDay, relativeDay,
  windowDays, windowHeading, windowLabel, windowPhrase, zoneName, coversDay,
} from '../utils/eventWindows';
import '../styles/CampusHome.css';
import '../styles/EventsPage.css';

const VIEWS = [
  { id: 'next', label: 'Up next' },
  { id: 'list', label: 'List' },
  { id: 'calendar', label: 'Calendar' },
];
const PLACEHOLDER_DELAY = 300;
const SEARCH_DELAY = 300;
const SOON_MINUTES = 15;
const HOUR_PX = 48;
const MAX_LANES = 3;
const ALL_DAY_CHIPS = 2;

// ---------------------------------------------------------------------------
// Small hooks

/** True under 768px (27A); false where matchMedia is missing (tests, old browsers). */
function usePhone() {
  const query = '(max-width: 767px)';
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [phone, setPhone] = useState(get);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const list = window.matchMedia(query);
    const update = () => setPhone(list.matches);
    list.addEventListener?.('change', update);
    return () => list.removeEventListener?.('change', update);
  }, []);
  return phone;
}

/** The current time, refreshed each minute for the now-line. Nothing reads it aloud (28A). */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** True once `active` has stayed true for `delay` ms (9A placeholders). */
function useDelayedFlag(active, delay) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return undefined;
    }
    const timer = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(timer);
  }, [active, delay]);
  return shown;
}

// ---------------------------------------------------------------------------
// Event helpers

const byStart = (a, b) => new Date(a.start) - new Date(b.start);

/** `open(event)` shows the event pop-up (`?event=ID`); null outside the page. */
const EventOpenContext = createContext(null);

const eventKey = (event) => event.id || `${event.title}-${event.start}`;

const saveItem = (event) => (event.id ? {
  kind: 'event',
  key: event.id,
  display_name: event.title,
  event_start: event.start,
  event_end: event.end,
} : null);

const isPhysical = (event) => hasPhysicalLocation(event.location);

/** "Happening now", "Starts in 12 min" (within 15 min), else null (13A). */
export function soonTag(event, now) {
  if (!event?.start || event.all_day) return null;
  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : null;
  if (start <= now && (!end || end > now)) return event.ongoing ? null : 'Happening now';
  const minutes = Math.ceil((start - now) / 60000);
  if (minutes > 0 && minutes <= SOON_MINUTES) return `Starts in ${minutes} min`;
  return null;
}

/** The event Next up features: the next timed event not yet over, else the first one listed. */
export function pickNextUp(events, now) {
  const live = events.filter((event) => !isAllDayLike(event) && (event.end ? new Date(event.end) > now : new Date(event.start) >= now));
  return live.sort(byStart)[0] || events[0] || null;
}

/** "2:00 PM – 5:00 PM" today; "Tomorrow 9:00 AM – 10:00 AM" or "Thu, Oct 29 9:00 AM" on other days (13A). */
function featureWhen(event, timezone, todayKey) {
  const range = formatEventRange(event, timezone);
  const day = dayKey(event.start, timezone);
  if (day === todayKey || event.ongoing) return range;
  return isAllDayLike(event) ? `${relativeDay(day, todayKey)} · ${range}` : `${relativeDay(day, todayKey)} ${range}`;
}

/** Events grouped under the window day they are listed on, days in order. */
function groupByDay(events, days, timezone) {
  const groups = new Map();
  events.forEach((event) => {
    const key = listingDay(event, days, timezone);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, list]) => [key, [
      ...list.filter((event) => isAllDayLike(event)),
      ...list.filter((event) => !isAllDayLike(event)).sort(byStart),
    ]]);
}

// ---------------------------------------------------------------------------
// Pieces shared by the views

function WalkTime({ event, className = '', to = false }) {
  if (event.walk_minutes == null || !isPhysical(event)) return null;
  return (
    <span className={`ev-walk ${className}`.trim()}>
      <Icon name="directions_walk" size={18} />
      {event.walk_minutes} min<span className="sr-only"> walk</span>
      {to && <span className="ev-walk-to">{` to ${event.location}`}</span>}
    </span>
  );
}

function DirectionsLink({ event, compact = false }) {
  if (!event.place_id || !isPhysical(event)) return null;
  const to = `/map?to=${encodeURIComponent(event.place_id)}`;
  const label = `Directions to ${event.location}`;
  return compact ? (
    <Link className="ev-icon-btn" to={to} aria-label={label} title="Directions">
      <Icon name="directions" size={21} />
    </Link>
  ) : (
    <Link className="ev-soft-btn" to={to} aria-label={label}>
      <Icon name="directions_walk" size={20} /> Directions
    </Link>
  );
}

function CalendarButton({ event, compact = false, className = 'ev-soft-btn' }) {
  if (!event.start) return null;
  const label = `Add ${event.title} to calendar`;
  return compact ? (
    <button type="button" className="ev-icon-btn" aria-label={label} title="Add to calendar" onClick={() => downloadEventIcs(event)}>
      <Icon name="calendar_add_on" size={21} />
    </button>
  ) : (
    <button type="button" className={className} aria-label={label} onClick={() => downloadEventIcs(event)}>
      <Icon name="calendar_add_on" size={20} /> Add to calendar
    </button>
  );
}

function EventTitle({ event }) {
  const open = useContext(EventOpenContext);
  if (open && event.id) {
    return (
      <button type="button" className="ev-title ev-title-btn" onClick={() => open(event)}>
        {event.title}
      </button>
    );
  }
  if (!event.url) return <span className="ev-title">{event.title}</span>;
  return (
    <a className="ev-title" href={event.url} target="_blank" rel="noopener noreferrer">
      {event.title}
      <span className="sr-only"> (opens event details in a new tab)</span>
    </a>
  );
}

function NextUp({ event, timezone, todayKey, now }) {
  const tag = soonTag(event, now);
  return (
    <article className="ev-feature" aria-labelledby="ev-feature-title">
      <div className="ev-feature-main">
        <p className="ev-feature-kicker">
          <span>Next up</span>
          <span aria-hidden="true">·</span>
          <span className="ev-feature-when">{featureWhen(event, timezone, todayKey)}</span>
          {tag && <span className="ev-tag">{tag}</span>}
        </p>
        <h3 id="ev-feature-title" className="ev-feature-title"><EventTitle event={event} /></h3>
        {event.location && (
          <p className="ev-feature-meta">
            {event.walk_minutes != null && isPhysical(event) ? <WalkTime event={event} to /> : (
              <span className="ev-feature-place">
                <Icon name="location_on" size={18} /> {event.location}
              </span>
            )}
          </p>
        )}
      </div>
      <div className="ev-feature-actions">
        <CalendarButton event={event} className="ev-mark-btn" />
        <DirectionsLink event={event} />
        <SaveButton item={saveItem(event)} className="ev-save" />
      </div>
    </article>
  );
}

function EventRow({ event, timezone }) {
  const until = isAllDayLike(event) ? null : formatEventRange(event, timezone).split(' – ')[1];
  return (
    <li className="ev-row">
      <span className="ev-row-time">
        <span className="ev-row-start">{formatEventTime(event, timezone)}</span>
        {until && <small>{`to ${until}`}</small>}
      </span>
      <span className="ev-row-text">
        <EventTitle event={event} />
        {event.location && (
          <span className="ev-row-place"><span className="ev-dot" aria-hidden="true" />{event.location}</span>
        )}
      </span>
      <span className="ev-row-walk"><WalkTime event={event} /></span>
      <span className="ev-row-actions">
        <DirectionsLink event={event} compact />
        <CalendarButton event={event} compact />
        <SaveButton item={saveItem(event)} className="ev-save" />
      </span>
    </li>
  );
}

function DayGroups({ groups, timezone, todayKey }) {
  return groups.map(([key, list]) => (
    <section className="ev-day" key={key} aria-labelledby={`ev-day-${key}`}>
      <h3 className="ev-day-heading" id={`ev-day-${key}`}>
        {key === todayKey || key === addDays(todayKey, 1)
          ? `${relativeDay(key, todayKey)} · ${formatDay(key, { weekday: 'short', month: 'short', day: 'numeric' })}`
          : formatDay(key, { weekday: 'long', month: 'short', day: 'numeric' })}
      </h3>
      <ul className="ev-rows">
        {list.map((event) => <EventRow key={eventKey(event)} event={event} timezone={timezone} />)}
      </ul>
    </section>
  ));
}

// ---------------------------------------------------------------------------
// Calendar (20A)

/** Timed events of one day laid into at most three lanes; the rest overflow by start hour. */
export function layoutDay(events, key, timezone) {
  const items = events.map((event) => {
    const start = dayKey(event.start, timezone) === key ? minutesOfDay(event.start, timezone) : 0;
    let end = event.end && dayKey(event.end, timezone) === key ? minutesOfDay(event.end, timezone) : 24 * 60;
    if (!event.end) end = start + 30;
    if (end <= start) end = start + 30;
    return { event, start, end, visualEnd: Math.max(end, start + 30) };
  }).sort((a, b) => a.start - b.start || b.end - a.end);

  const placed = [];
  const overflow = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    const inCluster = [];
    cluster.forEach((item) => {
      let lane = lanes.findIndex((laneEnd) => laneEnd <= item.start);
      if (lane === -1 && lanes.length < MAX_LANES) {
        lanes.push(0);
        lane = lanes.length - 1;
      }
      if (lane === -1) {
        overflow.push(item);
        return;
      }
      lanes[lane] = item.visualEnd;
      inCluster.push({ ...item, lane });
    });
    inCluster.forEach((item) => placed.push({ ...item, laneCount: lanes.length }));
    cluster = [];
    clusterEnd = -1;
  };
  items.forEach((item) => {
    if (cluster.length && item.start >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.visualEnd);
  });
  if (cluster.length) flush();

  const moreByHour = new Map();
  overflow.forEach((item) => {
    const hour = Math.floor(item.start / 60);
    moreByHour.set(hour, (moreByHour.get(hour) || 0) + 1);
  });
  return { items, placed, moreByHour };
}

const hourLabel = (hour) => {
  const h = hour % 24;
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
};

function HourList({ day, hour, events, timezone, onClose }) {
  const closeRef = useRef(null);
  useEffect(() => { closeRef.current?.focus(); }, [day, hour]);
  return (
    <section
      className="ev-hour-list"
      aria-labelledby="ev-hour-list-title"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="ev-hour-list-head">
        <h3 id="ev-hour-list-title">
          {formatDay(day, { weekday: 'short', month: 'short', day: 'numeric' })} · {hourLabel(hour)}
        </h3>
        <button type="button" ref={closeRef} className="ev-icon-btn" aria-label="Close this hour's events" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <ul className="ev-rows">
        {events.map((event) => <EventRow key={eventKey(event)} event={event} timezone={timezone} />)}
      </ul>
    </section>
  );
}

function CalendarWeek({ days, windowSet, events, timezone, todayKey, now, heading }) {
  const openEvent = useContext(EventOpenContext);
  const [expanded, setExpanded] = useState(false);
  const [hourOpen, setHourOpen] = useState(null);
  useEffect(() => { setHourOpen(null); setExpanded(false); }, [days[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  const perDay = useMemo(() => days.map((key) => {
    const allDay = events.filter((event) => isAllDayLike(event) && coversDay(event, key, timezone));
    const timed = events.filter((event) => !isAllDayLike(event) && coversDay(event, key, timezone));
    return { key, allDay, timed, layout: layoutDay(timed, key, timezone) };
  }), [days, events, timezone]);

  const allItems = perDay.flatMap((d) => d.layout.items);
  const firstHour = Math.max(0, Math.min(8, ...allItems.map((i) => Math.floor(i.start / 60))));
  const lastHour = Math.min(24, Math.max(18, ...allItems.map((i) => Math.ceil(i.visualEnd / 60))));
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const bodyHeight = hours.length * HOUR_PX;
  const nowMin = minutesOfDay(now, timezone);
  const showNow = days.includes(todayKey) && nowMin >= firstHour * 60 && nowMin <= lastHour * 60;
  const columns = { gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` };
  const hasAllDay = perDay.some((d) => d.allDay.length);

  const openHour = hourOpen && perDay.find((d) => d.key === hourOpen.day);
  const hourEvents = openHour
    ? openHour.layout.items.filter((i) => Math.floor(i.start / 60) === hourOpen.hour).map((i) => i.event)
    : [];

  return (
    <div className="ev-calendar">
      <div className="ev-cal" data-testid="events-calendar-grid">
        <div className="ev-cal-row ev-cal-head" data-testid="events-calendar-head" style={columns} aria-hidden="true">
          <span />
          {days.map((key) => (
            <span
              key={key}
              data-testid="events-calendar-day"
              className={`ev-cal-dayname ${key === todayKey ? 'is-today' : ''} ${windowSet.has(key) ? '' : 'is-outside'}`}
            >
              {formatDay(key, { weekday: 'short', day: 'numeric' })}
            </span>
          ))}
        </div>

        {hasAllDay && (
          <div className="ev-cal-row ev-cal-allday" style={columns}>
            <span className="ev-cal-gutter" aria-hidden="true">All day</span>
            {perDay.map(({ key, allDay }) => {
              const shown = expanded ? allDay : allDay.slice(0, ALL_DAY_CHIPS);
              const more = allDay.length - shown.length;
              return (
                <div key={key} className={`ev-cal-allday-cell ${key === todayKey ? 'is-today' : ''}`}>
                  {shown.map((event) => (
                    <span key={eventKey(event)} className="ev-chip" title={event.title} aria-hidden="true">{event.title}</span>
                  ))}
                  {more > 0 && (
                    <button
                      type="button"
                      className="ev-more"
                      aria-expanded={expanded}
                      aria-label={`Show ${more} more all-day events on ${formatDay(key, { weekday: 'long', month: 'long', day: 'numeric' })}`}
                      onClick={() => setExpanded(true)}
                    >
                      +{more} more
                    </button>
                  )}
                  {expanded && allDay.length > ALL_DAY_CHIPS && (
                    <button type="button" className="ev-more" aria-expanded="true" onClick={() => setExpanded(false)}>
                      Show less
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="ev-cal-row ev-cal-body" style={{ ...columns, height: bodyHeight }}>
          <div className="ev-cal-gutter ev-cal-hours" aria-hidden="true">
            {hours.map((hour) => (
              <span key={hour} style={{ top: (hour - firstHour) * HOUR_PX }}>{hourLabel(hour)}</span>
            ))}
          </div>
          {perDay.map(({ key, timed, layout }) => (
            <div
              key={key}
              className={`ev-cal-col ${key === todayKey ? 'is-today' : ''} ${windowSet.has(key) ? '' : 'is-outside'}`}
            >
              {hours.map((hour) => (
                <span key={hour} className="ev-cal-line" style={{ top: (hour - firstHour) * HOUR_PX }} aria-hidden="true" />
              ))}
              {windowSet.has(key) && timed.length === 0 && (
                <span className="ev-cal-none" aria-hidden="true">Nothing listed</span>
              )}
              {layout.placed.map((item) => {
                const top = ((item.start - firstHour * 60) / 60) * HOUR_PX;
                const height = Math.max(24, ((item.end - item.start) / 60) * HOUR_PX - 2);
                const width = 100 / item.laneCount;
                return (
                  // Hidden from assistive tech and the tab order: the agenda below is that path.
                  <button
                    type="button"
                    tabIndex={-1}
                    key={eventKey(item.event)}
                    className="ev-block"
                    data-testid="events-calendar-block"
                    aria-hidden="true"
                    title={`${item.event.title} · ${formatEventRange(item.event, timezone)}`}
                    style={{ top, height, left: `${item.lane * width}%`, width: `calc(${width}% - 2px)` }}
                    onClick={openEvent && item.event.id ? () => openEvent(item.event) : undefined}
                  >
                    <span className="ev-block-title">{item.event.title}</span>
                    {height >= 52 && <span className="ev-block-time">{formatEventTime(item.event, timezone)}</span>}
                  </button>
                );
              })}
              {[...layout.moreByHour.entries()].map(([hour, count]) => (
                <button
                  key={hour}
                  type="button"
                  className="ev-more ev-more-hour"
                  style={{ top: (hour - firstHour) * HOUR_PX }}
                  aria-label={`Show all events at ${hourLabel(hour)} on ${formatDay(key, { weekday: 'long', month: 'long', day: 'numeric' })} (${count} more)`}
                  onClick={() => setHourOpen({ day: key, hour })}
                >
                  +{count} more
                </button>
              ))}
              {showNow && key === todayKey && (
                <span
                  className="ev-now-line"
                  data-testid="events-now-line"
                  aria-hidden="true"
                  style={{ top: ((nowMin - firstHour * 60) / 60) * HOUR_PX }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {openHour && (
        <HourList
          day={hourOpen.day}
          hour={hourOpen.hour}
          events={hourEvents}
          timezone={timezone}
          onClose={() => setHourOpen(null)}
        />
      )}

      {/* Screen readers get the week as a list of days with events (28A). */}
      <div className="sr-only">
        <h3>{heading}, by day</h3>
        <ul>
          {perDay.filter((d) => d.allDay.length || d.timed.length).map((d) => (
            <li key={d.key}>
              {formatDay(d.key, { weekday: 'long', month: 'long', day: 'numeric' })}
              <ul>
                {[...d.allDay, ...[...d.timed].sort(byStart)].map((event) => (
                  <li key={eventKey(event)}>
                    {formatEventRange(event, timezone)}: {event.title}
                    {event.location ? `, ${event.location}` : ''}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Phones: one day at a time with day arrows (27A). */
function DayAgenda({ days, events, timezone, todayKey }) {
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [days[0], days.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const key = days[Math.min(index, days.length - 1)];
  const list = events.filter((event) => coversDay(event, key, timezone));
  const ordered = [...list.filter((e) => isAllDayLike(e)), ...list.filter((e) => !isAllDayLike(e)).sort(byStart)];
  const name = formatDay(key, { weekday: 'long', month: 'short', day: 'numeric' });
  return (
    <div className="ev-agenda">
      <div className="ev-agenda-nav">
        <button type="button" className="ev-icon-btn" aria-label="Previous day" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <h3 className="ev-agenda-day" aria-live="polite">
          {key === todayKey || key === addDays(todayKey, 1) ? `${relativeDay(key, todayKey)} · ${name}` : name}
        </h3>
        <button
          type="button"
          className="ev-icon-btn"
          aria-label="Next day"
          disabled={index >= days.length - 1}
          onClick={() => setIndex(index + 1)}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      {ordered.length ? (
        <ul className="ev-rows">
          {ordered.map((event) => <EventRow key={eventKey(event)} event={event} timezone={timezone} />)}
        </ul>
      ) : <p className="ev-muted">Nothing listed on this day.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Start place (16A)

function StartPlace({ origin, authToken, onPick }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState({ status: 'idle', places: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const buttonRef = useRef(null);
  const inputRef = useRef(null);
  const boxRef = useRef(null);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setQ('');
    setError(null);
    if (refocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    inputRef.current?.focus();
    const onDown = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) close(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);

  useEffect(() => {
    if (!open) return undefined;
    const text = q.trim();
    if (!text) {
      setResults({ status: 'idle', places: [] });
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setResults((current) => ({ ...current, status: 'loading' }));
      listPlaces(authToken, { q: text, limit: 8 })
        .then((data) => {
          if (cancelled) return;
          const places = Array.isArray(data) ? data : data?.places || [];
          setResults({ status: 'ready', places });
        })
        .catch(() => { if (!cancelled) setResults({ status: 'error', places: [] }); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [q, open, authToken]);

  const pick = (place) => {
    setSaving(true);
    setError(null);
    setCampusOrigin(authToken, place.id)
      .then((data) => {
        onPick(data?.place || place);
        close();
      })
      .catch(() => setError("Couldn't save your starting place. Try again."))
      .finally(() => setSaving(false));
  };

  let label = 'Loading…';
  if (origin.status === 'ready') label = origin.place?.name || 'Not set';
  if (origin.status === 'error') label = 'Unavailable';

  return (
    <div className="ev-start" ref={boxRef}>
      <Icon name="near_me" size={18} className="ev-start-icon" />
      <span className="ev-start-label">Starting from</span>
      <span className="ev-start-place">{label}</span>
      <span aria-hidden="true" className="ev-muted">·</span>
      <button
        type="button"
        ref={buttonRef}
        className="ev-link-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Change starting place${origin.place?.name ? ` (now ${origin.place.name})` : ''}`}
        onClick={() => (open ? close() : setOpen(true))}
      >
        Change
      </button>
      {open && (
        <div
          className="ev-popover"
          role="dialog"
          aria-label="Choose a starting place"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              close();
            }
          }}
        >
          <label htmlFor="ev-start-search" className="sr-only">Search campus places</label>
          <div className="ev-search ev-popover-search">
            <Icon name="search" size={20} />
            <input
              id="ev-start-search"
              ref={inputRef}
              type="search"
              value={q}
              placeholder="Search a building or place"
              autoComplete="off"
              onChange={(event) => setQ(event.target.value)}
            />
          </div>
          <div role="status" aria-live="polite" className="ev-popover-status">
            {results.status === 'loading' && 'Searching…'}
            {results.status === 'error' && "Couldn't search places right now."}
            {results.status === 'ready' && results.places.length === 0 && `No places match “${q.trim()}”.`}
            {error}
          </div>
          {results.places.length > 0 && (
            <ul className="ev-popover-list">
              {results.places.map((place) => (
                <li key={place.id}>
                  <button type="button" disabled={saving} onClick={() => pick(place)}>
                    <Icon name="location_on" size={18} /> {place.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// States

function Placeholders({ view }) {
  if (view === 'calendar') return <div className="ev-ph ev-ph-grid" aria-hidden="true" />;
  return (
    <div aria-hidden="true" className="ev-ph-wrap" data-testid="events-placeholder">
      {view === 'next' && <div className="ev-ph ev-ph-feature" />}
      {Array.from({ length: 5 }, (_, i) => <div key={i} className="ev-ph ev-ph-row" />)}
    </div>
  );
}

function ListedThrough({ date }) {
  if (!date) return null;
  return (
    <p className="ev-listed">
      Listed through {formatDay(date, { weekday: 'short', month: 'short', day: 'numeric' })}. Later events aren’t published yet.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Page

const EventsPage = () => {
  const navigate = useNavigate();
  const { user, authToken, handleSignOut, handleUserUpdate } = useAuth();
  const { config } = useAppConfig();
  const [params, setParams] = useSearchParams();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const phone = usePhone();
  const now = useNow();

  const school = config?.app?.institution || config?.app?.title || 'Your campus';
  const configZone = config?.school?.timezone;

  const view = VIEWS.some((v) => v.id === params.get('view')) ? params.get('view') : 'next';
  const windowId = WINDOW_IDS.includes(params.get('window')) ? params.get('window') : 'today';
  const q = params.get('q') || '';

  const update = useCallback((changes, options) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(changes).forEach(([key, value]) => {
        if (value) next.set(key, value);
        else next.delete(key);
      });
      return next;
    }, options);
  }, [setParams]);

  // Search box: typing updates ?q= after a pause; the URL wins when it changes elsewhere.
  const [draft, setDraft] = useState(q);
  const lastSent = useRef(q);
  useEffect(() => {
    if (q !== lastSent.current) {
      lastSent.current = q;
      setDraft(q);
    }
  }, [q]);
  useEffect(() => {
    const text = draft.trim();
    if (text === lastSent.current) return undefined;
    const timer = setTimeout(() => {
      lastSent.current = text;
      update({ q: text }, { replace: true });
    }, SEARCH_DELAY);
    return () => clearTimeout(timer);
  }, [draft, update]);

  // Start place (16A), shared with the Campus map.
  const [origin, setOrigin] = useState({ status: 'loading', place: null });
  useEffect(() => {
    if (!authToken) return undefined;
    let cancelled = false;
    getCampusOrigin(authToken)
      .then((data) => { if (!cancelled) setOrigin({ status: 'ready', place: data?.place || null }); })
      .catch(() => { if (!cancelled) setOrigin({ status: 'error', place: null }); });
    return () => { cancelled = true; };
  }, [authToken]);

  // Events for the window (one window drives every view, 8A).
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ status: 'loading', data: null });
  const sources = useRef([]);
  const originId = origin.place?.id || '';
  const originReady = origin.status !== 'loading';
  useEffect(() => {
    if (!authToken || !originReady) return undefined;
    const controller = new AbortController();
    setResult({ status: 'loading', data: null });
    listEvents(authToken, { window: windowId, q, from: originId || undefined }, { signal: controller.signal })
      .then((data) => {
        if (data?.source?.length) sources.current = data.source;
        const events = Array.isArray(data?.events) ? data.events : [];
        setResult({ status: data?.error && events.length === 0 ? 'error' : 'ready', data: { ...data, events } });
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        setResult({ status: 'error', data: null });
      });
    return () => controller.abort();
  }, [authToken, windowId, q, originId, originReady, attempt]);

  const loading = result.status === 'loading';
  const showPlaceholders = useDelayedFlag(loading, PLACEHOLDER_DELAY);
  const timezone = result.data?.timezone || configZone;
  const todayKey = dayKey(now, timezone);
  const days = useMemo(() => windowDays(windowId, todayKey), [windowId, todayKey]);
  const lastDay = days[days.length - 1];
  const heading = windowHeading(windowId, todayKey);
  const events = useMemo(() => [...(result.data?.events || [])].sort(byStart), [result.data]);
  const listedThrough = result.data?.listed_through;
  const listedInside = Boolean(listedThrough) && listedThrough < lastDay;

  const nextUp = view === 'next' ? pickNextUp(events, now) : null;
  const laterEvents = nextUp
    ? events.filter((event) => event !== nextUp && (isAllDayLike(event) || !event.end || new Date(event.end) > now))
    : events;

  const calendarDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(days[0], i)), [days]);
  const windowSet = useMemo(() => new Set(days), [days]);
  const windowIndex = WINDOW_IDS.indexOf(windowId);

  const sourceText = (result.data?.source?.length ? result.data.source : sources.current).join(', ');

  const tabRefs = useRef({});
  const onTabKey = (event) => {
    const index = VIEWS.findIndex((v) => v.id === view);
    let next = null;
    if (event.key === 'ArrowRight') next = VIEWS[(index + 1) % VIEWS.length];
    if (event.key === 'ArrowLeft') next = VIEWS[(index - 1 + VIEWS.length) % VIEWS.length];
    if (event.key === 'Home') [next] = VIEWS;
    if (event.key === 'End') next = VIEWS[VIEWS.length - 1];
    if (!next) return;
    event.preventDefault();
    update({ view: next.id === 'next' ? '' : next.id });
    tabRefs.current[next.id]?.focus();
  };

  const handleSignOutClick = () => {
    handleSignOut();
    navigate('/', { replace: true });
  };

  // The event pop-up (?event=ID) over the page column (D3).
  const eventId = params.get(EVENT_PARAM) || '';
  const openParam = useOpenParam(EVENT_PARAM);
  const openEvent = useCallback((event) => openParam(event?.id), [openParam]);
  const closeEvent = useCloseOnce(eventId, useCloseParam(EVENT_PARAM));
  const popup = usePopupContainer();
  const ask = usePopupAsk(eventId, closeEvent);
  const seedEvent = eventId ? events.find((event) => event.id === eventId) : null;

  let body;
  if (result.status === 'error') {
    body = (
      <div className="ev-error" role="alert">
        <span>
          Couldn&apos;t load events from {sourceText || 'the campus calendars'}
          {' · '}
        </span>
        <button type="button" className="ev-link-btn" onClick={() => setAttempt((n) => n + 1)}>
          <RefreshCw size={14} aria-hidden="true" /> Retry
        </button>
      </div>
    );
  } else if (loading) {
    body = showPlaceholders ? <Placeholders view={view} /> : null;
  } else if (events.length === 0) {
    body = (
      <div className="ev-empty">
        <p className="ev-empty-title">
          Nothing listed for {windowPhrase(windowId, todayKey)}{q ? ` matching “${q}”` : ''}
        </p>
        <ListedThrough date={listedInside ? listedThrough : null} />
        {windowId !== 'next_7_days' ? (
          <button type="button" className="ev-soft-btn" onClick={() => update({ window: 'next_7_days' })}>
            Try Next 7 days
          </button>
        ) : q && (
          <button type="button" className="ev-soft-btn" onClick={() => { setDraft(''); lastSent.current = ''; update({ q: '' }); }}>
            Clear search
          </button>
        )}
      </div>
    );
  } else if (view === 'calendar') {
    body = phone
      ? <DayAgenda days={days} events={events} timezone={timezone} todayKey={todayKey} />
      : (
        <CalendarWeek
          days={calendarDays}
          windowSet={windowSet}
          events={events}
          timezone={timezone}
          todayKey={todayKey}
          now={now}
          heading={heading}
        />
      );
  } else {
    body = (
      <>
        {nextUp && <NextUp event={nextUp} timezone={timezone} todayKey={todayKey} now={now} />}
        {laterEvents.length > 0 && (
          <DayGroups groups={groupByDay(laterEvents, days, timezone)} timezone={timezone} todayKey={todayKey} />
        )}
      </>
    );
  }

  const partialError = result.status === 'ready' && result.data?.error;
  const tzName = zoneName(timezone);

  return (
    <EventOpenContext.Provider value={openEvent}>
      <div className="campus-home ev-page">
        <CampusRail
          onNewChat={() => navigate('/chat', { state: { startNew: true } })}
          onSelectSession={(sessionId) => navigate('/chat', { state: { sessionId } })}
          onShowAllChats={() => navigate('/search')}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onSignOut={handleSignOutClick}
        />

        <main className="campus-main ev-main" id="main-content">
          <div className="ev-column">
            <header className="ev-header">
              <div className="ev-title-row">
                <div>
                  <p className="campus-kicker">{school}</p>
                  <h1>Events</h1>
                </div>
                <div className="ev-tabs" role="tablist" aria-label="Events view">
                  {VIEWS.map(({ id, label }) => (
                    <button
                      key={id}
                      id={`ev-tab-${id}`}
                      ref={(node) => { tabRefs.current[id] = node; }}
                      type="button"
                      role="tab"
                      aria-selected={view === id}
                      aria-controls="ev-panel"
                      tabIndex={view === id ? 0 : -1}
                      className={`ev-tab ${view === id ? 'is-current' : ''}`}
                      onClick={() => update({ view: id === 'next' ? '' : id })}
                      onKeyDown={onTabKey}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <StartPlace
                origin={origin}
                authToken={authToken}
                onPick={(place) => setOrigin({ status: 'ready', place })}
              />
            </header>

            <div className="ev-controls">
              <div className="ev-chips" role="group" aria-label="When">
                {WINDOWS.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className={`ev-chip-btn ${windowId === w.id ? 'is-current' : ''}`}
                    aria-pressed={windowId === w.id}
                    onClick={() => update({ window: w.id === 'today' ? '' : w.id })}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
              <form
                className="ev-search"
                role="search"
                onSubmit={(event) => {
                  event.preventDefault();
                  lastSent.current = draft.trim();
                  update({ q: draft.trim() }, { replace: true });
                }}
              >
                <Icon name="search" size={20} />
                <label htmlFor="ev-search-input" className="sr-only">Search events</label>
                <input
                  id="ev-search-input"
                  type="search"
                  value={draft}
                  placeholder="Search events"
                  onChange={(event) => setDraft(event.target.value)}
                />
              </form>
            </div>

            <section
              id="ev-panel"
              role="tabpanel"
              aria-labelledby={`ev-tab-${view}`}
              aria-busy={loading}
              className="ev-panel"
            >
              <div className="ev-results-head">
                {view === 'calendar' && !phone && (
                  <button
                    type="button"
                    className="ev-icon-btn"
                    disabled={windowIndex <= 0}
                    aria-label={windowIndex > 0 ? `Previous: ${windowLabel(WINDOW_IDS[windowIndex - 1])}` : 'Previous'}
                    onClick={() => update({ window: WINDOW_IDS[windowIndex - 1] === 'today' ? '' : WINDOW_IDS[windowIndex - 1] })}
                  >
                    <ChevronLeft size={18} aria-hidden="true" />
                  </button>
                )}
                <h2 className="ev-heading">{heading}</h2>
                {view === 'calendar' && !phone && (
                  <button
                    type="button"
                    className="ev-icon-btn"
                    disabled={windowIndex >= WINDOW_IDS.length - 1}
                    aria-label={windowIndex < WINDOW_IDS.length - 1 ? `Next: ${windowLabel(WINDOW_IDS[windowIndex + 1])}` : 'Next'}
                    onClick={() => update({ window: WINDOW_IDS[windowIndex + 1] })}
                  >
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                )}
                {tzName && <span className="ev-tz">Times in {tzName}</span>}
              </div>

              {partialError && (
                <div className="ev-banner" role="status">
                  <span>{result.data.error}</span>
                  <button type="button" className="ev-link-btn" onClick={() => setAttempt((n) => n + 1)}>
                    <RefreshCw size={14} aria-hidden="true" /> Retry
                  </button>
                </div>
              )}
              {result.status === 'ready' && events.length > 0 && listedInside && <ListedThrough date={listedThrough} />}

              <p className="sr-only" role="status" aria-live="polite">
                {result.status === 'ready' ? `${events.length} ${events.length === 1 ? 'event' : 'events'} for ${windowPhrase(windowId, todayKey)}` : ''}
              </p>

              {body}
            </section>

            {sourceText && (
              <p className="campus-footnote ev-foot">
                From {sourceText} · Add to calendar downloads an .ics file for Google, Apple or Outlook Calendar
              </p>
            )}
          </div>
        </main>

        {isSettingsOpen && (
          <SettingsModal
            user={user}
            authToken={authToken}
            onUserUpdate={handleUserUpdate}
            onSignOut={handleSignOutClick}
            onClose={() => setIsSettingsOpen(false)}
          />
        )}

        {eventId && popup.ready && (
          <AppDialog
            open
            container={popup.container}
            onClose={closeEvent}
            maxWidth={false}
            aria-labelledby="event-popup-title"
            slotProps={{ paper: { className: 'pop-dialog-paper' } }}
          >
            <EventPopup
              eventId={eventId}
              event={seedEvent}
              from={originId || undefined}
              timezone={timezone}
              onAsk={ask}
              onClose={closeEvent}
              onOpenEvent={openEvent}
              titleId="event-popup-title"
            />
          </AppDialog>
        )}
      </div>
    </EventOpenContext.Provider>
  );
};

export default EventsPage;
