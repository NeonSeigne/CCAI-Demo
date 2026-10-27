import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUp,
  LogOut,
  MapPin,
  MessageSquare,
  Plus,
  Settings2,
} from 'lucide-react';
import SettingsModal from '../components/SettingsModal';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { formatEventTime } from '../components/visuals/EventListCard';
import '../styles/CampusHome.css';

const API_URL = process.env.REACT_APP_API_URL;

// One color per domain, shared with the "Checked" chips in chat.
export const DOMAIN_COLORS = {
  academics: 'var(--domain-academics)',
  student_life: 'var(--domain-student-life)',
  campus: 'var(--domain-campus)',
};

const todayLabel = (timezone) => {
  try {
    return new Date().toLocaleDateString(undefined, {
      weekday: 'long', month: 'short', day: 'numeric', timeZone: timezone || undefined,
    });
  } catch {
    return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  }
};

const HomePage = () => {
  const navigate = useNavigate();
  const { user, authToken, handleSignOut, handleUserUpdate } = useAuth();
  const { config, advisors } = useAppConfig();
  const [question, setQuestion] = useState('');
  const [sessions, setSessions] = useState([]);
  const [today, setToday] = useState({ loading: true, events: [], error: null });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const inputRef = useRef(null);

  const school = config?.app?.institution || config?.app?.title || 'Your campus';
  const timezone = config?.school?.timezone;
  const starters = config?.homepage?.starters || [];

  useEffect(() => {
    if (!authToken) return;
    const headers = { Authorization: `Bearer ${authToken}` };

    fetch(`${API_URL}/api/chat-sessions`, { headers })
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => setSessions([]));

    fetch(`${API_URL}/api/campus/today`, { headers })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => setToday({ loading: false, events: data.events || [], error: data.error, source: data.source }))
      .catch(() => setToday({ loading: false, events: [], error: 'Events are unavailable right now.' }));
  }, [authToken]);

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

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || '?';

  return (
    <div className="campus-home">
      <nav className="campus-rail" aria-label="Main">
        <div className="campus-brand">
          <span className="campus-brand-mark" aria-hidden="true">
            <MapPin size={16} strokeWidth={2.4} />
          </span>
          <span className="campus-brand-name">Campus Companion</span>
        </div>

        <div className="campus-school">
          <span className="campus-school-dot" aria-hidden="true" />
          <span className="campus-school-name">{school}</span>
        </div>

        <button type="button" className="campus-new-chat" onClick={() => navigate('/chat', { state: { startNew: true } })}>
          <Plus size={18} /> New chat
        </button>

        <div className="campus-recent">
          <span className="campus-rail-label">Recent</span>
          {sessions.length === 0 ? (
            <p className="campus-rail-empty">Your chats will show up here.</p>
          ) : (
            sessions.slice(0, 6).map((session) => (
              <button
                type="button"
                key={session.id}
                className="campus-recent-item"
                onClick={() => navigate('/chat', { state: { sessionId: session.id } })}
              >
                <MessageSquare size={15} aria-hidden="true" />
                <span>{session.title || 'Untitled chat'}</span>
              </button>
            ))
          )}
          {sessions.length > 6 && (
            <button type="button" className="campus-recent-all" onClick={() => navigate('/search')}>
              All chats
            </button>
          )}
        </div>

        <div className="campus-user">
          <span className="campus-avatar" aria-hidden="true">{initials}</span>
          <span className="campus-user-name">{user?.firstName || 'You'}</span>
          <button type="button" className="campus-icon-btn" aria-label="Settings" onClick={() => setIsSettingsOpen(true)}>
            <Settings2 size={18} />
          </button>
          <button type="button" className="campus-icon-btn" aria-label="Sign out" onClick={handleSignOutClick}>
            <LogOut size={18} />
          </button>
        </div>
      </nav>

      <main className="campus-main">
        <div className="campus-column">
          <header className="campus-hero">
            <p className="campus-kicker">{school} · {todayLabel(timezone)}</p>
            <h1>What do you need on campus today?</h1>
            <form className="campus-ask" onSubmit={handleSubmit}>
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
              <div className="campus-ask-row">
                <span>Courses, events and places at {school}</span>
                <button type="submit" className="campus-send" aria-label="Ask">
                  <ArrowUp size={18} strokeWidth={2.4} />
                </button>
              </div>
            </form>
          </header>

          {starters.length > 0 && (
            <section aria-labelledby="campus-start" className="campus-section">
              <h2 id="campus-start">Start with</h2>
              <div className="campus-starters">
                {starters.map((group) => (
                  <div className="campus-starter-group" key={group.domain}>
                    <span className="campus-starter-domain">
                      <span
                        className="campus-domain-dot"
                        style={{ background: DOMAIN_COLORS[group.domain] || 'var(--ink-soft)' }}
                        aria-hidden="true"
                      />
                      {group.title}
                    </span>
                    {group.prompts.map((prompt) => (
                      <button type="button" key={prompt} className="campus-starter" onClick={() => ask(prompt)}>
                        {prompt}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section aria-labelledby="campus-today" className="campus-section">
            <h2 id="campus-today">Today on campus</h2>
            <div className="campus-today">
              {today.loading && <p className="campus-today-empty">Loading today’s events…</p>}
              {!today.loading && today.events.length === 0 && (
                <p className="campus-today-empty">{today.error || 'Nothing else on the calendar today.'}</p>
              )}
              {today.events.map((event) => (
                <div className="campus-today-row" key={`${event.title}-${event.start}`}>
                  <span className="campus-today-time">{formatEventTime(event, timezone)}</span>
                  <span className="campus-today-text">
                    <strong>{event.title}</strong>
                    {event.location && <span>{event.location}</span>}
                  </span>
                  {event.location && (
                    <button
                      type="button"
                      className="campus-chip-btn"
                      onClick={() => ask(`How do I get to ${event.location}?`)}
                    >
                      Directions
                    </button>
                  )}
                </div>
              ))}
            </div>
            {today.source?.length > 0 && (
              <p className="campus-footnote">From {today.source.join(', ')}</p>
            )}
          </section>
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
