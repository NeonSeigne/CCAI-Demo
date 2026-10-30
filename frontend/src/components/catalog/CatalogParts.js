import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from '../icons';
import { DEBOUNCE_MS, gradeSegments, notAvailableText } from './catalogFormat';

/** `value` once it has stopped changing for `delay` ms. */
export function useDebounced(value, delay = DEBOUNCE_MS) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

/**
 * Browse | Compare (n), a tablist whose tabs switch pages (4A, 28A). Arrow
 * keys move between the two tabs.
 */
export function CoursesTabs({
  active, count, onBrowse, onDegree, onCompare,
}) {
  const refs = useRef({});
  const tabs = [
    { id: 'browse', label: 'Browse', onSelect: onBrowse },
    ...(onDegree ? [{ id: 'degree', label: 'My degree', onSelect: onDegree }] : []),
    { id: 'compare', label: 'Compare', onSelect: onCompare },
  ];
  const onKeyDown = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.id === event.currentTarget.dataset.tab);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const other = tabs[(index + step + tabs.length) % tabs.length].id;
    refs.current[other]?.focus();
  };
  return (
    <div className="cc-tabs" role="tablist" aria-label="Courses view">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(node) => { refs.current[tab.id] = node; }}
            type="button"
            role="tab"
            data-tab={tab.id}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={`cc-tab ${selected ? 'is-selected' : ''}`}
            onKeyDown={onKeyDown}
            onClick={() => { if (!selected) tab.onSelect?.(); }}
          >
            {tab.label}
            {tab.id === 'compare' && (
              <span className="cc-tab-count">
                {count}
                <span className="sr-only"> ticked</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** "Not available for <school> (<source>)" (R3). */
export function NotAvailable({ school, source, className = '' }) {
  return <p className={`cc-na ${className}`.trim()}>{notAvailableText(school, source)}</p>;
}

/** "Couldn't load <what> from <source>" + Retry (11A). */
export function InlineError({ message, onRetry, retryLabel = 'Retry' }) {
  return (
    <div className="cc-error" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="cc-retry" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden="true" /> {retryLabel}
        </button>
      )}
    </div>
  );
}

/**
 * Stacked grade bar with its legend. The bar is decorative; the legend list
 * ("A 25%", ...) is the text alternative (28A).
 */
export function GradesBar({ distribution, label, compact = false }) {
  const segments = gradeSegments(distribution);
  if (!segments.length) return null;
  return (
    <div className={`cc-grades ${compact ? 'is-compact' : ''}`}>
      <div className="cc-grades-bar" aria-hidden="true">
        {segments.map((segment) => (
          <span
            key={segment.key}
            className={`cc-seg cc-tone-${segment.tone}`}
            style={{ flexGrow: segment.pct }}
          >
            {!compact && segment.pct >= 9 ? segment.label : ''}
          </span>
        ))}
      </div>
      <ul className="cc-grades-legend" aria-label={label ? `Grade distribution, ${label}` : 'Grade distribution'}>
        {segments.map((segment) => (
          <li key={segment.key}>
            <span className={`cc-dot cc-tone-${segment.tone}`} aria-hidden="true" />
            {segment.label} {Math.round(segment.pct)}%
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Grey bars sized like the content they stand in for (9A). */
export function Placeholder({ lines = 1, className = '' }) {
  return (
    <div className={`cc-ph-group ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => <span key={index} className="cc-ph" />)}
    </div>
  );
}
