import React, {
  useContext, useEffect, useRef, useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Button, DialogActions, DialogContent, DialogTitle, TextField,
} from '@mui/material';
import Composer from '../components/chat/Composer';
import Thread from '../components/chat/Thread';
import AppDialog from '../components/AppDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import { ChatMenu, useMenu } from '../components/menus';
import { Icon } from '../components/icons';
import { useToast } from '../components/Toast';
import { RecentChatsContext } from '../components/CampusRail';
import { useAuth } from '../contexts/AuthContext';
import { ChatContext, ChatProvider, useChat } from '../contexts/ChatContext';
import { exportChat, shareChat } from '../utils/exportChat';
import '../styles/ChatPage.css';
import '../styles/ChatFrame.css';

/** location.state keys that carry a one-shot intent from another page. */
const INTENT_KEYS = ['pendingPrompt', 'sessionId', 'startNew', 'openUpload'];

const isConversation = (message) => message.type !== 'system' && message.type !== 'document_upload';

// The placeholder title a chat gets before its first question ("Chat 10/27/2026").
const DEFAULT_TITLE = /^Chat \d{1,2}\/\d{1,2}\/\d{4}$/;

const hasIntent = (state) => Boolean(state) && typeof state === 'object' && INTENT_KEYS.some((key) => state[key]);

/** The chat's title: a rename or the stored title, else the first question. */
export function chatTitleOf(messages, sessionTitle) {
  const firstQuestion = messages.find((m) => m.type === 'user')?.content;
  if (sessionTitle && !DEFAULT_TITLE.test(sessionTitle)) return sessionTitle;
  return firstQuestion || '';
}

function RenameDialog({ open, title, onCancel, onSave }) {
  const [draft, setDraft] = useState(title);
  useEffect(() => { if (open) setDraft(title); }, [open, title]);
  return (
    <AppDialog open={open} onClose={onCancel} maxWidth="xs" fullWidth aria-labelledby="chat-rename-title">
      <form onSubmit={(event) => { event.preventDefault(); if (draft.trim()) onSave(draft); }}>
        <DialogTitle id="chat-rename-title">Rename</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Title"
            value={draft}
            inputProps={{ maxLength: 200 }}
            onChange={(event) => setDraft(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!draft.trim()}>Save</Button>
        </DialogActions>
      </form>
    </AppDialog>
  );
}

/**
 * The chat page (ask-chat.html, D4): one centred 760px column with the
 * header (the question as an Unbounded title that wraps, Share and ⋯), the
 * thread with its Checked chips inline, and the composer. There is no
 * landing: a chat starts on the Ask home, and /chat with nothing to show
 * goes there.
 */
const ChatPageView = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { authToken } = useAuth();
  const recent = useContext(RecentChatsContext);
  const toast = useToast();
  const chat = useChat();
  const {
    messages, sessionId, sessionTitle,
  } = chat;
  const hasConversation = messages.some(isConversation);
  // Text or the upload panel an intent puts in the composer without sending.
  const [prefill, setPrefill] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const more = useMenu();
  const intentConsumedRef = useRef(false);

  // Nothing to show and nothing on the way: the Ask home is where a chat starts.
  // (A pop-up open over the page, ?course= and the like, stays.)
  const arrivedEmptyRef = useRef(
    !hasIntent(location.state) && !location.search && messages.length === 0 && !chat.isLoadingSession,
  );
  useEffect(() => {
    if (arrivedEmptyRef.current) navigate('/home', { replace: true });
  }, [navigate]);

  // Consume one-shot navigation intent from Home (session resume / new chat / prompt).
  useEffect(() => {
    if (!authToken || intentConsumedRef.current) return;
    const intent = location.state;
    // Only the known intent keys; other state (a pop-up's history marker) is not an intent.
    if (!hasIntent(intent)) return;

    intentConsumedRef.current = true;
    const applyIntent = async () => {
      try {
        if (intent.pendingPrompt && intent.autoSend) {
          // Asked from the home page: send it straight away in a fresh
          // conversation. Sending creates a session titled after the
          // question, so a separate new-chat step would only leave an empty
          // session behind.
          await chat.send(intent.pendingPrompt, null, { fresh: true });
          return;
        }
        if (intent.sessionId) {
          await chat.openSession(intent.sessionId);
        } else if (intent.startNew) {
          await chat.newChat();
        }
        if (intent.pendingPrompt || intent.openUpload) {
          setPrefill({ text: intent.pendingPrompt, upload: Boolean(intent.openUpload) });
        }
      } finally {
        // Keep the query (?course= keeps its pop-up open).
        navigate({ pathname: '/chat', search: location.search }, { replace: true, state: null });
      }
    };

    applyIntent();
    // One-shot location.state handoff; handlers are stable enough for mount-time use.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, location.state, navigate]);

  const chatTitle = chatTitleOf(messages, sessionTitle);
  const pinned = Boolean(recent?.sessions?.find((session) => session.id === sessionId)?.pinned);
  const failed = (message) => () => toast.show({ message, tone: 'error' });

  const share = () => shareChat({ title: chatTitle, messages })
    .then((how) => { if (how === 'copied') toast.show({ message: 'Copied' }); })
    .catch(failed('Couldn’t share'));

  const runExport = (format) => exportChat({ format, sessionId, authToken })
    .catch(failed('Couldn’t export'));

  return (
    <div className="chat-frame">
      <main className="chat-main" id="main-content">
        <header className="chat-head">
          <h1 className="chat-title">{chatTitle}</h1>
          <button
            type="button"
            className="chat-head-btn"
            aria-label="Share"
            disabled={!hasConversation}
            onClick={share}
          >
            <Icon name="ios_share" size={22} />
          </button>
          <button type="button" className="chat-head-btn" aria-label="More" {...more.triggerProps}>
            <Icon name="more_horiz" size={22} />
          </button>
          <ChatMenu
            anchorEl={more.anchorEl}
            onClose={more.closeMenu}
            pinned={pinned}
            onRename={sessionId ? () => setRenaming(true) : undefined}
            onPin={sessionId ? (next) => chat.pinSession(next).catch(failed('Couldn’t pin')) : undefined}
            onShare={hasConversation ? share : undefined}
            onExport={hasConversation && sessionId ? runExport : undefined}
            onSearchChats={() => navigate('/search')}
            onDelete={sessionId ? () => setDeleting(true) : undefined}
          />
        </header>

        <div className="chat-thread">
          <Thread variant="page" />
        </div>

        <div className="chat-bottom">
          <Composer surface="chat" prefill={prefill} />
        </div>
      </main>

      <RenameDialog
        open={renaming}
        title={chatTitle}
        onCancel={() => setRenaming(false)}
        onSave={(title) => {
          setRenaming(false);
          chat.renameSession(title).catch(failed('Couldn’t rename'));
        }}
      />
      <ConfirmDialog
        isOpen={deleting}
        title="Delete this chat?"
        confirmLabel="Delete"
        tone="danger"
        onCancel={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false);
          chat.deleteSession()
            .then(() => navigate('/home'))
            .catch(failed('Couldn’t delete'));
        }}
      />
    </div>
  );
};

// The app mounts one ChatProvider above the routes; rendered on its own
// (tests, previews) the page brings its own.
const ChatPage = () => (
  useContext(ChatContext) ? <ChatPageView /> : <ChatProvider><ChatPageView /></ChatProvider>
);

export default ChatPage;
