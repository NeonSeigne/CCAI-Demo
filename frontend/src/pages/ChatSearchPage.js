import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/icons';
import CampusPageShell from '../components/catalog/CampusPageShell';
import PanelState from '../components/panel/PanelState';
import { useShellRecentChats } from '../components/CampusRail';
import { useAuth } from '../contexts/AuthContext';
import { parseServerTime } from '../utils/serverTime';
import '../styles/ChatSearchPage.css';

const formatRelativeTime = (dateString) => {
  const date = parseServerTime(dateString);
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

const messagesText = (count) => (count == null ? null : `${count} ${count === 1 ? 'message' : 'messages'}`);

function ChatRows({ sessions, onSelect, label }) {
  return (
    <ul className="cs-panel" aria-label={label}>
      {sessions.map((session) => (
        <li key={session.id}>
          <button type="button" className="cs-chat" onClick={() => onSelect(session.id)}>
            <Icon name={session.pinned ? 'push_pin' : 'chat_bubble'} size={22} />
            <span className="cs-chat-text">
              <b>{session.title || 'Untitled chat'}</b>
              {messagesText(session.message_count) && <span className="cs-meta">{messagesText(session.message_count)}</span>}
            </span>
            {session.updated_at && <span className="cs-when">{formatRelativeTime(session.updated_at)}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Search chats (phase9 search-chats.html): the title row with Back, a round
 * search field and the chats as rows, pinned ones first as their own group.
 * The list is the shell's recent chats, so the rail and this page share one
 * request.
 */
const ChatSearchPage = () => {
  const navigate = useNavigate();
  const { authToken } = useAuth();
  const recent = useShellRecentChats(authToken);
  const { sessions, failed, loading, retry } = recent;
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((session) => (session.title || '').toLowerCase().includes(query));
  }, [searchTerm, sessions]);

  const pinned = filtered.filter((session) => session.pinned);
  const others = filtered.filter((session) => !session.pinned);
  const open = (sessionId) => navigate('/chat', { state: { sessionId } });

  let body;
  if (loading && sessions.length === 0) {
    body = (
      <div className="cs-panel cs-state">
        <PanelState status="loading" rows={4} label="Loading chats…" />
      </div>
    );
  } else if (failed && sessions.length === 0) {
    body = (
      <div className="cs-panel cs-state">
        <PanelState status="error" message="Couldn't load chats" onRetry={retry} />
      </div>
    );
  } else if (filtered.length === 0) {
    body = (
      <div className="cs-panel cs-state">
        <PanelState
          status="empty"
          icon={searchTerm.trim() ? 'search_off' : 'forum'}
          message={searchTerm.trim() ? 'No chats found' : 'No chats yet'}
        />
      </div>
    );
  } else if (pinned.length === 0) {
    body = <ChatRows sessions={others} onSelect={open} label="Chats" />;
  } else {
    body = (
      <>
        <section className="cs-group" aria-labelledby="cs-pinned-h">
          <h2 id="cs-pinned-h" className="cs-group-h">Pinned</h2>
          <ChatRows sessions={pinned} onSelect={open} />
        </section>
        {others.length > 0 && (
          <section className="cs-group" aria-labelledby="cs-recent-h">
            <h2 id="cs-recent-h" className="cs-group-h">Recent</h2>
            <ChatRows sessions={others} onSelect={open} />
          </section>
        )}
      </>
    );
  }

  return (
    <CampusPageShell className="cs-page">
      <div className="cs-col">
        <header className="cs-titlerow">
          <button type="button" className="cs-back" aria-label="Back to chat" onClick={() => navigate('/chat')}>
            <Icon name="arrow_back" size={22} />
          </button>
          <h1>Search chats</h1>
        </header>

        <div className="cs-search" role="search">
          <Icon name="search" size={20} />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search your chats"
            aria-label="Search your chats"
            autoComplete="off"
            // The page exists to search; the field takes the keyboard on arrival.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
        </div>

        {body}
      </div>
    </CampusPageShell>
  );
};

export default ChatSearchPage;
