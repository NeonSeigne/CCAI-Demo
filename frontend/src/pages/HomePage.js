import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';
import CampusRail, { RecentChats, useRecentChats } from '../components/CampusRail';
import { DOMAIN_COLORS } from '../components/domainColors';
import SettingsModal from '../components/SettingsModal';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { formatEventTime, hasPhysicalLocation } from '../components/visuals/EventListCard';
import '../styles/CampusHome.css';

const API_URL = process.env.REACT_APP_API_URL;


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
  const [today, setToday] = useState({ loading: true, events: [], error: null });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const inputRef = useRef(null);
  const recent = useRecentChats(authToken);

  const school = config?.app?.institution || config?.app?.title || 'Your campus';
  const timezone = config?.school?.timezone;
  const starters = config?.homepage?.starters || [];

  useEffect(() => {
    if (!authToken) return;
    const headers = { Authorization: `Bearer ${authToken}` };

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

      <main className="campus-main" id="main-content">
        <div className="campus-column">
          {/* Phones only: the rail is hidden, so recent chats lead the page (26A). */}
          <section className="campus-phone-recent" aria-label="Recent chats">
            <RecentChats
              recent={recent}
              onSelectSession={(sessionId) => navigate('/chat', { state: { sessionId } })}
              onShowAllChats={() => navigate('/search')}
            />
          </section>
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
                  {hasPhysicalLocation(event.location) && (
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
