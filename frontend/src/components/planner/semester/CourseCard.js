import React, { useRef, useState } from 'react';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import PersonOutlineRounded from '@mui/icons-material/PersonOutlineRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';
import DriveFileMoveRounded from '@mui/icons-material/DriveFileMoveRounded';
import { useDraggableItem } from '../../dnd';
import { clockText, creditSpan } from '../planFormat';
import {
  colourVars, dayStrip, difficultyOf, partLabel, ratingFor, seatsOf, shortName, shownSections, timeRange,
} from './semesterData';

/**
 * One course in the semester view, a wide row (r9): code in the course
 * colour, GPA chip, credits, title, day strip and time where the school
 * publishes times, instructor ★, prerequisites; on the right the section(s)
 * with seats and the requirement and gen-ed chips.
 *
 * The ⋯ menu (Move to…, Swap section, Remove) is always there; Swap and
 * Remove shortcuts also show on hover and focus (D19). Ghost cards (D9) have
 * no actions: `ghost` 'in' is dashed, 'out' is faded and struck through.
 */

function SeatRow({ row, label, historicalTerm }) {
  const seats = seatsOf(row);
  return (
    <div className="sv-sec">
      <span className="sv-sec-name">
        {label}
        {' '}
        <b>{row.section}</b>
      </span>
      {seats ? (
        <>
          <span className="sv-seatbar" aria-hidden="true"><i style={{ width: `${Math.round(seats.taken * 100)}%` }} /></span>
          <span className={`sv-seats ${seats.low ? 'is-low' : ''}`.trim()} title={historicalTerm || undefined}>
            {seats.open} of {seats.capacity} left
            {historicalTerm && <span className="sr-only"> in {historicalTerm}</span>}
          </span>
        </>
      ) : <span />}
    </div>
  );
}

function GpaChip({ gpa, harder }) {
  if (gpa == null || Number.isNaN(Number(gpa))) return null;
  const level = difficultyOf(harder, gpa) || 'typical';
  return (
    <span className={`sv-gpa is-${level}`} title="Average GPA">
      <span className="sr-only">Average GPA </span>
      {Number(gpa).toFixed(2)}
    </span>
  );
}

function Prereqs({ prereqs }) {
  const status = prereqs?.status;
  if (status === 'met') {
    return (
      <span className="sv-pq is-met">
        <CheckCircleOutlineRounded aria-hidden="true" />
        Prereqs met
      </span>
    );
  }
  if (status === 'short') {
    const reason = prereqs.reason && /^needs\b/i.test(prereqs.reason) ? prereqs.reason : 'Needs prerequisites';
    return (
      <span className="sv-pq is-short">
        <LockOutlined aria-hidden="true" />
        {reason}
      </span>
    );
  }
  return null;
}

const safeKey = (id) => String(id).replace(/[^A-Za-z0-9]+/g, '-');

export default function CourseCard({
  course,
  colour,
  detail,
  blocks = [],
  chosen = null,
  showTimes = true,
  clash = false,
  ghost = null,
  flash = false,
  pulse = false,
  lit = false,
  moveTerms = [],
  onHighlight,
  onMove,
  onSwap,
  onRemove,
}) {
  const id = course.id;
  const summary = detail?.summary || null;
  const title = course.title || summary?.title || '';
  const drag = useDraggableItem({ type: 'course', id, title: title || id, disabled: !!ghost });
  const menuButton = useRef(null);
  const [menu, setMenu] = useState(null); // null | 'main' | 'move'

  const rows = summary?.sections?.rows || [];
  const sections = shownSections(rows, chosen);
  const historical = summary?.sections?.historical ? summary.sections.term : null;
  const instructorNames = sections[0]?.instructors || (summary?.instructors || [])[0];
  const instructor = shortName(instructorNames);
  const rating = ratingFor(instructorNames, detail?.ratings);
  const credits = creditSpan(course.credits);
  const gpa = summary?.grades?.gpa ?? course.avg_gpa ?? null;
  const hasTimes = showTimes && blocks.length > 0;
  const chips = [
    ...(course.fills || []).map((text) => ({ text, kind: 'rq' })),
    ...(course.gen_ed || []).map((text) => ({ text, kind: 'ge' })),
  ];
  const actionable = !ghost && !course.pending;
  const closeMenu = () => setMenu(null);

  const className = [
    'sv-card',
    drag.isDragging ? 'is-dragging' : '',
    ghost === 'in' ? 'is-ghost-in' : '',
    ghost === 'out' ? 'is-ghost-out' : '',
    flash ? 'sv-flash' : '',
    pulse ? 'is-pulsing' : '',
    lit ? 'is-lit' : '',
  ].filter(Boolean).join(' ');

  return (
    <article
      ref={ghost ? undefined : drag.ref}
      className={className}
      style={colourVars(colour)}
      aria-label={`${id}${title ? ` ${title}` : ''}${ghost === 'in' ? ', proposed addition' : ''}${ghost === 'out' ? ', proposed removal' : ''}`}
      data-course={id}
      onMouseEnter={() => onHighlight?.(id)}
      onMouseLeave={() => onHighlight?.(null)}
      onFocus={() => onHighlight?.(id)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onHighlight?.(null); }}
    >
      {!ghost && (
        <button
          ref={drag.gripRef}
          type="button"
          className="sv-grip"
          aria-label={`Drag ${id}`}
          title={`Drag ${id}`}
          {...drag.handleProps}
        >
          <DragIndicatorRounded aria-hidden="true" />
        </button>
      )}
      <div className="sv-card-main">
        <div className="sv-card-r1">
          <span className="sv-code">{id}</span>
          <GpaChip gpa={gpa} harder={course.harder} />
          {credits && <span className="sv-cr"><b>{credits}</b> cr</span>}
          {clash && <span className="sv-flag">Clash</span>}
        </div>
        {title && <h4 className="sv-card-title">{title}</h4>}
        {hasTimes && (
          <div className="sv-days">
            {dayStrip(blocks).map((d) => (
              <span key={d.key} className={d.on ? 'is-on' : undefined} aria-hidden="true">{d.letter}</span>
            ))}
            <span className="sr-only">
              {dayStrip(blocks).filter((d) => d.on).map((d) => d.name).join(', ')}
            </span>
            <em>{timeRange(blocks, clockText)}</em>
          </div>
        )}
        {(instructor || course.prereqs?.status === 'met' || course.prereqs?.status === 'short') && (
          <div className="sv-meta">
            {instructor && (
              <span className="sv-who">
                <PersonOutlineRounded aria-hidden="true" />
                {instructor}
                {rating != null && (
                  <span className="sv-rating">
                    <StarRounded aria-hidden="true" />
                    <span className="sr-only">rated </span>
                    {rating.toFixed(1)}
                  </span>
                )}
              </span>
            )}
            <Prereqs prereqs={course.prereqs} />
          </div>
        )}
      </div>
      <div className="sv-card-side">
        {!ghost && course.pending && (
          <div className="sv-acts">
            <button
              type="button"
              className="sv-icon-btn"
              aria-label={`More for ${id}`}
              aria-disabled="true"
              aria-describedby={`sv-saving-${safeKey(id)}`}
              title="Saving"
            >
              <MoreHorizRounded aria-hidden="true" />
            </button>
            <span className="sr-only" id={`sv-saving-${safeKey(id)}`}>Saving; available once saved</span>
          </div>
        )}
        {actionable && (
          <div className="sv-acts">
            <button
              type="button"
              className="sv-icon-btn sv-shortcut"
              aria-label={`Swap section of ${id}`}
              title="Swap section"
              onClick={() => onSwap?.(id)}
            >
              <SwapHorizRounded aria-hidden="true" />
            </button>
            <button
              type="button"
              className="sv-icon-btn sv-shortcut"
              aria-label={`Remove ${id}`}
              title="Remove"
              onClick={() => onRemove?.(id)}
            >
              <CloseRounded aria-hidden="true" />
            </button>
            <button
              ref={menuButton}
              type="button"
              className="sv-icon-btn"
              aria-label={`More for ${id}`}
              title="More"
              aria-haspopup="menu"
              aria-expanded={menu ? 'true' : 'false'}
              onClick={() => setMenu('main')}
            >
              <MoreHorizRounded aria-hidden="true" />
            </button>
            <Menu
              anchorEl={menuButton.current}
              open={!!menu}
              onClose={closeMenu}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              slotProps={{ paper: { className: 'sv-menu' } }}
            >
              {menu === 'move'
                ? moveTerms.map((term) => (
                  <MenuItem key={term} onClick={() => { closeMenu(); onMove?.(id, term); }}>{term}</MenuItem>
                ))
                : [
                  <MenuItem key="move" onClick={() => setMenu('move')}>
                    <DriveFileMoveRounded aria-hidden="true" />
                    Move to…
                  </MenuItem>,
                  <MenuItem key="swap" onClick={() => { closeMenu(); onSwap?.(id); }}>
                    <SwapHorizRounded aria-hidden="true" />
                    Swap section
                  </MenuItem>,
                  <MenuItem key="remove" className="is-danger" onClick={() => { closeMenu(); onRemove?.(id); }}>
                    <CloseRounded aria-hidden="true" />
                    Remove
                  </MenuItem>,
                ]}
            </Menu>
          </div>
        )}
        {sections.length > 0 && (
          <div className="sv-secs">
            {sections.map((row) => (
              <SeatRow
                key={`${row.type}-${row.section}`}
                row={row}
                label={showTimes ? 'Sec' : partLabel(row)}
                historicalTerm={historical}
              />
            ))}
          </div>
        )}
        {chips.length > 0 && (
          <div className="sv-tags">
            {chips.map((chip) => (
              <span key={`${chip.kind}-${chip.text}`} className={`sv-tag ${chip.kind === 'rq' ? 'is-rq' : ''}`.trim()}>
                {chip.text}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
