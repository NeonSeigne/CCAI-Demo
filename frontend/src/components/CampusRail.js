import React, { useEffect, useState } from 'react';
import { LogOut, MapPin, MessageSquare, Plus, Settings2 } from 'lucide-react';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useAuth } from '../contexts/AuthContext';
import '../styles/CampusRail.css';

const API_URL = process.env.REACT_APP_API_URL;
const RECENT_LIMIT = 6;

/**
 * The Campus Companion left rail, shared by the home and chat pages: brand,
 * school, New chat, recent chats and the signed-in user.
 */
export default function CampusRail({
  currentSessionId = null,
  refreshTrigger = 0,
  onNewChat,
  onSelectSession,
  onShowAllChats,
  onOpenSettings,
  onSignOut,
  className = '',
}) {
  const { user, authToken } = useAuth();
  const { config } = useAppConfig();
  const [sessions, setSessions] = useState([]);

  const school = config?.app?.institution || config?.app?.title || 'Your campus';
  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || '?';

  useEffect(() => {
    if (!authToken) return;
    fetch(`${API_URL}/api/chat-sessions`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => setSessions([]));
  }, [authToken, refreshTrigger]);

  return (
    <nav className={`campus-rail ${className}`} aria-label="Main">
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

      <button type="button" className="campus-new-chat" onClick={onNewChat}>
        <Plus size={18} /> New chat
      </button>

      <div className="campus-recent">
        <span className="campus-rail-label">Recent</span>
        {sessions.length === 0 ? (
          <p className="campus-rail-empty">Your chats will show up here.</p>
        ) : (
          sessions.slice(0, RECENT_LIMIT).map((session) => (
            <button
              type="button"
              key={session.id}
              className={`campus-recent-item ${session.id === currentSessionId ? 'is-current' : ''}`}
              aria-current={session.id === currentSessionId ? 'page' : undefined}
              onClick={() => onSelectSession?.(session.id)}
            >
              <MessageSquare size={15} aria-hidden="true" />
              <span>{session.title || 'Untitled chat'}</span>
            </button>
          ))
        )}
        {sessions.length > RECENT_LIMIT && onShowAllChats && (
          <button type="button" className="campus-recent-all" onClick={onShowAllChats}>
            All chats
          </button>
        )}
      </div>

      <div className="campus-user">
        <span className="campus-avatar" aria-hidden="true">{initials}</span>
        <span className="campus-user-name">{user?.firstName || 'You'}</span>
        <button type="button" className="campus-icon-btn" aria-label="Settings" onClick={onOpenSettings}>
          <Settings2 size={18} />
        </button>
        <button type="button" className="campus-icon-btn" aria-label="Sign out" onClick={onSignOut}>
          <LogOut size={18} />
        </button>
      </div>
    </nav>
  );
}
