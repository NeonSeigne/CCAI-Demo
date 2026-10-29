import React, { useRef, useState } from 'react';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded';
import { useDraggableItem } from '../../dnd';
import { creditSpan } from '../planFormat';
import { difficultyKey, formatGpa } from './degreeFormat';

/**
 * One planned course on a term column (D4, D14, D18, D19): code, title,
 * credits, a GPA chip in the difficulty ink, requirement tags. The card is
 * the drag handle (Space lifts, arrows move, Space drops); its ⋯ menu is
 * always visible and offers Move to… and Remove.
 */
export default function CourseCard({
  course, term, terms, tones, showRequirements, pulsing, onOpen, onMove, onRemove,
}) {
  const drag = useDraggableItem({
    type: 'course',
    id: course.id,
    title: course.title ? `${course.id} ${course.title}` : course.id,
    extra: { from: 'board', term, credits: course.credits || null },
  });
  const menuButton = useRef(null);
  const [menu, setMenu] = useState(null); // null | 'main' | 'move'

  const gpaKey = difficultyKey(course.avg_gpa);
  const credits = creditSpan(course.credits);
  const others = terms.filter((t) => t !== term);
  const close = () => setMenu(null);

  return (
    <li
      ref={drag.ref}
      {...drag.handleProps}
      className={`dg-card ${drag.className} ${pulsing ? 'is-pulsing' : ''} ${course.pending ? 'is-pending' : ''}`.trim()}
      data-course={course.id}
    >
      <div className="dg-card-top">
        <button type="button" className="dg-card-code" onClick={() => onOpen(course.id)}>
          {course.id}
        </button>
        {gpaKey && (
          <span className={`dg-gpa is-${gpaKey}`}>
            <span className="sr-only">Average GPA </span>
            {formatGpa(course.avg_gpa)}
          </span>
        )}
        <button
          type="button"
          ref={menuButton}
          className="dg-icon-btn dg-card-more"
          aria-label={`More for ${course.id}`}
          title="More"
          aria-haspopup="menu"
          aria-expanded={menu ? 'true' : undefined}
          onClick={() => setMenu('main')}
        >
          <MoreHorizRounded fontSize="small" aria-hidden="true" />
        </button>
      </div>
      {(course.title || credits) && (
        <p className="dg-card-title">
          {course.title}
          {course.title && credits ? ' · ' : ''}
          {credits}
          {credits && <span className="sr-only"> credits</span>}
        </p>
      )}
      {showRequirements && course.requirements?.length > 0 && (
        <ul className="dg-tags" aria-label="Counts toward">
          {course.requirements.map((title) => (
            <li key={title} className="dg-tag">
              <span className={`dg-key-dot tone-${tones[title] || 'other'}`} aria-hidden="true" />
              {title}
            </li>
          ))}
        </ul>
      )}

      <Menu
        anchorEl={menuButton.current}
        open={menu === 'main'}
        onClose={close}
        slotProps={{ list: { 'aria-label': `${course.id} actions` } }}
      >
        <MenuItem disabled={!others.length} onClick={() => setMenu('move')}>Move to…</MenuItem>
        <MenuItem onClick={() => { close(); onRemove(course); }}>Remove</MenuItem>
      </Menu>
      <Menu
        anchorEl={menuButton.current}
        open={menu === 'move'}
        onClose={close}
        slotProps={{ list: { 'aria-label': `Move ${course.id} to` } }}
      >
        {others.map((t) => (
          <MenuItem key={t} onClick={() => { close(); onMove(course, t); }}>{t}</MenuItem>
        ))}
      </Menu>
    </li>
  );
}
