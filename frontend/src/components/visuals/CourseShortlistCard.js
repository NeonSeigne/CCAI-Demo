import React, { useState } from 'react';
import { usePlanner } from '../../contexts/PlannerContext';
import { plannerError } from '../../api/planner';
import { creditSpan, statusWord } from '../planner/planFormat';
import ProposalCard from './ProposalCard';
import '../../styles/PlanCards.css';

/**
 * Chat card for a `course_shortlist` visual (design 19A).
 *
 * visual: {type: 'course_shortlist', items: [{id, title, why, labels, prereqs, credits}], reason?}
 *
 * Up to five rows, "Show more" for the next five. Choose creates the single
 * pending proposal (an `add` op) through the shared planner, and the new
 * proposal's card appears under the list.
 */

const PAGE = 5;
const EXAMPLES = [
  'Suggest an economics elective',
  'Something with climate, no mornings',
  'A lighter course that counts toward my major',
];

const PREREQ_TEXT = {
  met: 'Prerequisites met',
  short: 'Prerequisites not met yet',
  unknown: 'Prerequisites unknown',
};

export default function CourseShortlistCard({ visual, onAsk, onSelectCourse }) {
  const planner = usePlanner();
  const items = Array.isArray(visual?.items) ? visual.items : [];
  const [shown, setShown] = useState(PAGE);
  const [choosing, setChoosing] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [error, setError] = useState(null);

  if (!items.length) {
    return (
      <div className="proposal-card shortlist-card">
        <p className="pc-label">Suggested courses</p>
        <p className="pc-line">{visual?.reason || 'No courses matched; try other words'}</p>
        {onAsk && (
          <div className="pp-chips">
            {EXAMPLES.map((text) => (
              <button key={text} type="button" className="pp-chip" onClick={() => onAsk(text)}>{text}</button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const choose = async (item) => {
    setChoosing(item.id);
    setError(null);
    try {
      setChosen(await planner.propose([{ op: 'add', course: item.id }]));
    } catch (err) {
      const info = plannerError(err);
      setError({ id: item.id, text: info.message || "Couldn't add that course. Try again." });
    } finally {
      setChoosing(null);
    }
  };

  return (
    <div className="proposal-card shortlist-card">
      <p className="pc-label">Suggested courses</p>
      {visual?.reason && <p className="pc-lead">{visual.reason}</p>}
      <ul className="pc-rows">
        {items.slice(0, shown).map((item) => {
          const credits = creditSpan(item.credits);
          const prereq = item.prereqs?.status || 'unknown';
          const chips = (item.labels || []).filter((label) => !/^Prerequisites/i.test(label));
          return (
            <li key={item.id} className="sl-row">
              <div className="sl-row-main">
                <span className="sl-name">
                  {onSelectCourse ? (
                    <button type="button" className="pp-link" onClick={() => onSelectCourse(item.id)}>{item.id}</button>
                  ) : item.id}
                  {item.title && <span className="sl-title"> {item.title}</span>}
                  {credits && <span className="pp-muted"> · {credits} cr</span>}
                </span>
                {item.why && <p className="sl-why">{item.why}</p>}
                {chips.length > 0 && (
                  <div className="sl-chips">
                    {chips.map((label) => <span key={label} className="sl-chip">{label}</span>)}
                  </div>
                )}
                <span className={`sl-prereq ${prereq === 'short' ? 'is-short' : ''}`.trim()}>
                  {PREREQ_TEXT[prereq] || statusWord(prereq)}
                  {item.prereqs?.reason ? ` · ${item.prereqs.reason}` : ''}
                </span>
                {error?.id === item.id && <p className="pc-refused" role="alert">{error.text}</p>}
              </div>
              {planner && (
                <div className="sl-row-action">
                  <button
                    type="button"
                    className="pp-btn"
                    disabled={!!choosing}
                    aria-label={`Choose ${item.id}`}
                    onClick={() => choose(item)}
                  >
                    {choosing === item.id ? 'Checking…' : 'Choose'}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {items.length > shown && (
        <button type="button" className="pp-link" onClick={() => setShown(shown + PAGE)}>Show more</button>
      )}
      {chosen && (
        <div className="sl-chosen">
          <ProposalCard visual={{ type: 'proposed_change', proposal: chosen }} />
        </div>
      )}
    </div>
  );
}
