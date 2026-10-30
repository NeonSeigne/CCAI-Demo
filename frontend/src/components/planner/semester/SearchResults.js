import React from 'react';
import { AddRounded, CloseRounded, DragIndicatorRounded } from '../../icons';
import { useDraggableItem } from '../../dnd';
import { difficultyOf } from './semesterData';

/**
 * The inline results list above the course cards (D4): each row drags into
 * the list or the week, and has an Add button (D18).
 */
function ResultRow({ course, planned, onAdd }) {
  const id = course.identifier;
  const drag = useDraggableItem({ type: 'course', id, title: course.title || id });
  const level = difficultyOf(course);
  return (
    <li ref={drag.ref} className={`sv-result ${drag.isDragging ? 'is-dragging' : ''}`.trim()}>
      <button
        ref={drag.gripRef}
        type="button"
        className="sv-grip is-inline"
        aria-label={`Drag ${id}`}
        title={`Drag ${id}`}
        {...drag.handleProps}
      >
        <DragIndicatorRounded aria-hidden="true" />
      </button>
      <span className="sv-result-code">{id}</span>
      <span className="sv-result-title">{course.title}</span>
      {course.gpa != null && (
        <span className={`sv-gpa is-${level || 'none'}`} title="Average GPA">
          <span className="sr-only">Average GPA </span>
          {Number(course.gpa).toFixed(2)}
        </span>
      )}
      {planned ? (
        <span className="sv-result-in">{planned}</span>
      ) : (
        <button type="button" className="sv-btn is-small" aria-label={`Add ${id}`} onClick={() => onAdd(course)}>
          <AddRounded aria-hidden="true" />
          Add
        </button>
      )}
    </li>
  );
}

export default function SearchResults({
  status, results, plannedIn, onAdd, onClose, onRetry,
}) {
  return (
    <section className="sv-results" aria-label="Search results">
      <button type="button" className="sv-icon-btn sv-results-close" aria-label="Close results" title="Close" onClick={onClose}>
        <CloseRounded aria-hidden="true" />
      </button>
      {status === 'loading' && (
        <div aria-busy="true" aria-label="Searching">
          <div className="sv-skel sv-skel-row" />
          <div className="sv-skel sv-skel-row" />
        </div>
      )}
      {status === 'error' && (
        <p className="sv-error" role="alert">
          Couldn&apos;t load
          <span aria-hidden="true"> · </span>
          <button type="button" className="sv-link" onClick={onRetry}>Retry</button>
        </p>
      )}
      {status === 'ready' && results.length === 0 && <p className="sv-muted">No courses found.</p>}
      {status === 'ready' && results.length > 0 && (
        <ul className="sv-result-list">
          {results.map((course) => (
            <ResultRow
              key={course.identifier}
              course={course}
              planned={plannedIn(course.identifier)}
              onAdd={onAdd}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
