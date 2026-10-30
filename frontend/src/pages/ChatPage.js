import React, { useState, useEffect, useLayoutEffect, useRef, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import Composer from '../components/chat/Composer';
import Thread from '../components/chat/Thread';
import ExportButton from '../components/ExportButton';
import ChatMoreMenu from '../components/ChatMoreMenu';
import AnswerPanel, { buildSuggestions, latestVisuals } from '../components/AnswerPanel';
import { DOMAIN_COLORS } from '../components/domainColors';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { ChatContext, ChatProvider, useChat } from '../contexts/ChatContext';
import '../styles/ChatPage.css';
import '../styles/ChatFrame.css';
import useViewport from '../hooks/useViewport';
import { schoolFacts } from '../modules/campus';

/** location.state keys that carry a one-shot intent from another page. */
const INTENT_KEYS = ['pendingPrompt', 'sessionId', 'startNew'];

const isConversation = (message) => message.type !== 'system' && message.type !== 'document_upload';

/** How long the landing composer takes to move into the conversation. */
const PHASE_MS = 280;

const ChatPageView = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { authToken } = useAuth();
  const { config } = useAppConfig();
  const isMobile = useViewport() === 'phone';
  const chat = useChat();
  const {
    messages,
    isLoading,
    sessionId: currentSessionId,
    sessionTitle: currentSessionTitle,
    sessionEpoch,
  } = chat;
  const hasMessages = messages.length > 0;
  const hasConversationMessages = messages.some(isConversation);
  // Text an intent puts in the composer without sending it.
  const [prefill, setPrefill] = useState(null);
  // Coming back to a conversation in progress opens it active.
  const [chatPhase, setChatPhase] = useState(() => (hasConversationMessages ? 'active' : 'landing'));
  const phaseRef = useRef(chatPhase);
  phaseRef.current = chatPhase;
  const intentConsumedRef = useRef(false);
  const phaseTimerRef = useRef(null);
  const seenEpochRef = useRef(sessionEpoch);

  useEffect(() => () => {
    if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current);
  }, []);

  // newChat / openSession replaced the conversation: land or stay active to
  // match what was loaded. Otherwise the first question moves the landing
  // composer into the conversation. Before paint, so the welcome state never
  // flashes over loaded messages.
  useLayoutEffect(() => {
    if (seenEpochRef.current !== sessionEpoch) {
      seenEpochRef.current = sessionEpoch;
      if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current);
      setChatPhase(hasConversationMessages ? 'active' : 'landing');
      return;
    }
    if (hasConversationMessages && phaseRef.current === 'landing') {
      setChatPhase('transitioning');
      if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = window.setTimeout(() => setChatPhase('active'), PHASE_MS);
    }
  }, [sessionEpoch, hasConversationMessages]);

  const ask = (text) => {
    if (!text.trim()) return undefined;
    return chat.send(text);
  };

  // Consume one-shot navigation intent from Home (session resume / new chat / prompt).
  useEffect(() => {
    if (!authToken || intentConsumedRef.current) return;
    const intent = location.state;
    // Only the known intent keys; other state (a pop-up's history marker) is not an intent.
    if (!intent || typeof intent !== 'object' || !INTENT_KEYS.some((key) => intent[key])) {
      return;
    }

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
        if (intent.pendingPrompt) {
          setPrefill({ text: intent.pendingPrompt });
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

  // Dialogs center over the conversation, right of the 260px rail.
  const dialogInset = isMobile ? 0 : 260;

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('dialog-inset-change', { detail: { leftInset: dialogInset } }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent('dialog-inset-change', { detail: { leftInset: 0 } }),
      );
    };
  }, [dialogInset]);

  const firstQuestion = messages.find((m) => m.type === 'user')?.content;
  const chatTitle = firstQuestion || (hasMessages && currentSessionTitle) || 'New chat';
  const answerVisuals = latestVisuals(messages);
  const suggestions = buildSuggestions({
    visuals: answerVisuals,
    starters: config?.homepage?.starters || [],
    asked: messages.filter((m) => m.type === 'user').map((m) => m.content || ''),
  });

  return (
    <div className="chat-frame">
      <main className="main-chat-area" id="main-content">
        <div className="modern-chat-page">
          <header className="chat-head">
            <h1 className="chat-title">{chatTitle}</h1>
            <div className="chat-head-actions">
              <ExportButton
                hasMessages={hasConversationMessages}
                currentSessionId={currentSessionId}
                authToken={authToken}
              />
              <ChatMoreMenu
                onSearchChats={() => navigate('/search')}
                onOpenGuide={() => window.dispatchEvent(new CustomEvent(
                  'open-user-guide',
                  { detail: { leftInset: dialogInset } },
                ))}
              />
            </div>
          </header>

          {/* Main Content */}
          <div className="chat-content">
            {chatPhase !== 'active' && (
              <div className={`welcome-state ${chatPhase === 'transitioning' ? 'is-leaving' : ''}`}>
                <div className="chat-hero-copy">
                  <h2>What do you need on campus today?</h2>
                </div>
              </div>
            )}
            <Thread variant="page" />
          </div>

          <div className={`floating-input-area phase-${chatPhase}`}>
            {suggestions.length > 0 && (
              <div className="chat-suggestions" aria-label="Suggested questions">
                {suggestions.map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion.text}
                    className="chat-suggestion"
                    disabled={isLoading}
                    onClick={() => ask(suggestion.text)}
                  >
                    <span
                      className="chat-suggestion-dot"
                      style={{ background: DOMAIN_COLORS[suggestion.domain] || 'var(--muted)' }}
                      aria-hidden="true"
                    />
                    {suggestion.text}
                  </button>
                ))}
              </div>
            )}

            <Composer surface="chat" prefill={prefill} />
          </div>
        </div>
      </main>

      <AnswerPanel
        visuals={answerVisuals}
        authToken={authToken}
        timezone={schoolFacts(config).timezone}
        onAsk={ask}
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
