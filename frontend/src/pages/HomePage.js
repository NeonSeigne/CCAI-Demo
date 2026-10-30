import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';
import Composer from '../components/chat/Composer';
import PanelState from '../components/panel/PanelState';
import SaveButton from '../components/SaveButton';
import { useAuth } from '../contexts/AuthContext';
import { useSaved } from '../contexts/SavedContext';
import { listEvents } from '../api/campus';
import { getToday } from '../api/planner';
import { useCourse } from '../modules/course';
import {
  dateLabel, endLine, eventTime, meetingClock, rangeParts, useSchool, useStartPlace, walkText,
} from '../modules/campus';
import { downloadEventIcs } from '../utils/ics';
import { useOpenCourse } from '../utils/openCourse';
import '../styles/CampusHome.css';

const NEXT_UP_LIMIT = 4;
const SAVED_LIMIT = 4;
// "Next up" looks this far ahead.
const NEXT_HOURS = 12;

/**
 * Today's events still ahead (or under way) within the next hours, earliest
 * first. All-day and multi-day runs are left to the Events page.
 */
export function nextUp(events, now = Date.now()) {
  const horizon = now + NEXT_HOURS * 3600 * 1000;
  return (events || [])
    .filter((event) => event?.start && !event.all_day && !event.ongoing)
    .filter((event) => {
      const start = new Date(event.start).getTime();
      const end = event.end ? new Date(event.end).getTime() : start;
      return end > now && start < horizon;
    })
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, NEXT_UP_LIMIT);
}

/**
 * An event's two time lines (ask-home.html): "12:00" over "to 1:00 PM"; the
 * start keeps its meridiem only when the end's differs or there is no end.
 */
export function eventClock(event, timezone) {
  const end = endLine(event, timezone);
  if (!end || !end.startsWith('to ')) return { start: eventTime(event, timezone), end };
  return { start: rangeParts(event, timezone).start, end };
}

/** Today's events with walking minutes from the student's start place. */
function useTodayEvents(authToken) {
  const [today, setToday] = useState({ loading: true, events: [], failed: false });
  const [attempt, setAttempt] = useState(0);
  const start = useStartPlace();
  const startReady = start.status !== 'loading';
  const from = start.id || undefined;
  useEffect(() => {
    if (!authToken || !startReady) return undefined;
    let cancelled = false;
    setToday((current) => ({ ...current, loading: true, failed: false }));
    listEvents(authToken, { window: 'today', from })
      .then((data) => {
        if (!cancelled) setToday({ loading: false, events: Array.isArray(data?.events) ? data.events : [], failed: false });
      })
      .catch(() => {
        if (!cancelled) setToday({ loading: false, events: [], failed: true });
      });
    return () => { cancelled = true; };
  }, [authToken, startReady, from, attempt]);
  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  return { ...today, retry };
}

/**
 * "Your classes today" (R12) from GET /api/planner/today: the meetings, or
 * an empty list when the card hides (no term dates, a weekend, outside the
 * term, no meetings) or the request fails.
 */
function useClassesToday(authToken) {
  const [meetings, setMeetings] = useState([]);
  useEffect(() => {
    if (!authToken) return undefined;
    let cancelled = false;
    getToday(authToken)
      .then((data) => {
        if (!cancelled) setMeetings(data?.show && Array.isArray(data.meetings) ? data.meetings : []);
      })
      .catch(() => { if (!cancelled) setMeetings([]); });
    return () => { cancelled = true; };
  }, [authToken]);
  return meetings;
}

function EventRow({ event, timezone }) {
  const clock = eventClock(event, timezone);
  return (
    <li className="ah-evt">
      <span className="ah-time">
        {clock.start}
        {clock.end && <small>{clock.end}</small>}
      </span>
      <span className="ah-what">
        <b>{event.title}</b>
        {event.location && (
          <span>
            <Icon name="location_on" size={16} />
            <span>{event.location}</span>
          </span>
        )}
      </span>
      {walkText(event.walk_minutes)
        ? <span className="ah-walk"><Icon name="directions_walk" size={18} />{walkText(event.walk_minutes)}</span>
        : <span />}
      <span className="ah-acts">
        <button
          type="button"
          className="ah-icon-btn"
          aria-label={`Add ${event.title} to calendar`}
          onClick={() => downloadEventIcs(event)}
        >
          <Icon name="calendar_add_on" size={21} />
        </button>
        <SaveButton
          className="ah-save"
          item={event.id ? {
            kind: 'event', key: event.id, display_name: event.title, event_start: event.start, event_end: event.end,
          } : null}
        />
      </span>
    </li>
  );
}

/** A saved course: its code in the 104px column, then its title. */
function SavedCourseRow({ item, onOpenCourse }) {
  const { data } = useCourse(item.key);
  const code = item.display_name || item.key;
  const title = data?.title && data.title !== code ? data.title : null;
  return (
    <li>
      <button type="button" className="ah-saved-row" onClick={() => onOpenCourse(item.key)}>
        <span className="ah-saved-code">{code}</span>
        <span className="ah-saved-name">{title || code}</span>
      </button>
    </li>
  );
}

function SavedRow({ item, onOpenCourse }) {
  if (item.kind === 'course') return <SavedCourseRow item={item} onOpenCourse={onOpenCourse} />;
  const name = item.display_name || item.key;
  const to = item.kind === 'place' ? `/map?to=${encodeURIComponent(item.key)}` : '/saved';
  return (
    <li>
      <Link className="ah-saved-row" to={to}>
        <span className="ah-saved-code">
          <Icon name={item.kind === 'place' ? 'location_on' : 'event'} size={18} />
        </span>
        <span className="ah-saved-name">{name}</span>
      </Link>
    </li>
  );
}

function NextUpRows({ today, upcoming, timezone }) {
  if (today.loading) {
    return (
      <PanelState status="loading" label="Loading today’s events">
        {[0, 1, 2].map((row) => (
          <div key={row} className="ah-evt ah-evt-skeleton">
            <span className="pnl-block" />
            <span className="pnl-block" />
          </div>
        ))}
      </PanelState>
    );
  }
  if (today.failed) return <PanelState status="error" message="Couldn’t load today’s events" onRetry={today.retry} />;
  if (!upcoming.length) return <PanelState status="empty" icon="event" />;
  return (
    <ul className="ah-list">
      {upcoming.map((event) => (
        <EventRow key={event.id || `${event.title}-${event.start}`} event={event} timezone={timezone} />
      ))}
    </ul>
  );
}

/**
 * The Ask home (ask-home.html): the date, the heading and the composer, then
 * Next up beside "Your classes today" and Saved. Each side panel shows only
 * with rows; with neither, Next up takes the full width (design Q6).
 */
const HomePage = () => {
  const navigate = useNavigate();
  const { authToken } = useAuth();
  const { name: school, timezone, zoneLabel } = useSchool();
  const saved = useSaved();
  const openCourse = useOpenCourse();

  const today = useTodayEvents(authToken);
  const upcoming = nextUp(today.events);
  const classes = useClassesToday(authToken);
  const savedItems = (saved?.items || []).slice(0, SAVED_LIMIT);
  const showSide = classes.length > 0 || savedItems.length > 0;

  return (
    <div className="campus-home">
      <main className="campus-main ah-main" id="main-content">
        <div className="ah-column">
          <header className="ah-hero">
            <p className="campus-kicker ah-date">{school} · {dateLabel(new Date(), timezone)}</p>
            <div className="ah-title-row">
              <h1>What do you need on campus today?</h1>
              {/* Phones: the rail's Recent isn't there, so chats open from here (design Q21). */}
              <button
                type="button"
                className="ah-history"
                aria-label="Search chats"
                onClick={() => navigate('/search')}
              >
                <Icon name="history" size={24} />
              </button>
            </div>
            <Composer surface="home" />
          </header>

          <div className={`ah-bento ${showSide ? '' : 'is-single'}`.trim()}>
            <section aria-labelledby="ah-next" className="ah-panel">
              <div className="ah-panel-h">
                <h2 id="ah-next">Next up</h2>
                {zoneLabel && <span className="ah-tz">Times in {zoneLabel}</span>}
              </div>
              <NextUpRows today={today} upcoming={upcoming} timezone={timezone} />
              <Link className="ah-more" to="/events">All events today</Link>
            </section>

            {showSide && (
              <div className="ah-side">
                {classes.length > 0 && (
                  <section aria-labelledby="ah-classes" className="ah-panel">
                    <div className="ah-panel-h">
                      <h2 id="ah-classes">Your classes today</h2>
                    </div>
                    <ul className="ah-list">
                      {classes.map((row) => (
                        <li key={`${row.course}-${row.section}-${row.start}`}>
                          <button type="button" className="ah-cls" onClick={() => openCourse(row.course)}>
                            <span className="ah-time">{meetingClock(row.start)}</span>
                            <span>
                              <span className="ah-code">{row.course}</span>
                              {row.title && <b>{row.title}</b>}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {savedItems.length > 0 && (
                  <section aria-labelledby="ah-saved" className="ah-panel">
                    <div className="ah-panel-h">
                      <h2 id="ah-saved">Saved</h2>
                    </div>
                    <ul className="ah-list ah-saved">
                      {savedItems.map((item) => (
                        <SavedRow key={`${item.kind}-${item.key}`} item={item} onOpenCourse={openCourse} />
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default HomePage;
