import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons';
import { DEBOUNCE_MS, notAvailableText } from './catalogFormat';

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

/** "Couldn't load <what> from <source>" + Retry (11A): ink text with an icon (design Q4). */
export function InlineError({ message, onRetry, retryLabel = 'Retry' }) {
  return (
    <div className="cc-error" role="alert">
      <Icon name="error" size={20} />
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="cc-retry" onClick={onRetry}>
          <Icon name="refresh" size={18} /> {retryLabel}
        </button>
      )}
    </div>
  );
}

/** The source chip ("theCourseForum · as of Oct 12") in place of a footnote. */
export function SourceChip({ children, className = '' }) {
  return (
    <p className={`cc-checked ${className}`.trim()}>
      <span className="cc-src">
        <Icon name="verified" size={16} />
        {children}
      </span>
    </p>
  );
}

/**
 * The GPA in Unbounded, coloured by the backend's difficulty. At UW,
 * "harder" is ink, so it carries the trending_down icon (DESIGN.md).
 */
export function GpaValue({
  value, difficulty, school, className = '',
}) {
  if (value == null) return null;
  const icon = difficulty === 'harder' && school === 'UW';
  return (
    <span className={`${className} ${difficulty ? `is-${difficulty}` : ''}`.trim()}>
      {icon && <Icon name="trending_down" size={15} className="cc-harder-icon" />}
      {value}
    </span>
  );
}
