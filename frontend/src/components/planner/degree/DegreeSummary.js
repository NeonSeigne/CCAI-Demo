import React from 'react';
import {
  openRequirements, waffleModel, waffleSquares, waffleSummary,
} from './degreeFormat';

const ROWS = 8;

/** "Fall 2028" over two lines, like the approved board. */
function FinishDate({ term }) {
  const [season, ...rest] = String(term).split(' ');
  return (
    <p className="dg-finish-date">
      <span>{season}</span>
      {rest.length > 0 && <span>{rest.join(' ')}</span>}
    </p>
  );
}

/**
 * The degree's top bar (D13, D22, R14): the Finish date only when the
 * server gives one, otherwise the count of open requirements; credit
 * totals; the waffle (one square per credit, filled column by column,
 * group after group) with its key, an accessible summary and a hidden table.
 */
export default function DegreeSummary({ name, waffle }) {
  // Whole squares; every number below is read from the same rounding.
  const { groups, totals } = waffleModel(waffle);
  const squares = waffleSquares(waffle);
  const summary = waffleSummary(name, waffle);
  const openCount = openRequirements(waffle);

  return (
    <section className="dg-summary" aria-label="Degree progress">
      <div className="dg-summary-side">
        {waffle?.finish ? (
          <div className="dg-finish">
            <span className="dg-label">Finish</span>
            <FinishDate term={waffle.finish} />
          </div>
        ) : (
          <div className="dg-finish is-open">
            <span className="dg-label">Open requirements</span>
            <p className="dg-finish-count">{openCount}</p>
          </div>
        )}
        <dl className="dg-stats">
          <div>
            <dt>Credits</dt>
            <dd>
              {totals.earned + totals.planned}
              {waffle?.total_credits != null && <span className="dg-of"> / {totals.size}</span>}
            </dd>
          </div>
          <div>
            <dt>Done</dt>
            <dd>{totals.earned}</dd>
          </div>
          <div>
            <dt>Planned</dt>
            <dd>{totals.planned}</dd>
          </div>
          <div>
            <dt>Open</dt>
            <dd className={totals.open ? 'is-open' : ''}>{totals.open}</dd>
          </div>
        </dl>
      </div>

      <div
        className="dg-waffle"
        role="img"
        aria-label={summary}
        data-testid="degree-waffle"
        style={{ gridTemplateRows: `repeat(${ROWS}, var(--dg-square))` }}
      >
        {squares.map((square, index) => (
          <span
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            className={`dg-square is-${square.state} tone-${square.tone}`}
            data-group={square.group}
            data-state={square.state}
            aria-hidden="true"
          />
        ))}
      </div>

      <ul className="dg-key" aria-hidden="true">
        {groups.map((group, index) => {
          const { tone, hatched } = group;
          const have = group.earned + group.planned;
          return (
            <li key={group.rule_id || `other-${index}`} className="dg-key-row">
              <span className={`dg-key-dot tone-${tone}`} />
              <span className="dg-key-title">{group.title}</span>
              <span className="dg-key-count">
                {hatched > 0 && (
                  <span className="dg-key-ungraded">
                    <span className={`dg-key-hatch tone-${tone}`} />
                    {group.unknown_grade}
                  </span>
                )}
                {have}/{group.size}
                {group.open > 0 && <span className="dg-key-left"> · {group.open} left</span>}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="sr-only">
        <table>
          <caption>{name ? `${name} credits` : 'Degree credits'}</caption>
          <thead>
            <tr>
              <th scope="col">Group</th>
              <th scope="col">Earned</th>
              <th scope="col">Planned</th>
              <th scope="col">Open</th>
              <th scope="col">Without a grade</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group, index) => (
              <tr key={group.rule_id || `other-${index}`}>
                <th scope="row">{group.title}</th>
                <td>{group.earned}</td>
                <td>{group.planned}</td>
                <td>{group.open}</td>
                <td>{group.unknown_grade || 0}</td>
                <td>{group.size}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function DegreeSummarySkeleton() {
  return (
    <section className="dg-summary is-loading" aria-hidden="true" data-testid="degree-skeleton">
      <div className="dg-summary-side">
        <span className="cc-ph dg-ph-big" />
        <span className="cc-ph" />
        <span className="cc-ph" />
        <span className="cc-ph" />
      </div>
      <div className="dg-waffle dg-ph-waffle cc-ph" />
    </section>
  );
}
