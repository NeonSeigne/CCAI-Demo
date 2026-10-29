import React from 'react';
import { creditSpan } from '../planFormat';
import { formatGpa, pastTermLabel } from './degreeFormat';

/**
 * The slim Past column (D5): one row per past term from the completed
 * courses, "‹ See past" to show those terms in full, and the way into the
 * Completed editor (O2). Not rendered when there's no history.
 */
export function PastColumn({
  past, courseTone, expanded, onToggle, onEditCompleted,
}) {
  return (
    <section className="dg-past" aria-labelledby="dg-past-h">
      <h3 id="dg-past-h">Past</h3>
      <ul className="dg-past-terms">
        {past.map((entry) => (
          <li key={entry.term} className="dg-past-term">
            <div className="dg-past-row">
              <span className="dg-past-name">{pastTermLabel(entry.term)}</span>
              <span className="dg-past-credits">
                {entry.credits}
                <span className="sr-only"> credits</span>
              </span>
            </div>
            <span className="dg-past-bar" aria-hidden="true">
              {entry.courses.map((course) => (
                <span key={course.id} className={`tone-${courseTone(course.id)}`} />
              ))}
            </span>
            {entry.gpa != null && (
              <div className="dg-past-row is-gpa">
                <span>GPA</span>
                <span className="dg-past-gpa">{formatGpa(entry.gpa)}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="dg-past-actions">
        <button type="button" className="dg-open" onClick={onEditCompleted}>Completed</button>
        <button type="button" className="dg-open" aria-expanded={expanded} onClick={onToggle}>
          {expanded ? 'Hide past ›' : '‹ See past'}
        </button>
      </div>
    </section>
  );
}

/** A past term shown in full: its completed courses, read-only. */
export function PastTermColumn({ entry, onOpen }) {
  const headingId = `dg-past-${entry.term.replace(/\W+/g, '-')}`;
  return (
    <section className="dg-col is-past" aria-labelledby={headingId} data-past-term={entry.term}>
      <header className="dg-col-head">
        <div className="dg-col-title">
          <h3 id={headingId}>{entry.term}</h3>
        </div>
        <div className="dg-credits">
          <span className="dg-credits-num">
            {entry.credits}
            <span className="dg-credits-unit"> cr</span>
          </span>
        </div>
      </header>
      <ul className="dg-cards">
        {entry.courses.map((course) => {
          const credits = creditSpan(course.credits);
          return (
            <li key={course.id} className="dg-card is-past">
              <div className="dg-card-top">
                <button type="button" className="dg-card-code" onClick={() => onOpen(course.id)}>{course.id}</button>
                {course.grade && (
                  <span className="dg-grade">
                    <span className="sr-only">Grade </span>
                    {course.grade}
                  </span>
                )}
              </div>
              {(course.title || credits) && (
                <p className="dg-card-title">
                  {course.title}
                  {course.title && credits ? ' · ' : ''}
                  {credits}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
