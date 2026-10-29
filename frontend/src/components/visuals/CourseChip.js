import React from 'react';
import { BookOpen } from '../icons';
import { useOpenCourse } from '../../utils/openCourse';

/**
 * A clickable pill representing a UW-Madison course.
 *
 * Rendered both inline (from `course:` markdown links) and inside the
 * prerequisite tree. Clicking invokes `onSelect(identifier)` when supplied,
 * otherwise it opens the course pop-up over the current page (`?course=`).
 */
const CourseChip = ({ identifier, title, onSelect, size = 'md' }) => {
  const openCourse = useOpenCourse();
  const label = (identifier || '').trim();
  if (!label) return null;

  const isSmall = size === 'sm';

  const handleClick = (e) => {
    e.preventDefault();
    if (onSelect) onSelect(label);
    else openCourse(label);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title ? `${label} — ${title}` : label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: isSmall ? '2px 8px' : '4px 10px',
        margin: '0 1px',
        borderRadius: 999,
        border: '1px solid var(--ink)',
        background: 'color-mix(in srgb, var(--ink) 12%, transparent)',
        color: 'var(--ink)',
        fontSize: isSmall ? '0.78rem' : '0.85rem',
        fontWeight: 600,
        lineHeight: 1.3,
        cursor: 'pointer',
        verticalAlign: 'baseline',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background =
          'color-mix(in srgb, var(--ink) 22%, transparent)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background =
          'color-mix(in srgb, var(--ink) 12%, transparent)';
      }}
    >
      <BookOpen size={isSmall ? 11 : 13} />
      {label}
    </button>
  );
};

export default CourseChip;
