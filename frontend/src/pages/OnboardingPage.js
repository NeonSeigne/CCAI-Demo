import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, ArrowRight, Code2 } from 'lucide-react';
import AdvisorCard from '../components/AdvisorCard';
import CopyrightNotice from '../components/CopyrightNotice';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { ENABLE_DEV_LOGIN } from '../App';

const OnboardingPage = () => {
  const navigate = useNavigate();
  const { handleAuthSuccess } = useAuth();
  const { config, advisors, resolveIcon } = useAppConfig();
  const [devLoginLoading, setDevLoginLoading] = useState(false);
  const [devLoginError, setDevLoginError] = useState('');

  const UsersIcon = resolveIcon('Users');

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
    <div className="homepage min-h-screen bg-bg-primary font-sans">
      <header className="header">
        <div className="header-content">
          <div className="header-left">
            <div className="logo-container">
              <UsersIcon className="logo-icon" />
            </div>
            <div>
              <h1 className="logo-title">{config.app.title}</h1>
              <p className="logo-subtitle">{config.app.subtitle}</p>
            </div>
          </div>
          {ENABLE_DEV_LOGIN && (
            <div className="header-right">
              <button
                type="button"
                className="dev-mode-btn"
                onClick={handleDevLogin}
                disabled={devLoginLoading}
                title="Skip sign-in and enter as the seeded developer user"
              >
                <Code2 className="dev-mode-btn-icon" aria-hidden="true" />
                <span>{devLoginLoading ? 'Signing in…' : 'Developer mode'}</span>
              </button>
            </div>
          )}
        </div>
        {devLoginError && (
          <p className="dev-mode-error" role="alert">
            {devLoginError}
          </p>
        )}
      </header>

      <main className="main">
        <div className="hero-section">
          <h2 className="hero-title text-ink">
            {config.homepage.headline_prefix}{' '}
            <span className="hero-highlight text-ink">{config.homepage.headline_highlight}</span>
          </h2>
          <p className="hero-subtitle text-text-secondary">
            {config.homepage.description}
          </p>
          <button
            type="button"
            onClick={() => navigate('/auth')}
            className="btn-primary cta-button"
          >
            <MessageCircle className="cta-icon" />
            <span>Start Conversation</span>
            <ArrowRight className="cta-arrow" />
          </button>
        </div>

        <div className="advisors-grid">
          {Object.entries(advisors).map(([id, advisor]) => (
            <AdvisorCard key={id} advisor={advisor} advisorId={id} />
          ))}
        </div>

        <div className="features-section">
          <h3 className="features-title">{config.homepage.features_title}</h3>
          <div className="features-grid">
            {(config.homepage.features || []).map((feature, index) => {
              const FeatureIcon = resolveIcon(feature.icon);
              const accentColors = ['bg-accent-red', 'bg-accent-blue', 'bg-accent-green'];
              return (
                <div key={index} className="feature-card surface-card">
                  <div className="feature-icon flex items-center gap-2">
                    <span className={`accent-dot ${accentColors[index % accentColors.length]}`} />
                    <FeatureIcon />
                  </div>
                  <h4 className="feature-title">{feature.title}</h4>
                  <p className="feature-description">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      <footer className="footer">
        <div className="footer-content">
          <CopyrightNotice />
        </div>
      </footer>
    </div>
  );
};

export default OnboardingPage;
