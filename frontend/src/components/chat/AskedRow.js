import React from 'react';
import { Icon } from '../icons';
import { useMenu } from '../menus/Menu';
import { useAppConfig } from '../../contexts/AppConfigContext';
import { useChat } from '../../contexts/ChatContext';
import { AdvisorMenu } from './AdvisorMenu';
import { AdvisorAvatar, advisorFor } from './PanelRow';
import '../../styles/Panel.css';

/** The advisors an answer asked: who answered it, else its panel event's advisors. */
export function askedAdvisors(message, exchangePanels = {}) {
  if (message?.source_personas?.length) return message.source_personas;
  return exchangePanels?.[message?.responseGroupId] || [];
}

/**
 * "Asked" above an answer (DESIGN.md Components): one chip per advisor the
 * answer asked, then Add, which opens the advisor menu for the next message.
 */
export default function AskedRow({ advisorIds = [] }) {
  const { config } = useAppConfig();
  const chat = useChat();
  const menu = useMenu();
  const personas = config?.personas?.items || [];
  const ids = advisorIds.filter((id, i, all) => id && all.indexOf(id) === i);
  if (!ids.length) return null;
  const advisors = ids.map((id) => advisorFor(id, personas));

  return (
    <div className="ap-asked" role="group" aria-label="Asked">
      <span className="ap-asked-label" aria-hidden="true">Asked</span>
      <ul className="ap-asked-list">
        {advisors.map((advisor) => (
          <li key={advisor.id} className={`ap-asked-chip adv-${advisor.slot}`}>
            <AdvisorAvatar advisor={advisor} size="sm" />
            <span>{advisor.name}</span>
          </li>
        ))}
      </ul>
      {chat?.chooseAdvisors && (
        <>
          <button type="button" className="ap-asked-add" {...menu.triggerProps}>
            <Icon name="add" size={18} />
            <span>Add</span>
          </button>
          <AdvisorMenu anchorEl={menu.anchorEl} onClose={menu.closeMenu} placement="bottom-start" />
        </>
      )}
    </div>
  );
}
