import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUp, Icon } from '../components/icons';
import CampusRail, { RecentChats, useRecentChats } from '../components/CampusRail';
import SettingsModal from '../components/SettingsModal';
import SaveButton from '../components/SaveButton';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { usePlanner } from '../contexts/PlannerContext';
import { useSaved } from '../contexts/SavedContext';
import { getCampusOrigin, getCatalogCourse, listEvents } from '../api/campus';
import { formatEventTime, hasPhysicalLocation } from '../components/visuals/EventListCard';
import { classesOn, coursesOnDate, dateIn } from '../components/planner/semester/semesterData';
import { clockText } from '../components/planner/planFormat';
import { downloadEventIcs } from '../utils/ics';
import { useOpenCourse } from '../utils/openCourse';
import '../styles/CampusHome.css';

const NEXT_UP_LIMIT = 4;
const SAVED_LIMIT = 4;
// "Next up" looks this far ahead.
const NEXT_HOURS = 12;

const todayLabel = (timezone) => {
  try {
    return new Date().toLocaleDateString(undefined, {
      weekday: 'long', month: 'short', day: 'numeric', timeZone: timezone || undefined,
    });
  } catch {
    return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  }
};

const timeOf = (iso, timezone) => {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', ...(timezone ? { timeZone: timezone } : {}) });
  } catch {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
};

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

/** Today's events with walking minutes from the student's start place. */
function useTodayEvents(authToken) {
  const [today, setToday] = useState({ loading: true, events: [], error: null, source: [] });
  useEffect(() => {
    if (!authToken) return undefined;
    let cancelled = false;
    getCampusOrigin(authToken)
      .then((data) => data?.place?.id || undefined)
      .catch(() => undefined)
      .then((from) => listEvents(authToken, { window: 'today', from }))
      .then((data) => {
        if (cancelled) return;
        const events = Array.isArray(data?.events) ? data.events : [];
        setToday({ loading: false, events, error: events.length ? null : data?.error, source: data?.source || [] });
      })
      .catch(() => {
        if (!cancelled) setToday({ loading: false, events: [], error: 'Events are unavailable right now.', source: [] });
      });
    return () => { cancelled = true; };
  }, [authToken]);
  return today;
}

/**
 * "Your classes today" (R12): the plan's chosen sections in the term that
 * takes in today, meeting today in the school's time zone. Null (no board)
 * without a plan, or when a time or date range is unknown.
 */
function useClassesToday(authToken, timezone) {
  const planner = usePlanner();
  const plan = planner?.view?.plan;
  const date = dateIn(timezone);
  const courses = useMemo(() => coursesOnDate(plan, date), [plan, date]);
  const [summaries, setSummaries] = useState(null);

  const plannerRef = useRef(planner);
  plannerRef.current = planner;
  useEffect(() => { plannerRef.current?.ensureLoaded?.(); }, []);

  const ids = courses.map((c) => c.id).join('|');
  useEffect(() => {
    if (!authToken || !ids) {
      setSummaries(null);
      return undefined;
    }
    let cancelled = false;
    Promise.all(ids.split('|').map((id) => getCatalogCourse(authToken, id).then((data) => [id, data]).catch(() => [id, null])))
      .then((pairs) => { if (!cancelled) setSummaries(new Map(pairs.filter(([, data]) => data))); });
    return () => { cancelled = true; };
  }, [authToken, ids]);

  return useMemo(() => (summaries ? classesOn(plan, summaries, date) : null), [plan, summaries, date]);
}

function EventRow({ event, timezone, onAsk }) {
  const physical = hasPhysicalLocation(event.location);
  return (
    <li className="home-evt">
      <span className="home-time">
        {formatEventTime(event, timezone)}
        {event.end && event.end !== event.start && <small>to {timeOf(event.end, timezone)}</small>}
      </span>
      <span className="home-what">
        <b>{event.title}</b>
        {event.location && (
          <span>
            <Icon name="location_on" size={16} />
            <span>{event.location}</span>
          </span>
        )}
      </span>
      {event.walk_minutes != null
        ? <span className="home-walk"><Icon name="directions_walk" size={18} />{event.walk_minutes} min</span>
        : <span />}
      <span className="home-acts">
        {physical && (
          <button type="button" className="home-chip" onClick={() => onAsk(`How do I get to ${event.location}?`)}>
            Directions
          </button>
        )}
        <button
          type="button"
          className="home-icon-btn"
          aria-label={`Add ${event.title} to calendar`}
          onClick={() => downloadEventIcs(event)}
        >
          <Icon name="calendar_add_on" size={21} />
        </button>
        <SaveButton
          className="home-save"
          item={event.id ? {
            kind: 'event', key: event.id, display_name: event.title, event_start: event.start, event_end: event.end,
          } : null}
        />
      </span>
    </li>
  );
}

function SavedRow({ item, onOpenCourse }) {
  const marker = {
    course: null,
    event: <Icon name="event" size={18} />,
    place: <Icon name="location_on" size={18} />,
  }[item.kind];
  const name = item.display_name || item.key;
  if (item.kind === 'course') {
    return (
      <li>
        <button type="button" className="home-saved-row" onClick={() => onOpenCourse(item.key)}>
          <span className="home-code">{name}</span>
        </button>
      </li>
    );
  }
  const to = item.kind === 'place' ? `/map?to=${encodeURIComponent(item.key)}` : '/saved';
  return (
    <li>
      <Link className="home-saved-row" to={to}>
        <span className="home-saved-kind">{marker}</span>
        <span className="home-saved-name">{name}</span>
      </Link>
    </li>
  );
}

const HomePage = () => {
  const navigate = useNavigate();
  const { user, authToken, handleSignOut, handleUserUpdate } = useAuth();
  const { config, advisors } = useAppConfig();
  const saved = useSaved();
  const openCourse = useOpenCourse();
  const [question, setQuestion] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const inputRef = useRef(null);
  const recent = useRecentChats(authToken);

  const school = config?.app?.institution || config?.app?.title || 'Your campus';
  const timezone = config?.school?.timezone;
  const starters = config?.homepage?.starters || [];
  const today = useTodayEvents(authToken);
  const upcoming = nextUp(today.events);
  const classes = useClassesToday(authToken, timezone);
  const savedItems = (saved?.items || []).slice(0, SAVED_LIMIT);

  const ask = (text) => {
    const prompt = (text || '').trim();
    if (!prompt) {
      inputRef.current?.focus();
      return;
    }
    navigate('/chat', { state: { startNew: true, pendingPrompt: prompt, autoSend: true } });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    ask(question);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      ask(question);
    }
  };

  const handleSignOutClick = () => {
    handleSignOut();
    navigate('/', { replace: true });
  };

  const showSide = (classes && classes.length > 0) || savedItems.length > 0;

  return (
    <div className="campus-home">
      <CampusRail
        recent={recent}
        onNewChat={() => navigate('/chat', { state: { startNew: true } })}
        onSelectSession={(sessionId) => navigate('/chat', { state: { sessionId } })}
        onShowAllChats={() => navigate('/search')}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSignOut={handleSignOutClick}
      />

      <main className="campus-main home-main" id="main-content">
        <div className="home-column">
          {/* Phones only: the rail is hidden, so recent chats lead the page (26A). */}
          <section className="campus-phone-recent" aria-label="Recent chats">
            <RecentChats
              recent={recent}
              onSelectSession={(sessionId) => navigate('/chat', { state: { sessionId } })}
              onShowAllChats={() => navigate('/search')}
            />
          </section>
          <header className="home-hero">
            <p className="campus-kicker home-date">{school} · {todayLabel(timezone)}</p>
            <h1>What do you need on campus today?</h1>
            <form className="home-ask" onSubmit={handleSubmit}>
              <label htmlFor="campus-ask-input" className="sr-only">Ask a question</label>
              <textarea
                id="campus-ask-input"
                ref={inputRef}
                rows={2}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={starters[0]?.prompts?.[0] ? `Try “${starters[0].prompts[0]}”` : 'Ask about courses, events or places'}
              />
              <div className="home-ask-row">
                <span className="home-scope">
                  <Icon name="school" size={18} />
                  Courses, events and places at {school}
                </span>
                <button type="submit" className="home-send" aria-label="Ask">
                  <ArrowUp size={22} />
                </button>
              </div>
            </form>
          </header>

          <div className={`home-bento ${showSide ? '' : 'is-single'}`.trim()}>
            <section aria-labelledby="home-next" className="home-panel">
              <div className="home-panel-h">
                <h2 id="home-next">Next up</h2>
              </div>
              {today.loading && <p className="home-empty">Loading today’s events…</p>}
              {!today.loading && upcoming.length === 0 && (
                <p className="home-empty">
                  <Icon name="event" size={20} />
                  {today.error || 'Nothing else on the calendar today.'}
                </p>
              )}
              {upcoming.length > 0 && (
                <ul className="home-list">
                  {upcoming.map((event) => (
                    <EventRow key={event.id || `${event.title}-${event.start}`} event={event} timezone={timezone} onAsk={ask} />
                  ))}
                </ul>
              )}
              <div className="home-panel-foot">
                <Link className="home-more" to="/events">All events today</Link>
                {today.source?.length > 0 && <p className="campus-footnote">From {today.source.join(', ')}</p>}
              </div>
            </section>

            {showSide && (
              <div className="home-side">
                {classes && classes.length > 0 && (
                  <section aria-labelledby="home-classes" className="home-panel">
                    <div className="home-panel-h">
                      <h2 id="home-classes">Your classes today</h2>
                    </div>
                    <ul className="home-list">
                      {classes.map((row) => (
                        <li key={`${row.id}-${row.part}-${row.start}`}>
                          <button type="button" className="home-cls" onClick={() => openCourse(row.id)}>
                            <span className="home-time">{clockText(row.start)}</span>
                            <span>
                              <span className="home-code">{row.id}</span>
                              {row.title && <b>{row.title}</b>}
                              {row.place && <span className="home-where">{row.place}</span>}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {savedItems.length > 0 && (
                  <section aria-labelledby="home-saved" className="home-panel">
                    <div className="home-panel-h">
                      <h2 id="home-saved">Saved</h2>
                    </div>
                    <ul className="home-list home-saved">
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

      {isSettingsOpen && (
        <SettingsModal
          user={user}
          authToken={authToken}
          onUserUpdate={handleUserUpdate}
          onSignOut={handleSignOutClick}
          advisors={advisors}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  );
};

export default HomePage;
