import React from 'react';
import { useDndContext } from '@dnd-kit/core';
import { useDropTarget } from '../../dnd';
import CourseCard from './CourseCard';
import { LOAD_KEYS, creditMin } from './degreeFormat';

const SLOTS = 5;
const SCALE = 21; // credits across the full bar
const BAND = { min: 12, max: 18 };

const pct = (value) => `${Math.max(0, Math.min(100, (100 * value) / SCALE))}%`;

/** A dashed "+" slot: a drop target of its own, and a way into the semester view. */
function PlusSlot({ term, index, onDrop, onAdd }) {
  const target = useDropTarget({
    id: `degree-slot:${term}:${index}`,
    label: term,
    accepts: ['course'],
    onDrop: (item) => onDrop(item, term),
  });
  return (
    <li ref={target.ref} className={`dg-slot ${target.className}`}>
      <button type="button" className="dg-slot-btn" aria-label={`Add a course to ${term}`} onClick={() => onAdd(term)}>
        +
      </button>
    </li>
  );
}

/**
 * The credits line on the 12–18 band (D17, R12). A term the data doesn't
 * cover, or one whose facts didn't arrive, shows no number for unknown credits.
 */
function CreditsBand({
  credits, preview, limits, clashes = 0,
}) {
  const band = limits || BAND;
  const known = credits.known;
  return (
    <div className="dg-credits">
      {known && (
        <span className="dg-credits-num">
          {credits.min}
          {preview != null && <span className="dg-credits-preview"> → {preview}</span>}
          <span className="dg-credits-unit"> cr</span>
        </span>
      )}
      <span
        className="dg-band"
        role="meter"
        aria-label="Credits"
        aria-valuemin={0}
        aria-valuemax={SCALE}
        aria-valuenow={known ? credits.min : undefined}
        aria-valuetext={known ? `${credits.min} credits` : 'Credits unknown'}
      >
        <span className="dg-band-range" style={{ left: pct(band.min), width: pct(band.max - band.min) }} />
        {known && <span className="dg-band-fill" style={{ width: pct(credits.min) }} />}
        {known && preview != null && <span className="dg-band-ghost" style={{ width: pct(preview) }} />}
        <span className="dg-band-tick" style={{ left: pct(band.min) }} />
        <span className="dg-band-tick" style={{ left: pct(band.max) }} />
      </span>
      {clashes > 0 && <span className="dg-clash">{`${clashes} ${clashes === 1 ? 'clash' : 'clashes'}`}</span>}
    </div>
  );
}

/**
 * One term on the board: name, credits on the band, the load label,
 * course cards, "+" slots and "Open semester →". The whole column takes
 * drops; while a course hovers, the header previews the new credits (D8).
 */
export default function TermColumn({
  term, courses, credits, load, limits, clashes, terms, tones, showRequirements, current, pulseId,
  onDrop, onOpen, onMove, onRemove, onOpenSemester,
}) {
  const target = useDropTarget({
    id: `degree-term:${term}`,
    label: term,
    accepts: ['course'],
    onDrop: (item) => onDrop(item, term),
  });
  const { active } = useDndContext();
  const dragged = active?.data?.current?.item;

  let preview = null;
  if (target.over && dragged && dragged.extra?.term !== term && !courses.some((c) => c.id === dragged.id)) {
    const add = creditMin(dragged.extra?.credits);
    if (add != null) preview = credits.min + add;
  }

  const slots = Math.max(0, SLOTS - courses.length);
  const headingId = `dg-term-${term.replace(/\W+/g, '-')}`;

  return (
    <section
      ref={target.ref}
      className={`dg-col ${target.className} ${current ? 'is-current' : ''}`.trim()}
      aria-labelledby={headingId}
      data-term={term}
    >
      <header className="dg-col-head">
        <div className="dg-col-title">
          <h3 id={headingId}>{term}</h3>
          {load && <span className={`dg-load is-${LOAD_KEYS[load] || 'typical'}`}>{load}</span>}
        </div>
        <CreditsBand credits={credits} preview={preview} limits={limits} clashes={clashes} />
      </header>
      <ul className="dg-cards">
        {courses.map((course) => (
          <CourseCard
            key={course.id}
            course={course}
            term={term}
            terms={terms}
            tones={tones}
            showRequirements={showRequirements}
            pulsing={pulseId === course.id}
            onOpen={onOpen}
            onMove={onMove}
            onRemove={onRemove}
          />
        ))}
        {Array.from({ length: slots }, (_, index) => (
          <PlusSlot
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            term={term}
            index={index}
            onDrop={onDrop}
            onAdd={onOpenSemester}
          />
        ))}
      </ul>
      <button
        type="button"
        className={`dg-open ${current ? 'is-primary' : ''}`.trim()}
        onClick={() => onOpenSemester(term)}
      >
        Open semester →
      </button>
    </section>
  );
}

export function TermColumnSkeleton() {
  return (
    <section className="dg-col is-loading" aria-hidden="true">
      <span className="cc-ph dg-ph-title" />
      <span className="cc-ph" />
      <span className="cc-ph dg-ph-card" />
      <span className="cc-ph dg-ph-card" />
      <span className="cc-ph dg-ph-card" />
    </section>
  );
}
