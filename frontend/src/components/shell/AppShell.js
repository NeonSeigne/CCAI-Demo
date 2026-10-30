import React, {
  useContext, useEffect, useMemo, useState,
} from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import CampusRail, { RecentChatsContext, useRecentChats } from '../CampusRail';
import ChatDock from '../ChatDock';
import SettingsModal from '../SettingsModal';
import { AccountMenu } from '../menus';
import { DndProvider } from '../dnd';
import { useAuth } from '../../contexts/AuthContext';
import { ChatContext } from '../../contexts/ChatContext';
import { ChatDockProvider } from '../../contexts/ChatDockContext';
import { PageColumnContext } from './PageColumnContext';
import '../../styles/AppShell.css';

/** Pages that are the ask themselves, so they show no dock (D17). */
const NO_DOCK = ['/home', '/chat'];

/** The dock's placeholder on a page that has its own wording (events.html). */
const DOCK_PLACEHOLDERS = [['/events', 'Ask about these events']];

const onPath = (paths, pathname) => paths.some(
  (path) => pathname === path || pathname.startsWith(`${path}/`),
);

/** "gemini" -> "Gemini": the account menu's Model value. */
const modelLabel = (backend) => (backend ? backend.charAt(0).toUpperCase() + backend.slice(1) : '');

/** The student's model name, read once the account menu first opens. */
function useModelName(authToken, wanted) {
  const [name, setName] = useState('');
  useEffect(() => {
    if (!wanted || !authToken || name) return undefined;
    let cancelled = false;
    fetch(`${process.env.REACT_APP_API_URL}/current-provider`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setName(modelLabel(data?.llm_config?.default_backend || ''));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authToken, wanted, name]);
  return name;
}

/**
 * The signed-in layout (eng R15): rail | page column | chat dock, inside one
 * drag-and-drop context. The shell renders the rail, the phone header and
 * tab bar, the account menu and Settings once (C2); pages render only their
 * main region. Pop-ups render into the page column (usePageColumn), so the
 * rail and dock stay usable and readable.
 */
export default function AppShell({ children }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, authToken, handleSignOut, handleUserUpdate } = useAuth();
  const chat = useContext(ChatContext);
  const [railSlot, setRailSlot] = useState(null);
  const [pageColumn, setPageColumn] = useState(null);
  const [settingsTab, setSettingsTab] = useState(null);
  const [accountAnchor, setAccountAnchor] = useState(null);
  const [accountSeen, setAccountSeen] = useState(false);
  const dockAvailable = !onPath(NO_DOCK, pathname);
  const dockPlaceholder = DOCK_PLACEHOLDERS.find(([path]) => onPath([path], pathname))?.[1] || null;
  const onChat = onPath(['/chat'], pathname);
  const recent = useRecentChats(authToken, chat?.sessionsVersion || 0);
  const modelName = useModelName(authToken, accountSeen);

  const slots = useMemo(() => ({ pageColumn, railSlot }), [pageColumn, railSlot]);

  const selectSession = (sessionId) => {
    if (onChat && chat) {
      if (sessionId !== chat.sessionId) chat.openSession(sessionId);
    } else {
      navigate('/chat', { state: { sessionId } });
    }
  };
  const signOut = () => {
    handleSignOut?.();
    navigate('/', { replace: true });
  };
  const openAccount = (event) => {
    setAccountAnchor(event.currentTarget);
    setAccountSeen(true);
  };

  return (
    <PageColumnContext.Provider value={slots}>
      <RecentChatsContext.Provider value={recent}>
        <ChatDockProvider available={dockAvailable} placeholder={dockPlaceholder}>
          <DndProvider>
            <div className="cc-shell">
              <div className="cc-shell-rail" ref={setRailSlot} />
              <div className="cc-shell-page" ref={setPageColumn}>
                {railSlot && (
                  <CampusRail
                    recent={recent}
                    currentSessionId={onChat ? chat?.sessionId : null}
                    onSelectSession={selectSession}
                    onOpenAccount={openAccount}
                    accountOpen={Boolean(accountAnchor)}
                  />
                )}
                {children || <Outlet />}
              </div>
              <ChatDock />
            </div>
            <AccountMenu
              anchorEl={accountAnchor}
              onClose={() => setAccountAnchor(null)}
              modelName={modelName}
              onProfile={() => setSettingsTab('profile')}
              onSettings={() => setSettingsTab('profile')}
              onModel={() => setSettingsTab('model')}
              onHelp={() => window.dispatchEvent(new CustomEvent('open-user-guide', { detail: { leftInset: 0 } }))}
              onSignOut={signOut}
            />
            {settingsTab && (
              <SettingsModal
                user={user}
                authToken={authToken}
                initialTab={settingsTab}
                onUserUpdate={handleUserUpdate}
                onSignOut={signOut}
                onClose={() => setSettingsTab(null)}
              />
            )}
          </DndProvider>
        </ChatDockProvider>
      </RecentChatsContext.Provider>
    </PageColumnContext.Provider>
  );
}
