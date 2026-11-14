import React, { useId } from 'react';
import { useAppConfig } from '../../contexts/AppConfigContext';
import { AdvisorAvatar, advisorFor } from './PanelRow';
import '../../styles/Panel.css';

/**
 * Where the panel's advisors disagree (DESIGN.md Components, "Where they
 * differ"): each topic with every advisor's stance. Nothing when they agree.
 */
export default function Differences({ differences, panel = [] }) {
  const { config } = useAppConfig();
  const titleId = useId();
  const personas = config?.personas?.items || [];
  const topics = (Array.isArray(differences) ? differences : [])
    .filter((d) => d?.topic && Array.isArray(d.positions) && d.positions.length);
  if (!topics.length) return null;
  const replyName = (id) => panel.find((m) => m?.persona_id === id)?.advisorName;

  return (
    <section className="ap-diff" aria-labelledby={titleId}>
      <h3 id={titleId} className="ap-diff-title">Where they differ</h3>
      {topics.map((difference) => (
        <div key={difference.topic} className="ap-diff-topic">
          <h4 className="ap-diff-topic-name">{difference.topic}</h4>
          <ul className="ap-diff-positions">
            {difference.positions.map((position) => {
              const advisor = advisorFor(position.persona_id, personas, replyName(position.persona_id));
              return (
                <li key={position.persona_id} className={`ap-diff-position adv-${advisor.slot}`}>
                  <AdvisorAvatar advisor={advisor} size="sm" />
                  <p><b>{advisor.name}</b> {position.stance}</p>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
