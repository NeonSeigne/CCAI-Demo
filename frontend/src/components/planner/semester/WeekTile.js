import React from 'react';
import { useDropTarget } from '../../dnd';
import { WEEKDAYS, minutes } from '../planFormat';
import { meetingClock as clockText } from '../../../modules/campus';
import { colourVars } from './semesterData';

/**
 * The week (r9): Mon–Fri columns, free time hatched, blocks in the course
 * colour. Hovering or focusing a card lights its blocks and fades the rest
 * (D10). A pending proposal's `blocks_in` are dashed and `blocks_out`
 * faded (D9, R16). A course dropped here is added with the section that
 * fits (D4); the view decides what that is.
 */
export function useWeekTarget(onDrop) {
  return useDropTarget({
    id: 'semester-week',
    label: 'Week',
    accepts: ['course'],
    onDrop,
  });
}

export default function WeekTile({
  blocks, ghostIn = [], ghostOut = [], colours, lit = null, clashIds, target, flash = false,
}) {
  const outKeys = new Set(ghostOut.map((b) => `${b.course}|${b.section}|${b.day}|${b.start}`));
  const all = [
    ...blocks.map((b) => ({ ...b, ghost: outKeys.has(`${b.course}|${b.section}|${b.day}|${b.start}`) ? 'out' : null })),
    ...ghostIn.map((b) => ({ ...b, ghost: 'in' })),
  ].filter((b) => WEEKDAYS.some((d) => d.key === b.day));

  const starts = all.map((b) => minutes(b.start));
  const ends = all.map((b) => minutes(b.end));
  const first = Math.min(9 * 60, ...(starts.length ? [Math.floor(Math.min(...starts) / 60) * 60] : []));
  const last = Math.max(17 * 60, ...(ends.length ? [Math.ceil(Math.max(...ends) / 60) * 60] : []));
  const span = last - first;
  const hours = [];
  for (let h = first; h < last; h += 60) hours.push(h);

  const describe = (b) => {
    const day = WEEKDAYS.find((d) => d.key === b.day)?.short;
    const extra = [
      b.kind && b.kind !== 'lecture' ? b.kind : null,
      b.ghost === 'in' ? 'proposed' : null,
      b.ghost === 'out' ? 'proposed removal' : null,
      clashIds.has(b.course) ? 'clash' : null,
    ].filter(Boolean);
    return `${day} ${clockText(b.start)}–${clockText(b.end)} ${b.course}${extra.length ? ` (${extra.join(', ')})` : ''}`;
  };

  return (
    <section
      ref={target.ref}
      className={`sv-tile sv-week ${target.className} ${flash ? 'sv-flash' : ''}`.trim()}
      aria-labelledby="sv-week-h"
    >
      <h3 className="sv-label" id="sv-week-h">Week</h3>
      <ul className="sr-only">
        {all.map((b, i) => <li key={`${b.course}-${b.section}-${b.day}-${i}`}>{describe(b)}</li>)}
      </ul>
      <div className="sv-week-grid" aria-hidden="true" style={{ '--sv-hours': hours.length }}>
        <span />
        <div className="sv-week-days">
          {WEEKDAYS.map((d) => <span key={d.key}>{d.short}</span>)}
        </div>
        <div className="sv-week-hours">
          {hours.map((h, i) => (
            <span key={h} style={{ top: `${(i / hours.length) * 100}%` }}>{((Math.floor(h / 60) + 11) % 12) + 1}</span>
          ))}
        </div>
        <div className="sv-week-cols">
          {WEEKDAYS.map((d) => (
            <div key={d.key} className="sv-week-col">
              {all.filter((b) => b.day === d.key).map((b, i) => {
                const start = Math.max(minutes(b.start), first);
                const end = Math.min(minutes(b.end), last);
                if (end <= start) return null;
                const cls = [
                  'sv-block',
                  b.ghost ? `is-ghost-${b.ghost}` : '',
                  lit && b.course === lit ? 'is-lit' : '',
                  lit && b.course !== lit ? 'is-dim' : '',
                  clashIds.has(b.course) ? 'is-clash' : '',
                ].filter(Boolean).join(' ');
                return (
                  <span
                    key={`${b.course}-${b.section}-${i}`}
                    className={cls}
                    data-course={b.course}
                    style={{
                      ...colourVars(colours.get(b.course)),
                      top: `${((start - first) / span) * 100}%`,
                      height: `${((end - start) / span) * 100}%`,
                    }}
                  >
                    {b.course}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
