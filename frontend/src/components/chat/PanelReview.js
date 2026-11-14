import React, { useId } from 'react';
import { Icon } from '../icons';
import { useAuth } from '../../contexts/AuthContext';
import { useAppConfig } from '../../contexts/AppConfigContext';
import { AdvisorAvatar, advisorFor } from './PanelRow';
import '../../styles/Panel.css';

const VERDICTS = {
  fine: { label: 'Fine', icon: 'check' },
  concern: { label: 'Concern', icon: 'warning' },
};

/** The rows worth showing: a known verdict and a line. */
export const reviewRows = (review) => (Array.isArray(review) ? review : [])
  .filter((row) => row?.persona_id && VERDICTS[row.verdict] && typeof row.line === 'string' && row.line.trim());

function Rows({ rows }) {
  const { user } = useAuth();
  const { config } = useAppConfig();
  const titleId = useId();
  if (user?.show_panel === false) return null;
  const personas = config?.personas?.items || [];

  return (
    <section className="ap-review" aria-labelledby={titleId}>
      <h4 id={titleId} className="ap-review-title">Panel review</h4>
      <ul className="ap-review-rows">
        {rows.map((row) => {
          const advisor = advisorFor(row.persona_id, personas);
          const verdict = VERDICTS[row.verdict];
          return (
            <li key={row.persona_id} className={`ap-review-row adv-${advisor.slot}`}>
              <AdvisorAvatar advisor={advisor} size="sm" />
              <p className="ap-review-line"><b>{advisor.name}</b> {row.line}</p>
              <span className={`ap-verdict is-${row.verdict}`}>
                <Icon name={verdict.icon} size={16} />
                {verdict.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The panel's review of a proposed change (DESIGN.md Components, "Panel
 * review"): one row per advisor with a Fine or Concern chip. Nothing when
 * the review is empty or failed, or when the student turned the panel off.
 */
export default function PanelReview({ review }) {
  const rows = reviewRows(review);
  if (!rows.length) return null;
  return <Rows rows={rows} />;
}
