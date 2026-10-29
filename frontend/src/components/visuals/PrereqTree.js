import React from 'react';
import { Icon } from '../icons';
import CourseChip from './CourseChip';
import '../../styles/CourseVisuals.css';

/**
 * Legacy `prereq_tree` / `next_courses_tree` specs from older sessions: a
 * flat list of linked courses (no AND/OR), so they stay a list of chips
 * under the course rather than a graph that would claim a structure.
 */
const PrereqTree = ({ visual, onSelectCourse }) => {
  if (!visual) return null;

  const isNext = visual.type === 'next_courses_tree';
  const { course, title, prereq_text: prereqText, note } = visual;
  const linked = isNext
    ? visual.next_courses || []
    : visual.prerequisites || [];
  const hasLinked = linked.length > 0;

  const heading = isNext
    ? `After ${course || 'course'} you can take`
    : `Prerequisites for ${course || 'course'}`;

  return (
    <section className="vc-card vc-prereq vc-prereq-list" aria-label={heading}>
      <div className="vc-head">
        <Icon name="account_tree" size={20} />
        <h3>{heading}</h3>
      </div>
      <div className="vc-body">
        <div className="vc-prereq-course">
          <span className="vc-band-code">{course}</span>
          {title && <strong>{title}</strong>}
        </div>
        {hasLinked && (
          <div className="vc-prereq-chips">
            {linked.map((p) => (
              <CourseChip
                key={p.identifier}
                identifier={p.identifier}
                title={p.title}
                onSelect={onSelectCourse}
              />
            ))}
          </div>
        )}
        {hasLinked && isNext && note && <p className="vc-prereq-text">{note}</p>}
        {!hasLinked && prereqText && <p className="vc-prereq-text">{prereqText}</p>}
      </div>
    </section>
  );
};

export default PrereqTree;
