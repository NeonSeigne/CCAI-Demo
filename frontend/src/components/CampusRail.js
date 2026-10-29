import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import {
  Bookmark, CalendarDays, GraduationCap, LogOut, Map as MapIcon, MapPin, MessageCircle,
  MessageSquare, Plus, RefreshCw, Settings2,
} from 'lucide-react';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { useSaved } from '../contexts/SavedContext';
import { useChatDock } from '../contexts/ChatDockContext';
import { useSavedDropTarget } from './dnd';
import { useRailSlot } from './shell/PageColumnContext';
import '../styles/CampusRail.css';

const API_URL = process.env.REACT_APP_API_URL;
const RECENT_LIMIT = 6;

/** The five places the rail and the phone tab bar lead to (design 26A). */
export const NAV_ITEMS = [
  { to: '/home', label: 'Ask', short: 'Ask', icon: MessageCircle, match: ['/home', '/chat', '/search'] },
  { to: '/courses', label: 'Courses', short: 'Courses', icon: GraduationCap, match: ['/courses'] },
  { to: '/events', label: 'Events', short: 'Events', icon: CalendarDays, match: ['/events'] },
  { to: '/map', label: 'Campus map', short: 'Map', icon: MapIcon, match: ['/map'] },
  { to: '/saved', label: 'Saved', short: 'Saved', icon: Bookmark, match: ['/saved'], counted: true },
];

const isCurrent = (item, pathname) => item.match.some(
  (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
);

/**
 * The student's chat sessions for the Recent list: {sessions, failed, loading, retry}.
 * A failed request is reported (failed: true), not shown as "no chats yet".
 */
export function useRecentChats(authToken, refreshTrigger = 0) {
  const [state, setState] = useState({ sessions: [], failed: false, loading: Boolean(authToken) });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!authToken) return undefined;
    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));
    fetch(`${API_URL}/api/chat-sessions`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (!cancelled) setState({ sessions: Array.isArray(data) ? data : [], failed: false, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState((current) => ({ ...current, failed: true, loading: false }));
      });
    return () => { cancelled = true; };
  }, [authToken, refreshTrigger, attempt]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  return { ...state, retry };
}

/** Recent chats, "Couldn't load chats · Retry" on failure, and All chats. */
export function RecentChats({ recent, currentSessionId, onSelectSession, onShowAllChats, className = '' }) {
  const { sessions, failed, loading, retry } = recent;
  let body;
  if (failed && sessions.length === 0) {
    body = (
      <p className="campus-rail-empty campus-rail-error">
        Couldn&apos;t load chats ·{' '}
        <button type="button" className="campus-rail-retry" onClick={retry}>
          <RefreshCw size={12} aria-hidden="true" /> Retry
        </button>
      </p>
    );
  } else if (sessions.length === 0) {
    body = loading ? null : <p className="campus-rail-empty">Your chats will show up here.</p>;
  } else {
    body = sessions.slice(0, RECENT_LIMIT).map((session) => (
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
    ));
  }

  return (
    <div className={`campus-recent ${className}`}>
      <span className="campus-rail-label">Recent</span>
      {body}
      {sessions.length > RECENT_LIMIT && onShowAllChats && (
        <button type="button" className="campus-recent-all" onClick={onShowAllChats}>
          All chats
        </button>
      )}
    </div>
  );
}

function SavedCount({ count, pulse = false }) {
  if (!count) return null;
  return (
    <span className={`campus-nav-count ${pulse ? 'is-pulsing' : ''}`.trim()}>
      {count}
      <span className="sr-only"> saved</span>
    </span>
  );
}

function NavLink({ item, current, savedCount }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={`campus-nav-link ${current ? 'is-current' : ''}`}
      aria-current={current ? 'page' : undefined}
    >
      <Icon size={17} aria-hidden="true" />
      <span className="campus-nav-label">{item.label}</span>
      {item.counted && <SavedCount count={savedCount} />}
    </Link>
  );
}

/** Saved in the rail doubles as a drop target while a drag runs (D20). */
function SavedNavItem({ item, current, savedCount }) {
  const target = useSavedDropTarget();
  const Icon = item.icon;
  return (
    <li ref={target.ref} className={target.className}>
      <Link
        to={item.to}
        className={`campus-nav-link ${current ? 'is-current' : ''}`}
        aria-current={current ? 'page' : undefined}
      >
        <Icon size={17} aria-hidden="true" fill={target.over ? 'currentColor' : 'none'} />
        <span className="campus-nav-label">{item.label}</span>
        <SavedCount count={savedCount} pulse={target.pulse} />
      </Link>
    </li>
  );
}

/**
 * The Campus Companion left rail, shared by the home and chat pages: brand,
 * school, the five page links, New chat, recent chats and the signed-in user.
 * Under 768px it gives way to a slim top header and a bottom tab bar (26A).
 *
 * Pass `recent` (from useRecentChats) when the page also shows the chats, so
 * they load once.
 */
export default function CampusRail({
  currentSessionId = null,
  refreshTrigger = 0,
  recent: recentProp,
  onNewChat,
  onSelectSession,
  onShowAllChats,
  onOpenSettings,
  onSignOut,
  className = '',
}) {
  const { user, authToken } = useAuth();
  const { config } = useAppConfig();
  const { pathname } = useLocation();
  const savedCount = useSaved()?.count || 0;
  const ownRecent = useRecentChats(recentProp ? null : authToken, refreshTrigger);
  const recent = recentProp || ownRecent;
  const dock = useChatDock();
  const railSlot = useRailSlot();

  const school = config?.app?.institution || config?.app?.title || 'Your campus';
  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || '?';

  const brandMark = (
    <span className="campus-brand-mark" aria-hidden="true">
      <MapPin size={16} strokeWidth={2.4} />
    </span>
  );

  const rail = (
    <nav className={`campus-rail ${className}`} aria-label="Main">
      <div className="campus-brand">
        {brandMark}
        <span className="campus-brand-name">Campus Companion</span>
      </div>

      <div className="campus-school">
        <span className="campus-school-dot" aria-hidden="true" />
        <span className="campus-school-name">{school}</span>
      </div>

      <ul className="campus-nav">
        {NAV_ITEMS.map((item) => {
          const current = isCurrent(item, pathname);
          return item.counted ? (
            <SavedNavItem key={item.to} item={item} current={current} savedCount={savedCount} />
          ) : (
            <li key={item.to}>
              <NavLink item={item} current={current} savedCount={savedCount} />
            </li>
          );
        })}
      </ul>

      <button type="button" className="campus-new-chat" onClick={onNewChat}>
        <Plus size={18} /> New chat
      </button>

      <RecentChats
        recent={recent}
        currentSessionId={currentSessionId}
        onSelectSession={onSelectSession}
        onShowAllChats={onShowAllChats}
      />

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

  const tabbar = (
    <nav className="campus-tabbar" aria-label="Main tabs">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const current = isCurrent(item, pathname);
        // Where the chat dock is available, Ask raises its sheet instead (D17).
        if (item.to === '/home' && dock?.available) {
          return (
            <button
              key={item.to}
              type="button"
              className={`campus-tab ${dock.open ? 'is-current' : ''}`}
              aria-expanded={dock.open}
              onClick={() => (dock.open ? dock.closeDock() : dock.openDock())}
            >
              <span className="campus-tab-icon">
                <Icon size={20} aria-hidden="true" />
              </span>
              <span className="campus-tab-label">{item.short}</span>
            </button>
          );
        }
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`campus-tab ${current ? 'is-current' : ''}`}
            aria-current={current ? 'page' : undefined}
          >
            <span className="campus-tab-icon">
              <Icon size={20} aria-hidden="true" />
              {item.counted && <SavedCount count={savedCount} />}
            </span>
            <span className="campus-tab-label">{item.short}</span>
          </Link>
        );
      })}
    </nav>
  );

  // Inside the app shell the rail and tab bar render in the shell's rail
  // slot, outside the page column, so a pop-up there never hides them (R15).
  return (
    <>
      {railSlot ? createPortal(rail, railSlot) : rail}
      {/* Phones (<768px): slim header on top, tab bar at the bottom. */}
      <header className="campus-phone-header">
        {brandMark}
        <span className="campus-phone-school">{school}</span>
        <button type="button" className="campus-icon-btn" aria-label="Settings" onClick={onOpenSettings}>
          <Settings2 size={18} />
        </button>
      </header>
      {railSlot ? createPortal(tabbar, railSlot) : tabbar}
    </>
  );
}
