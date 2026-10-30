import React, { useState } from 'react';
import { usePlanner } from '../../contexts/PlannerContext';
import { plannerError } from '../../api/planner';
import { gpaText } from '../../modules/course';
import { meetingClock } from '../../modules/campus';
import ProposalCard from './ProposalCard';
import { Icon } from '../icons';
import '../../styles/CourseVisuals.css';

/**
 * Chat card for a `course_shortlist` visual (design 19A, R9, Q9; chat-grades).
 *
 * visual: {type: 'course_shortlist', items: [{id, title, prereqs, gpa, difficulty,
 *          fit, section, clashes_with, ...}], reason?, term?}
 *
 * Rows that fit the schedule come first with the time they fit, then those
 * the check couldn't settle, then clashing rows tagged "Clashes". The card is
 * titled "Fits your schedule" when at least one row fits, else "Suggested
 * courses". Up to five rows, "Show more" for the next five. The round +
 * creates the single pending proposal (an `add` op, into `term` when the
 * visual names one) through the shared planner, and the new proposal's card
 * appears under the list.
 */

const PAGE = 5;
const EXAMPLES = [
  'Suggest an economics elective',
  'Something with climate, no mornings',
  'A lighter course that counts toward my major',
];
const FIT_ORDER = { fits: 0, unknown: 1, clashes: 2 };
const DAY_ORDER = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/**
 * "TuTh 8:00": the days and start of the chosen section's first meeting
 * kind (the lecture); null without meetings.
 */
export function fitTime(section) {
  const meetings = (section?.meetings || []).filter((m) => m?.day && m.start);
  if (!meetings.length) return null;
  const kind = meetings[0].kind;
  const first = meetings.filter((m) => m.kind === kind);
  const start = first[0].start;
  const days = [...new Set(first.filter((m) => m.start === start).map((m) => m.day))]
    .sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  return `${days.join('')} ${meetingClock(start)}`;
}

/** Fitting rows first, then unknown, then clashing ones; the server's order within each. */
export function orderByFit(items) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (FIT_ORDER[a.item.fit] ?? 1) - (FIT_ORDER[b.item.fit] ?? 1) || a.index - b.index)
    .map(({ item }) => item);
}

function Head({ title }) {
  return (
    <div className="vc-head">
      <Icon name="playlist_add" size={20} />
      <h3>{title}</h3>
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
        <Head title="Suggested courses" />
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

  const ordered = orderByFit(items);
  const anyFits = items.some((item) => item.fit === 'fits');

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
      <Head title={anyFits ? 'Fits your schedule' : 'Suggested courses'} />
      <ul className="vc-rows">
        {ordered.slice(0, shown).map((item) => {
          const time = item.fit === 'fits' ? fitTime(item.section) : null;
          const gpa = gpaText(item.gpa);
          return (
            <li key={item.id} className={`vc-srow ${item.fit ? `is-${item.fit}` : ''}`.trim()}>
              <div className="vc-srow-main">
                {onSelectCourse ? (
                  <button type="button" className="vc-srow-code" onClick={() => onSelectCourse(item.id)}>{item.id}</button>
                ) : <span className="vc-srow-code">{item.id}</span>}
                {item.title && <b>{item.title}</b>}
                {item.prereqs?.status === 'short' && (
                  <span className="vc-srow-prereq">Prerequisites not met yet</span>
                )}
                {error?.id === item.id && (
                  <p className="vc-alert" role="alert"><Icon name="error" size={20} />{error.text}</p>
                )}
              </div>
              {time && <span className="vc-tag is-plan vc-srow-time">{time}</span>}
              {item.fit === 'clashes' && <span className="vc-tag vc-srow-clash">Clashes</span>}
              {gpa && <span className={`vc-srow-gpa ${item.difficulty ? `is-${item.difficulty}` : ''}`.trim()}>{gpa}</span>}
              {planner && (
                <button
                  type="button"
                  className="vc-btn is-icon vc-srow-add"
                  disabled={!!choosing}
                  aria-label={`Add ${item.id}`}
                  onClick={() => choose(item)}
                >
                  {choosing === item.id ? <span className="vc-spinner" aria-hidden="true" /> : <Icon name="add" size={20} />}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {ordered.length > shown && (
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
