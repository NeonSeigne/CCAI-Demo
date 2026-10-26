import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageCircle,
  Plus,
  Settings2,
  User,
  LogOut,
  MessageSquare,
  FileText,
  ArrowRight,
  LayoutDashboard,
} from 'lucide-react';
import CopyrightNotice from '../components/CopyrightNotice';
import SettingsModal from '../components/SettingsModal';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useAuth } from '../contexts/AuthContext';

const ACCENT_DOTS = ['bg-accent-red', 'bg-accent-blue', 'bg-accent-green'];

const formatRelativeTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = Math.abs(now - date);
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    if (diffMins <= 1) return 'Just now';
    return `${diffMins} minutes ago`;
  }
  if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }
  if (diffDays === 1) return 'Today';
  if (diffDays === 2) return 'Yesterday';
  if (diffDays <= 7) return `${diffDays - 1} days ago`;
  return date.toLocaleDateString();
};

const HomePage = () => {
  const navigate = useNavigate();
  const { user, authToken, handleSignOut, handleUserUpdate } = useAuth();
  const { config, advisors, getAdvisorColors, resolveIcon } = useAppConfig();
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);

  const LogoIcon = resolveIcon(config?.app?.logo_icon || 'GraduationCap');
  const examples = config?.chat_page?.examples || [];
  const recentSessions = sessions.slice(0, 5);
  const mostRecent = sessions[0] || null;
  const canvasTitle = config?.canvas?.tour_title || 'Academic Progress Canvas';
  const canvasBody =
    config?.canvas?.tour_body ||
    'Review your extracted insights, degree roadmaps, and academic goals';

  useEffect(() => {
    if (!authToken) return;

    const fetchSessions = async () => {
      setSessionsLoading(true);
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/chat-sessions`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
        });
        if (response.ok) {
          setSessions(await response.json());
        }
      } catch (error) {
        console.error('Error fetching chat sessions:', error);
      } finally {
        setSessionsLoading(false);
      }
    };

    fetchSessions();
  }, [authToken]);

  useEffect(() => {
    if (!showUserMenu) return;
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  const goToChat = (state) => {
    navigate('/chat', { state });
  };

  const handleContinueRecent = () => {
    if (!mostRecent) return;
    goToChat({ sessionId: mostRecent.id });
  };

  const handleStartNew = () => {
    goToChat({ startNew: true });
  };

  const handleChipClick = (category) => {
    const prompt = category.suggestions?.[0] || '';
    goToChat({ startNew: true, pendingPrompt: prompt });
  };

  const handleSignOutClick = () => {
    setShowUserMenu(false);
    handleSignOut();
    navigate('/', { replace: true });
  };

  return (
    <div className="home-launchpad min-h-screen bg-bg-primary font-sans">
      <header className="home-launchpad-header">
        <nav className="nav-pill home-launchpad-nav mx-auto flex items-center justify-between gap-4 px-4 py-2">
          <div className="home-launchpad-brand">
            <div className="logo-container">
              <LogoIcon className="logo-icon" />
            </div>
            <div>
              <h1 className="logo-title">{config?.app?.title}</h1>
              <p className="logo-subtitle">{config?.app?.subtitle}</p>
            </div>
          </div>

          <div className="home-launchpad-header-actions">
            <button
              type="button"
              className="home-icon-btn"
              onClick={() => setIsSettingsOpen(true)}
              aria-label="Open settings"
              title="Settings"
            >
              <Settings2 size={18} />
            </button>

            <div className="home-user-menu" ref={userMenuRef}>
              <button
                type="button"
                className="home-icon-btn"
                onClick={() => setShowUserMenu((open) => !open)}
                aria-label="User menu"
                aria-expanded={showUserMenu}
              >
                <User size={18} />
              </button>
              {showUserMenu && (
                <div className="home-user-dropdown surface-card">
                  <div className="home-user-dropdown-info">
                    <div className="home-user-dropdown-name">
                      {user?.firstName} {user?.lastName}
                    </div>
                    <div className="home-user-dropdown-email">{user?.email}</div>
                  </div>
                  <button
                    type="button"
                    className="home-user-dropdown-item"
                    onClick={() => {
                      setShowUserMenu(false);
                      setIsSettingsOpen(true);
                    }}
                  >
                    <Settings2 size={14} />
                    Settings
                  </button>
                  <button
                    type="button"
                    className="home-user-dropdown-item sign-out"
                    onClick={handleSignOutClick}
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </nav>
      </header>

      <main className="home-launchpad-main">
        <section className="home-launchpad-hero">
          <h2 className="home-launchpad-greeting text-ink">
            Welcome back, {user?.firstName || 'there'}!
          </h2>
          <p className="home-launchpad-subtext text-text-secondary">
            Ready to continue your progress or start a new topic?
          </p>

          <div className="home-launchpad-ctas">
            {mostRecent && (
              <button type="button" className="btn-primary" onClick={handleContinueRecent}>
                <MessageCircle size={18} />
                Continue Recent Chat
              </button>
            )}
            <button
              type="button"
              className={mostRecent ? 'home-btn-secondary' : 'btn-primary'}
              onClick={handleStartNew}
            >
              <Plus size={18} />
              Start New Conversation
            </button>
          </div>
        </section>

        {examples.length > 0 && (
          <section className="home-chips-section surface-card">
            <h3 className="home-section-label">Quick suggestions</h3>
            <div className="home-chips-row">
              {examples.map((category, index) => {
                const Icon = resolveIcon(category.icon);
                return (
                  <button
                    key={category.title}
                    type="button"
                    className="home-chip"
                    onClick={() => handleChipClick(category)}
                  >
                    <span className={`accent-dot ${ACCENT_DOTS[index % ACCENT_DOTS.length]}`} />
                    <Icon size={14} aria-hidden="true" />
                    {category.title}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="home-launchpad-grid">
          <div className="surface-card home-panel">
            <h3 className="home-section-label">Your six advisors</h3>
            <ul className="home-advisor-roster">
              {Object.entries(advisors).map(([id, advisor]) => {
                const Icon = advisor.icon;
                const colors = getAdvisorColors(id);
                return (
                  <li key={id} className="home-advisor-row">
                    <span
                      className="accent-dot"
                      style={{ backgroundColor: colors.dotColor || colors.color }}
                    />
                    <div
                      className="home-advisor-icon"
                      style={{ backgroundColor: 'var(--paper-sunken)' }}
                    >
                      {advisor.avatarUrl ? (
                        <img src={advisor.avatarUrl} alt="" />
                      ) : (
                        <Icon size={16} style={{ color: 'var(--ink)' }} />
                      )}
                    </div>
                    <div className="home-advisor-text">
                      <div className="home-advisor-name">{advisor.name}</div>
                      <div className="home-advisor-role text-text-secondary">{advisor.role}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="home-advisor-footnote text-text-secondary">
              Questions are routed to all active advisors at once.
            </p>
          </div>

          <div className="surface-card home-panel">
            <h3 className="home-section-label">Recent chat sessions</h3>
            {sessionsLoading ? (
              <p className="home-empty-state text-text-secondary">Loading sessions…</p>
            ) : recentSessions.length === 0 ? (
              <p className="home-empty-state text-text-secondary">
                No saved chats yet. Start a conversation to see it here.
              </p>
            ) : (
              <ul className="home-session-list">
                {recentSessions.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      className="home-session-row"
                      onClick={() => goToChat({ sessionId: session.id })}
                    >
                      <MessageSquare size={16} className="home-session-icon" />
                      <div className="home-session-details">
                        <div className="home-session-title">{session.title}</div>
                        <div className="home-session-meta text-text-secondary">
                          <span>{formatRelativeTime(session.updated_at)}</span>
                          {session.document_count > 0 && (
                            <span>
                              · {session.document_count} document
                              {session.document_count === 1 ? '' : 's'} attached
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="home-view-all"
              onClick={() => goToChat({})}
            >
              View All Saved Chats
              <ArrowRight size={14} />
            </button>
          </div>
        </section>

        <section className="surface-card home-canvas-banner">
          <div className="home-canvas-banner-content">
            <div className="home-canvas-banner-icon">
              <LayoutDashboard size={20} />
            </div>
            <div>
              <h3 className="home-canvas-banner-title">{canvasTitle}</h3>
              <p className="home-canvas-banner-body text-text-secondary">{canvasBody}</p>
            </div>
          </div>
          <button
            type="button"
            className="btn-primary home-canvas-open"
            onClick={() => navigate('/canvas')}
          >
            <FileText size={16} />
            Open
          </button>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-content">
          <CopyrightNotice />
        </div>
      </footer>

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
