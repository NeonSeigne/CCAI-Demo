import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { usePlanner } from './PlannerContext';
import { parseServerTime } from '../utils/serverTime';
import {
  deleteChat, renameChat, setAnswerFeedback, setChatPinned,
} from '../api/chatSessions';

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
 *
 * Replacing the conversation (new chat, opening a session, a fresh send,
 * signing out) aborts the stream, and calls still in flight for the old
 * conversation drop their results instead of writing into the new one.
 * Proposals from a live stream are handed to the planner here, so one that
 * arrives while the student is on another page still reaches it.
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

const proposalOf = (visual) => visual.proposal || visual;

/** The server's longest chat title. */
export const TITLE_MAX = 200;

/** A chat titled after its question: the whole question, as the server stores it. */
export function titleFor(text) {
  return (text || '').trim().replace(/\s+/g, ' ').slice(0, TITLE_MAX);
}

export function ChatProvider({ children }) {
  const { authToken } = useAuth();
  const planner = usePlanner();
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
  // Latest values for calls that may run from a stale closure.
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const activeTermRef = useRef(activeTerm);
  activeTermRef.current = activeTerm;
  const plannerRef = useRef(planner);
  plannerRef.current = planner;
  // Which conversation a call belongs to; bumped whenever it is replaced.
  const conversationRef = useRef(0);
  // Open /chat-stream requests, aborted when the conversation is replaced.
  const streamsRef = useRef(new Set());
  // The latest send; only it clears the loading state.
  const latestSendRef = useRef(0);
  const handedProposalsRef = useRef(new Set());
  // The last proposal a live stream handed to the planner, for views to open on.
  const [liveProposalId, setLiveProposalId] = useState(null);

  const bumpSessions = () => setSessionsVersion((prev) => prev + 1);

  // Start a new conversation: stop the stream and orphan calls in flight.
  const replaceConversation = () => {
    conversationRef.current += 1;
    streamsRef.current.forEach((controller) => controller.abort());
    streamsRef.current.clear();
    setIsLoading(false);
    setThinkingAdvisors([]);
    setSynthesizingGroups({});
  };

  const appendMessage = (message) => {
    setMessages((prev) => [...prev, { id: generateMessageId(), timestamp: new Date(), ...message }]);
  };

  // Hand each new proposal from a live stream to the planner, once.
  const handOffProposals = (visuals) => {
    (visuals || []).forEach((visual) => {
      if (visual?.type !== 'proposed_change') return;
      const proposal = proposalOf(visual);
      if (!proposal?.id || handedProposalsRef.current.has(proposal.id)) return;
      handedProposalsRef.current.add(proposal.id);
      plannerRef.current?.receiveProposal(proposal);
      setLiveProposalId(proposal.id);
    });
  };

  const createSession = async (firstMessage = null, isLive = () => true) => {
    try {
      const title = firstMessage
        ? titleFor(firstMessage)
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
        if (isLive()) {
          setSessionId(newSession.id);
          setSessionTitle(newSession.title);
        }
        return newSession.id;
      }
      console.error('Failed to create new session');
      return null;
    } catch (error) {
      console.error('Error creating new session:', error);
      return null;
    }
  };

  const updateSessionTitle = async (id, newTitle, isLive) => {
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
      if (isLive()) setSessionTitle(newTitle);
    } catch (error) {
      console.error('Error updating session title:', error);
    }
  };

  // Load a saved session; /switch-chat also syncs the server-side context.
  const openSession = async (id) => {
    if (!id || isLoadingSession) return;
    const started = conversationRef.current;
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

      if (response.ok && conversationRef.current === started) {
        const result = await response.json();
        if (result.status === 'success' && conversationRef.current === started) {
          replaceConversation();
          const conversation = conversationRef.current;
          setSessionId(id);
          setSessionTitle('');
          setMessages(result.context.messages.map((msg) => ({
            ...msg,
            timestamp: parseServerTime(msg.timestamp),
            persona_id: msg.persona_id || msg.advisor || msg.advisorId,
            responseGroupId: msg.response_group_id || null,
          })));
          setSessionEpoch((prev) => prev + 1);

          const sessionResponse = await fetch(`${process.env.REACT_APP_API_URL}/api/chat-sessions/${id}`, {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            }
          });
          if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json();
            if (conversationRef.current === conversation) setSessionTitle(sessionData.title);
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
    replaceConversation();
    setMessages([]);
    setSessionId(id);
    setSessionTitle(title);
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

  // Signing out or in as someone else: nothing of the old conversation stays.
  const previousTokenRef = useRef(authToken);
  useEffect(() => {
    if (previousTokenRef.current === authToken) return;
    previousTokenRef.current = authToken;
    resetConversation(null, '');
    setAttachments([]);
    setActiveTerm(null);
    setGroupViews({});
    handedProposalsRef.current = new Set();
    setLiveProposalId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  useEffect(() => () => streamsRef.current.forEach((controller) => controller.abort()), []);

  const streamChat = async (userInput, id, activeAdvisorIds, signal) => {
    const body = {
      user_input: userInput,
      response_length: 'medium',
      chat_session_id: id || sessionId,
      response_mode: responseMode,
      active_advisors: activeAdvisorIds,
    };
    if (activeTermRef.current) body.active_term = activeTermRef.current;
    const response = await fetch(`${process.env.REACT_APP_API_URL}/chat-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return response;
  };

  // Send a message (with any attached chips as leading lines) and stream the
  // reply. `fresh` drops the current conversation first; sending then creates
  // a session titled after the question. The chips clear once the stream
  // opens, so a failed send keeps them.
  const send = async (text, activeAdvisorIds = null, { fresh = false } = {}) => {
    if (!text.trim()) return;

    const attached = attachmentsRef.current;
    const inputMessage = attached.length
      ? [...attached.map(attachmentLine), text].join('\n')
      : text;

    const userMessage = {
      id: generateMessageId(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };
    if (fresh) {
      replaceConversation();
      setMessages([userMessage]);
      setSessionId(null);
      setSessionTitle('');
      setUploadedDocuments([]);
    } else {
      setMessages((prev) => [...prev, userMessage]);
    }

    const conversation = conversationRef.current;
    const isLive = () => conversationRef.current === conversation;
    const controller = new AbortController();
    streamsRef.current.add(controller);
    const sendNumber = latestSendRef.current + 1;
    latestSendRef.current = sendNumber;

    setIsLoading(true);
    setThinkingAdvisors(['system']);

    const aggregatedMode = responseMode === 'aggregated';
    const responseGroupId = 'grp_' + generateMessageId();
    // Always collect this exchange's advisor responses so the panel is stored
    // even when aggregated mode is the default — the user can toggle to it.
    const collectedAdvisorResponses = [];

    try {
      let id = fresh ? null : sessionId;
      if (!id) {
        id = await createSession(text, isLive);
        if (!id) throw new Error('Could not start a chat session');
      }
      if (!isLive()) return;

      // Retitle a generic "Chat <date>" session after its first message.
      if (!fresh && messages.length === 0 && sessionTitle.includes('Chat ')) {
        await updateSessionTitle(id, titleFor(text), isLive);
      }

      const response = await streamChat(inputMessage, id, activeAdvisorIds, controller.signal);
      if (!isLive()) return;
      if (attached.length) setAttachments((prev) => prev.filter((a) => !attached.some((b) => sameItem(a, b))));

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let refreshedForUserMessage = false;

      while (true) {
        const { done, value } = await reader.read();
        if (!isLive()) return;
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
                // The stored message's id, for answer feedback (null without a session).
                message_id: d.message_id ?? null,
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
              handOffProposals(msg.visuals);
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
      if (error?.name === 'AbortError' || !isLive()) return;
      console.error('Error sending message:', error);
      setMessages((prev) => [...prev, {
        id: generateMessageId(),
        type: 'error',
        content: `Failed to send message: ${error.message}`,
        timestamp: new Date()
      }]);
    } finally {
      streamsRef.current.delete(controller);
      if (isLive() && latestSendRef.current === sendNumber) {
        setIsLoading(false);
        setThinkingAdvisors([]);
      }
      bumpSessions();
    }
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

  // The ⋯ menu's actions on the open chat. Each throws when the server refuses.
  const renameSession = async (title) => {
    const next = titleFor(title);
    if (!sessionId || !next) return;
    await renameChat(authToken, sessionId, next);
    setSessionTitle(next);
    bumpSessions();
  };

  const pinSession = async (pinned) => {
    if (!sessionId) return;
    await setChatPinned(authToken, sessionId, pinned);
    bumpSessions();
  };

  const deleteSession = async () => {
    if (sessionId) await deleteChat(authToken, sessionId);
    resetConversation(null, '');
    bumpSessions();
  };

  /**
   * Thumbs on an answer ('up' | 'down' | null), shown at once and put back
   * when the server refuses (the error is rethrown). Loaded answers carry
   * their stored id as `id`; streamed ones as `message_id`.
   */
  const rateAnswer = async (message, feedback) => {
    const storedId = 'message_id' in message ? message.message_id : message.id;
    if (!sessionId || !storedId) throw new Error('This answer isn’t saved');
    const previous = message.feedback ?? null;
    const set = (value) => setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, feedback: value } : m)));
    set(feedback);
    try {
      await setAnswerFeedback(authToken, sessionId, storedId, feedback);
    } catch (error) {
      set(previous);
      throw error;
    }
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
    liveProposalId,
    send,
    newChat,
    openSession,
    appendMessage,
    addDocument,
    attachments,
    attach,
    removeAttachment,
    renameSession,
    pinSession,
    deleteSession,
    rateAnswer,
    activeTerm,
    setActiveTerm,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  return useContext(ChatContext);
}

export default ChatContext;
