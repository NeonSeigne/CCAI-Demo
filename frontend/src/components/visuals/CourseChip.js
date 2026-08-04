import React from 'react';
import { BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * A clickable pill representing a UW-Madison course.
 *
 * Rendered both inline (from `course:` markdown links) and inside the
 * prerequisite tree. Clicking invokes `onSelect(identifier)` when supplied,
 * otherwise it opens the protected course-detail route.
 */
const CourseChip = ({ identifier, title, onSelect, size = 'md' }) => {
  const navigate = useNavigate();
  const label = (identifier || '').trim();
  if (!label) return null;

  const isSmall = size === 'sm';

  const handleClick = (e) => {
    e.preventDefault();
    if (onSelect) onSelect(label);
    else navigate(`/courses/${encodeURIComponent(label)}`);
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
        border: '1px solid var(--accent-primary)',
        background: 'color-mix(in srgb, var(--accent-primary) 12%, transparent)',
        color: 'var(--accent-primary)',
        fontSize: isSmall ? '0.78rem' : '0.85rem',
        fontWeight: 600,
        lineHeight: 1.3,
        cursor: 'pointer',
        verticalAlign: 'baseline',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background =
          'color-mix(in srgb, var(--accent-primary) 22%, transparent)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background =
          'color-mix(in srgb, var(--accent-primary) 12%, transparent)';
      }}
    >
      <BookOpen size={isSmall ? 11 : 13} />
      {label}
    </button>
  );
};

export default CourseChip;
