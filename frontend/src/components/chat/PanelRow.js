import React, { useId, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Icon, LEGACY } from '../icons';
import { useAppConfig } from '../../contexts/AppConfigContext';
import '../../styles/Panel.css';

// Advisor colours (DESIGN.md Components): the course palette in this order,
// then two advisor-only colours, so no advisor wears the school's own colour.
const SLOTS = [1, 2, 3, 6, 5, 4, 7, 8];

// /api/config sends `image: "icon://BookOpen"` (or an avatar URL, shown as
// the default icon for now).
const iconFor = (persona) => {
  const match = /^icon:\/\/(.+)$/.exec(persona?.image || '');
  return (match && LEGACY[match[1]]) || 'person';
};

/** One advisor's name, icon and colour slot from /api/config. */
export function advisorFor(id, personas = [], fallbackName = '') {
  const index = personas.findIndex((p) => p.id === id);
  const persona = personas[index] || {};
  return {
    id,
    name: persona.name || fallbackName || id,
    icon: iconFor(persona),
    slot: SLOTS[(index < 0 ? 0 : index) % SLOTS.length],
  };
}

/** The advisors behind an answer, in the order the answer names them. */
export function panelAdvisors(message, panel = [], personas = []) {
  const replies = panel.filter((m) => m?.persona_id && m.content);
  const ids = (message?.source_personas?.length ? message.source_personas : replies.map((m) => m.persona_id))
    .filter((id, i, all) => all.indexOf(id) === i);
  return ids.map((id) => {
    const reply = replies.find((m) => m.persona_id === id);
    if (!reply) return null;
    return { ...advisorFor(id, personas, reply.advisorName), content: reply.content };
  }).filter(Boolean);
}

export function AdvisorAvatar({ advisor, size = 'md' }) {
  return (
    <span className={`ap-avatar is-${size} adv-${advisor.slot}`} aria-hidden="true">
      <Icon name={advisor.icon} size={size === 'sm' ? 16 : 18} />
    </span>
  );
}

/**
 * Who answered (DESIGN.md Components, "Panel"): one button per advisor under
 * the merged answer. Tapping one shows that advisor's own reply; none is open
 * at first.
 */
export default function PanelRow({ message, panel }) {
  const { config } = useAppConfig();
  const [open, setOpen] = useState(null);
  const takeId = useId();
  const advisors = panelAdvisors(message, panel, config?.personas?.items || []);
  if (!advisors.length) return null;
  const current = advisors.find((a) => a.id === open);

  return (
    <section className="ap-panel" aria-label="The panel">
      <div className="ap-tabs">
        {advisors.map((advisor) => (
          <button
            key={advisor.id}
            type="button"
            className={`ap-tab adv-${advisor.slot}`}
            aria-pressed={open === advisor.id}
            aria-controls={open === advisor.id ? takeId : undefined}
            onClick={() => setOpen(open === advisor.id ? null : advisor.id)}
          >
            <AdvisorAvatar advisor={advisor} />
            <span>{advisor.name}</span>
          </button>
        ))}
      </div>
      {current && (
        <article id={takeId} className={`ap-take adv-${current.slot}`} aria-label={current.name}>
          <header className="ap-take-head">
            <AdvisorAvatar advisor={current} size="sm" />
            <b>{current.name}</b>
          </header>
          <div className="ap-take-text">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.content}</ReactMarkdown>
          </div>
        </article>
      )}
    </section>
  );
}
