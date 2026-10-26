import React from 'react';
import { useAppConfig } from '../contexts/AppConfigContext';

const ThinkingIndicator = ({ advisorId }) => {
  const { advisors, getAdvisorColors } = useAppConfig();
  const advisor = advisors[advisorId];
  const colors = getAdvisorColors(advisorId);

  if (!advisor) return null;

  const Icon = advisor.icon;

  return (
    <div className="thinking-container">
      <div
        className="advisor-avatar"
        style={{ backgroundColor: 'var(--paper-sunken)' }}
      >
        {Icon ? <Icon style={{ color: 'var(--ink)' }} /> : null}
      </div>
      <div
        className="thinking-bubble surface-card"
        style={{
          backgroundColor: 'var(--paper)',
          borderColor: 'var(--line)',
        }}
      >
        <div className="thinking-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            className="accent-dot"
            style={{ backgroundColor: colors.dotColor || colors.color }}
          />
          <h4 className="advisor-name" style={{ color: 'var(--ink)' }}>
            {advisor.name}
          </h4>
        </div>
        <div className="thinking-dots">
          <div className="thinking-dot" style={{ backgroundColor: 'var(--ink-soft)', animationDelay: '0ms' }} />
          <div className="thinking-dot" style={{ backgroundColor: 'var(--ink-soft)', animationDelay: '150ms' }} />
          <div className="thinking-dot" style={{ backgroundColor: 'var(--ink-soft)', animationDelay: '300ms' }} />
        </div>
        <p className="thinking-text" style={{ color: 'var(--ink-soft)' }}>
          thinking...
        </p>
      </div>
    </div>
  );
};

export default ThinkingIndicator;
