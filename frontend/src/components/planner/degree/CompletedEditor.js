import React, { useEffect, useMemo, useState } from 'react';
import CloseRounded from '@mui/icons-material/CloseRounded';
import AppDialog from '../../AppDialog';
import { usePageColumn } from '../../shell/PageColumnContext';
import { InlineError, useDebounced } from '../../catalog/CatalogParts';
import { searchCatalog } from '../../../api/campus';
import { useAuth } from '../../../contexts/AuthContext';
import { GRADES, checklistCourses, normalizeCourseId } from '../completedCourses';

const SEARCH_LIMIT = 8;

/**
 * The Completed editor (CEO review O2): the program's checklist, search to
 * add any course, and an optional grade per course. Saves the whole list
 * through `set_profile` `completed`.
 */
export default function CompletedEditor({
  open, onClose, planner, titles = {},
}) {
  const container = usePageColumn();
  const { authToken } = useAuth();
  const profile = planner?.view?.plan?.profile || {};
  const completed = useMemo(() => profile.completed || [], [profile.completed]);
  const programIds = profile.program_ids || [];

  const [rows, setRows] = useState(() => new Map());
  const [extra, setExtra] = useState([]);
  const [names, setNames] = useState({});
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim());
  const [results, setResults] = useState({ status: 'idle', courses: [] });
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // Start from the saved list each time it opens.
  useEffect(() => {
    if (!open) return;
    setRows(new Map(completed.map((c) => [c.id, { id: c.id, grade: c.grade ?? null, term: c.term ?? null }])));
    setExtra([]);
    setQuery('');
    setFailed(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !debounced || !authToken) {
      setResults({ status: 'idle', courses: [] });
      return undefined;
    }
    const controller = new AbortController();
    setResults((current) => ({ ...current, status: 'loading' }));
    searchCatalog(authToken, { q: debounced, limit: SEARCH_LIMIT }, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResults({ status: 'ready', courses: data?.courses || [] });
      })
      .catch((error) => {
        if (!controller.signal.aborted && error?.name !== 'AbortError') setResults({ status: 'error', courses: [] });
      });
    return () => controller.abort();
  }, [open, debounced, authToken]);

  const courses = [...new Set([
    ...checklistCourses(programIds, planner?.programs || [], planner?.view?.report, completed),
    ...extra,
  ])];
  const titleOf = (id) => names[id] || titles[id] || null;

  const toggle = (id) => setRows((current) => {
    const next = new Map(current);
    if (next.has(id)) next.delete(id);
    else next.set(id, { id, grade: null, term: null });
    return next;
  });

  const setGrade = (id, grade) => setRows((current) => {
    const next = new Map(current);
    next.set(id, { ...(next.get(id) || { id, term: null }), grade: grade || null });
    return next;
  });

  const add = (id, title) => {
    const norm = normalizeCourseId(id);
    if (!norm) return;
    if (title) setNames((current) => ({ ...current, [norm]: title }));
    setExtra((current) => (current.includes(norm) ? current : [...current, norm]));
    setRows((current) => (current.has(norm) ? current : new Map(current).set(norm, { id: norm, grade: null, term: null })));
    setQuery('');
  };

  const save = async () => {
    setSaving(true);
    setFailed(false);
    planner.dismissSaveError?.();
    try {
      await planner.edit([{ op: 'set_profile', completed: [...rows.values()] }]);
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const retry = () => {
    if (planner.saveError?.held) {
      planner.retry();
      onClose();
    } else {
      save();
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      container={container}
      aria-labelledby="dg-completed-h"
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { className: 'dg-editor' } }}
    >
      <header className="dg-editor-head">
        <h2 id="dg-completed-h">Completed</h2>
        <button type="button" className="dg-icon-btn" aria-label="Close" title="Close" onClick={onClose}>
          <CloseRounded fontSize="small" aria-hidden="true" />
        </button>
      </header>

      <div className="dg-editor-search">
        <label htmlFor="dg-completed-search" className="sr-only">Search courses</label>
        <input
          id="dg-completed-search"
          type="search"
          value={query}
          autoComplete="off"
          placeholder="Course code or title"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add(query);
            }
          }}
        />
        {results.status === 'ready' && results.courses.length > 0 && (
          <ul className="dg-editor-results" aria-label="Search results">
            {results.courses.map((course) => (
              <li key={course.identifier}>
                <span>
                  <span className="cc-code">{course.identifier}</span>
                  {course.title && <span className="dg-editor-title"> {course.title}</span>}
                </span>
                <button
                  type="button"
                  className="cc-btn"
                  aria-label={`Add ${course.identifier}`}
                  disabled={rows.has(course.identifier)}
                  onClick={() => add(course.identifier, course.title)}
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        )}
        {results.status === 'error' && <InlineError message="Couldn't load" />}
      </div>

      <ul className="dg-editor-list" aria-label="Courses">
        {courses.map((id) => {
          const row = rows.get(id);
          const title = titleOf(id);
          return (
            <li key={id} className="dg-editor-row">
              <label className="dg-editor-check">
                <input type="checkbox" checked={Boolean(row)} onChange={() => toggle(id)} />
                <span className="cc-code">{id}</span>
                {title && <span className="dg-editor-title">{title}</span>}
              </label>
              {row && (
                <select
                  aria-label={`Grade for ${id}`}
                  value={row.grade || ''}
                  onChange={(event) => setGrade(id, event.target.value)}
                >
                  <option value="">Grade</option>
                  {GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                </select>
              )}
            </li>
          );
        })}
      </ul>

      <footer className="dg-editor-foot">
        {failed && <InlineError message="Couldn't save" onRetry={retry} />}
        <button type="button" className="cc-btn cc-btn-primary" onClick={save} disabled={saving}>
          Save
        </button>
      </footer>
    </AppDialog>
  );
}
