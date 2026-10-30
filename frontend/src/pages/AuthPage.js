import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Login from '../components/Login';
import Signup from '../components/Signup';
import CopyrightNotice from '../components/CopyrightNotice';
import { ThemeToggle } from '../components/CampusRail';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../modules/campus';
import '../styles/CampusRail.css';
import '../styles/Auth.css';

const MODES = [
  { id: 'signin', label: 'Sign in' },
  { id: 'create', label: 'Create account' },
];

/**
 * Sign in and Create account (sign-in.html): one card with a switch, in
 * the school frame. `?mode=create` opens Create account.
 */
const AuthPage = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleAuthSuccess } = useAuth();
  const { name: school, mark } = useSchool();
  const mode = params.get('mode') === 'create' ? 'create' : 'signin';

  const handleAuthComplete = (userData, token) => {
    handleAuthSuccess(userData, token);
    navigate('/home', { replace: true });
  };

  const pick = (next) => setParams(next === 'create' ? { mode: 'create' } : {}, { replace: true });

  return (
    <div className="au-page">
      <header className="au-bar">
        <span className="campus-brand-mark au-mark" aria-hidden="true">{mark}</span>
        <span className="au-brand">
          <b>Campus Companion</b>
          <span>{school}</span>
        </span>
        <ThemeToggle className="au-toggle" />
      </header>
      <div className="au-wrap">
        <main className="au-card" id="main-content">
          <div className="cc-segmented au-switch" role="tablist" aria-label="Account">
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`au-tab-${item.id}`}
                aria-selected={mode === item.id}
                aria-controls="au-panel"
                tabIndex={mode === item.id ? 0 : -1}
                onClick={() => pick(item.id)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                    const next = mode === 'create' ? 'signin' : 'create';
                    pick(next);
                    document.getElementById(`au-tab-${next}`)?.focus();
                  }
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div id="au-panel" role="tabpanel" aria-labelledby={`au-tab-${mode}`}>
            {mode === 'create'
              ? <Signup onAuthSuccess={handleAuthComplete} />
              : <Login onAuthSuccess={handleAuthComplete} />}
          </div>
        </main>
      </div>
      <footer className="au-foot">
        <CopyrightNotice />
      </footer>
    </div>
  );
};

export default AuthPage;
