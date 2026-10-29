import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CampusRail from '../CampusRail';
import SettingsModal from '../SettingsModal';
import { useAuth } from '../../contexts/AuthContext';
import '../../styles/CampusHome.css';

/**
 * The rail (or phone header + tab bar) beside a page's main region, wired the
 * same way HomePage wires it.
 */
export default function CampusPageShell({ className = '', children }) {
  const navigate = useNavigate();
  const { user, authToken, handleSignOut, handleUserUpdate } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const signOut = () => {
    handleSignOut?.();
    navigate('/', { replace: true });
  };

  return (
    <div className={`campus-home ${className}`.trim()}>
      <CampusRail
        onNewChat={() => navigate('/chat', { state: { startNew: true } })}
        onSelectSession={(sessionId) => navigate('/chat', { state: { sessionId } })}
        onShowAllChats={() => navigate('/search')}
        onOpenSettings={() => setSettingsOpen(true)}
        onSignOut={signOut}
      />
      <main className="cc-page-main" id="main-content">
        {children}
      </main>
      {settingsOpen && (
        <SettingsModal
          user={user}
          authToken={authToken}
          onUserUpdate={handleUserUpdate}
          onSignOut={signOut}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
