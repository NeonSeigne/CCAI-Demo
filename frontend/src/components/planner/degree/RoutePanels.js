import React from 'react';
import { CloseButton } from '../../../modules/sheet';
import { creditsLabel, sectionText } from './routeModel';

/**
 * The Requirements panel (transit-a, Phase 8.4): one row per rule with a dot
 * in its line's colour, the rule name, a pill per course (done in the line
 * colour, this term in signal, placed in track, the rest empty) and "X of N".
 */
export function RequirementsPanel({ rows }) {
  return (
    <section className="rt-panel rt-reqs" aria-labelledby="rt-reqs-title">
      <div className="rt-panel-h"><h2 id="rt-reqs-title">Requirements</h2></div>
      <table className="rt-req-table">
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={`rt-${row.tone}`}>
              <td>
                <span className="rt-req-dot" aria-hidden="true" />
                {row.title}
              </td>
              <td className="rt-req-n">
                <span className="rt-pills" aria-hidden="true">
                  {row.pills.map((state, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <i key={i} className={`is-${state}`} />
                  ))}
                </span>
                {row.count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const ids = (list) => list.map((item) => (typeof item === 'string' ? item : item.id)).filter(Boolean);

/**
 * The selected stop (transit-a, Phase 8.4; design Q7, Q20): code and
 * credits over the title in the band, then Term, Line, Needs, Opens and
 * Section; rows with nothing to show are left out. The title opens the
 * course pop-up. Where the source has no full "opens" list (UVA, CU) the
 * row names only plan courses and says so in its label.
 */
export function DetailCard({ stop, onOpen, onClose }) {
  if (!stop) return null;
  const credits = creditsLabel(stop.credits);
  const needs = ids(stop.needs || []);
  const opens = ids(stop.opens || []);
  const section = sectionText(stop.sections);
  const rows = [
    stop.termKnown !== false && stop.term ? ['Term', stop.term] : null,
    ['Line', stop.line],
    needs.length ? ['Needs', needs.join(' · '), true] : null,
    opens.length ? [stop.opensComplete ? 'Opens' : 'Opens in plan', opens.join(' · '), true] : null,
    section ? ['Section', section] : null,
  ].filter(Boolean);
  return (
    <section className="rt-panel rt-detail" aria-labelledby="rt-detail-title" aria-live="polite">
      <div className="rt-detail-band">
        <span className="rt-detail-code">{[stop.id, credits].filter(Boolean).join(' · ')}</span>
        <h2 id="rt-detail-title">
          <button type="button" className="rt-detail-open" onClick={() => onOpen?.(stop.id)}>
            {stop.title || stop.id}
          </button>
        </h2>
        {onClose && <span className="rt-detail-close"><CloseButton onClose={onClose} /></span>}
      </div>
      <dl className="rt-detail-rows">
        {rows.map(([label, value, code]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className={code ? 'rt-codes' : undefined}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
