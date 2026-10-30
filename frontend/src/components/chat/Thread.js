import React, { useEffect, useMemo, useRef } from 'react';
import { FileText, MessageCircle, Sparkles } from '../icons';
import Answer from './Answer';
import ChatThinking from './ChatThinking';
import { useChat } from '../../contexts/ChatContext';
import groupMessages from '../../utils/messageGroups';
import { useOpenCourse } from '../../utils/openCourse';

/**
 * The conversation, as the chat page (`variant="page"`) and the dock
 * (`variant="dock"`) show it. It reads the one chat through `useChat()` and
 * renders every message kind: the question, the answer (text, cards,
 * Checked chips, action row), clarifications, errors and notices. Courses
 * open the pop-up through `?course=`; follow-up questions are sent to the chat.
 */
const VARIANTS = {
  page: { scroll: { behavior: 'smooth' }, showSynthesis: true },
  dock: { scroll: { block: 'end' }, showSynthesis: false },
};

const SynthesisNote = () => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 8,
    color: 'var(--muted)', fontSize: 13, padding: '8px 4px',
  }}>
    <Sparkles size={16} />
    <span>Combining advisor responses into one answer…</span>
  </div>
);

function Clarification({ message, onAsk }) {
  const suggestions = message.suggestions || [];
  return (
    <div className="clarification-message-container">
      <div className="clarification-message">
        <div className="clarification-header">
          <MessageCircle size={16} />
          <span>I need a bit more information</span>
        </div>
        <p>{message.content}</p>
        {suggestions.length > 0 && (
          <div className="clarification-suggestions">
            <p className="suggestions-label">Here are some ways you could be more specific:</p>
            <div className="suggestions-list">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  className="suggestion-button"
                  onClick={() => onAsk(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** A user, error, notice, upload or clarification message. */
function SingleMessage({ message, onAsk }) {
  switch (message.type) {
    case 'user':
      return (
        <div className="user-message-container">
          <div className="user-message"><p>{message.content}</p></div>
        </div>
      );
    case 'error':
      return (
        <div className="error-message-container">
          <div className="error-message"><p>{message.content}</p></div>
        </div>
      );
    case 'system':
      return (
        <div className="system-message-container">
          <div className="system-message"><p>{message.content}</p></div>
        </div>
      );
    case 'document_upload':
      return (
        <div className="system-message-container">
          <div className="system-message document-upload">
            <FileText size={16} />
            <p>{message.content}</p>
          </div>
        </div>
      );
    case 'clarification':
      return <Clarification message={message} onAsk={onAsk} />;
    default:
      return null;
  }
}

/** The answers of one exchange to show: the combined one when there is one. */
function shownAnswers(group, groupViews) {
  const hasAggregated = group.aggregatedMessages.length > 0;
  const view = groupViews?.[group.responseGroupId] || (hasAggregated ? 'aggregated' : 'panel');
  return view === 'aggregated' && hasAggregated ? group.aggregatedMessages : group.panelMessages;
}

function ThreadMessages({ variant }) {
  const {
    messages, thinkingAdvisors, groupViews, synthesizingGroups, send,
  } = useChat();
  const openCourse = useOpenCourse();
  const groups = useMemo(() => groupMessages(messages), [messages]);
  const endRef = useRef(null);
  const { scroll, showSynthesis } = VARIANTS[variant] || VARIANTS.page;

  useEffect(() => {
    endRef.current?.scrollIntoView?.(scroll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, thinkingAdvisors]);

  const ask = (text) => send(text);
  const selectCourse = (identifier) => {
    const course = (identifier || '').trim();
    if (course) openCourse(course);
  };

  return (
    <>
      {groups.map((group) => {
        if (group.type !== 'advisor_group') {
          const single = <SingleMessage message={group.message} onAsk={ask} />;
          // The page wraps each message (its column rule sizes the wrapper).
          return variant === 'page'
            ? <div key={group.message.id}>{single}</div>
            : <React.Fragment key={group.message.id}>{single}</React.Fragment>;
        }
        const shown = shownAnswers(group, groupViews);
        const synthesizing = showSynthesis && Boolean(synthesizingGroups?.[group.responseGroupId]);
        if (!shown.length && !synthesizing) return null;
        return (
          <div key={group.responseGroupId} className="response-group">
            {synthesizing && <SynthesisNote />}
            {shown.map((message) => (
              <div key={message.id} className="single-response-wide">
                <Answer message={message} onCourseSelect={selectCourse} onAsk={ask} />
              </div>
            ))}
          </div>
        );
      })}
      <ChatThinking thinkingAdvisors={thinkingAdvisors} />
      <div ref={endRef} />
    </>
  );
}

export default function Thread({ variant = 'page' }) {
  const { messages, isLoadingSession } = useChat();

  if (variant === 'dock') {
    return (
      <div className="cc-dock-messages">
        <ThreadMessages variant="dock" />
      </div>
    );
  }

  if (!messages.length) return null;
  return (
    <div className="messages-container">
      {isLoadingSession && (
        <div className="loading-session">
          <div className="loading-spinner"></div>
          <span>Loading chat session...</span>
        </div>
      )}
      <div className="messages-list">
        <div className="messages-scroll">
          <ThreadMessages variant="page" />
        </div>
      </div>
    </div>
  );
}
