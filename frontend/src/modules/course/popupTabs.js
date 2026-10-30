/**
 * The course pop-up's tabs as they look today (Grades, Instructors,
 * Sections), shared by the pop-up and the chat course cards so neither
 * imports the other. The mockups' pieces are GradeBars, SectionRows,
 * PrereqTags and CourseTiles (parts.js); the lanes switch callers over.
 */
import React, { useId, useState } from 'react';
import { gradeSegments, sectionName, seatsText } from '../../components/catalog/catalogFormat';
import { nameKey, termShort } from '../../components/course/popupFormat';
import { gpaText } from './facts';
import '../sheet/BandSheet.css';
import '../../styles/CoursePopup.css';

/**
 * Average GPA by term, drawn in the course's difficulty colour (the
 * backend's label; neutral when it has none).
 */
export function GpaByTerm({ history, difficulty }) {
  const titleId = useId();
  const points = (history || []).filter((row) => row && row.gpa != null);
  if (!points.length) return null;
  const width = 600;
  const height = 230;
  const pad = { left: 36, right: 24, top: 26, bottom: 44 };
  const values = points.map((p) => Number(p.gpa));
  const lo = Math.min(2.8, Math.floor((Math.min(...values) - 0.1) * 5) / 5);
  const hi = Math.max(3.6, Math.ceil((Math.max(...values) + 0.1) * 5) / 5);
  const x = (i) => (points.length === 1
    ? (pad.left + width - pad.right) / 2
    : pad.left + (i * (width - pad.left - pad.right)) / (points.length - 1));
  const y = (v) => pad.top + ((hi - v) * (height - pad.top - pad.bottom)) / (hi - lo);
  const ticks = [];
  for (let t = lo; t <= hi + 1e-9; t += 0.2) ticks.push(Number(t.toFixed(1)));
  const right = width - pad.right;
  const tone = difficulty || 'none';

  return (
    <section className="pop-tile cp-gpa" aria-labelledby={titleId}>
      <div className="pop-tile-head">
        <h3 id={titleId} className="pop-tile-title">Average GPA by term</h3>
        <ul className="cp-legend" aria-hidden="true">
          <li className="is-easier">Easier</li>
          <li className="is-typical">Typical</li>
          <li className="is-harder">Harder</li>
        </ul>
      </div>
      <svg className="cp-gpa-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden="true" focusable="false">
        {ticks.map((t) => (
          <g key={t}>
            <line className="cp-grid" x1={pad.left} x2={right} y1={y(t)} y2={y(t)} />
            <text className="cp-axis" x={pad.left - 8} y={y(t) + 4} textAnchor="end">{t.toFixed(1)}</text>
          </g>
        ))}
        {points.slice(1).map((p, i) => (
          <line
            key={`seg-${p.term}`}
            className={`cp-seg is-${tone}`}
            x1={x(i)}
            y1={y(points[i].gpa)}
            x2={x(i + 1)}
            y2={y(p.gpa)}
          />
        ))}
        {points.map((p, i) => (
          <g key={p.term}>
            <circle className={`cp-dot is-${tone}`} cx={x(i)} cy={y(p.gpa)} r="5" />
            <text className={`cp-value is-${tone}`} x={x(i)} y={y(p.gpa) - 10} textAnchor="middle">
              {gpaText(p.gpa)}
            </text>
            <text className="cp-axis" x={x(i)} y={height - 24} textAnchor="middle">{termShort(p.term)}</text>
            {p.students ? (
              <text className="cp-axis cp-axis--soft" x={x(i)} y={height - 10} textAnchor="middle">{p.students}</text>
            ) : null}
          </g>
        ))}
      </svg>
      <ul className="sr-only">
        {points.map((p) => (
          <li key={p.term}>{`${p.term}: ${gpaText(p.gpa)}${p.students ? `, ${p.students} students` : ''}`}</li>
        ))}
      </ul>
    </section>
  );
}

const DF_KEYS = new Set(['d', 'f', 'dfw', 'd+', 'd-', 'w']);

/** The grade distribution with a term picker (latest term, all terms). */
export function GradeDistribution({ grades, cumulative }) {
  const titleId = useId();
  const options = [];
  if (grades?.distribution && gradeSegments(grades.distribution).length) {
    options.push({ id: 'term', label: grades.term ? termShort(grades.term) : 'Latest', distribution: grades.distribution });
  }
  if (cumulative?.distribution && gradeSegments(cumulative.distribution).length) {
    options.push({ id: 'all', label: 'All terms', distribution: cumulative.distribution });
  }
  const [picked, setPicked] = useState(null);
  const current = options.find((o) => o.id === picked) || options[0];
  if (!current) return null;
  const segments = gradeSegments(current.distribution);
  const top = Math.max(...segments.map((s) => s.pct));

  return (
    <section className="pop-tile cp-dist" aria-labelledby={titleId}>
      <div className="pop-tile-head">
        <h3 id={titleId} className="pop-tile-title">Grades</h3>
        {options.length > 1 && (
          <div className="pop-seg" role="group" aria-label="Term">
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                className="pop-seg-btn"
                aria-pressed={o.id === current.id}
                onClick={() => setPicked(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <ol className="cp-bars">
        {segments.map((s) => (
          <li
            key={s.key}
            className={['cp-bar', DF_KEYS.has(s.key.toLowerCase()) && 'is-df', s.pct === top && 'is-top'].filter(Boolean).join(' ')}
          >
            <span className="cp-bar-pct">{`${Math.round(s.pct)}%`}</span>
            <span className="cp-bar-fill" style={{ height: `${Math.max(2, (s.pct / top) * 100)}%` }} />
            <span className="cp-bar-label">{s.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// Instructors tab

export function instructorRows(gradesRows, ratings) {
  const rows = (gradesRows || []).map((row) => ({ name: row.name, gpa: row.gpa, students: row.students }));
  const byKey = new Map(rows.map((row) => [nameKey(row.name), row]));
  (ratings || []).forEach((rating) => {
    const key = nameKey(rating.name);
    const row = byKey.get(key);
    if (row) row.rating = rating;
    else {
      const added = { name: rating.name, rating };
      rows.push(added);
      byKey.set(key, added);
    }
  });
  return rows;
}

export function InstructorsTab({ rows }) {
  const top = Math.max(1, ...rows.map((r) => Number(r.students) || 0));
  return (
    <section className="pop-tile" aria-label="Instructors">
      <ul className="cp-instructors">
        {rows.map((row) => {
          const rating = row.rating;
          return (
            <li key={row.name} className="cp-instructor">
              <span className="cp-instructor-name">{row.name}</span>
              {row.students ? (
                <span className="cp-instructor-bar" aria-hidden="true">
                  <span style={{ width: `${(100 * Number(row.students)) / top}%` }} />
                </span>
              ) : <span />}
              {row.students ? <span className="cp-instructor-meta">{`${Number(row.students).toLocaleString('en-US')} students`}</span> : <span />}
              {rating && rating.rating != null ? (
                <span className="cp-instructor-rating">
                  {rating.url ? (
                    <a href={rating.url} target="_blank" rel="noopener noreferrer">{`★ ${Number(rating.rating).toFixed(1)}`}</a>
                  ) : `★ ${Number(rating.rating).toFixed(1)}`}
                  {rating.num_ratings ? <small>{` (${rating.num_ratings})`}</small> : null}
                </span>
              ) : <span />}
              {gpaText(row.gpa) ? (
                <span className="cp-instructor-gpa">{gpaText(row.gpa)}</span>
              ) : <span />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sections tab

export function SectionsTab({ sections }) {
  const historical = sections.historical;
  return (
    <section className="pop-tile" aria-label="Sections">
      <ul className="cp-sections">
        {(sections.rows || []).map((row, index) => {
          const meetings = (row.meetings || []).filter(Boolean).join(', ');
          const seats = sections.seats_published ? seatsText(row, historical) : null;
          const filled = row.enrolled != null && row.capacity ? Math.min(100, (100 * row.enrolled) / row.capacity) : null;
          const sub = [row.instructors, row.bldg].filter(Boolean).join(' · ');
          return (
            <li key={`${row.type}-${row.section}-${index}`} className="cp-section">
              <div className="cp-section-head">
                <strong>{[sectionName(row), meetings].filter(Boolean).join(' · ')}</strong>
                {seats && <span className="cp-section-seats">{seats}</span>}
              </div>
              {sub && <p className="cp-section-sub">{sub}</p>}
              {filled != null && (
                <>
                  <span className="cp-seatbar" aria-hidden="true"><span style={{ width: `${filled}%` }} /></span>
                  <p className="cp-section-sub">
                    {`${row.enrolled} of ${row.capacity}`}
                    {historical && sections.term ? ` · ${sections.term}` : ''}
                  </p>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
