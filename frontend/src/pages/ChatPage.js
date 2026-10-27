import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMediaQuery } from '@mui/material';

import { Menu, MessageCircle, Reply, X, Sparkles, FileText } from 'lucide-react';

import EnhancedChatInput from '../components/EnhancedChatInput';
import MessageBubble from '../components/MessageBubble';
import ThinkingIndicator from '../components/ThinkingIndicator';
import SettingsModal from '../components/SettingsModal';
import ExportButton from '../components/ExportButton';
import CampusRail from '../components/CampusRail';
import ChatMoreMenu from '../components/ChatMoreMenu';
import AnswerPanel, { buildSuggestions, latestVisuals } from '../components/AnswerPanel';
import { DOMAIN_COLORS } from '../components/domainColors';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useAuth } from '../contexts/AuthContext';
import '../styles/ChatPage.css';
import '../styles/EnhancedChatInput.css';
import '../styles/ChatFrame.css';
import AdvisorCarousel from '../components/AdvisorCarousel';
import OnboardingTour from '../components/OnboardingTour';
import muiTheme from '../theme/muiTheme';
import { parseServerTime } from '../utils/serverTime';

const ChatPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, authToken, handleSignOut, handleUserUpdate } = useAuth();
  const { config, advisors } = useAppConfig();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingAdvisors, setThinkingAdvisors] = useState([]);
  const [collectedInfo, setCollectedInfo] = useState({});
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
  const [uploadedDocuments, setUploadedDocuments] = useState([]);
  const [composerMessage, setComposerMessage] = useState('');
  const [selectedAdvisorIds, setSelectedAdvisorIds] = useState(null);
  const [chatPhase, setChatPhase] = useState('landing');
  const messagesEndRef = useRef(null);
  const intentConsumedRef = useRef(false);
  const phaseTimerRef = useRef(null);

  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [currentSessionTitle, setCurrentSessionTitle] = useState('');
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0);
  // Campus Companion answers as one voice: advisor replies are always combined.
  const responseMode = 'aggregated';

  // Per-exchange view override: { [responseGroupId]: 'panel' | 'aggregated' }.
  // Lets the user flip an individual exchange between the advisor panel and
  // the single combined answer, independently of the global default.
  const [groupViews, setGroupViews] = useState({});
  // Group ids currently running an on-demand synthesis pass (for lag UX).
  const [synthesizingGroups, setSynthesizingGroups] = useState({});
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

        setMessages(prev => [...prev, {
          id: generateMessageId(),
          type: 'system',
          content: `✨ Switched to ${label}. Your advisors are now ready with the new configuration.`,
          timestamp: new Date()
        }]);
        return true;
      }

      const error = await response.json().catch(() => ({}));
      console.error('Failed to switch provider:', error);
      setMessages(prev => [...prev, {
        id: generateMessageId(),
        type: 'error',
        content: `Failed to switch to ${label}: ${error.detail || 'Unknown error'}`,
        timestamp: new Date()
      }]);
      return false;
    } catch (error) {
      console.error('Error switching provider:', error);
      setMessages(prev => [...prev, {
        id: generateMessageId(),
        type: 'error',
        content: `Error switching to ${label}. Please try again.`,
        timestamp: new Date()
      }]);
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

  const generateMessageId = () => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
  };

  const createNewSession = async (firstMessage = null) => {
    try {
      const title = firstMessage 
        ? `${firstMessage.substring(0, 30)}...` 
        : `Chat ${new Date().toLocaleDateString()}`;

      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/chat-sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title })
      });

      if (response.ok) {
        const newSession = await response.json();
        
        // Update state immediately
        setCurrentSessionId(newSession.id);
        setCurrentSessionTitle(newSession.title);
        
        console.log('MongoDB session created:', newSession.id);
        return newSession.id;
      } else {
        console.error('Failed to create new session');
        return null;
      }
    } catch (error) {
      console.error('Error creating new session:', error);
      return null;
    }
  };


// Load an existing chat session
const loadChatSession = async (sessionId) => {
  if (!sessionId || isLoadingSession) return;
  setIsLoadingSession(true);
  try {
    // Use the new switch-chat endpoint that syncs context
    const response = await fetch(`${process.env.REACT_APP_API_URL}/switch-chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_session_id: sessionId
      })
    });

    if (response.ok) {
      const result = await response.json();
      if (result.status === 'success') {
        setCurrentSessionId(sessionId);
        setCurrentSessionTitle(''); // Will be set from MongoDB data
        
        // Load the messages from the synced context
        const formattedMessages = result.context.messages.map(msg => ({
          ...msg,
          timestamp: parseServerTime(msg.timestamp),
          persona_id: msg.persona_id || msg.advisor || msg.advisorId,
          responseGroupId: msg.response_group_id || null,
        }));
        
        setMessages(formattedMessages);
        setComposerMessage('');
        setSelectedAdvisorIds(null);
        setChatPhase(formattedMessages.some(
          (message) => message.type !== 'system' && message.type !== 'document_upload',
        ) ? 'active' : 'landing');
        setReplyingTo(null);
        setThinkingAdvisors([]);
        
        // Also get the session title from MongoDB
        const sessionResponse = await fetch(`${process.env.REACT_APP_API_URL}/api/chat-sessions/${sessionId}`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        });
        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json();
          setCurrentSessionTitle(sessionData.title);
        }
      }
    }
  } catch (error) {
    console.error('Error loading session:', error);
  } finally {
    setIsLoadingSession(false);
  }
};

// Update session title based on first message
const updateSessionTitle = async (sessionId, newTitle) => {
  if (!sessionId || !authToken) return;

  try {
    await fetch(`${process.env.REACT_APP_API_URL}/api/chat-sessions/${sessionId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title: newTitle })
    });
    setCurrentSessionTitle(newTitle);
  } catch (error) {
    console.error('Error updating session title:', error);
  }
};

// Handle selecting a session from sidebar
const handleSelectSession = async (sessionId) => {
  if (sessionId === currentSessionId) return;
  await loadChatSession(sessionId);
};

// Handle creating new chat from sidebar
const handleNewChat = async (sessionId = null) => {
  if (sessionId) {
    // Loading existing session
    await loadChatSession(sessionId);
    return; // Return early for existing session loading
  } else {
    // Creating completely new chat with fresh context
    try {
      // Step 1: Reset memory session
      const response = await fetch(`${process.env.REACT_APP_API_URL}/new-chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: `Chat ${new Date().toLocaleDateString()}`
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.status === 'success') {
          // Step 2: Immediately create MongoDB session
          const newSessionId = await createNewSession(`Chat ${new Date().toLocaleDateString()}`);
          
          if (newSessionId) {
            // Reset all state to fresh with the new session
            setMessages([]);
            setComposerMessage('');
            setSelectedAdvisorIds(null);
            setChatPhase('landing');
            setCurrentSessionId(newSessionId); // Set the new session ID immediately
            setCurrentSessionTitle(`Chat ${new Date().toLocaleDateString()}`);
            setReplyingTo(null);
            setThinkingAdvisors([]);
            setUploadedDocuments([]);
            
            console.log('New chat created with MongoDB session:', newSessionId);
            
            // Wait a bit to ensure state has updated
            await new Promise(resolve => setTimeout(resolve, 100));
            return newSessionId; // Return the session ID for the sidebar
          } else {
            throw new Error('Failed to create MongoDB session');
          }
        } else {
          throw new Error('Failed to create memory session');
        }
      } else {
        throw new Error(`HTTP error: ${response.status}`);
      }
    } catch (error) {
      console.error('Error creating new chat:', error);
      
      // Fallback to local reset
      setMessages([]);
      setComposerMessage('');
      setSelectedAdvisorIds(null);
      setChatPhase('landing');
      setCurrentSessionId(null);
      setCurrentSessionTitle('');
      setReplyingTo(null);
      setThinkingAdvisors([]);
      setUploadedDocuments([]);
      
      // Re-throw the error so the sidebar knows something went wrong
      throw error;
    }
  }
};

  // Consume one-shot navigation intent from Home (session resume / new chat / prompt).
  useEffect(() => {
    if (!authToken || intentConsumedRef.current) return;
    const intent = location.state;
    if (!intent || (typeof intent === 'object' && Object.keys(intent).length === 0)) {
      return;
    }

    intentConsumedRef.current = true;
    const applyIntent = async () => {
      try {
        if (intent.pendingPrompt && intent.autoSend) {
          // Asked from the home page: send it straight away. With no current
          // session, sending creates one titled after the question, so a
          // separate new-chat step would only leave an empty session behind.
          await handleSendMessage(intent.pendingPrompt);
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
        navigate('/chat', { replace: true, state: null });
      }
    };

    applyIntent();
    // One-shot location.state handoff; handlers are stable enough for mount-time use.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, location.state, navigate]);

  

  const handleFileUploaded = async (file, uploadResult) => {
    // FIXED: Use the upload result data for better messaging
    const documentMessage = {
      id: generateMessageId(),
      type: 'document_upload',
      content: `Document uploaded: ${uploadResult.filename || file.name} (${uploadResult.chunks_created || 0} sections processed)`,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, documentMessage]);
    setUploadedDocuments(prev => [...prev, file]);
    
    // FIXED: Log document access info
    console.log('File uploaded to session:', {
      filename: uploadResult.filename,
      session_id: uploadResult.session_id,
      chat_session_id: uploadResult.chat_session_id,
      current_session_id: currentSessionId
    });
    
  };


  // Reusable streaming call to /chat-stream. Lifted to component scope so the
  // on-demand "generalize" action can reuse it too.
  const streamChat = async (userInput, sessionId = null, activeAdvisorIds = null) => {
    const response = await fetch(`${process.env.REACT_APP_API_URL}/chat-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        user_input: userInput,
        response_length: 'medium',
        chat_session_id: sessionId || currentSessionId,
        response_mode: responseMode,
        active_advisors: activeAdvisorIds,
      }),
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return response;
  };

  const handleCourseSelect = (identifier) => {
    const course = (identifier || '').trim();
    if (course) navigate(`/courses/${encodeURIComponent(course)}`);
  };

  const handleSendMessage = async (inputMessage, activeAdvisorIds = null) => {
    if (!inputMessage.trim()) return;

    if (!hasConversationMessages) {
      setChatPhase('transitioning');
      if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = window.setTimeout(() => setChatPhase('active'), 280);
    }

    // Create user message
    const userMessage = {
      id: generateMessageId(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    // Add to local state immediately
    setMessages(prev => [...prev, userMessage]);

    // Create new session if we don't have one
    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = await createNewSession(inputMessage);
      if (!sessionId) {
        console.error('Failed to create session');
        return;
      }
    }

    // Update session title if this is the first message and title is generic
    if (messages.length === 0 && currentSessionTitle.includes('Chat ')) {
      const newTitle = inputMessage.length > 30 
        ? `${inputMessage.substring(0, 30)}...` 
        : inputMessage;
      await updateSessionTitle(sessionId, newTitle);
    }

    // Set loading state
    setIsLoading(true);
    setThinkingAdvisors(['system']);

    const aggregatedMode = responseMode === 'aggregated';
    const responseGroupId = 'grp_' + generateMessageId();
    // Always collect this exchange's advisor responses so the panel is stored
    // even when aggregated mode is the default — the user can toggle to it.
    const collectedAdvisorResponses = [];

    try {
      const response = await streamChat(inputMessage, sessionId, activeAdvisorIds);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let refreshedForUserMessage = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const payload = JSON.parse(line);

          if (!refreshedForUserMessage) {
            setSidebarRefreshTrigger(prev => prev + 1);
            refreshedForUserMessage = true;
          }

          const d = payload.data || {};

          switch (payload.type) {
            case 'advisor': {
              const msg = {
                id: generateMessageId(),
                type: 'advisor',
                persona_id: d.persona_id,
                content: d.content,
                timestamp: new Date(),
                advisorName: d.persona_name || d.persona_id,
                used_documents: d.used_documents || false,
                document_chunks_used: d.document_chunks_used || 0,
                responseGroupId,
                is_aggregated: d.is_aggregated || false,
                source_personas: d.source_personas || null,
                visuals: d.visuals || null,
              };
              collectedAdvisorResponses.push(msg);
              setThinkingAdvisors(prev => prev.filter(a => a !== d.persona_id));
              if (!aggregatedMode || msg.is_aggregated) {
                setMessages(prev => [...prev, msg]);
              }
              break;
            }
            case 'clarification':
              setMessages(prev => [...prev, {
                id: generateMessageId(),
                type: 'clarification',
                content: d.message,
                suggestions: d.suggestions || [],
                timestamp: new Date(),
              }]);
              break;
            case 'progress':
              if (d.phase === 'complete') {
                break;
              }
              if (d.phase === 'synthesizing') {
                setSynthesizingGroups(prev => ({ ...prev, [responseGroupId]: true }));
              }
              if (d.persona_id != null) {
                setThinkingAdvisors(prev => prev.filter(a => a !== d.persona_id));
              }
              break;
            case 'error':
              setMessages(prev => [...prev, {
                id: generateMessageId(),
                type: 'error',
                content: d.detail || 'An error occurred',
                timestamp: new Date(),
              }]);
              break;
            default:
              break;
          }
        }
      }

      const hasAggregated = collectedAdvisorResponses.some(m => m.is_aggregated);
      if (aggregatedMode) {
        const deferred = collectedAdvisorResponses.filter(m => !m.is_aggregated);
        if (deferred.length > 0) {
          setMessages(prev => [...prev, ...deferred]);
        }
      }
      setGroupViews(prev => ({ ...prev, [responseGroupId]: hasAggregated ? 'aggregated' : 'panel' }));
      setSynthesizingGroups(prev => { const n = { ...prev }; delete n[responseGroupId]; return n; });

    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, {
        id: generateMessageId(),
        type: 'error',
        content: `Failed to send message: ${error.message}`,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
      setThinkingAdvisors([]);
      setSidebarRefreshTrigger(prev => prev + 1);
    }
  };

  const handleReplyToAdvisor = async (inputMessage, replyContext) => {
  // Ensure we have a session before proceeding
  let sessionId = currentSessionId;
  if (!sessionId) {
    sessionId = await createNewSession(inputMessage);
    if (!sessionId) {
      console.error('Failed to create session for reply');
      return;
    }
  }

  const replyMessage = {
    id: generateMessageId(),
    type: 'user',
    content: inputMessage,
    replyTo: {
      advisorId: replyContext.persona_id,
      advisorName: replyContext.advisorName,
      messageId: replyContext.messageId
    },
    timestamp: new Date()
  };

  setMessages(prev => [...prev, replyMessage]);
  setSidebarRefreshTrigger(prev => prev + 1);

  setIsLoading(true);
  setThinkingAdvisors([replyContext.persona_id]);

  try {
    const response = await fetch(`${process.env.REACT_APP_API_URL}/reply-to-advisor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        user_input: inputMessage,
        advisor_id: replyContext.advisorId,
        original_message_id: replyContext.messageId,
        chat_session_id: sessionId // Use confirmed session ID
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();

    if (data.type === 'advisor_reply') {
      const replyResponseMessage = {
        id: generateMessageId(),
        type: 'advisor',
        persona_id: data.persona_id,
        advisorName: data.persona,
        content: data.response,
        isReply: true,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, replyResponseMessage]);
    }

  } catch (error) {
    console.error('Error replying to advisor:', error);
    const errorMessage = {
      id: generateMessageId(),
      type: 'error',
      content: 'Sorry, I encountered an error with your reply. Please try again.',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, errorMessage]);
  }

  setIsLoading(false);
  setThinkingAdvisors([]);
  setSidebarRefreshTrigger(prev => prev + 1);
};

  const handleCopyMessage = (messageId, content) => {
    // Optional: Show a toast notification or add to message history
    console.log(`Copied message ${messageId}: ${content.substring(0, 50)}...`);
  };

  const handleExpandMessage = async (messageId, advisorId) => {
    const advisor = advisors[advisorId];
    if (!advisor) return;

    const originalMessage = messages.find(msg => msg.id === messageId);
    if (!originalMessage) return;

    const expandPrompt = `Please expand on your previous response: "${originalMessage.content.substring(0, 100)}..." Provide more detail and depth.`;
    
    const expandMessage = {
      id: generateMessageId(),
      type: 'user',
      content: expandPrompt,
      timestamp: new Date(),
      isExpandRequest: true,
      expandsMessageId: messageId
    };
    setMessages(prev => [...prev, expandMessage]);
    setSidebarRefreshTrigger(prev => prev + 1);

    setIsLoading(true);
    setThinkingAdvisors([advisorId]);

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/chat/${advisorId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          user_input: expandPrompt,
          response_length: 'long',
          chat_session_id: currentSessionId
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();

      if (data.persona && data.response) {
        const expandedMessage = {
          id: generateMessageId(),
          type: 'advisor',
          persona_id: advisorId,
          advisorName: advisor.name,
          content: data.response,
          isExpansion: true,
          expandsMessageId: messageId,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, expandedMessage]);
      } else {
        const errorMessage = {
          id: generateMessageId(),
          type: 'error',
          content: 'Sorry, I received an unexpected response format. Please try again.',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
      }

    } catch (error) {
      console.error('Error expanding message:', error);
      const errorMessage = {
        id: generateMessageId(),
        type: 'error',
        content: 'Sorry, I encountered an error while expanding the message. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }

    setIsLoading(false);
    setThinkingAdvisors([]);
    setSidebarRefreshTrigger(prev => prev + 1);
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

  /** Group consecutive advisor messages so we can render them in a horizontal carousel */
  const messageGroups = useMemo(() => {
    const groups = [];
    let i = 0;
    while (i < messages.length) {
      if (messages[i].type === 'advisor') {
        const advisorGroup = [];
        while (i < messages.length && messages[i].type === 'advisor') {
          advisorGroup.push(messages[i]);
          i++;
        }
        const aggregatedMessages = advisorGroup.filter(m => m.is_aggregated);
        const panelMessages = advisorGroup.filter(m => !m.is_aggregated);
        // Prefer the shared responseGroupId from non-aggregated messages;
        // aggregated messages appended to the DB can land after a later
        // exchange's advisors, so they must not pollute that group's key.
        const responseGroupId =
          advisorGroup.find(m => m.responseGroupId && !m.is_aggregated)?.responseGroupId ||
          `legacy_${advisorGroup.map(m => m.id).join('_')}`;
        groups.push({
          type: 'advisor_group',
          responseGroupId,
          messages: advisorGroup,
          panelMessages,
          aggregatedMessages,
        });
      } else {
        groups.push({ type: 'single', message: messages[i] });
        i++;
      }
    }
    return groups;
  }, [messages]);

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
  const hasConversationMessages = messages.filter(m => m.type !== 'system' && m.type !== 'document_upload').length > 0;

  const chatPlaceholder = config?.chat_page?.placeholder || 'Ask about courses, events or places';
  const firstQuestion = messages.find((m) => m.type === 'user')?.content;
  const chatTitle = firstQuestion || (hasMessages && currentSessionTitle) || 'New chat';
  const answerVisuals = latestVisuals(messages);
  const suggestions = buildSuggestions({
    visuals: answerVisuals,
    starters: config?.homepage?.starters || [],
    asked: messages.filter((m) => m.type === 'user').map((m) => m.content || ''),
  });

  return (
    <OnboardingTour>
    <div className={`chat-frame ${isMobileMenuOpen ? 'rail-open' : ''}`}>
      <CampusRail
        className="chat-rail"
        currentSessionId={currentSessionId}
        refreshTrigger={sidebarRefreshTrigger}
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

      <div className="main-chat-area">
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
                                color: 'var(--text-secondary)', fontSize: 13, padding: '8px 4px',
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

                    {thinkingAdvisors.includes('system') && (
                      <div className="orchestrator-thinking">
                        <div className="thinking-bubble">
                          <MessageCircle size={20} />
                        </div>
                        <div className="thinking-content">
                          <span className="thinking-label">Thinking…</span>
                          <div className="thinking-animation">
                            <div className="dot"></div>
                            <div className="dot"></div>
                            <div className="dot"></div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {thinkingAdvisors.filter(id => id !== 'system').map(advisorId => (
                      <ThinkingIndicator key={advisorId} advisorId={advisorId} />
                    ))}

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
                      style={{ background: DOMAIN_COLORS[suggestion.domain] || 'var(--ink-soft)' }}
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
              isLanding={chatPhase !== 'active'}
              placeholder={
                replyingTo
                  ? `Reply to ${replyingTo.advisorName}...`
                  : chatPlaceholder
              }
            />
          </div>
        </div>
      </div>

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
    </OnboardingTour>
  );
};

export default ChatPage;
