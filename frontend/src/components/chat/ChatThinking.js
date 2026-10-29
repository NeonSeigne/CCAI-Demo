import React from 'react';
import { MessageCircle } from 'lucide-react';
import ThinkingIndicator from '../ThinkingIndicator';

/** "Thinking…" while the answer streams, plus one indicator per advisor still working. */
export default function ChatThinking({ thinkingAdvisors = [] }) {
  return (
    <>
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

      {thinkingAdvisors.filter((id) => id !== 'system').map((advisorId) => (
        <ThinkingIndicator key={advisorId} advisorId={advisorId} />
      ))}
    </>
  );
}
