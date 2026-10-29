import React, { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText } from '../icons';
import MessageBubble from '../MessageBubble';
import ChatThinking from './ChatThinking';
import { useChat } from '../../contexts/ChatContext';
import groupMessages from '../../utils/messageGroups';

/**
 * The dock's view of the one conversation: the same message components the
 * chat page uses, so answer cards (proposal cards included) look the same.
 */
export default function DockConversation() {
  const navigate = useNavigate();
  const {
    messages, thinkingAdvisors, groupViews, send,
  } = useChat();
  const groups = useMemo(() => groupMessages(messages), [messages]);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, thinkingAdvisors]);

  const openCourse = (identifier) => {
    const course = (identifier || '').trim();
    if (course) navigate(`/courses/${encodeURIComponent(course)}`);
  };

  return (
    <div className="cc-dock-messages">
      {groups.map((group) => {
        if (group.type === 'advisor_group') {
          const hasAggregated = group.aggregatedMessages.length > 0;
          const view = groupViews?.[group.responseGroupId] || (hasAggregated ? 'aggregated' : 'panel');
          const shown = view === 'aggregated' && hasAggregated ? group.aggregatedMessages : group.panelMessages;
          if (!shown.length) return null;
          return (
            <div key={group.responseGroupId} className="response-group">
              {shown.map((message) => (
                <div key={message.id} className="single-response-wide">
                  <MessageBubble message={message} onCourseSelect={openCourse} onAsk={(text) => send(text)} />
                </div>
              ))}
            </div>
          );
        }
        const { message } = group;
        if (message.type === 'user') {
          return (
            <div key={message.id} className="user-message-container">
              <div className="user-message"><p>{message.content}</p></div>
            </div>
          );
        }
        if (message.type === 'error') {
          return (
            <div key={message.id} className="error-message-container">
              <div className="error-message"><p>{message.content}</p></div>
            </div>
          );
        }
        if (message.type === 'document_upload') {
          return (
            <div key={message.id} className="system-message-container">
              <div className="system-message document-upload">
                <FileText size={16} />
                <p>{message.content}</p>
              </div>
            </div>
          );
        }
        return (
          <div key={message.id} className="system-message-container">
            <div className="system-message"><p>{message.content}</p></div>
          </div>
        );
      })}
      <ChatThinking thinkingAdvisors={thinkingAdvisors} />
      <div ref={endRef} />
    </div>
  );
}
