import React, { useContext, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import CampusRail, { RecentChatsContext, useRecentChats } from '../CampusRail';
import ChatDock from '../ChatDock';
import SettingsModal from '../SettingsModal';
import { DndProvider } from '../dnd';
import { useAuth } from '../../contexts/AuthContext';
import { ChatContext } from '../../contexts/ChatContext';
import { ChatDockProvider } from '../../contexts/ChatDockContext';
import { PageColumnContext } from './PageColumnContext';
import '../../styles/AppShell.css';

/** Pages that are the ask themselves, so they show no dock (D17). */
const NO_DOCK = ['/home', '/chat'];

const onPath = (paths, pathname) => paths.some(
  (path) => pathname === path || pathname.startsWith(`${path}/`),
);

/**
 * The signed-in layout (eng R15): rail | page column | chat dock, inside one
 * drag-and-drop context. The shell renders the rail, the phone header and
 * tab bar, Settings and sign-out once (C2); pages render only their main
 * region. Pop-ups render into the page column (usePageColumn), so the rail
 * and dock stay usable and readable.
 */
export default function AppShell({ children }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, authToken, handleSignOut, handleUserUpdate } = useAuth();
  const chat = useContext(ChatContext);
  const [railSlot, setRailSlot] = useState(null);
  const [pageColumn, setPageColumn] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const dockAvailable = !onPath(NO_DOCK, pathname);
  const onChat = onPath(['/chat'], pathname);
  const recent = useRecentChats(authToken, chat?.sessionsVersion || 0);

  const slots = useMemo(() => ({ pageColumn, railSlot }), [pageColumn, railSlot]);

  // On the chat page the conversation changes in place; elsewhere the chat
  // page picks the intent up from location.state.
  const newChat = () => {
    if (onChat && chat) chat.newChat();
    else navigate('/chat', { state: { startNew: true } });
  };
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

  return (
    <PageColumnContext.Provider value={slots}>
      <RecentChatsContext.Provider value={recent}>
        <ChatDockProvider available={dockAvailable}>
          <DndProvider>
            <div className="cc-shell">
              <div className="cc-shell-rail" ref={setRailSlot} />
              <div className="cc-shell-page" ref={setPageColumn}>
                {railSlot && (
                  <CampusRail
                    recent={recent}
                    currentSessionId={onChat ? chat?.sessionId : null}
                    onNewChat={newChat}
                    onSelectSession={selectSession}
                    onShowAllChats={() => navigate('/search')}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onSignOut={signOut}
                  />
                )}
                {children || <Outlet />}
              </div>
              <ChatDock />
            </div>
            {settingsOpen && (
              <SettingsModal
                user={user}
                authToken={authToken}
                onUserUpdate={handleUserUpdate}
                onSignOut={signOut}
                onClose={() => setSettingsOpen(false)}
              />
            )}
          </DndProvider>
        </ChatDockProvider>
      </RecentChatsContext.Provider>
    </PageColumnContext.Provider>
  );
}
