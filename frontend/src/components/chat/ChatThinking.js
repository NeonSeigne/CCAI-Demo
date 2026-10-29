import React from 'react';
import { MessageCircle } from '../icons';

/** "Thinking…" while the answer streams. */
export default function ChatThinking({ thinkingAdvisors = [] }) {
  if (thinkingAdvisors.length === 0) return null;
  return (
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
  );
}
