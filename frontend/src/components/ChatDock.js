import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import AddCommentRounded from '@mui/icons-material/AddCommentRounded';
import ChatBubbleOutlineRounded from '@mui/icons-material/ChatBubbleOutlineRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import KeyboardTabRounded from '@mui/icons-material/KeyboardTabRounded';
import EnhancedChatInput from './EnhancedChatInput';
import DockConversation from './chat/DockConversation';
import { useDropTarget } from './dnd';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../contexts/ChatContext';
import { useChatDock } from '../contexts/ChatDockContext';
import { chatPlaceholder } from '../utils/messageGroups';
import '../styles/EnhancedChatInput.css';
import '../styles/ChatDock.css';

const BIGGER = { peek: 'half', half: 'full', full: 'full' };
const SMALLER = { full: 'half', half: 'peek', peek: null };
const DRAG_THRESHOLD = 40;

/**
 * Answers that arrived while the dock was closed light the strip's dot.
 * Replies read where the dock is hidden (/home, /chat) or that belong to an
 * earlier conversation never count.
 */
function useUnread(visible) {
  const { messages, sessionEpoch } = useChat();
  const answers = messages.filter((m) => m.type === 'advisor').length;
  const [seen, setSeen] = useState(answers);
  const epochRef = useRef(sessionEpoch);
  useEffect(() => {
    const replaced = epochRef.current !== sessionEpoch;
    epochRef.current = sessionEpoch;
    if (visible || replaced || answers < seen) setSeen(answers);
  }, [visible, answers, seen, sessionEpoch]);
  return !visible && answers > seen;
}

function Strip({ dock, unread, targetRef, targetClass, buttonRef }) {
  return (
    <aside ref={targetRef} className={`cc-dock is-strip ${targetClass}`} aria-label="Ask">
      <button
        ref={buttonRef}
        type="button"
        className="cc-dock-icon-btn"
        aria-label="Open Ask"
        aria-expanded={dock.open}
        title="Ask"
        onClick={dock.openDock}
      >
        <ChatBubbleOutlineRounded fontSize="small" />
        {unread && <span className="cc-dock-unread"><span className="sr-only">New reply</span></span>}
      </button>
    </aside>
  );
}

/** The sheet's grab handle: tap to grow, drag up or down between peek / half / full. */
function SheetHandle({ snap, onSnap, onClose }) {
  const start = useRef(null);
  const dragged = useRef(false);
  return (
    <button
      type="button"
      className="cc-dock-handle"
      aria-label={snap === 'full' ? 'Shrink' : 'Expand'}
      onPointerDown={(event) => {
        start.current = event.clientY;
        dragged.current = false;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerUp={(event) => {
        const delta = start.current == null ? 0 : event.clientY - start.current;
        start.current = null;
        if (Math.abs(delta) <= DRAG_THRESHOLD) return;
        dragged.current = true;
        if (delta < 0) onSnap(BIGGER[snap]);
        else if (SMALLER[snap]) onSnap(SMALLER[snap]);
        else onClose();
      }}
      onClick={() => {
        if (dragged.current) { dragged.current = false; return; }
        onSnap(snap === 'full' ? 'half' : BIGGER[snap]);
      }}
    >
      <span aria-hidden="true" />
    </button>
  );
}

/**
 * The chat dock (design D17): the one conversation beside every page.
 * Docked at >= 1280px (collapses to a 48px strip), a 400px drawer at
 * 768–1279px, a bottom sheet under 768px (opened by the Ask tab). Dropping a
 * course, event or place on it attaches the item to the composer.
 */
export default function ChatDock() {
  const dock = useChatDock();
  const chat = useChat();
  const { config } = useAppConfig();
  const { authToken } = useAuth();
  const [draft, setDraft] = useState('');
  const panelRef = useRef(null);
  const stripButtonRef = useRef(null);
  const epochRef = useRef(chat.sessionEpoch);
  const unread = useUnread(!dock?.available || Boolean(dock?.open));

  const target = useDropTarget({
    id: 'chat-dock',
    label: 'Ask',
    disabled: !dock?.available,
    onDrop: (item) => {
      chat.attach(item);
      dock.openDock();
    },
  });

  // New chat or another session replaced the conversation: clear the draft.
  useLayoutEffect(() => {
    if (epochRef.current === chat.sessionEpoch) return;
    epochRef.current = chat.sessionEpoch;
    setDraft('');
  }, [chat.sessionEpoch]);

  // useAsk() asked for the composer: focus it once the dock is open.
  const focusedRef = useRef(dock?.focusRequest || 0);
  useEffect(() => {
    if (!dock?.open || dock.focusRequest === focusedRef.current) return;
    focusedRef.current = dock.focusRequest;
    panelRef.current?.querySelector('textarea')?.focus();
  }, [dock?.focusRequest, dock?.open]);

  if (!dock?.available) return null;
  const { mode, open } = dock;

  // Focus goes back to the strip, or on phones to the Ask tab (or whatever
  // opened the sheet).
  const close = () => {
    const back = mode === 'sheet'
      ? [dock.askTabRef?.current, dock.openerRef?.current]
      : [stripButtonRef.current, dock.openerRef?.current];
    dock.closeDock();
    window.requestAnimationFrame?.(() => {
      const target = back.find((node) => node?.isConnected && node !== document.body);
      target?.focus();
    });
  };

  const strip = (
    <Strip
      dock={dock}
      unread={unread}
      buttonRef={stripButtonRef}
      targetRef={open ? undefined : target.ref}
      targetClass={open ? '' : target.className}
    />
  );

  if (!open) return mode === 'sheet' ? null : strip;

  const panel = (
    <aside
      ref={(node) => { panelRef.current = node; target.ref(node); }}
      className={`cc-dock is-${mode} ${mode === 'sheet' ? `is-${dock.snap}` : ''} ${target.className}`}
      aria-label="Ask"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || mode === 'docked') return;
        if (!panelRef.current?.contains(event.target)) return; // a menu's own Escape
        close();
      }}
    >
      {mode === 'sheet' && <SheetHandle snap={dock.snap} onSnap={dock.setSnap} onClose={close} />}
      <header className="cc-dock-head">
        <h2>Ask</h2>
        <button
          type="button"
          className="cc-dock-icon-btn"
          aria-label="New chat"
          title="New chat"
          onClick={() => chat.newChat()}
        >
          <AddCommentRounded fontSize="small" />
        </button>
        <button
          type="button"
          className="cc-dock-icon-btn"
          aria-label={mode === 'docked' ? 'Collapse Ask' : 'Close Ask'}
          title={mode === 'docked' ? 'Collapse' : 'Close'}
          onClick={close}
        >
          {mode === 'docked' ? <KeyboardTabRounded fontSize="small" /> : <CloseRounded fontSize="small" />}
        </button>
      </header>
      <DockConversation />
      <div className="cc-dock-composer">
        <EnhancedChatInput
          compact
          onSendMessage={(text) => chat.send(text)}
          onFileUploaded={(file, result) => chat.addDocument(file, result)}
          uploadedDocuments={chat.uploadedDocuments}
          isLoading={chat.isLoading}
          currentChatSessionId={chat.sessionId}
          authToken={authToken}
          messageValue={draft}
          onMessageChange={setDraft}
          attachments={chat.attachments}
          onRemoveAttachment={chat.removeAttachment}
          placeholder={chatPlaceholder(config)}
        />
      </div>
    </aside>
  );

  // The drawer overlays the page; its strip keeps the column's place.
  return mode === 'drawer' ? <>{strip}{panel}</> : panel;
}
