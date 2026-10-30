import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MessageSquare, Plus, Search, X } from '../components/icons';
import CampusPageShell from '../components/catalog/CampusPageShell';
import {
  CoursesTabs, GradesBar, InlineError, NotAvailable, Placeholder, useDebounced,
} from '../components/catalog/CatalogParts';
import {
  MAX_TICKED, askComparePrompt, askState, formatGpa, formatPct, gradesLabel,
  primarySections, readTicked, shortDate, sourceName, writeTicked,
} from '../components/catalog/catalogFormat';
import { getCatalogCourse, searchCatalog } from '../api/campus';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useAuth } from '../contexts/AuthContext';
import '../styles/CoursesPage.css';
import '../styles/CourseComparePage.css';
import { isAbort, useDelayedFlag } from '../utils/loading';

const countOf = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;

const parseIds = (value) => {
  const seen = new Set();
  return (value || '').split(',').map((id) => id.trim()).filter((id) => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, MAX_TICKED);
};

/** One value with its term label underneath (25A); no "better" marking (30A). */
function Value({ value, note, extra }) {
  return (
    <>
      <span className="cmp-value">{value}</span>
      {note && <span className="cmp-note">{note}</span>}
      {extra && <span className="cmp-note">{extra}</span>}
    </>
  );
}

const gradesMissing = (data) => data.capabilities?.grades === false || !('grades' in data);

/** Each row: header text and how one course fills its cell. */
function buildRows(school, labels) {
  const na = (data) => <NotAvailable school={school} source={data.source} />;
  const noGrades = <span className="cmp-note">No grade data for this course</span>;
  const gradeCell = (fn) => (data) => {
    if (gradesMissing(data)) return na(data);
    if (!data.grades) return noGrades;
    return fn(data.grades, data);
  };
  return [
    {
      key: 'gpa',
      label: 'Avg GPA',
      cell: gradeCell((grades, data) => (
        <Value
          value={formatGpa(grades.gpa) ?? '—'}
          note={grades.term}
          extra={data.cumulative?.gpa != null ? `${formatGpa(data.cumulative.gpa)} across all terms` : null}
        />
      )),
    },
    {
      key: 'grades',
      label: 'Grades',
      cell: gradeCell((grades) => (
        <>
          <GradesBar distribution={grades.distribution} label={gradesLabel(grades)} compact />
          {grades.term && <span className="cmp-note">{grades.term}</span>}
        </>
      )),
    },
    {
      key: 'a',
      label: `Got ${labels.a}`,
      cell: gradeCell((grades) => <Value value={formatPct(grades.pct_a) ?? '—'} note={grades.term} />),
    },
    {
      key: 'df',
      label: `Got ${labels.df}`,
      cell: gradeCell((grades) => <Value value={formatPct(grades.pct_df) ?? '—'} note={grades.term} />),
    },
    {
      key: 'students',
      label: 'Students',
      cell: gradeCell((grades) => (
        <Value value={grades.students ? grades.students.toLocaleString('en-US') : '—'} note={grades.term} />
      )),
    },
    {
      key: 'seats',
      label: 'Seats',
      cell: (data) => {
        if (data.capabilities?.sections === false || !('sections' in data)) return na(data);
        const sections = data.sections;
        if (!sections || !(sections.rows || []).length) return <span className="cmp-note">No sections listed</span>;
        const term = sections.term || 'Current term';
        if (!sections.seats_published) {
          return <Value value="Seats not published" note={`${term} · ${countOf(sections.rows.length, 'section')}`} />;
        }
        const primary = primarySections(sections.rows);
        const kind = primary.some((row) => /^LEC/i.test(row.type || '')) ? 'lecture' : 'section';
        const note = sections.historical
          ? `${term} · as of ${shortDate(sections.as_of) || 'snapshot'}`
          : `${term} · ${countOf(primary.length, kind)}`;
        return <Value value={sections.seats_open == null ? 'Not listed' : `${sections.seats_open} open`} note={note} />;
      },
    },
  ];
}

function AddCourse({ ids, suggestions, suggestFrom, onAdd, inputRef, authToken, school }) {
  const [query, setQuery] = useState('');
  const settled = useDebounced(query.trim());
  const [state, setState] = useState({ status: 'idle', courses: [] });
  const [attempt, setAttempt] = useState(0);
  const showPlaceholder = useDelayedFlag(state.status === 'loading');

  useEffect(() => {
    if (!settled) {
      setState({ status: 'idle', courses: [] });
      return undefined;
    }
    const controller = new AbortController();
    setState((current) => ({ ...current, status: 'loading' }));
    searchCatalog(authToken, { q: settled, limit: 8 }, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', courses: data?.courses || [], source: data?.source });
      })
      .catch((error) => {
        if (controller.signal.aborted || isAbort(error)) return;
        setState({ status: error?.status === 400 ? 'hint' : 'error', courses: [], error });
      });
    return () => controller.abort();
  }, [authToken, settled, attempt]);

  const list = settled ? state.courses : suggestions;
  const options = list.filter((course) => !ids.includes(course.identifier));

  return (
    <section className="cmp-add" aria-labelledby="cmp-add-h">
      <h2 id="cmp-add-h">Add a course</h2>
      <div className="cc-search">
        <Search size={18} aria-hidden="true" />
        <label htmlFor="cmp-add-input" className="sr-only">Add a course: code or title</label>
        <input
          id="cmp-add-input"
          ref={inputRef}
          type="search"
          autoComplete="off"
          placeholder="Code or title"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {!settled && options.length > 0 && <p className="cmp-add-label">Often taken after {suggestFrom}</p>}
      {state.status === 'loading' && showPlaceholder && <Placeholder lines={3} />}
      {settled && state.status === 'error' && (
        <InlineError
          message={`Couldn't load courses from ${sourceName(state.source)}`}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      )}
      {settled && state.status === 'hint' && <p className="cc-muted">{state.error?.message || `Try a course code at ${school}.`}</p>}
      {settled && state.status === 'ready' && options.length === 0 && (
        <p className="cc-muted">No courses match &ldquo;{settled}&rdquo;</p>
      )}
      {options.length > 0 && state.status !== 'loading' && (
        <ul className="cmp-add-list">
          {options.slice(0, 6).map((course) => (
            <li key={course.identifier}>
              <button
                type="button"
                className="cmp-add-item"
                aria-label={`Add ${course.identifier} to compare`}
                onClick={() => { setQuery(''); onAdd(course); }}
              >
                <Plus size={16} aria-hidden="true" />
                <span>{course.identifier}</span>
                {course.title && <span className="cmp-add-title">{course.title}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function CourseComparePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { authToken } = useAuth();
  const { config } = useAppConfig();
  const school = config?.app?.institution || config?.app?.title || 'your school';
  const ids = useMemo(() => parseIds(params.get('ids')), [params]);
  const idsKey = ids.join(',');

  const [columns, setColumns] = useState({});
  const controllers = useRef(new Map());
  const requested = useRef(new Set());
  const removeRefs = useRef({});
  const addRef = useRef(null);
  const pendingFocus = useRef(null);
  const anyLoading = ids.some((id) => !columns[id] || columns[id].status === 'loading');
  const showPlaceholder = useDelayedFlag(anyLoading);

  const load = useCallback((id) => {
    controllers.current.get(id)?.abort();
    const controller = new AbortController();
    controllers.current.set(id, controller);
    setColumns((current) => ({ ...current, [id]: { status: 'loading', data: current[id]?.data } }));
    getCatalogCourse(authToken, id, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setColumns((current) => ({ ...current, [id]: { status: 'ready', data } }));
      })
      .catch((error) => {
        if (controller.signal.aborted || isAbort(error)) return;
        setColumns((current) => ({ ...current, [id]: { status: 'error', error } }));
      });
  }, [authToken]);

  useEffect(() => {
    if (!authToken) return;
    ids.forEach((id) => {
      if (requested.current.has(id)) return;
      requested.current.add(id);
      load(id);
    });
    // idsKey stands in for ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, authToken, load]);

  useEffect(() => {
    const map = controllers.current;
    const seen = requested.current;
    // Forget what was requested too, so a remount (StrictMode does one) loads again.
    return () => {
      map.forEach((controller) => controller.abort());
      seen.clear();
    };
  }, []);

  // Removing a column moves focus to the next column, else "Add a course".
  useEffect(() => {
    if (pendingFocus.current == null) return;
    const index = pendingFocus.current;
    pendingFocus.current = null;
    const next = ids.length >= 2 ? removeRefs.current[ids[index]] : null;
    (next || addRef.current)?.focus();
  }, [idsKey, ids]);

  const titleOf = (id) => columns[id]?.data?.title || readTicked().find((c) => c.identifier === id)?.title || '';

  const setIds = (next) => {
    writeTicked(next.map((id) => ({ identifier: id, title: titleOf(id) })));
    setParams(next.length ? { ids: next.join(',') } : {}, { replace: true });
  };

  // Keep Browse's ticks in step with what is on screen.
  useEffect(() => {
    writeTicked(ids.map((id) => ({ identifier: id, title: titleOf(id) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, columns]);

  const remove = (index) => {
    pendingFocus.current = index;
    setIds(ids.filter((_, i) => i !== index));
  };

  const add = (course) => {
    if (ids.includes(course.identifier) || ids.length >= MAX_TICKED) return;
    if (course.title) {
      writeTicked([...ids.map((id) => ({ identifier: id, title: titleOf(id) })), { identifier: course.identifier, title: course.title }]);
    }
    setIds([...ids, course.identifier]);
  };

  const ready = ids.map((id) => columns[id]).filter((col) => col?.status === 'ready');
  const firstGrades = ready.find((col) => col.data.grades)?.data.grades;
  const labels = firstGrades?.labels || { a: 'A/AB', df: 'D/F' };
  const rows = buildRows(school, labels);
  const source = ready[0]?.data.source;
  const first = ids[0] && columns[ids[0]]?.data;
  const suggestions = (first?.next_courses || []).map((course) => (
    typeof course === 'string' ? { identifier: course } : course
  ));
  const enough = ids.length >= 2;

  const askCompare = () => navigate('/chat', { state: askState(askComparePrompt(ids)) });

  const addPanel = ids.length < MAX_TICKED ? (
    <AddCourse
      ids={ids}
      suggestions={suggestions}
      suggestFrom={ids[0]}
      onAdd={add}
      inputRef={addRef}
      authToken={authToken}
      school={school}
    />
  ) : (
    <p className="cmp-add cmp-add-full">Compare up to {MAX_TICKED}. Remove one to add another.</p>
  );

  return (
    <CampusPageShell className="cc-compare">
      <div className="cc-page">
        <header className="cc-page-head">
          <div>
            <p className="cc-kicker">{school}</p>
            <h1>Compare courses</h1>
          </div>
          <CoursesTabs
            active="compare"
            count={ids.length}
            onBrowse={() => navigate('/courses?view=browse')}
            onDegree={() => navigate('/courses?view=degree')}
          />
        </header>

        {!enough ? (
          <div className="cmp-layout">
            <div className="cmp-empty">
              <p>Tick at least 2 courses to compare.</p>
              <Link className="cc-btn" to="/courses?view=browse">Back to Browse</Link>
            </div>
            {addPanel}
          </div>
        ) : (
          <div className="cmp-layout">
            <div className="cmp-scroll" role="region" aria-label="Comparison table" tabIndex={0}>
              <table className="cmp-table">
                <caption className="sr-only">Comparing {ids.join(', ')}</caption>
                <thead>
                  <tr>
                    <td className="cmp-corner" />
                    {ids.map((id, index) => {
                      const col = columns[id];
                      return (
                        <th key={id} scope="col" className="cmp-col-head">
                          <div className="cmp-col-name">
                            <span className="cc-code">{col?.data?.identifier || id}</span>
                            <span className="cmp-col-title">{col?.data?.title || titleOf(id)}</span>
                          </div>
                          <button
                            type="button"
                            className="cmp-remove"
                            ref={(node) => { removeRefs.current[id] = node; }}
                            aria-label={`Remove ${id} from compare`}
                            onClick={() => remove(index)}
                          >
                            <X size={16} aria-hidden="true" />
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={row.key}>
                      <th scope="row" className="cmp-row-head">{row.label}</th>
                      {ids.map((id) => {
                        const col = columns[id];
                        if (col?.status === 'error') {
                          if (rowIndex > 0) return null;
                          return (
                            <td key={id} rowSpan={rows.length} className="cmp-cell cmp-cell-error">
                              <InlineError
                                message={col.error?.notFound
                                  ? `We couldn't find ${id} at ${school}`
                                  : `Couldn't load ${id} from ${sourceName(source)}`}
                                onRetry={col.error?.notFound ? null : () => load(id)}
                                retryLabel="Retry"
                              />
                            </td>
                          );
                        }
                        if (col?.status !== 'ready') {
                          return (
                            <td key={id} className="cmp-cell" aria-busy="true">
                              {showPlaceholder ? <Placeholder lines={2} /> : null}
                            </td>
                          );
                        }
                        return <td key={id} className="cmp-cell">{row.cell(col.data)}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {addPanel}
          </div>
        )}

        {enough && (
          <div className="cmp-ask">
            <MessageSquare size={18} aria-hidden="true" />
            <p>Want a plain-English take on which fits your semester?</p>
            <button type="button" className="cc-btn cc-btn-primary" onClick={askCompare}>
              Ask Campus Companion
              <span className="sr-only"> to compare {ids.join(', ')}</span>
            </button>
          </div>
        )}
        {source && (
          <p className="cc-footnote">
            Grades and seats from {sourceName(source)}
            {ready.some((col) => col.data.capabilities?.seats_historical && col.data.as_of)
              ? ` · as of ${shortDate(ready.find((col) => col.data.as_of)?.data.as_of)}`
              : ''}
          </p>
        )}
      </div>
    </CampusPageShell>
  );
}

