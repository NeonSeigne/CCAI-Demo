import React from 'react';
import CourseChip from './CourseChip';

/**
 * Single-level course link tree used for both prerequisites (courses you need
 * before) and next courses (courses that list yours as a prerequisite).
 */
const PrereqTree = ({ visual, onSelectCourse }) => {
  if (!visual) return null;

  const isNext = visual.type === 'next_courses_tree';
  const { course, title, prereq_text, note } = visual;
  const linked = isNext
    ? visual.next_courses || []
    : visual.prerequisites || [];
  const hasLinked = linked.length > 0;

  const heading = isNext
    ? `After ${course || 'course'} you can take`
    : `Prerequisites for ${course || 'course'}`;

  return (
    <div
      style={{
        border: '1px solid var(--border-primary)',
        borderRadius: 12,
        padding: '14px 16px',
        margin: '12px 0',
        background: 'var(--bg-secondary)',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: 12 }}>
        {heading}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div
          style={{
            padding: '6px 14px',
            borderRadius: 10,
            background: 'var(--accent-primary)',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.9rem',
            textAlign: 'center',
            maxWidth: '90%',
          }}
        >
          {course}
          {title && (
            <div style={{ fontSize: '0.7rem', fontWeight: 500, opacity: 0.9 }}>{title}</div>
          )}
        </div>

        {hasLinked ? (
          <>
            <div style={{ width: 2, height: 16, background: 'var(--border-primary)' }} />
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                justifyContent: 'center',
                paddingTop: 12,
                borderTop: '2px solid var(--border-primary)',
                width: '100%',
              }}
            >
              {linked.map((p) => (
                <CourseChip
                  key={p.identifier}
                  identifier={p.identifier}
                  title={p.title}
                  onSelect={onSelectCourse}
                />
              ))}
            </div>
            {isNext && note && (
              <div
                style={{
                  marginTop: 12,
                  fontSize: '0.78rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.45,
                  textAlign: 'center',
                  maxWidth: 520,
                }}
              >
                {note}
              </div>
            )}
          </>
        ) : (
          prereq_text && (
            <div
              style={{
                marginTop: 12,
                fontSize: '0.82rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                textAlign: 'center',
                maxWidth: 520,
              }}
            >
              {prereq_text}
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default PrereqTree;
