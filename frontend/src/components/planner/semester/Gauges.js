import React from 'react';
import { LOAD_LEVELS } from './semesterData';

/**
 * Credits and Load gauges (D11 compact, D22 role="meter" with values).
 * `after` draws the value a pending proposal or a hovered drop would give,
 * as a dashed ghost (D8, D9).
 */

const START = 135;
const SWEEP = 270;
const CX = 60;
const CY = 60;
const R = 48;

const point = (angle, r = R) => {
  const rad = (angle * Math.PI) / 180;
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
};

const arc = (from, to, r = R) => {
  const [x0, y0] = point(from, r);
  const [x1, y1] = point(to, r);
  const large = to - from > 180 ? 1 : 0;
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
};

const angleOf = (value, max) => START + SWEEP * Math.max(0, Math.min(1, value / max));

function Needle({ angle, ghost = false }) {
  const [x0, y0] = point(angle, R - 16);
  const [x1, y1] = point(angle, R - 4);
  return (
    <line
      className={ghost ? 'sv-needle is-ghost' : 'sv-needle'}
      x1={x0}
      y1={y0}
      x2={x1}
      y2={y1}
    />
  );
}

const spanText = (span) => {
  if (!span || span.min == null) return null;
  return span.max != null && span.max !== span.min ? `${span.min}–${span.max}` : `${span.min}`;
};

export function CreditsGauge({
  credits, after, compact = false, flash = false, chips = null,
}) {
  const limits = credits?.limits || { min: 12, max: 18 };
  const value = credits?.min ?? 0;
  const afterValue = after?.min;
  const showAfter = afterValue != null && afterValue !== value;
  const max = Math.max(24, value + 2, (afterValue || 0) + 2, limits.max + 4);
  const text = spanText(credits) ?? '0';
  const afterText = showAfter ? spanText(after) : null;
  const status = credits?.status;
  const [lx, ly] = point(angleOf(limits.min, max), R + 10);
  const [hx, hy] = point(angleOf(limits.max, max), R + 10);

  return (
    <section className={`sv-tile sv-gauge ${compact ? 'is-compact' : ''} ${flash ? 'sv-flash' : ''}`.trim()} aria-labelledby="sv-credits-h">
      <h3 className="sv-label" id="sv-credits-h">Credits</h3>
      <div
        className="sv-meter"
        role="meter"
        aria-labelledby="sv-credits-h"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${text} credits${afterText ? `, ${afterText} after the change` : ''}`}
      >
        <svg viewBox="-8 -8 136 128" className="sv-gauge-svg" aria-hidden="true">
          <path className="sv-arc-track" d={arc(START, START + SWEEP)} />
          <path className="sv-arc-band" d={arc(angleOf(limits.min, max), angleOf(limits.max, max))} />
          <text className="sv-arc-tick" x={lx} y={ly} textAnchor="middle">{limits.min}</text>
          <text className="sv-arc-tick" x={hx} y={hy} textAnchor="start">{limits.max}</text>
          <Needle angle={angleOf(value, max)} />
          {showAfter && <Needle angle={angleOf(afterValue, max)} ghost />}
        </svg>
        <span className={`sv-gauge-value ${status === 'over' || status === 'short' ? 'is-off' : ''}`.trim()}>
          {text}
          {afterText && (
            <span className="sv-gauge-after">
              <span aria-hidden="true"> → </span>
              {afterText}
            </span>
          )}
        </span>
      </div>
      {chips}
    </section>
  );
}

const LEVEL_CLASS = { Light: 'easier', Balanced: 'typical', Heavy: 'harder' };

export function LoadGauge({
  difficulty, counts, after, compact = false, flash = false,
}) {
  const label = difficulty?.label;
  const level = LOAD_LEVELS.indexOf(label);
  const afterLevel = after && after !== label ? LOAD_LEVELS.indexOf(after) : -1;
  const gap = 6;
  const seg = (SWEEP - gap * 2) / 3;
  const segments = LOAD_LEVELS.map((name, i) => {
    const from = START + i * (seg + gap);
    return { name, from, to: from + seg };
  });
  const countText = [
    counts.harder ? `${counts.harder} harder` : null,
    counts.typical ? `${counts.typical} typical` : null,
    counts.easier ? `${counts.easier} easier` : null,
  ].filter(Boolean);

  return (
    <section className={`sv-tile sv-gauge ${compact ? 'is-compact' : ''} ${flash ? 'sv-flash' : ''}`.trim()} aria-labelledby="sv-load-h">
      <h3 className="sv-label" id="sv-load-h">Load</h3>
      <div
        className="sv-meter"
        role="meter"
        aria-labelledby="sv-load-h"
        aria-valuemin={1}
        aria-valuemax={3}
        aria-valuenow={level + 1}
        aria-valuetext={[
          label,
          countText.join(', '),
          afterLevel >= 0 ? `${after} after the change` : null,
        ].filter(Boolean).join('; ')}
      >
        <svg viewBox="-8 -8 136 128" className="sv-gauge-svg" aria-hidden="true">
          {segments.map((s, i) => (
            <path
              key={s.name}
              className={[
                'sv-arc-seg',
                i === level ? `is-${LEVEL_CLASS[s.name]}` : '',
                i === afterLevel ? 'is-ghost' : '',
              ].filter(Boolean).join(' ')}
              d={arc(s.from, s.to)}
            />
          ))}
          <Needle angle={(segments[level]?.from ?? START) + seg / 2} />
          {afterLevel >= 0 && <Needle angle={segments[afterLevel].from + seg / 2} ghost />}
        </svg>
        <span className={`sv-gauge-word is-${LEVEL_CLASS[label] || 'none'}`}>
          {label}
          {afterLevel >= 0 && (
            <span className="sv-gauge-after">
              <span aria-hidden="true"> → </span>
              {after}
            </span>
          )}
        </span>
      </div>
      {countText.length > 0 && (
        <div className="sv-counts" aria-hidden="true">
          {counts.harder > 0 && <span className="sv-count is-harder">{counts.harder} harder</span>}
          {counts.typical > 0 && <span className="sv-count is-typical">{counts.typical} typical</span>}
          {counts.easier > 0 && <span className="sv-count is-easier">{counts.easier} easier</span>}
        </div>
      )}
    </section>
  );
}
