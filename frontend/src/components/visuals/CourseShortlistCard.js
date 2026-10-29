import React, { useState } from 'react';
import { usePlanner } from '../../contexts/PlannerContext';
import { plannerError } from '../../api/planner';
import { creditSpan, statusWord } from '../planner/planFormat';
import ProposalCard from './ProposalCard';
import { Icon } from '../icons';
import '../../styles/CourseVisuals.css';

/**
 * Chat card for a `course_shortlist` visual (design 19A).
 *
 * visual: {type: 'course_shortlist', items: [{id, title, why, labels, prereqs, credits}], reason?, term?}
 *
 * Up to five rows, "Show more" for the next five. Choose creates the single
 * pending proposal (an `add` op, into `term` when the visual names one)
 * through the shared planner, and the new proposal's card appears under the
 * list.
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

function Head() {
  return (
    <div className="vc-head">
      <Icon name="playlist_add" size={20} />
      <h3>Suggested courses</h3>
    </div>
  );
}

export default function CourseShortlistCard({ visual, onAsk, onSelectCourse }) {
  const planner = usePlanner();
  const items = Array.isArray(visual?.items) ? visual.items : [];
  const [shown, setShown] = useState(PAGE);
  const [choosing, setChoosing] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [error, setError] = useState(null);

  if (!items.length) {
    return (
      <div className="vc-card vc-shortlist">
        <Head />
        <p className="vc-line is-muted">{visual?.reason || 'No courses matched; try other words'}</p>
        {onAsk && (
          <div className="vc-chips">
            {EXAMPLES.map((text) => (
              <button key={text} type="button" className="vc-chip" onClick={() => onAsk(text)}>{text}</button>
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
      // The term the shortlist was checked for (N2); without one the server uses the open term.
      const term = visual?.term || null;
      const op = term ? { op: 'add', course: item.id, term } : { op: 'add', course: item.id };
      setChosen(await planner.propose([op], term ? { term } : undefined));
    } catch (err) {
      const info = plannerError(err);
      setError({ id: item.id, text: info.message || "Couldn't add that course. Try again." });
    } finally {
      setChoosing(null);
    }
  };

  return (
    <div className="vc-card vc-shortlist">
      <Head />
      {visual?.reason && <p className="vc-lead">{visual.reason}</p>}
      <ul className="vc-rows">
        {items.slice(0, shown).map((item) => {
          const credits = creditSpan(item.credits);
          const prereq = item.prereqs?.status || 'unknown';
          const chips = (item.labels || []).filter((label) => !/^Prerequisites/i.test(label));
          return (
            <li key={item.id} className="vc-srow">
              <div className="vc-srow-main">
                <span>
                  {onSelectCourse ? (
                    <button type="button" className="vc-link" onClick={() => onSelectCourse(item.id)}>{item.id}</button>
                  ) : <span className="vc-code">{item.id}</span>}
                  {credits && <span className="vc-code"> · {credits} cr</span>}
                </span>
                {item.title && <b>{item.title}</b>}
                {item.why && <p className="vc-srow-why">{item.why}</p>}
                {chips.length > 0 && (
                  <div className="vc-srow-chips">
                    {chips.map((label) => <span key={label} className="vc-tag">{label}</span>)}
                  </div>
                )}
                <span className={`vc-srow-prereq ${prereq === 'short' ? 'is-short' : ''}`.trim()}>
                  {PREREQ_TEXT[prereq] || statusWord(prereq)}
                  {item.prereqs?.reason ? ` · ${item.prereqs.reason}` : ''}
                </span>
                {error?.id === item.id && <p className="vc-alert" role="alert">{error.text}</p>}
              </div>
              {planner && (
                <button
                  type="button"
                  className="vc-btn"
                  disabled={!!choosing}
                  aria-label={`Choose ${item.id}`}
                  onClick={() => choose(item)}
                >
                  {choosing === item.id ? 'Checking…' : <><Icon name="add" size={20} />Choose</>}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {items.length > shown && (
        <button type="button" className="vc-btn vc-more-btn" onClick={() => setShown(shown + PAGE)}>Show more</button>
      )}
      {chosen && (
        <div className="vc-chosen">
          <ProposalCard visual={{ type: 'proposed_change', proposal: chosen }} />
        </div>
      )}
    </div>
  );
}
