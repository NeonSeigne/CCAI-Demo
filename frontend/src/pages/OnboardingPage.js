import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Code2, MapPin } from '../components/icons';
import CopyrightNotice from '../components/CopyrightNotice';
import { DOMAIN_COLORS } from '../components/domainColors';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { ENABLE_DEV_LOGIN } from '../App';
import '../styles/CampusRail.css';
import '../styles/CampusHome.css';
import '../styles/CampusLanding.css';

// What each answer domain draws from; shown beside that domain's starters.
const DOMAIN_SOURCES = {
  academics: 'Course grades, instructors and sections',
  student_life: 'Events from the campus calendars',
  campus: 'Walking times and the campus map',
};

/** Signed-out landing page: what Campus Companion answers, and a way in. */
const OnboardingPage = () => {
  const navigate = useNavigate();
  const { handleAuthSuccess } = useAuth();
  const { config } = useAppConfig();
  const [devLoginLoading, setDevLoginLoading] = useState(false);
  const [devLoginError, setDevLoginError] = useState('');

  const school = config?.app?.institution || config?.app?.title || 'your campus';
  const starters = config?.homepage?.starters || [];

  const handleDevLogin = async () => {
    if (devLoginLoading) return;
    setDevLoginLoading(true);
    setDevLoginError('');

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/auth/dev-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setDevLoginError(
          typeof data.detail === 'string'
            ? data.detail
            : 'Developer login is unavailable. Is ENABLE_DEV_LOGIN set on the backend?'
        );
        return;
      }

      localStorage.setItem('authToken', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      handleAuthSuccess(data.user, data.access_token);
      navigate('/home', { replace: true });
    } catch (error) {
      console.error('Dev login error:', error);
      setDevLoginError('Developer login failed. Is the API running?');
    } finally {
      setDevLoginLoading(false);
    }
  };

  return (
    <div className="campus-landing">
      <header className="landing-bar">
        <div className="campus-brand">
          <span className="campus-brand-mark" aria-hidden="true">
            <MapPin size={16} strokeWidth={2.4} />
          </span>
          <span className="campus-brand-name">Campus Companion</span>
        </div>
        <div className="landing-bar-actions">
          {ENABLE_DEV_LOGIN && (
            <button
              type="button"
              className="landing-soft-btn"
              onClick={handleDevLogin}
              disabled={devLoginLoading}
              title="Skip sign-in and enter as the seeded developer user"
            >
              <Code2 size={15} aria-hidden="true" />
              <span>{devLoginLoading ? 'Signing in…' : 'Developer mode'}</span>
            </button>
          )}
          <button type="button" className="landing-soft-btn" onClick={() => navigate('/auth')}>
            Sign in
          </button>
        </div>
      </header>
      {devLoginError && (
        <p className="landing-error" role="alert">{devLoginError}</p>
      )}

      <main className="landing-main">
        <section className="landing-hero">
          <p className="campus-kicker">{school}</p>
          <h1>Ask about courses, events and places on campus.</h1>
          <p className="landing-lede">
            One short answer, with the grades, times and walking distances in cards
            underneath and the sources it checked listed at the end.
          </p>
          <button type="button" className="landing-cta" onClick={() => navigate('/auth')}>
            Sign in to start asking
            <ArrowRight size={17} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </section>

        {starters.length > 0 && (
          <section className="landing-asks" aria-labelledby="landing-asks-title">
            <h2 id="landing-asks-title">Questions students ask</h2>
            <ul className="landing-domains">
              {starters.map((group) => (
                <li className="landing-domain" key={group.domain}>
                  <div className="landing-domain-head">
                    <span
                      className="campus-domain-dot"
                      style={{ background: DOMAIN_COLORS[group.domain] || 'var(--muted)' }}
                      aria-hidden="true"
                    />
                    <strong>{group.title}</strong>
                    {DOMAIN_SOURCES[group.domain] && <span>{DOMAIN_SOURCES[group.domain]}</span>}
                  </div>
                  <ul className="landing-prompts">
                    {group.prompts.map((prompt) => <li key={prompt}>“{prompt}”</li>)}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="landing-foot">
        <CopyrightNotice />
      </footer>
    </div>
  );
};

export default OnboardingPage;
