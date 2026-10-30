/**
 * Small render pieces over `courseFacts`, in the mockups' presentation
 * (DESIGN.md "Course card / pop-up", design Q5, Q13, Q14). Callers keep
 * today's look until their lane switches them on.
 */
import React from 'react';
import './CourseParts.css';

const BAR_HEIGHT = { popup: 72, chat: 110 };

/**
 * Grade groups as bars sharing the width, scaled so the largest group fills
 * the box (72px in the pop-up, 110px in chat), that group in signal (Q13).
 * The pop-up's bars are neutral and carry no visible percentages (mockup);
 * screen readers still hear each share. Renders nothing without groups.
 */
export function GradeBars({ groups, size = 'popup', label = 'Grades' }) {
  if (!groups?.length) return null;
  const most = Math.max(...groups.map((g) => g.pct));
  const height = BAR_HEIGHT[size] || BAR_HEIGHT.popup;
  const pctClass = size === 'popup' ? 'sr-only' : 'crs-bar-pct';
  return (
    <figure className={`crs-bars crs-bars--${size}`} aria-label={label}>
      <ol className="crs-bars-list" style={{ '--crs-bars-h': `${height}px` }}>
        {groups.map((g) => {
          const fill = Math.max(2, (g.pct / most) * 100);
          return (
            // --crs-bar-fill (0..1) lets a caller's stylesheet place the % on top of its bar.
            <li key={g.key} className={`crs-bar ${g.top ? 'is-top' : ''}`.trim()} style={{ '--crs-bar-fill': fill / 100 }}>
              <span className={pctClass}>{`${Math.round(g.pct)}%`}</span>
              <span className="crs-bar-box" aria-hidden="true">
                <span className="crs-bar-fill" style={{ height: `${fill}%` }} />
              </span>
              <span className="crs-bar-label">{g.label}</span>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}

/**
 * Section rows: name and time, instructor, and the seat tag (live green,
 * snapshot neutral). `variant="popup"` is the pop-up's row (course-popup.html):
 * the section code, the time, the instructor and the tag in four columns.
 */
export function SectionRows({ sections, label = 'Sections', variant }) {
  if (!sections?.rows?.length) return null;
  if (variant === 'popup') {
    return (
      <ul className="crs-sections crs-sections--popup" aria-label={label}>
        {sections.rows.map((row) => (
          <li key={row.key} className="crs-section">
            <span className="crs-section-code">
              {row.type && <span className="sr-only">{`${row.type} `}</span>}
              {row.row?.section || row.name}
            </span>
            <span className="crs-section-when">{row.when || ''}</span>
            <span className="crs-section-who">{row.instructors || ''}</span>
            {row.tag ? <span className={`crs-tag crs-tag--${row.tag.kind}`}>{row.tag.text}</span> : <span />}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="crs-sections" aria-label={label}>
      {sections.rows.map((row) => (
        <li key={row.key} className="crs-section">
          <span className="crs-section-main">
            <strong>{row.name}</strong>
            {row.when && <span className="crs-section-when">{row.when}</span>}
          </span>
          {row.instructors && <span className="crs-section-who">{row.instructors}</span>}
          {row.tag && <span className={`crs-tag crs-tag--${row.tag.kind}`}>{row.tag.text}</span>}
        </li>
      ))}
    </ul>
  );
}

const STATE_WORDS = { done: 'Done', now: 'This term' };

/** Prerequisite tags with the student's state (done, this term); `onOpen(id)` makes each a button. */
export function PrereqTags({ prereqs, onOpen, label = 'Prerequisites' }) {
  if (!prereqs?.length) return null;
  return (
    <ul className="crs-prereqs" aria-label={label}>
      {prereqs.map((p) => {
        const state = p.state ? <span className="sr-only">{`, ${STATE_WORDS[p.state] || p.state}`}</span> : null;
        const className = `crs-prereq ${p.state ? `is-${p.state}` : ''}`.trim();
        return (
          <li key={p.id}>
            {onOpen ? (
              <button type="button" className={className} onClick={() => onOpen(p.id)}>{p.id}{state}</button>
            ) : (
              <span className={className}>{p.id}{state}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The stat tiles named by `keys` (default: GPA, rating, seats), in that
 * order, the number above its label ("3.31" over "Average GPA · Typical");
 * a tile without data is left out and the rest share the width (Q5).
 */
export function CourseTiles({ tiles, keys = ['gpa', 'rating', 'seats'] }) {
  const shown = keys.map((key) => (tiles || []).find((t) => t.key === key)).filter(Boolean);
  if (!shown.length) return null;
  return (
    <div className="crs-tiles" style={{ '--crs-tiles': shown.length }}>
      {shown.map((tile) => (
        <div key={tile.key} className="crs-tile">
          <span className={`crs-tile-value ${tile.tone ? `is-${tile.tone}` : ''}`.trim()}>
            {tile.value}
            {tile.sub && <small>{` ${tile.sub}`}</small>}
          </span>
          <span className="crs-tile-label">{tile.label}</span>
        </div>
      ))}
    </div>
  );
}
