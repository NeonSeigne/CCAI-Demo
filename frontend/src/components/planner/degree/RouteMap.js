import React from 'react';
import { NOT_PLACED, routeByTerm } from './routeModel';
import { parseTerm } from './degreeFormat';
import '../../../styles/RouteMap.css';

// Geometry of the line map, in SVG units (1 unit = 1px at full width).
const LABEL_W = 132;
const COL_W = 104;
const HEAD_H = 64;
const ROW_H = 100;
const FIRST_ROW = HEAD_H + 46;
const SPREAD = 56; // between stops that share a term; their codes alternate above and below

const STATE_WORDS = { done: 'done', now: 'this term', planned: 'planned' };

const stopLabel = (stop) => [stop.id, stop.term, STATE_WORDS[stop.state], stop.grade].filter(Boolean).join(', ');

const onKey = (fn) => (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    fn();
  }
};

/**
 * Column edges and stop positions. A column widens to fit the most stops any
 * one line has in it; stops that share a term spread out across it.
 */
function layout(model, columns) {
  const most = (term) => Math.max(1, ...model.lines.map((l) => l.stops.filter((s) => s.term === term).length));
  const widths = columns.map((term) => Math.max(COL_W, most(term) * SPREAD + 24));
  const lefts = widths.map((_, i) => LABEL_W + widths.slice(0, i).reduce((a, b) => a + b, 0));
  const col = (term) => {
    const i = columns.indexOf(term);
    return { left: lefts[i], width: widths[i], mid: lefts[i] + widths[i] / 2 };
  };
  const colX = (term) => col(term).mid;
  const at = {};
  model.lines.forEach((line, row) => {
    const y = FIRST_ROW + row * ROW_H;
    const byTerm = new Map();
    line.stops.forEach((stop) => byTerm.set(stop.term, [...(byTerm.get(stop.term) || []), stop]));
    byTerm.forEach((stops, term) => {
      const step = stops.length > 1 ? SPREAD : 0;
      stops.forEach((stop, i) => {
        at[stop.id] = { x: colX(term) + (i - (stops.length - 1) / 2) * step, y, above: i % 2 === 1 };
      });
    });
  });
  const width = lefts[lefts.length - 1] + widths[widths.length - 1];
  return { at, col, colX, width };
}

const Check = ({ x, y }) => (
  <path className="rt-check" d={`M${x - 4.2} ${y + 0.2} l2.8 2.8 l5.4 -5.6`} />
);

/**
 * The line map (Phase 2 P.1): requirement lines across terms, stops by status,
 * prerequisite links between lines and the core deadline. Choosing a stop
 * opens the course pop-up.
 */
export default function RouteMap({ model, onOpen }) {
  const columns = [...model.terms, ...(model.notPlaced ? [NOT_PLACED] : [])];
  const { at, col, colX, width: right } = layout(model, columns);
  const width = right + 8;
  const height = FIRST_ROW + Math.max(model.lines.length - 1, 0) * ROW_H + 58;
  const lineOf = new Map(model.lines.flatMap((l) => l.stops.map((s) => [s.id, l.key])));
  const currentIndex = columns.indexOf(model.current);
  const dueIndex = model.deadline ? columns.indexOf(model.deadline.term) : -1;

  return (
    <div className="rt-scroll" role="region" aria-label="Route map" tabIndex={0}>
      <svg className="rt-map" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group">
        {currentIndex !== -1 && (
          <rect
            className="rt-now-band"
            x={col(model.current).left + 4}
            y={8}
            width={col(model.current).width - 8}
            height={height - 16}
            rx={16}
          />
        )}

        {columns.map((term, i) => {
          const parsed = parseTerm(term);
          const x = col(term).mid;
          const cls = `rt-term ${i === currentIndex ? 'is-now' : ''}`.trim();
          return parsed ? (
            <text key={term} className={cls} x={x} y={32} textAnchor="middle">
              <tspan x={x}>{term.split(' ')[0]}</tspan>
              <tspan x={x} dy={16}>{parsed.year}</tspan>
            </text>
          ) : (
            <text key={term} className={cls} x={x} y={40} textAnchor="middle">{term}</text>
          );
        })}

        {dueIndex !== -1 && (
          <g className="rt-due">
            <line
              x1={col(model.deadline.term).left + col(model.deadline.term).width}
              x2={col(model.deadline.term).left + col(model.deadline.term).width}
              y1={HEAD_H}
              y2={height - 12}
            />
            <text x={col(model.deadline.term).left + col(model.deadline.term).width - 6} y={height - 16} textAnchor="end">
              Core due
            </text>
          </g>
        )}

        {model.edges.filter((e) => lineOf.get(e.from) !== lineOf.get(e.to)).map((edge) => {
          const a = at[edge.from];
          const b = at[edge.to];
          if (!a || !b) return null;
          const mid = (a.x + b.x) / 2;
          return (
            <path
              key={`${edge.from}>${edge.to}`}
              className="rt-edge"
              d={`M${a.x} ${a.y} C${mid} ${a.y} ${mid} ${b.y} ${b.x} ${b.y}`}
            />
          );
        })}

        {model.lines.map((line, row) => {
          const y = FIRST_ROW + row * ROW_H;
          const points = line.stops.map((s) => at[s.id]);
          const last = points[points.length - 1];
          const openX = colX(NOT_PLACED);
          return (
            <g key={line.key} className={`rt-line rt-${line.tone}`}>
              <text className="rt-line-name" x={0} y={y + 5}>{line.name}</text>
              {points.length > 1 && (
                <polyline className="rt-track" points={points.map((p) => `${p.x},${p.y}`).join(' ')} />
              )}
              {line.open > 0 && (
                <>
                  <line className="rt-track-open" x1={last ? last.x : LABEL_W + 8} x2={openX} y1={y} y2={y} />
                  <circle className="rt-stop-open" cx={openX} cy={y} r={9} />
                  <text className="rt-more" x={openX} y={y + 30} textAnchor="middle">{`${line.open} more`}</text>
                </>
              )}
              {line.stops.map((stop) => {
                const p = at[stop.id];
                const open = () => onOpen?.(stop.id);
                return (
                  <g
                    key={stop.id}
                    className={`rt-stop is-${stop.state}`}
                    role="button"
                    tabIndex={0}
                    aria-label={stopLabel(stop)}
                    onClick={open}
                    onKeyDown={onKey(open)}
                  >
                    <circle className="rt-focus" cx={p.x} cy={p.y} r={17} />
                    <circle className="rt-dot" cx={p.x} cy={p.y} r={stop.state === 'now' ? 11 : 9} />
                    {stop.state === 'done' && <Check x={p.x} y={p.y} />}
                    <text className="rt-code" x={p.x} y={p.above ? p.y - 20 : p.y + 29} textAnchor="middle">
                      {stop.id}
                    </text>
                    {stop.grade && !p.above && (
                      <text className="rt-grade" x={p.x} y={p.y + 44} textAnchor="middle">{stop.grade}</text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * The phone route (Phase 2 P.2): one stop per term with its courses, the
 * open stops, then each line's progress.
 */
export function RouteList({ model, onOpen }) {
  const { terms, open } = routeByTerm(model);
  return (
    <div className="rt-list">
      <ol className="rt-route" aria-label="Route">
        {terms.map((entry) => (
          <li key={entry.term} className={`rt-term-stop is-${entry.state} ${entry.now ? 'is-current' : ''}`.trim()}>
            <span className="rt-marker" aria-hidden="true" />
            <div className="rt-term-body">
              <div className="rt-term-head">
                <h4>{entry.term}</h4>
                {entry.now && <span className="rt-pill is-now">Now</span>}
                {entry.due && <span className="rt-pill">Core due</span>}
                {entry.credits > 0 && <span className="rt-credits">{`${entry.credits} cr`}</span>}
              </div>
              {entry.stops.length > 0 && (
                <ul>
                  {entry.stops.map((stop) => (
                    <li key={stop.id}>
                      <button
                        type="button"
                        className={`rt-row rt-${stop.tone} is-${stop.state}`}
                        aria-label={stopLabel(stop)}
                        onClick={() => onOpen?.(stop.id)}
                      >
                        <span className="rt-row-dot" aria-hidden="true" />
                        <span className="rt-row-code">{stop.id}</span>
                        {stop.title && <span className="rt-row-title">{stop.title}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
        {open.length > 0 && (
          <li className="rt-term-stop is-open">
            <span className="rt-marker" aria-hidden="true" />
            <div className="rt-term-body">
              <div className="rt-term-head"><h4>{NOT_PLACED}</h4></div>
              <ul>
                {open.map((entry) => (
                  <li key={entry.line} className={`rt-row rt-${entry.tone} is-open`}>
                    <span className="rt-row-dot" aria-hidden="true" />
                    <span className="rt-row-title">{entry.rules.join(' · ')}</span>
                    <span className="rt-row-count">{entry.open}</span>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        )}
      </ol>

      <section className="rt-lines" aria-labelledby="rt-lines-title">
        <h3 id="rt-lines-title">Lines</h3>
        {model.lines.map((line) => (
          <div key={line.key} className={`rt-line-card rt-${line.tone}`}>
            <div className="rt-line-head">
              <h4>{line.name}</h4>
              <span>{`${line.done} of ${line.total}`}</span>
            </div>
            <div className="rt-dots" aria-hidden="true">
              {line.stops.map((stop) => <span key={stop.id} className={`rt-pip is-${stop.state}`} />)}
              {Array.from({ length: line.open }, (_, i) => <span key={`open-${i}`} className="rt-pip is-open" />)}
            </div>
            <p>{line.rules.map((r) => `${r.title} ${r.completed}/${r.needed}`).join(' · ')}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
