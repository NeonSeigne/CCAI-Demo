import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';
import CopyrightNotice from '../components/CopyrightNotice';
import { ThemeToggle } from '../components/CampusRail';
import { DOMAIN_COLORS } from '../components/domainColors';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../modules/campus';
import { ENABLE_DEV_LOGIN } from '../App';
import '../styles/CampusRail.css';
import '../styles/CampusLanding.css';

/** The decorative line map at the hero's lower right (landing.html). No text. */
function LineMap() {
  return (
    <svg className="cl-lines" viewBox="0 0 900 600" preserveAspectRatio="xMaxYMax meet" aria-hidden="true" focusable="false">
      <path className="l1" d="M120 120 H520 Q560 120 580 150 L660 270 Q680 300 720 300 H940" />
      <path className="l2" d="M40 300 H330 Q370 300 395 330 L470 420 Q495 450 535 450 H940" />
      <path className="l3" d="M200 520 H600 Q640 520 665 490 L760 380 Q785 350 825 350 H940" />
      <circle cx="300" cy="120" r="13" />
      <circle cx="520" cy="120" r="13" />
      <circle cx="720" cy="300" r="13" />
      <circle cx="200" cy="300" r="13" />
      <circle className="now" cx="395" cy="330" r="15" />
      <circle cx="640" cy="450" r="13" />
      <circle cx="420" cy="520" r="13" />
      <circle cx="825" cy="350" r="13" />
    </svg>
  );
}

/**
 * Signed-out landing (landing.html, design Q12): one first viewport in the
 * school's deep colour with the brand, the headline and one sign-in action,
 * then the questions students ask.
 */
const OnboardingPage = () => {
  const navigate = useNavigate();
  const { handleAuthSuccess } = useAuth();
  const { config } = useAppConfig();
  const { name: school, mark } = useSchool();
  const [devLoginLoading, setDevLoginLoading] = useState(false);
  const [devLoginError, setDevLoginError] = useState('');

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
    <div className="cl-landing">
      <main id="main-content">
        <section className="cl-hero">
          <div className="cl-bar">
            {ENABLE_DEV_LOGIN && (
              <button
                type="button"
                className="cc-btn cl-dev"
                onClick={handleDevLogin}
                disabled={devLoginLoading}
                title="Skip sign-in and enter as the seeded developer user"
              >
                <Icon name="code" size={18} />
                <span>{devLoginLoading ? 'Signing in…' : 'Developer mode'}</span>
              </button>
            )}
            <ThemeToggle className="cl-toggle" />
          </div>
          {devLoginError && (
            <p className="cl-error" role="alert">
              <Icon name="error" size={18} />
              {devLoginError}
            </p>
          )}
          <LineMap />
          <div className="cl-copy cl-rise">
            <div className="cl-lock">
              <span className="campus-brand-mark cl-mark" aria-hidden="true">{mark}</span>
              <span>
                <b>Campus Companion</b>
                <span>{school}</span>
              </span>
            </div>
            <h1>Ask about courses, events and places on campus.</h1>
            <button type="button" className="cc-btn cc-btn-primary cl-cta" onClick={() => navigate('/auth')}>
              Sign in to start asking
              <Icon name="arrow_forward" size={22} />
            </button>
          </div>
        </section>

        {starters.length > 0 && (
          <section className="cl-asks" aria-labelledby="landing-asks-title">
            <h2 id="landing-asks-title">Questions students ask</h2>
            <ul className="cc-panel cl-questions">
              {starters.flatMap((group) => group.prompts.map((prompt, index) => (
                <li className={`cl-q ${index ? 'is-cont' : ''}`.trim()} key={`${group.domain}:${prompt}`}>
                  <span className="cl-domain" aria-hidden={index ? true : undefined}>
                    <i className="cl-dot" style={{ background: DOMAIN_COLORS[group.domain] || 'var(--muted)' }} aria-hidden="true" />
                    {group.title}
                  </span>
                  <span>“{prompt}”</span>
                </li>
              )))}
            </ul>
          </section>
        )}
      </main>

      <footer className="cl-foot">
        <CopyrightNotice />
      </footer>
    </div>
  );
};

export default OnboardingPage;
