import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';

const PlannerCoursePicker = ({
  open,
  mode = 'add',
  title,
  candidates = [],
  excludeIds = [],
  onClose,
  onPick,
}) => {
  const [query, setQuery] = useState('');
  const excluded = useMemo(() => new Set(excludeIds), [excludeIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    return (candidates || []).filter((c) => {
      if (!c?.identifier || excluded.has(c.identifier)) return false;
      if (!q) return true;
      return (
        c.identifier.toUpperCase().includes(q) ||
        (c.title || '').toUpperCase().includes(q) ||
        (c.program_name || '').toUpperCase().includes(q)
      );
    });
  }, [candidates, excluded, query]);

  if (!open) return null;

  return (
    <div className="planner-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="planner-modal surface-card"
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Pick a course'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="planner-modal-header">
          <h3 className="planner-step-title" style={{ margin: 0, fontSize: '1.05rem' }}>
            {title || (mode === 'replace' ? 'Swap course' : 'Add course')}
          </h3>
          <button type="button" className="home-icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <input
          className="planner-select"
          placeholder="Search courses…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <ul className="planner-picker-list">
          {filtered.length === 0 ? (
            <li className="text-text-secondary">No matching candidates.</li>
          ) : (
            filtered.map((c) => (
              <li key={c.identifier}>
                <button
                  type="button"
                  className="planner-picker-row"
                  onClick={() => onPick(c.identifier)}
                >
                  <div>
                    <div className="planner-course-id">{c.identifier}</div>
                    <div className="text-text-secondary planner-course-title">
                      {c.title || c.requirement_title || c.program_name || '—'}
                    </div>
                  </div>
                  <div className="planner-course-metrics">
                    <span className={`planner-diff planner-diff--${c.difficulty || 'medium'}`}>
                      {c.difficulty || 'medium'}
                    </span>
                    <span className="text-text-secondary">{c.category || 'core'}</span>
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
};

export default PlannerCoursePicker;
