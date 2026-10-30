import React, {
  createContext, useCallback, useContext, useEffect, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { Icon, RefreshCw } from './icons';
import { useSchool } from '../modules/campus';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useChatDock } from '../contexts/ChatDockContext';
import { useSavedDropTarget } from './dnd';
import { useRailSlot } from './shell/PageColumnContext';
import '../styles/CampusRail.css';

const API_URL = process.env.REACT_APP_API_URL;
const RECENT_LIMIT = 6;

/**
 * The five places the rail and the phone tab bar lead to (design 26A). Ask
 * is also "New chat": it always opens a fresh Ask home (D5).
 */
export const NAV_ITEMS = [
  { to: '/home', label: 'Ask', short: 'Ask', icon: 'forum', match: ['/home', '/chat', '/search'] },
  { to: '/courses', label: 'Courses', short: 'Courses', icon: 'school', match: ['/courses'] },
  { to: '/events', label: 'Events', short: 'Events', icon: 'event', match: ['/events'] },
  { to: '/map', label: 'Campus map', short: 'Map', icon: 'map', match: ['/map'] },
  { to: '/saved', label: 'Saved', short: 'Saved', icon: 'bookmark', match: ['/saved'], dropTarget: true },
];

/** The phone tab bar puts Ask in the centre: Courses, Events, Ask, Map, Saved. */
const TAB_ORDER = ['/courses', '/events', '/home', '/map', '/saved'];
const TAB_ITEMS = TAB_ORDER.map((to) => NAV_ITEMS.find((item) => item.to === to));

const THEME_STOPS = [
  { mode: 'auto', label: 'Auto' },
  { mode: 'light', label: 'Light', icon: 'light_mode' },
  { mode: 'dark', label: 'Dark', icon: 'dark_mode' },
];

// Pages rendered on their own (page tests) have no ThemeProvider: no toggle there.
const useOptionalTheme = () => {
  try {
    return useTheme();
  } catch {
    return null;
  }
};

/**
 * Auto / Light / Dark with a sliding thumb (DESIGN.md, theme toggle). Each
 * stop is a labelled button with aria-pressed (design Q19).
 */
export function ThemeToggle({ className = '' }) {
  const theme = useOptionalTheme();
  if (!theme) return null;
  const { mode, setMode } = theme;
  return (
    <div className={`cc-theme-toggle ${className}`.trim()} data-mode={mode} role="group" aria-label="Theme">
      <span className="cc-theme-thumb" aria-hidden="true" />
      {THEME_STOPS.map((stop) => (
        <button
          key={stop.mode}
          type="button"
          aria-label={stop.label}
          aria-pressed={mode === stop.mode}
          onClick={() => setMode(stop.mode)}
        >
          {stop.icon ? <Icon name={stop.icon} size={17} /> : stop.label}
        </button>
      ))}
    </div>
  );
}

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

/** The app shell's recent chats, so a page that lists them doesn't load them again. */
export const RecentChatsContext = createContext(null);

/** The shell's recent chats, or the page's own outside the shell. */
export function useShellRecentChats(authToken) {
  const shared = useContext(RecentChatsContext);
  const own = useRecentChats(shared ? null : authToken);
  return shared || own;
}

/** Recent chats as plain rows (D5), "Couldn't load chats · Retry" on failure. */
export function RecentChats({
  recent, currentSessionId, onSelectSession, className = '',
}) {
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
        {session.title || 'Untitled chat'}
      </button>
    ));
  }

  return (
    <div className={`campus-recent ${className}`}>
      <span className="campus-rail-label">Recent</span>
      {body}
    </div>
  );
}

function NavLink({ item, current }) {
  return (
    <Link
      to={item.to}
      className={`campus-nav-link ${current ? 'is-current' : ''}`}
      aria-current={current ? 'page' : undefined}
    >
      <Icon name={item.icon} size={22} filled={current} />
      <span className="campus-nav-label">{item.label}</span>
    </Link>
  );
}

/** Saved in the rail doubles as a drop target while a drag runs (D20). */
function SavedNavItem({ item, current }) {
  const target = useSavedDropTarget();
  return (
    <li ref={target.ref} className={target.className}>
      <Link
        to={item.to}
        className={`campus-nav-link ${current ? 'is-current' : ''} ${target.pulse ? 'dnd-pulse' : ''}`.trim()}
        aria-current={current ? 'page' : undefined}
      >
        <Icon name={item.icon} size={22} filled={current || target.over} />
        <span className="campus-nav-label">{item.label}</span>
      </Link>
    </li>
  );
}

/** The signed-in student's initials for the round avatar. */
export function initialsOf(user) {
  return `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || '?';
}

/**
 * The Campus Companion left rail, in the school's deep colour: the round
 * school mark with the product and the school's short name, the five page
 * links, recent chats, the theme toggle and the signed-in user, whose row
 * opens the account menu. At 700px and under it gives way to a
 * school-coloured header (mark, "Campus Companion", the toggle and the
 * avatar) and a bottom tab bar (26A, design Q1).
 *
 * Pass `recent` (from useRecentChats) when the page also shows the chats, so
 * they load once. `onOpenAccount(event)` opens the account menu at the
 * avatar that was pressed.
 */
export default function CampusRail({
  currentSessionId = null,
  refreshTrigger = 0,
  recent: recentProp,
  onSelectSession,
  onOpenAccount,
  accountOpen = false,
  className = '',
}) {
  const { user, authToken } = useAuth();
  const { shortName: school, mark } = useSchool();
  const { pathname } = useLocation();
  const ownRecent = useRecentChats(recentProp ? null : authToken, refreshTrigger);
  const recent = recentProp || ownRecent;
  const dock = useChatDock();
  const railSlot = useRailSlot();

  const initials = initialsOf(user);

  const brandMark = (
    <span className="campus-brand-mark" aria-hidden="true">{mark}</span>
  );

  const accountProps = {
    type: 'button',
    'aria-haspopup': 'menu',
    'aria-expanded': accountOpen,
    onClick: (event) => onOpenAccount?.(event),
  };

  const rail = (
    <nav className={`campus-rail ${className}`} aria-label="Main">
      <div className="campus-brand">
        {brandMark}
        <span className="campus-brand-text">
          <span className="campus-brand-name">Campus Companion</span>
          <span className="campus-school-name">{school}</span>
        </span>
      </div>

      <ul className="campus-nav">
        {NAV_ITEMS.map((item) => {
          const current = isCurrent(item, pathname);
          return item.dropTarget ? (
            <SavedNavItem key={item.to} item={item} current={current} />
          ) : (
            <li key={item.to}>
              <NavLink item={item} current={current} />
            </li>
          );
        })}
      </ul>

      <RecentChats
        recent={recent}
        currentSessionId={currentSessionId}
        onSelectSession={onSelectSession}
      />

      <ThemeToggle className="campus-rail-toggle" />

      <button className="campus-user" aria-label="Account" {...accountProps}>
        <span className="campus-avatar" aria-hidden="true">{initials}</span>
        <span className="campus-user-name">{user?.firstName || 'You'}</span>
        <Icon name="settings" size={20} className="campus-user-gear" />
      </button>
    </nav>
  );

  const tabbar = (
    <nav className="campus-tabbar" aria-label="Main tabs">
      {TAB_ITEMS.map((item) => {
        const current = isCurrent(item, pathname);
        // Where the chat dock is available, Ask raises its sheet instead (D17).
        if (item.to === '/home' && dock?.available) {
          return (
            <button
              key={item.to}
              ref={dock.askTabRef}
              type="button"
              className={`campus-tab ${dock.open ? 'is-current' : ''}`}
              aria-expanded={dock.open}
              onClick={() => (dock.open ? dock.closeDock() : dock.openDock())}
            >
              <span className="campus-tab-icon">
                <Icon name={item.icon} size={24} filled={dock.open} />
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
              <Icon name={item.icon} size={24} filled={current} />
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
      {/* Phones (<=700px): school-coloured header on top, tab bar at the bottom. */}
      <header className="campus-phone-header">
        {brandMark}
        <span className="campus-phone-name">Campus Companion</span>
        <ThemeToggle className="campus-phone-toggle" />
        <button className="campus-phone-avatar" aria-label="Account" {...accountProps}>
          <span className="campus-avatar" aria-hidden="true">{initials}</span>
        </button>
      </header>
      {railSlot ? createPortal(tabbar, railSlot) : tabbar}
    </>
  );
}
