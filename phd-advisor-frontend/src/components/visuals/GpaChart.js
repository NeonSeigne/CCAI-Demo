import React from 'react';

/**
 * Hand-rolled bar chart (no charting dependency) for a course's cumulative
 * grade distribution, with an average-GPA badge. Driven entirely by the
 * structured `gpa_chart` spec from the backend.
 */

const BUCKETS = [
  { key: 'a', label: 'A', color: '#16a34a' },
  { key: 'ab', label: 'AB', color: '#65a30d' },
  { key: 'b', label: 'B', color: '#ca8a04' },
  { key: 'bc', label: 'BC', color: '#d97706' },
  { key: 'c', label: 'C', color: '#ea580c' },
  { key: 'd', label: 'D', color: '#dc2626' },
  { key: 'f', label: 'F', color: '#991b1b' },
];

const gpaBadgeColor = (gpa) => {
  if (gpa == null) return '#6b7280';
  if (gpa >= 3.5) return '#16a34a';
  if (gpa >= 3.0) return '#0891b2';
  if (gpa >= 2.5) return '#d97706';
  return '#dc2626';
};

const GpaChart = ({ visual }) => {
  if (!visual) return null;
  const { course, average_gpa, total, distribution = {} } = visual;

  const counts = BUCKETS.map((b) => distribution[b.key] || 0);
  const maxCount = Math.max(1, ...counts);
  const totalGraded = counts.reduce((sum, c) => sum + c, 0) || total || 0;

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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
            {course || 'Course'} — Grade Distribution
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {totalGraded.toLocaleString()} graded students (all terms)
          </span>
        </div>
        {average_gpa != null && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '4px 12px',
              borderRadius: 10,
              background: gpaBadgeColor(average_gpa),
              color: '#fff',
              minWidth: 64,
            }}
          >
            <span style={{ fontSize: '1.1rem', fontWeight: 800, lineHeight: 1.1 }}>
              {average_gpa.toFixed(2)}
            </span>
            <span style={{ fontSize: '0.62rem', opacity: 0.9, letterSpacing: 0.4 }}>
              AVG GPA
            </span>
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
          height: 140,
        }}
      >
        {BUCKETS.map((b, i) => {
          const count = counts[i];
          const heightPct = (count / maxCount) * 100;
          const share = totalGraded ? Math.round((count / totalGraded) * 100) : 0;
          return (
            <div
              key={b.key}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                height: '100%',
                justifyContent: 'flex-end',
              }}
              title={`${b.label}: ${count.toLocaleString()} (${share}%)`}
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
                {count > 0 ? count.toLocaleString() : ''}
              </span>
              <div
                style={{
                  width: '100%',
                  maxWidth: 38,
                  height: `${Math.max(heightPct, count > 0 ? 4 : 0)}%`,
                  minHeight: count > 0 ? 4 : 0,
                  background: b.color,
                  borderRadius: '4px 4px 0 0',
                  transition: 'height 0.3s ease',
                }}
              />
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginTop: 4,
                }}
              >
                {b.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GpaChart;
