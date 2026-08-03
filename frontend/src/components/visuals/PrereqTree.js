import React from 'react';
import CourseChip from './CourseChip';

/**
 * Single-level prerequisite tree: the target course on top, its direct
 * prerequisites below, connected by simple lines. Falls back to the official
 * requisite text when no linked prerequisite courses are available.
 */
const PrereqTree = ({ visual, onSelectCourse }) => {
  if (!visual) return null;
  const { course, title, prereq_text, prerequisites = [] } = visual;
  const hasPrereqs = prerequisites.length > 0;

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
        Prerequisites for {course || 'course'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Target course node */}
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

        {hasPrereqs ? (
          <>
            {/* Vertical connector */}
            <div style={{ width: 2, height: 16, background: 'var(--border-primary)' }} />
            {/* Horizontal rail */}
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
              {prerequisites.map((p) => (
                <CourseChip
                  key={p.identifier}
                  identifier={p.identifier}
                  title={p.title}
                  onSelect={onSelectCourse}
                />
              ))}
            </div>
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
