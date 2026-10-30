import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { MessageCircle, Sparkles, FileText } from '../components/icons';

import EnhancedChatInput from '../components/EnhancedChatInput';
import MessageBubble from '../components/MessageBubble';
import ChatThinking from '../components/chat/ChatThinking';
import ExportButton from '../components/ExportButton';
import ChatMoreMenu from '../components/ChatMoreMenu';
import AnswerPanel, { buildSuggestions, latestVisuals } from '../components/AnswerPanel';
import { DOMAIN_COLORS } from '../components/domainColors';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { ChatContext, ChatProvider, useChat } from '../contexts/ChatContext';
import { useOpenCourse } from '../utils/openCourse';
import '../styles/ChatPage.css';
import '../styles/EnhancedChatInput.css';
import '../styles/ChatFrame.css';
import groupMessages, { chatPlaceholder } from '../utils/messageGroups';
import useViewport from '../hooks/useViewport';

/** location.state keys that carry a one-shot intent from another page. */
const INTENT_KEYS = ['pendingPrompt', 'sessionId', 'startNew'];

const isConversation = (message) => message.type !== 'system' && message.type !== 'document_upload';

const ChatPageView = () => {
  const navigate = useNavigate();
  const openCourse = useOpenCourse();
  const location = useLocation();
  const { authToken } = useAuth();
  const { config } = useAppConfig();
  const isMobile = useViewport() === 'phone';
  const chat = useChat();
  const {
    messages,
    isLoading,
    thinkingAdvisors,
    sessionId: currentSessionId,
    sessionTitle: currentSessionTitle,
    isLoadingSession,
    sessionEpoch,
    uploadedDocuments,
    groupViews,
    synthesizingGroups,
  } = chat;
  const [composerMessage, setComposerMessage] = useState('');
  // Coming back to a conversation in progress opens it active.
  const [chatPhase, setChatPhase] = useState(() => (messages.some(isConversation) ? 'active' : 'landing'));
  const messagesEndRef = useRef(null);
  const intentConsumedRef = useRef(false);
  const phaseTimerRef = useRef(null);
  const seenEpochRef = useRef(sessionEpoch);
  const skipAutoScrollRef = useRef(false);




  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }
    scrollToBottom();
  }, [messages, thinkingAdvisors]);

  useEffect(() => () => {
    if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current);
  }, []);

  // newChat / openSession replaced the conversation: reset the composer and
  // land or stay active to match what was loaded. Before paint, so the
  // welcome state never flashes over loaded messages.
  useLayoutEffect(() => {
    if (seenEpochRef.current === sessionEpoch) return;
    seenEpochRef.current = sessionEpoch;
    setComposerMessage('');
    setChatPhase(messages.some(isConversation) ? 'active' : 'landing');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionEpoch]);

  const loadChatSession = (sessionId) => chat.openSession(sessionId);

  const handleNewChat = async (sessionId = null) => {
    if (sessionId) {
      await loadChatSession(sessionId);
      return;
    }
    return chat.newChat();
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
          await handleSendMessage(intent.pendingPrompt, { fresh: true });
          return;
        }
        if (intent.sessionId) {
          await loadChatSession(intent.sessionId);
        } else if (intent.startNew) {
          await handleNewChat();
        }
        if (intent.pendingPrompt) {
          setComposerMessage(intent.pendingPrompt);
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

  

  const handleFileUploaded = async (file, uploadResult) => {
    chat.addDocument(file, uploadResult);
    console.log('File uploaded to session:', {
      filename: uploadResult.filename,
      session_id: uploadResult.session_id,
      chat_session_id: uploadResult.chat_session_id,
      current_session_id: currentSessionId
    });
  };

  const handleCourseSelect = (identifier) => {
    const course = (identifier || '').trim();
    if (!course) return;
    openCourse(course);
  };

  const handleSendMessage = async (inputMessage, options) => {
    if (!inputMessage.trim()) return;

    if (!hasConversationMessages) {
      setChatPhase('transitioning');
      if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = window.setTimeout(() => setChatPhase('active'), 280);
    }

    await chat.send(inputMessage, null, options);
  };

  const messageGroups = useMemo(() => groupMessages(messages), [messages]);

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

  const hasMessages = messages.length > 0;
  const hasConversationMessages = messages.some(isConversation);

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
                  <p>Ask about courses, events or places at {config?.app?.institution || 'your school'}.</p>
                </div>
              </div>
            )}
            {hasMessages && (
              <div className="messages-container">
                {/* Add loading session indicator */}
                {isLoadingSession && (
                  <div className="loading-session">
                    <div className="loading-spinner"></div>
                    <span>Loading chat session...</span>
                  </div>
                )}
                
                <div className="messages-list">
                  <div className="messages-scroll">
                    {messageGroups.map((group) => (
                      group.type === 'advisor_group' ? (() => {
                        const hasAggregated = group.aggregatedMessages.length > 0;
                        const view = groupViews[group.responseGroupId] || (hasAggregated ? 'aggregated' : 'panel');
                        const isSynth = !!synthesizingGroups[group.responseGroupId];
                        const showAggregated = view === 'aggregated' && hasAggregated;
                        const shown = showAggregated ? group.aggregatedMessages : group.panelMessages;
                        return (
                          <div key={group.responseGroupId} className="response-group">
                            {isSynth && (
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                color: 'var(--muted)', fontSize: 13, padding: '8px 4px',
                              }}>
                                <Sparkles size={16} />
                                <span>Combining advisor responses into one answer…</span>
                              </div>
                            )}
                            {shown.map((message) => (
                              <div key={message.id} className="single-response-wide">
                                <MessageBubble
                                  message={message}
                                  onCourseSelect={handleCourseSelect}
                                  onAsk={(text) => handleSendMessage(text)}
                                />
                              </div>
                            ))}
                          </div>
                        );
                      })() : (
                      <div key={group.message.id}>
                        {group.message.type === 'user' && (
                          <div className="user-message-container">
                            <div className="user-message">
                              <p>{group.message.content}</p>
                            </div>
                          </div>
                        )}

                        {group.message.type === 'error' && (
                          <div className="error-message-container">
                            <div className="error-message">
                              <p>{group.message.content}</p>
                            </div>
                          </div>
                        )}

                        {group.message.type === 'system' && (
                          <div className="system-message-container">
                            <div className="system-message">
                              <p>{group.message.content}</p>
                            </div>
                          </div>
                        )}

                        {group.message.type === 'document_upload' && (
                          <div className="system-message-container">
                            <div className="system-message document-upload">
                              <FileText size={16} />
                              <p>{group.message.content}</p>
                            </div>
                          </div>
                        )}

                        {group.message.type === 'clarification' && (
                          <div className="clarification-message-container">
                            <div className="clarification-message">
                              <div className="clarification-header">
                                <MessageCircle size={16} />
                                <span>I need a bit more information</span>
                              </div>
                              <p>{group.message.content}</p>
                              
                              {group.message.suggestions && group.message.suggestions.length > 0 && (
                                <div className="clarification-suggestions">
                                  <p className="suggestions-label">Here are some ways you could be more specific:</p>
                                  <div className="suggestions-list">
                                    {group.message.suggestions.map((suggestion, index) => (
                                      <button
                                        key={index}
                                        className="suggestion-button"
                                        onClick={() => handleSendMessage(suggestion)}
                                      >
                                        {suggestion}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      )
                    ))}

                    <ChatThinking thinkingAdvisors={thinkingAdvisors} />

                    <div ref={messagesEndRef} />
                  </div>
                </div>
              </div>
            )}
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
                    onClick={() => handleSendMessage(suggestion.text)}
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

            <EnhancedChatInput
              compact
              onSendMessage={(text) => handleSendMessage(text)}
              onFileUploaded={handleFileUploaded}
              uploadedDocuments={uploadedDocuments}
              isLoading={isLoading}
              currentChatSessionId={currentSessionId}
              authToken={authToken}
              messageValue={composerMessage}
              onMessageChange={setComposerMessage}
              attachments={chat.attachments}
              onRemoveAttachment={chat.removeAttachment}
              isLanding={chatPhase !== 'active'}
              placeholder={chatPlaceholder(config)}
            />
          </div>
        </div>
      </main>

      <AnswerPanel
        visuals={answerVisuals}
        authToken={authToken}
        timezone={config?.school?.timezone}
        onAsk={(text) => handleSendMessage(text)}
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
