import React from 'react';
import { Icon } from '../icons';
import { useAppConfig } from '../../contexts/AppConfigContext';
import { useChat } from '../../contexts/ChatContext';
import { AdvisorAvatar, advisorFor } from './PanelRow';
import '../../styles/Panel.css';

/**
 * One-advisor mode (DESIGN.md Components): a banner in the advisor's tint at
 * the top of the thread, with "Back to the panel".
 */
export default function OneAdvisorBanner() {
  const chat = useChat();
  const { config } = useAppConfig();
  if (!chat?.oneAdvisor) return null;
  const advisor = advisorFor(chat.oneAdvisor.id, config?.personas?.items || [], chat.oneAdvisor.name);

  return (
    <div className={`ap-banner adv-${advisor.slot}`} role="region" aria-label={advisor.name}>
      <AdvisorAvatar advisor={advisor} />
      <b className="ap-banner-name">{advisor.name}</b>
      <button type="button" className="cc-btn ap-banner-back" onClick={chat.backToPanel}>
        <Icon name="arrow_back" size={18} />
        <span>Back to the panel</span>
      </button>
    </div>
  );
}
