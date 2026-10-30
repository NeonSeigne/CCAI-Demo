import React, { useRef, useState } from 'react';
import { NOT_PLACED, routeByTerm } from './routeModel';
import { creditMin, parseTerm } from './degreeFormat';
import '../../../styles/RouteMap.css';

// Geometry of the line map, in SVG units (transit-a.html: COL 108, LEFT 136, TOP 52).
const LABEL_W = 136;
const COL_W = 108;
const TOP = 52;
const FIRST_ROW = TOP + 52;
const ROW_H = 100;
const SPREAD = 48; // between stops that share a term; the first goes above, the next below
const HIT_R = 22; // a 44px hit area round every stop (design Q19)

const STATE_WORDS = { done: 'done', now: 'this term', planned: 'planned' };

export const stopLabel = (stop) => [
  stop.id, stop.termKnown === false ? null : stop.term, STATE_WORDS[stop.state], stop.grade,
].filter(Boolean).join(', ');

/**
 * Column edges and stop positions. Every column is one width unless a line
 * has three or more stops in it; stops that share a term spread across it.
 */
function layout(model, columns) {
  const most = (term) => Math.max(1, ...model.lines.map((l) => l.stops.filter((s) => s.term === term).length));
  const widths = columns.map((term) => Math.max(COL_W, most(term) * SPREAD + 12));
  const lefts = widths.map((_, i) => LABEL_W + widths.slice(0, i).reduce((a, b) => a + b, 0));
  const col = (term) => {
    const i = columns.indexOf(term);
    return { left: lefts[i], width: widths[i], mid: lefts[i] + widths[i] / 2 };
  };
  const at = {};
  model.lines.forEach((line, row) => {
    const y = FIRST_ROW + row * ROW_H;
    const byTerm = new Map();
    line.stops.forEach((stop) => byTerm.set(stop.term, [...(byTerm.get(stop.term) || []), stop]));
    byTerm.forEach((stops, term) => {
      stops.forEach((stop, i) => {
        at[stop.id] = {
          x: col(term).mid + (i - (stops.length - 1) / 2) * SPREAD,
          y,
          above: stops.length > 1 && i % 2 === 0,
        };
      });
    });
  });
  const width = lefts[lefts.length - 1] + widths[widths.length - 1];
  return { at, col, width };
}

const Check = ({ x, y }) => <path className="rt-check" d={`M${x - 4} ${y} l3 3 l5 -6`} />;

/** The stop in `line` nearest to `x`, for moving between lines. */
const nearest = (line, x, at) => line.stops.reduce((best, stop) => (
  !best || Math.abs(at[stop.id].x - x) < Math.abs(at[best.id].x - x) ? stop : best), null);

/**
 * The line map (Phase 2 P.1, Phase 8.3): requirement lines across every term
 * to graduation, stops by status, prerequisite links and the core deadline.
 * Choosing a stop selects it (design Q7); keyboard per design Q20: one Tab
 * stop per line, Left/Right along it, Up/Down between lines, Enter or Space
 * selects, Shift+Enter opens the course pop-up.
 */
export default function RouteMap({
  model, selected = null, onSelect, onOpen,
}) {
  const columns = [...model.terms, ...(model.notPlaced ? [NOT_PLACED] : [])];
  const { at, col, width: right } = layout(model, columns);
  const width = right + 12;
  const height = FIRST_ROW + Math.max(model.lines.length - 1, 0) * ROW_H + 64;
  const currentIndex = columns.indexOf(model.current);
  const dueIndex = model.deadline ? columns.indexOf(model.deadline.term) : -1;
  const refs = useRef({});
  // The stop each line keeps in the Tab order (roving tabindex).
  const [roving, setRoving] = useState({});

  const tabStopOf = (line) => {
    if (line.stops.some((s) => s.id === selected)) return selected;
    if (line.stops.some((s) => s.id === roving[line.key])) return roving[line.key];
    return line.stops[0]?.id;
  };

  const focusStop = (line, stop) => {
    if (!stop) return;
    setRoving((current) => ({ ...current, [line.key]: stop.id }));
    refs.current[stop.id]?.focus();
  };

  const onKeyDown = (line, row, stop) => (event) => {
    const index = line.stops.indexOf(stop);
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      onOpen?.(stop.id);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect?.(stop.id);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      focusStop(line, line.stops[index + (event.key === 'ArrowRight' ? 1 : -1)]);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      for (let r = row + step; r >= 0 && r < model.lines.length; r += step) {
        const other = model.lines[r];
        if (other.stops.length) {
          focusStop(other, nearest(other, at[stop.id].x, at));
          break;
        }
      }
    }
  };

  const dueX = dueIndex !== -1 ? col(model.deadline.term).left + col(model.deadline.term).width : null;

  return (
    <div className="rt-scroll" role="region" aria-label="Route map">
      <svg className="rt-map" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group">
        {currentIndex !== -1 && (
          <rect
            className="rt-now-band"
            x={col(model.current).left}
            y={8}
            width={col(model.current).width}
            height={height - 16}
            rx={12}
          />
        )}

        {columns.map((term, i) => {
          const parsed = parseTerm(term);
          const x = col(term).mid;
          return parsed ? (
            <g key={term} className={`rt-term ${i === currentIndex ? 'is-now' : ''}`.trim()}>
              <text className="rt-season" x={x} y={26} textAnchor="middle">{term.split(' ')[0]}</text>
              <text className="rt-year" x={x} y={42} textAnchor="middle">{parsed.year}</text>
            </g>
          ) : (
            <text key={term} className="rt-term rt-year" x={x} y={34} textAnchor="middle">{term}</text>
          );
        })}

        {dueX != null && (
          <g className="rt-due">
            <line x1={dueX} x2={dueX} y1={54} y2={height - 10} />
            <text x={dueX - 6} y={height - 14} textAnchor="end">Core due</text>
          </g>
        )}

        {model.edges.map((edge) => {
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
          const xs = line.stops.map((s) => at[s.id].x);
          const first = xs.length ? Math.min(...xs) : null;
          const last = xs.length ? Math.max(...xs) : null;
          const openX = col(NOT_PLACED)?.mid;
          const tabStop = tabStopOf(line);
          return (
            <g key={line.key} className={`rt-line rt-${line.tone}`}>
              <text className="rt-line-name" x={16} y={y + 5}>{line.name}</text>
              {first != null && <line className="rt-track" x1={first} x2={last} y1={y} y2={y} />}
              {line.open > 0 && openX != null && (
                <>
                  <line className="rt-track-open" x1={last ?? LABEL_W + 8} x2={openX} y1={y} y2={y} />
                  <circle className="rt-stop-open" cx={openX} cy={y} r={9} />
                  <text className="rt-more" x={openX} y={y + 30} textAnchor="middle">{`${line.open} more`}</text>
                </>
              )}
              <g role="group" aria-label={line.name}>
                {line.stops.map((stop) => {
                  const p = at[stop.id];
                  const isSelected = stop.id === selected;
                  const codeY = p.above ? p.y - 22 : p.y + 30;
                  return (
                    <g
                      key={stop.id}
                      ref={(node) => { refs.current[stop.id] = node; }}
                      className={`rt-stop is-${stop.state} ${isSelected ? 'is-selected' : ''}`.trim()}
                      role="button"
                      tabIndex={stop.id === tabStop ? 0 : -1}
                      aria-pressed={isSelected}
                      aria-label={stopLabel(stop)}
                      data-stop={stop.id}
                      onClick={(event) => {
                        setRoving((current) => ({ ...current, [line.key]: stop.id }));
                        if (event.shiftKey) onOpen?.(stop.id);
                        else onSelect?.(stop.id);
                      }}
                      onKeyDown={onKeyDown(line, row, stop)}
                    >
                      <circle className="rt-hit" cx={p.x} cy={p.y} r={HIT_R} />
                      <circle className="rt-ring" cx={p.x} cy={p.y} r={17} />
                      <circle className="rt-dot" cx={p.x} cy={p.y} r={{ done: 10, now: 12 }[stop.state] || 9} />
                      {stop.state === 'done' && <Check x={p.x} y={p.y} />}
                      <text className="rt-code" x={p.x} y={codeY} textAnchor="middle">{stop.id}</text>
                      {stop.grade && (
                        <text className="rt-grade" x={p.x} y={p.above ? codeY - 15 : codeY + 15} textAnchor="middle">
                          {stop.grade}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const STATE_CLASS = { done: 'past', now: 'now', planned: 'future' };

/**
 * The phone route (transit-b, Phase 8.6): "Your route" with one stop per
 * term and its courses, the open stops, then each line's progress. A course
 * row selects its stop; the board shows the detail card in a sheet.
 */
export function RouteList({
  model, meta, selected = null, onSelect,
}) {
  const { terms, open } = routeByTerm(model);
  return (
    <div className="rt-list">
      <section className="rt-panel" aria-labelledby="rt-route-title">
        <div className="rt-panel-h">
          <h2 id="rt-route-title">Your route</h2>
          {meta && <span className="rt-panel-meta">{meta}</span>}
        </div>
        <ol className="rt-route" aria-label="Route">
          {terms.map((entry) => (
            <li key={entry.term} className={`rt-term-stop is-${STATE_CLASS[entry.state]}`}>
              <span className="rt-marker" aria-hidden="true" />
              <div className="rt-term-body">
                <div className="rt-term-head">
                  <h3>{entry.term}</h3>
                  {entry.now && <span className="rt-tag is-now">Now</span>}
                  {entry.due && <span className="rt-tag">Core due</span>}
                  <span className="rt-credits">{`${entry.credits} cr`}</span>
                </div>
                {entry.stops.length > 0 && (
                  <ul>
                    {entry.stops.map((stop) => {
                      const credits = creditMin(stop.credits);
                      return (
                        <li key={stop.id}>
                          <button
                            type="button"
                            className={`rt-row rt-${stop.tone} is-${stop.state}`}
                            aria-label={stopLabel(stop)}
                            aria-pressed={stop.id === selected}
                            onClick={() => onSelect?.(stop.id)}
                          >
                            <span className="rt-row-dot" aria-hidden="true" />
                            <span className="rt-row-code">{stop.id}</span>
                            <span className="rt-row-title">{stop.title}</span>
                            <span className="rt-row-meta">{stop.grade || (credits != null ? `${credits} cr` : null)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </li>
          ))}
          {open.length > 0 && (
            <li className="rt-term-stop is-future is-open">
              <span className="rt-marker" aria-hidden="true" />
              <div className="rt-term-body">
                <div className="rt-term-head"><h3>{NOT_PLACED}</h3></div>
                <ul>
                  {open.map((entry) => (
                    <li key={`${entry.line}:${entry.key}`} className={`rt-row rt-${entry.tone} is-open`}>
                      <span className="rt-row-dot" aria-hidden="true" />
                      <span className="rt-row-code">{entry.code}</span>
                      <span className="rt-row-title">{entry.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          )}
        </ol>
      </section>

      <section className="rt-panel" aria-labelledby="rt-lines-title">
        <div className="rt-panel-h"><h2 id="rt-lines-title">Lines</h2></div>
        <div className="rt-lines">
          {model.lines.map((line) => {
            const pips = [...line.stops.map((s) => s.state), ...Array(line.open).fill('open')];
            return (
              <div key={line.key} className={`rt-line-card rt-${line.tone}`}>
                <div className="rt-line-head">
                  <h3>{line.name}</h3>
                  <span>{`${line.done} of ${line.total}`}</span>
                </div>
                <div className="rt-strip" aria-hidden="true">
                  {pips.map((state, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <React.Fragment key={i}>
                      {i > 0 && <b className={pips[i - 1] === 'done' && state === 'done' ? 'is-done' : ''} />}
                      <i className={`rt-pip is-${state}`} />
                    </React.Fragment>
                  ))}
                </div>
                <p>{line.rules.map((r) => `${r.title} ${r.completed}/${r.needed}`).join(' · ')}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
