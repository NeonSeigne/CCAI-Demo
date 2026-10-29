import React from 'react';

/**
 * Degree requirements: per rule, the count without this term → with it,
 * the gain chip, and cells (done solid, this term's gain outlined). A
 * pending proposal's after-count shows as a ghost (D9).
 */
const MAX_CELLS = 12;

function Cells({ row, ghostAfter }) {
  const { needed, completed, before, after } = row;
  if (needed > MAX_CELLS) {
    const pct = (n) => `${Math.max(0, Math.min(100, (n / needed) * 100))}%`;
    return (
      <div className="sv-rq-bar" aria-hidden="true">
        <span className="is-done" style={{ width: pct(completed) }} />
        <span className="is-planned" style={{ width: pct(Math.max(0, before - completed)) }} />
        <span className="is-gain" style={{ width: pct(Math.max(0, after - before)) }} />
        {ghostAfter != null && ghostAfter > after && (
          <span className="is-ghost" style={{ width: pct(ghostAfter - after) }} />
        )}
      </div>
    );
  }
  const cells = [];
  for (let i = 0; i < needed; i += 1) {
    let cls = '';
    if (i < completed) cls = 'is-done';
    else if (i < before) cls = 'is-planned';
    else if (i < after) cls = 'is-gain';
    else if (ghostAfter != null && i < ghostAfter) cls = 'is-ghost';
    cells.push(<i key={i} className={cls} />);
  }
  return <div className="sv-rq-cells" aria-hidden="true">{cells}</div>;
}

export default function RequirementsTile({ rows, changes, flash = false }) {
  if (!rows.length) return null;
  return (
    <section className={`sv-tile sv-rq ${flash ? 'sv-flash' : ''}`.trim()} aria-labelledby="sv-rq-h">
      <h3 className="sv-label" id="sv-rq-h">Degree requirements</h3>
      <ul className="sv-rq-list">
        {rows.map((row) => {
          const change = changes?.get(row.key);
          const ghostAfter = change
            ? (change.after?.completed || 0) + (change.after?.planned || 0)
            : null;
          const ghostShown = ghostAfter != null && ghostAfter !== row.after;
          const unit = row.unit === 'credits' ? ' cr' : '';
          return (
            <li key={row.key} className={`sv-rq-row ${ghostShown ? 'is-previewed' : ''}`.trim()}>
              <div className="sv-rq-head">
                <span className="sv-rq-title">{row.title}</span>
                <span className="sv-rq-value">
                  {row.gain > 0 && (
                    <>
                      {row.before}
                      <span aria-hidden="true"> → </span>
                      <span className="sr-only"> to </span>
                    </>
                  )}
                  {row.after}
                  {ghostShown && (
                    <span className="sv-rq-ghost">
                      <span aria-hidden="true"> → </span>
                      <span className="sr-only"> then </span>
                      {ghostAfter}
                    </span>
                  )}
                  <span className="sv-rq-of"> of {row.needed}{unit}</span>
                  <span className={row.gain > 0 ? 'sv-rq-gain' : 'sv-rq-gain is-zero'}>+{row.gain}</span>
                </span>
              </div>
              <Cells row={row} ghostAfter={ghostShown ? ghostAfter : null} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
