import React, { createContext, useContext, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { parseServerTime } from '../utils/serverTime';

/**
 * The one conversation, mounted above the routes so it outlives any page
 * (eng R1): messages, the current session, the stream and its thinking state.
 * ChatPage (and later the chat dock) are views of it through `useChat()`.
 *
 * Attachments are composer chips that become text lines on send (R9);
 * `activeTerm` is sent as `active_term` when a semester view sets it (O1).
 * View-only state (composer text, landing phase, reply target) stays in the
 * view; `sessionEpoch` changes whenever newChat / openSession replace the
 * conversation, so a view knows to reset it.
 */
export const ChatContext = createContext(null);

// Campus Companion answers as one voice: advisor replies are always combined.
const responseMode = 'aggregated';

const generateMessageId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);

const sameItem = (a, b) => a.type === b.type && String(a.id) === String(b.id);

/** The chip's text: "ECON 3720 Intermediate Macroeconomics", "Jazz night · Oct 30". */
export function attachmentLabel(item) {
  if (item.type === 'course') return [item.id, item.title].filter(Boolean).join(' ');
  if (item.type === 'event') return [item.title, item.extra?.date].filter(Boolean).join(' · ');
  return item.title || String(item.id);
}

/** The line a chip adds before the message: "Course: ECON 3720 Intermediate Macroeconomics". */
export function attachmentLine(item) {
  const prefix = { course: 'Course', event: 'Event', place: 'Place' }[item.type] || 'Item';
  return `${prefix}: ${attachmentLabel(item)}`;
}

export function ChatProvider({ children }) {
  const { authToken } = useAuth();
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingAdvisors, setThinkingAdvisors] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [sessionTitle, setSessionTitle] = useState('');
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [sessionsVersion, setSessionsVersion] = useState(0);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const [uploadedDocuments, setUploadedDocuments] = useState([]);
  // Per-exchange view: { [responseGroupId]: 'panel' | 'aggregated' }.
  const [groupViews, setGroupViews] = useState({});
  // Group ids currently running a synthesis pass (for lag UX).
  const [synthesizingGroups, setSynthesizingGroups] = useState({});
  const [attachments, setAttachments] = useState([]);
  const [activeTerm, setActiveTerm] = useState(null);
  // The latest attachments for send, which may run from a stale closure.
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  const bumpSessions = () => setSessionsVersion((prev) => prev + 1);

  const appendMessage = (message) => {
    setMessages((prev) => [...prev, { id: generateMessageId(), timestamp: new Date(), ...message }]);
  };

  const createSession = async (firstMessage = null) => {
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
        setSessionId(newSession.id);
        setSessionTitle(newSession.title);
        return newSession.id;
      }
      console.error('Failed to create new session');
      return null;
    } catch (error) {
      console.error('Error creating new session:', error);
      return null;
    }
  };

  const updateSessionTitle = async (id, newTitle) => {
    if (!id || !authToken) return;
    try {
      await fetch(`${process.env.REACT_APP_API_URL}/api/chat-sessions/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: newTitle })
      });
      setSessionTitle(newTitle);
    } catch (error) {
      console.error('Error updating session title:', error);
    }
  };

  // Load a saved session; /switch-chat also syncs the server-side context.
  const openSession = async (id) => {
    if (!id || isLoadingSession) return;
    setIsLoadingSession(true);
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/switch-chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ chat_session_id: id })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.status === 'success') {
          setSessionId(id);
          setSessionTitle('');
          setMessages(result.context.messages.map((msg) => ({
            ...msg,
            timestamp: parseServerTime(msg.timestamp),
            persona_id: msg.persona_id || msg.advisor || msg.advisorId,
            responseGroupId: msg.response_group_id || null,
          })));
          setThinkingAdvisors([]);
          setSessionEpoch((prev) => prev + 1);

          const sessionResponse = await fetch(`${process.env.REACT_APP_API_URL}/api/chat-sessions/${id}`, {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            }
          });
          if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json();
            setSessionTitle(sessionData.title);
          }
        }
      }
    } catch (error) {
      console.error('Error loading session:', error);
    } finally {
      setIsLoadingSession(false);
    }
  };

  const resetConversation = (id, title) => {
    setMessages([]);
    setSessionId(id);
    setSessionTitle(title);
    setThinkingAdvisors([]);
    setUploadedDocuments([]);
    setSessionEpoch((prev) => prev + 1);
  };

  // A fresh conversation: reset the memory session, then create a saved one.
  // Throws after a local reset when either step fails.
  const newChat = async () => {
    try {
      const title = `Chat ${new Date().toLocaleDateString()}`;
      const response = await fetch(`${process.env.REACT_APP_API_URL}/new-chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title })
      });
      if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

      const result = await response.json();
      if (result.status !== 'success') throw new Error('Failed to create memory session');

      const newSessionId = await createSession(title);
      if (!newSessionId) throw new Error('Failed to create MongoDB session');

      resetConversation(newSessionId, title);
      // Wait a bit to ensure state has updated
      await new Promise((resolve) => setTimeout(resolve, 100));
      return newSessionId;
    } catch (error) {
      console.error('Error creating new chat:', error);
      resetConversation(null, '');
      throw error;
    }
  };

  const streamChat = async (userInput, id, activeAdvisorIds = null) => {
    const body = {
      user_input: userInput,
      response_length: 'medium',
      chat_session_id: id || sessionId,
      response_mode: responseMode,
      active_advisors: activeAdvisorIds,
    };
    if (activeTerm) body.active_term = activeTerm;
    const response = await fetch(`${process.env.REACT_APP_API_URL}/chat-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return response;
  };

  // Send a message (with any attached chips as leading lines) and stream the
  // reply. `fresh` drops the current conversation first; sending then creates
  // a session titled after the question.
  const send = async (text, activeAdvisorIds = null, { fresh = false } = {}) => {
    if (!text.trim()) return;

    const attached = attachmentsRef.current;
    const inputMessage = attached.length
      ? [...attached.map(attachmentLine), text].join('\n')
      : text;
    if (attached.length) setAttachments([]);

    const userMessage = {
      id: generateMessageId(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };
    if (fresh) {
      setMessages([userMessage]);
      setSessionId(null);
      setSessionTitle('');
      setThinkingAdvisors([]);
      setUploadedDocuments([]);
    } else {
      setMessages((prev) => [...prev, userMessage]);
    }

    let id = fresh ? null : sessionId;
    if (!id) {
      id = await createSession(text);
      if (!id) {
        console.error('Failed to create session');
        return;
      }
    }

    // Retitle a generic "Chat <date>" session after its first message.
    if (!fresh && messages.length === 0 && sessionTitle.includes('Chat ')) {
      await updateSessionTitle(id, text.length > 30 ? `${text.substring(0, 30)}...` : text);
    }

    setIsLoading(true);
    setThinkingAdvisors(['system']);

    const aggregatedMode = responseMode === 'aggregated';
    const responseGroupId = 'grp_' + generateMessageId();
    // Always collect this exchange's advisor responses so the panel is stored
    // even when aggregated mode is the default — the user can toggle to it.
    const collectedAdvisorResponses = [];

    try {
      const response = await streamChat(inputMessage, id, activeAdvisorIds);

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
            bumpSessions();
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
              setThinkingAdvisors((prev) => prev.filter((a) => a !== d.persona_id));
              if (!aggregatedMode || msg.is_aggregated) {
                setMessages((prev) => [...prev, msg]);
              }
              break;
            }
            case 'clarification':
              setMessages((prev) => [...prev, {
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
                setSynthesizingGroups((prev) => ({ ...prev, [responseGroupId]: true }));
              }
              if (d.persona_id != null) {
                setThinkingAdvisors((prev) => prev.filter((a) => a !== d.persona_id));
              }
              break;
            case 'error':
              setMessages((prev) => [...prev, {
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

      const hasAggregated = collectedAdvisorResponses.some((m) => m.is_aggregated);
      if (aggregatedMode) {
        const deferred = collectedAdvisorResponses.filter((m) => !m.is_aggregated);
        if (deferred.length > 0) {
          setMessages((prev) => [...prev, ...deferred]);
        }
      }
      setGroupViews((prev) => ({ ...prev, [responseGroupId]: hasAggregated ? 'aggregated' : 'panel' }));
      setSynthesizingGroups((prev) => { const n = { ...prev }; delete n[responseGroupId]; return n; });

    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => [...prev, {
        id: generateMessageId(),
        type: 'error',
        content: `Failed to send message: ${error.message}`,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
      setThinkingAdvisors([]);
      bumpSessions();
    }
  };

  // replyContext: { advisorId, advisorName, messageId, persona_id }.
  const replyToAdvisor = async (inputMessage, replyContext) => {
    let id = sessionId;
    if (!id) {
      id = await createSession(inputMessage);
      if (!id) {
        console.error('Failed to create session for reply');
        return;
      }
    }

    setMessages((prev) => [...prev, {
      id: generateMessageId(),
      type: 'user',
      content: inputMessage,
      replyTo: {
        advisorId: replyContext.persona_id,
        advisorName: replyContext.advisorName,
        messageId: replyContext.messageId
      },
      timestamp: new Date()
    }]);
    bumpSessions();

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
          chat_session_id: id
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      if (data.type === 'advisor_reply') {
        setMessages((prev) => [...prev, {
          id: generateMessageId(),
          type: 'advisor',
          persona_id: data.persona_id,
          advisorName: data.persona,
          content: data.response,
          isReply: true,
          timestamp: new Date()
        }]);
      }
    } catch (error) {
      console.error('Error replying to advisor:', error);
      appendMessage({ type: 'error', content: 'Sorry, I encountered an error with your reply. Please try again.' });
    }

    setIsLoading(false);
    setThinkingAdvisors([]);
    bumpSessions();
  };

  // Ask one advisor to expand an earlier answer.
  const expand = async (messageId, advisorId, advisorName) => {
    const originalMessage = messages.find((msg) => msg.id === messageId);
    if (!originalMessage) return;

    const expandPrompt = `Please expand on your previous response: "${originalMessage.content.substring(0, 100)}..." Provide more detail and depth.`;
    setMessages((prev) => [...prev, {
      id: generateMessageId(),
      type: 'user',
      content: expandPrompt,
      timestamp: new Date(),
      isExpandRequest: true,
      expandsMessageId: messageId
    }]);
    bumpSessions();

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
          chat_session_id: sessionId
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      if (data.persona && data.response) {
        setMessages((prev) => [...prev, {
          id: generateMessageId(),
          type: 'advisor',
          persona_id: advisorId,
          advisorName,
          content: data.response,
          isExpansion: true,
          expandsMessageId: messageId,
          timestamp: new Date()
        }]);
      } else {
        appendMessage({ type: 'error', content: 'Sorry, I received an unexpected response format. Please try again.' });
      }
    } catch (error) {
      console.error('Error expanding message:', error);
      appendMessage({ type: 'error', content: 'Sorry, I encountered an error while expanding the message. Please try again.' });
    }

    setIsLoading(false);
    setThinkingAdvisors([]);
    bumpSessions();
  };

  const addDocument = (file, uploadResult) => {
    appendMessage({
      type: 'document_upload',
      content: `Document uploaded: ${uploadResult.filename || file.name} (${uploadResult.chunks_created || 0} sections processed)`,
    });
    setUploadedDocuments((prev) => [...prev, file]);
  };

  // item: { type: 'course' | 'event' | 'place', id, title, extra? }. Never sends.
  const attach = (item) => {
    setAttachments((prev) => (prev.some((a) => sameItem(a, item)) ? prev : [...prev, item]));
  };

  const removeAttachment = (item) => {
    setAttachments((prev) => prev.filter((a) => !sameItem(a, item)));
  };

  const value = {
    messages,
    isLoading,
    thinkingAdvisors,
    sessionId,
    sessionTitle,
    isLoadingSession,
    sessionsVersion,
    sessionEpoch,
    uploadedDocuments,
    groupViews,
    synthesizingGroups,
    send,
    newChat,
    openSession,
    replyToAdvisor,
    expand,
    appendMessage,
    addDocument,
    attachments,
    attach,
    removeAttachment,
    activeTerm,
    setActiveTerm,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  return useContext(ChatContext);
}

export default ChatContext;
