import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMediaQuery } from '@mui/material';

import { Menu, MessageCircle, Reply, X, Sparkles, FileText } from '../components/icons';

import EnhancedChatInput from '../components/EnhancedChatInput';
import MessageBubble from '../components/MessageBubble';
import ChatThinking from '../components/chat/ChatThinking';
import SettingsModal from '../components/SettingsModal';
import ExportButton from '../components/ExportButton';
import CampusRail from '../components/CampusRail';
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
import AdvisorCarousel from '../components/AdvisorCarousel';
import muiTheme from '../theme/muiTheme';
import groupMessages, { chatPlaceholder } from '../utils/messageGroups';

/** location.state keys that carry a one-shot intent from another page. */
const INTENT_KEYS = ['pendingPrompt', 'sessionId', 'startNew'];

const isConversation = (message) => message.type !== 'system' && message.type !== 'document_upload';

const ChatPageView = () => {
  const navigate = useNavigate();
  const openCourse = useOpenCourse();
  const location = useLocation();
  const { user, authToken, handleSignOut, handleUserUpdate } = useAuth();
  const { config, advisors } = useAppConfig();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));
  const chat = useChat();
  const {
    messages,
    isLoading,
    thinkingAdvisors,
    sessionId: currentSessionId,
    sessionTitle: currentSessionTitle,
    isLoadingSession,
    sessionsVersion,
    sessionEpoch,
    uploadedDocuments,
    groupViews,
    synthesizingGroups,
  } = chat;
  const [replyingTo, setReplyingTo] = useState(null);
  const [llmConfig, setLlmConfig] = useState({
    mode: 'uniform',
    default_backend: null,
    orchestrator_backend: null,
    persona_backends: null,
  });
  const [availableBackends, setAvailableBackends] = useState([]);
  const [isProviderSwitching, setIsProviderSwitching] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [composerMessage, setComposerMessage] = useState('');
  const [selectedAdvisorIds, setSelectedAdvisorIds] = useState(null);
  // Coming back to a conversation in progress opens it active.
  const [chatPhase, setChatPhase] = useState(() => (messages.some(isConversation) ? 'active' : 'landing'));
  const messagesEndRef = useRef(null);
  const intentConsumedRef = useRef(false);
  const phaseTimerRef = useRef(null);
  const seenEpochRef = useRef(sessionEpoch);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const skipAutoScrollRef = useRef(false);




  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleMobileMenuToggle = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
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

  useEffect(() => {
    if (authToken) fetchCurrentProvider();
  }, [authToken]);

  const fetchCurrentProvider = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/current-provider`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.llm_config) setLlmConfig(data.llm_config);
        if (Array.isArray(data.available_backends)) setAvailableBackends(data.available_backends);
      }
    } catch (error) {
      console.error('Error fetching current provider:', error);
    }
  };

  

  const submitProviderConfig = async (payload, label) => {
    setIsProviderSwitching(true);
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/switch-provider`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.llm_config) {
          setLlmConfig(data.llm_config);
        } else {
          setLlmConfig(payload);
        }

        chat.appendMessage({
          type: 'system',
          content: `✨ Switched to ${label}. Your advisors are now ready with the new configuration.`,
        });
        return true;
      }

      const error = await response.json().catch(() => ({}));
      console.error('Failed to switch provider:', error);
      chat.appendMessage({
        type: 'error',
        content: `Failed to switch to ${label}: ${error.detail || 'Unknown error'}`,
      });
      return false;
    } catch (error) {
      console.error('Error switching provider:', error);
      chat.appendMessage({
        type: 'error',
        content: `Error switching to ${label}. Please try again.`,
      });
      return false;
    } finally {
      setIsProviderSwitching(false);
    }
  };

  const handleHybridSubmit = async (hybridConfig) => {
    const ok = await submitProviderConfig(
      { mode: 'hybrid', ...hybridConfig },
      'Hybrid configuration'
    );
    if (ok) setIsSettingsOpen(false);
    return ok;
  };

  // newChat / openSession replaced the conversation: reset the composer and
  // land or stay active to match what was loaded. Before paint, so the
  // welcome state never flashes over loaded messages.
  useLayoutEffect(() => {
    if (seenEpochRef.current === sessionEpoch) return;
    seenEpochRef.current = sessionEpoch;
    setComposerMessage('');
    setSelectedAdvisorIds(null);
    setReplyingTo(null);
    setChatPhase(messages.some(isConversation) ? 'active' : 'landing');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionEpoch]);

  const loadChatSession = (sessionId) => chat.openSession(sessionId);

  // Handle selecting a session from sidebar
  const handleSelectSession = async (sessionId) => {
    if (sessionId === currentSessionId) return;
    await loadChatSession(sessionId);
  };

  // Handle creating new chat from sidebar
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
          await handleSendMessage(intent.pendingPrompt, null, { fresh: true });
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

  const handleSendMessage = async (inputMessage, activeAdvisorIds = null, options) => {
    if (!inputMessage.trim()) return;

    if (!hasConversationMessages) {
      setChatPhase('transitioning');
      if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = window.setTimeout(() => setChatPhase('active'), 280);
    }

    await chat.send(inputMessage, activeAdvisorIds, options);
  };

  const handleReplyToAdvisor = (inputMessage, replyContext) => chat.replyToAdvisor(inputMessage, replyContext);

  const handleCopyMessage = (messageId, content) => {
    // Optional: Show a toast notification or add to message history
    console.log(`Copied message ${messageId}: ${content.substring(0, 50)}...`);
  };

  const handleExpandMessage = async (messageId, advisorId) => {
    const advisor = advisors[advisorId];
    if (!advisor) return;
    await chat.expand(messageId, advisorId, advisor.name);
  };

  const handleReplyToMessage = (message) => {
    const advisor = advisors[message.persona_id];
    setReplyingTo({
      advisorId: message.persona_id,
      messageId: message.id,
      advisorName: advisor?.name || message.advisorName || 'Advisor',
      persona_id: message.persona_id
    });
  };

  const handleMessageClick = (message) => {
    if (message.type === 'advisor') {
      const advisor = advisors[message.persona_id];
      setReplyingTo({
        advisorId: message.persona_id,
        messageId: message.id,
        advisorName: advisor?.name || message.advisorName || 'Advisor',
        persona_id: message.persona_id
      });
    }
  };

  const messageGroups = useMemo(() => groupMessages(messages), [messages]);

  const handleInputSubmit = async (inputMessage) => {
  if (replyingTo) {
    // This is a reply to a specific message
    await handleReplyToAdvisor(inputMessage, replyingTo);
  } else {
    // This is a regular message
    const advisorIdsForMessage = selectedAdvisorIds;
    setSelectedAdvisorIds(null);
    await handleSendMessage(inputMessage, advisorIdsForMessage);
  }
};

  const cancelReply = () => {
    setReplyingTo(null);
  };

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
    <div className={`chat-frame ${isMobileMenuOpen ? 'rail-open' : ''}`}>
      <CampusRail
        className="chat-rail"
        currentSessionId={currentSessionId}
        refreshTrigger={sessionsVersion}
        onNewChat={() => { setIsMobileMenuOpen(false); handleNewChat(); }}
        onSelectSession={(sessionId) => { setIsMobileMenuOpen(false); handleSelectSession(sessionId); }}
        onShowAllChats={() => navigate('/search')}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSignOut={() => {
          handleSignOut();
          navigate('/', { replace: true });
        }}
      />
      {isMobileMenuOpen && (
        <button
          type="button"
          className="chat-rail-backdrop"
          aria-label="Close menu"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <main className="main-chat-area" id="main-content">
        <div className="modern-chat-page">
          <header className="chat-head">
            <button
              type="button"
              className="chat-head-btn chat-menu-btn"
              aria-label="Open menu"
              onClick={handleMobileMenuToggle}
            >
              <Menu size={18} />
            </button>
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
                            {shown.length > 0 && (
                              <AdvisorCarousel
                                key={shown.map(m => m.id).join('-')}
                                messages={shown}
                                onReply={handleReplyToMessage}
                                onExpand={handleExpandMessage}
                                onClick={handleMessageClick}
                                onCourseSelect={handleCourseSelect}
                                onAsk={(text) => handleSendMessage(text)}
                              />
                            )}
                          </div>
                        );
                      })() : (
                      <div key={group.message.id}>
                        {group.message.type === 'user' && (
                          <div className="user-message-container">
                            <div className="user-message">
                              {group.message.replyTo && (
                                <div className="reply-indicator">
                                  <Reply size={12} />
                                  <span>Reply to {group.message.replyTo.advisorName}</span>
                                </div>
                              )}
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
            {replyingTo && (
              <div className="reply-banner">
                <div className="reply-info">
                  <Reply size={16} />
                  <span>Replying to <strong>{replyingTo.advisorName}</strong></span>
                </div>
                <button onClick={cancelReply} className="cancel-reply">
                  <X size={16} />
                </button>
              </div>
            )}
            
            {suggestions.length > 0 && !replyingTo && (
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
              onSendMessage={handleInputSubmit}
              onFileUploaded={handleFileUploaded}
              uploadedDocuments={uploadedDocuments}
              isLoading={isLoading}
              currentChatSessionId={currentSessionId}
              authToken={authToken}
              messageValue={composerMessage}
              onMessageChange={setComposerMessage}
              selectedAdvisorIds={selectedAdvisorIds}
              onSelectedAdvisorIdsChange={setSelectedAdvisorIds}
              attachments={replyingTo ? [] : chat.attachments}
              onRemoveAttachment={chat.removeAttachment}
              isLanding={chatPhase !== 'active'}
              placeholder={
                replyingTo
                  ? `Reply to ${replyingTo.advisorName}...`
                  : chatPlaceholder(config)
              }
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

      {isSettingsOpen && (
        <SettingsModal
          user={user}
          authToken={authToken}
          onUserUpdate={handleUserUpdate}
          onSignOut={() => {
            handleSignOut();
            navigate('/', { replace: true });
          }}
          advisors={advisors}
          availableBackends={availableBackends}
          llmConfig={llmConfig}
          isSaving={isProviderSwitching}
          onSubmitConfig={handleHybridSubmit}
          onClose={() => setIsSettingsOpen(false)}
          leftInset={dialogInset}
        />
      )}
    </div>
  );
};

// The app mounts one ChatProvider above the routes; rendered on its own
// (tests, previews) the page brings its own.
const ChatPage = () => (
  useContext(ChatContext) ? <ChatPageView /> : <ChatProvider><ChatPageView /></ChatProvider>
);

export default ChatPage;
