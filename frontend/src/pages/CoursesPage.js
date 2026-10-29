import React, {
  Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Search, X } from 'lucide-react';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import CampusPageShell from '../components/catalog/CampusPageShell';
import SaveButton from '../components/SaveButton';
import {
  CoursesTabs, GradesBar, InlineError, NotAvailable, Placeholder, useDebounced, useDelayedFlag,
} from '../components/catalog/CatalogParts';
import {
  MAX_TICKED, askCoursePrompt, askState, compareUrl, formatGpa, formatPct, gradesLabel, levelOf,
  levelOptions, primarySections, readTicked, safeId, sectionName, seatsHeading, seatsText, shortDate,
  sourceName, titleFromSaved, writeTicked,
} from '../components/catalog/catalogFormat';
import { getCatalogCourse, getCatalogStarters, searchCatalog } from '../api/campus';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { useSaved } from '../contexts/SavedContext';
import { usePlanner } from '../contexts/PlannerContext';
import { useOpenCourse } from '../utils/openCourse';
import { useDraggableItem } from '../components/dnd';
import DegreeBoard from '../components/planner/degree/DegreeBoard';
import '../styles/CoursesPage.css';

const SemesterView = lazy(() => import('../components/planner/semester/SemesterView'));

const SEARCH_LIMIT = 20;
const MODES = ['browse', 'degree', 'semester'];
const SECTION_ROWS = 6;
const isAbort = (error) => error?.name === 'AbortError';
const isPhone = () => typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(max-width: 767px)').matches;

/** Starters and saved courses, once each (R6). */
function mergeCourses(...lists) {
  const seen = new Set();
  const out = [];
  lists.flat().forEach((course) => {
    if (!course?.identifier || seen.has(course.identifier)) return;
    seen.add(course.identifier);
    out.push(course);
  });
  return out;
}

function StatTile({ value, label, available }) {
  return (
    <div className="cc-tile">
      {available && value != null ? (
        <>
          <strong className="cc-tile-value">{value}</strong>
          <span className="cc-tile-label">{label}</span>
        </>
      ) : (
        <>
          <strong className="cc-tile-value is-missing">Not available</strong>
          <span className="cc-tile-label">{label}</span>
        </>
      )}
    </div>
  );
}

function CourseChips({ courses, onSelect, label }) {
  return (
    <ul className="cc-chips" aria-label={label}>
      {courses.map((course) => {
        const id = typeof course === 'string' ? course : course.identifier;
        return (
          <li key={id}>
            <button type="button" className="cc-chip" onClick={() => onSelect(id)} aria-label={`Preview ${id}`}>
              <span className="cc-chip-dot" aria-hidden="true" />
              {id}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SectionsBlock({ data, school }) {
  const caps = data.capabilities || {};
  const source = data.source;
  if (caps.sections === false || !('sections' in data)) {
    return (
      <section className="cc-block" aria-labelledby="cc-seats-h">
        <h3 id="cc-seats-h">Sections and seats</h3>
        <NotAvailable school={school} source={source} />
      </section>
    );
  }
  const sections = data.sections;
  if (!sections || !(sections.rows || []).length) {
    return (
      <section className="cc-block" aria-labelledby="cc-seats-h">
        <h3 id="cc-seats-h">Sections and seats</h3>
        <p className="cc-muted">No sections listed for this course.</p>
      </section>
    );
  }
  const rows = sections.seats_published ? primarySections(sections.rows) : sections.rows;
  const shown = rows.slice(0, SECTION_ROWS);
  return (
    <section className="cc-block" aria-labelledby="cc-seats-h">
      <h3 id="cc-seats-h">{seatsHeading(sections)}</h3>
      <ul className="cc-sections">
        {shown.map((row, index) => {
          const seats = sections.seats_published ? seatsText(row, sections.historical) : null;
          const fill = row.capacity ? Math.min(100, Math.round((100 * (row.enrolled || 0)) / row.capacity)) : null;
          return (
            <li key={`${sectionName(row)}-${index}`} className="cc-section-row">
              <span className="cc-section-name">{sectionName(row)}</span>
              {sections.seats_published && fill != null ? (
                <span className="cc-section-fill" aria-hidden="true">
                  <span className={seats === 'Full' ? 'is-full' : ''} style={{ width: `${fill}%` }} />
                </span>
              ) : (
                <span className="cc-section-who">{row.instructors || (row.meetings || []).join(', ')}</span>
              )}
              {seats && <span className={`cc-section-seats ${seats === 'Full' ? 'is-full' : ''}`}>{seats}</span>}
            </li>
          );
        })}
      </ul>
      {rows.length > shown.length && (
        <p className="cc-muted">+{rows.length - shown.length} more {sections.seats_published ? 'lectures' : 'sections'}</p>
      )}
    </section>
  );
}

function CoursePreview({
  data, school, onSelectCourse, onAsk, onDetails, headingRef,
}) {
  const caps = data.capabilities || {};
  const source = data.source;
  const code = data.identifier;
  const title = data.title || '';
  const grades = data.grades;
  const hasGrades = caps.grades !== false && 'grades' in data;
  const instructors = Array.isArray(data.instructors) ? data.instructors : [];
  const labels = grades?.labels || { a: 'A/AB', df: 'D/F' };
  const termSuffix = grades?.term ? `, ${grades.term}` : '';

  return (
    <article className="cc-preview-body" key={code} aria-labelledby="cc-preview-title">
      <header className="cc-preview-head">
        <div className="cc-preview-name">
          <span className="cc-code">{code}</span>
          <h2 id="cc-preview-title" ref={headingRef} tabIndex={-1}>{title || code}</h2>
          {instructors.length > 0 && <p className="cc-muted">Taught by {instructors.slice(0, 3).join(', ')}</p>}
        </div>
        <div className="cc-preview-actions">
          <SaveButton item={{ kind: 'course', key: code, display_name: title ? `${code} ${title}` : code }} />
          <button type="button" className="cc-btn" onClick={() => onDetails(code)}>
            Details
            <span className="sr-only"> {code}</span>
          </button>
          <button type="button" className="cc-btn cc-btn-primary" onClick={() => onAsk(code, title)}>
            <MessageSquare size={16} aria-hidden="true" /> Ask about it
            <span className="sr-only"> {code}</span>
          </button>
        </div>
      </header>

      <div className="cc-tiles">
        <StatTile available={hasGrades && Boolean(grades)} value={formatGpa(grades?.gpa)} label={`avg GPA${termSuffix}`} />
        <StatTile available={hasGrades && Boolean(grades)} value={formatPct(grades?.pct_a)} label={`got ${labels.a}`} />
        <StatTile available={hasGrades && Boolean(grades)} value={formatPct(grades?.pct_df)} label={`got ${labels.df}`} />
      </div>

      <section className="cc-block" aria-labelledby="cc-grades-h">
        <h3 id="cc-grades-h">{grades ? `Grades, ${gradesLabel(grades)}` : 'Grades'}</h3>
        {!hasGrades && <NotAvailable school={school} source={source} />}
        {hasGrades && !grades && <p className="cc-muted">No grade data for this course.</p>}
        {grades && <GradesBar distribution={grades.distribution} label={gradesLabel(grades)} />}
      </section>

      <div className="cc-preview-grid">
        <section className="cc-block" aria-labelledby="cc-prereq-h">
          <h3 id="cc-prereq-h">Prerequisites</h3>
          {caps.prerequisites === false || !('prerequisites' in data) ? (
            <NotAvailable school={school} source={source} />
          ) : !data.prerequisites || (!data.prerequisites.courses?.length && !data.prerequisites.text) ? (
            <p className="cc-muted">No prerequisites listed.</p>
          ) : (
            <div className="cc-prereq">
              {data.prerequisites.courses?.length > 0 && (
                <CourseChips courses={data.prerequisites.courses} onSelect={onSelectCourse} label={`Prerequisites for ${code}`} />
              )}
              {data.prerequisites.text && <p className="cc-prereq-text">{data.prerequisites.text}</p>}
            </div>
          )}
        </section>

        <div className="cc-preview-side">
          <SectionsBlock data={data} school={school} />
          <section className="cc-block" aria-labelledby="cc-next-h">
            <h3 id="cc-next-h">Often taken next</h3>
            {caps.next_courses === false || !('next_courses' in data) ? (
              <NotAvailable school={school} source={source} />
            ) : !data.next_courses?.length ? (
              <p className="cc-muted">No follow-on courses listed.</p>
            ) : (
              <CourseChips courses={data.next_courses.slice(0, 6)} onSelect={onSelectCourse} label={`Often taken after ${code}`} />
            )}
          </section>
        </div>
      </div>

      <p className="cc-footnote">
        Grades, seats and requirements from {sourceName(source)}
        {data.as_of && caps.seats_historical ? ` · as of ${shortDate(data.as_of)}` : ''}
      </p>
    </article>
  );
}

/**
 * A Browse row: a draggable course source (D4). The grip is the keyboard
 * handle; a pointer drag can start anywhere on the row.
 */
export function BrowseRow({
  course, isTicked, isSelected, full, onTick, onOpen,
}) {
  const rowId = `cc-row-${safeId(course.identifier)}`;
  const drag = useDraggableItem({
    type: 'course',
    id: course.identifier,
    title: course.title ? `${course.identifier} ${course.title}` : course.identifier,
    extra: { from: 'browse', credits: course.credits || null },
  });
  const { onPointerDown, onTouchStart } = drag.handleProps;
  return (
    <li
      ref={drag.ref}
      className={`cc-row ${isSelected ? 'is-selected' : ''} ${drag.className}`}
      onPointerDown={onPointerDown}
      onTouchStart={onTouchStart}
    >
      <label className="cc-row-check">
        <input
          type="checkbox"
          checked={isTicked}
          disabled={!isTicked && full}
          onChange={() => onTick(course)}
          aria-labelledby={`cc-tick-word ${rowId}`}
          aria-describedby={!isTicked && full ? 'cc-cap-note' : undefined}
        />
      </label>
      <button
        type="button"
        className="cc-row-main"
        aria-current={isSelected ? 'true' : undefined}
        onClick={() => onOpen(course.identifier)}
      >
        <span id={rowId} className="cc-row-name">
          <span className="cc-code">{course.identifier}</span>
          {course.title && <span className="cc-row-title"> {course.title}</span>}
        </span>
        {course.gpa != null && (
          <span className="cc-row-gpa">
            {formatGpa(course.gpa)}
            <small>GPA</small>
          </span>
        )}
      </button>
      <button
        type="button"
        ref={drag.gripRef}
        {...drag.handleProps}
        className="cc-row-grip"
        aria-label={`Drag ${course.identifier}`}
        title="Drag"
      >
        <DragIndicatorRounded fontSize="small" aria-hidden="true" />
      </button>
    </li>
  );
}

function PreviewPlaceholder() {
  return (
    <div className="cc-preview-body" aria-hidden="true">
      <Placeholder lines={2} className="cc-ph-head" />
      <div className="cc-tiles">
        <span className="cc-tile cc-ph-tile" />
        <span className="cc-tile cc-ph-tile" />
        <span className="cc-tile cc-ph-tile" />
      </div>
      <span className="cc-ph cc-ph-bar" />
    </div>
  );
}

function BrowseView({ tabs }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { authToken } = useAuth();
  const { config } = useAppConfig();
  const saved = useSaved();
  const school = config?.app?.institution || config?.app?.title || 'your school';
  const requested = params.get('selected');

  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim());
  const [level, setLevel] = useState(null);
  const [openOnly, setOpenOnly] = useState(false);
  const [catalog, setCatalog] = useState({ capabilities: null, source: null, asOf: null });
  const [starters, setStarters] = useState({ status: 'loading', courses: [] });
  const [startersTry, setStartersTry] = useState(0);
  const [results, setResults] = useState({ status: 'idle', courses: [], q: '' });
  const [searchTry, setSearchTry] = useState(0);
  const [ticked, setTicked] = useState(readTicked);
  const [selectedId, setSelectedId] = useState(requested || null);
  const [preview, setPreview] = useState({ status: 'idle', data: null });
  const [previewTry, setPreviewTry] = useState(0);
  const [phoneView, setPhoneView] = useState(requested ? 'preview' : 'list');

  const searchRef = useRef(null);
  const chipRefs = useRef([]);
  const focusChip = useRef(null);
  const listScroll = useRef(0);
  const headingRef = useRef(null);

  const learn = useCallback((data) => {
    if (!data) return;
    setCatalog((current) => ({
      capabilities: data.capabilities || current.capabilities,
      source: data.source || current.source,
      asOf: data.capabilities?.seats_historical && data.as_of ? data.as_of : current.asOf,
    }));
  }, []);

  // Starters (R6): courses the school's home page suggests.
  useEffect(() => {
    if (!authToken) return undefined;
    const controller = new AbortController();
    setStarters((current) => ({ ...current, status: 'loading' }));
    getCatalogStarters(authToken, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        learn(data);
        setStarters({ status: 'ready', courses: data?.courses || [] });
      })
      .catch((error) => {
        if (controller.signal.aborted || isAbort(error)) return;
        setStarters({ status: 'error', courses: [], error });
      });
    return () => controller.abort();
  }, [authToken, startersTry, learn]);

  // Search: 300 ms after typing stops; a newer search cancels the one in flight.
  useEffect(() => {
    if (!debounced) {
      setResults({ status: 'idle', courses: [], q: '' });
      return undefined;
    }
    const controller = new AbortController();
    setResults((current) => ({ ...current, status: 'loading', q: debounced }));
    searchCatalog(
      authToken,
      { q: debounced, level: level ?? undefined, open_only: openOnly || undefined, limit: SEARCH_LIMIT },
      { signal: controller.signal },
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        learn(data);
        setResults({ status: 'ready', courses: data?.courses || [], q: debounced, asOf: data?.as_of });
      })
      .catch((error) => {
        if (controller.signal.aborted || isAbort(error)) return;
        setResults({ status: error?.status === 400 ? 'hint' : 'error', courses: [], q: debounced, error });
      });
    return () => controller.abort();
  }, [authToken, debounced, level, openOnly, searchTry, learn]);

  // Preview of the selected course.
  useEffect(() => {
    if (!selectedId || !authToken) return undefined;
    const controller = new AbortController();
    setPreview((current) => ({ ...current, status: 'loading', id: selectedId, error: null }));
    getCatalogCourse(authToken, selectedId, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        learn(data);
        setPreview({ status: 'ready', id: selectedId, data });
      })
      .catch((error) => {
        if (controller.signal.aborted || isAbort(error)) return;
        setPreview({ status: 'error', id: selectedId, data: null, error });
      });
    return () => controller.abort();
  }, [authToken, selectedId, previewTry, learn]);

  useEffect(() => { writeTicked(ticked); }, [ticked]);

  // After a chip is removed, focus the next chip or the search box (29A).
  useEffect(() => {
    if (focusChip.current == null) return;
    const index = focusChip.current;
    focusChip.current = null;
    const next = chipRefs.current[index] || chipRefs.current[index - 1];
    (next || searchRef.current)?.focus();
  }, [ticked]);

  const caps = catalog.capabilities || {};
  const savedCourses = useMemo(() => (saved?.items || [])
    .filter((item) => item.kind === 'course' && item.key)
    .map((item) => ({ identifier: item.key, title: titleFromSaved(item) })), [saved?.items]);

  const mode = debounced ? 'search' : 'start';
  const startList = useMemo(() => mergeCourses(starters.courses, savedCourses)
    .filter((course) => level == null || levelOf(course.identifier) === level)
    .filter((course) => !openOnly || (course.seats_open || 0) > 0), [starters.courses, savedCourses, level, openOnly]);
  const rows = mode === 'search' ? results.courses : startList;
  const listLoading = mode === 'search' ? results.status === 'loading' : starters.status === 'loading';
  const showListPlaceholder = useDelayedFlag(listLoading);
  const showPreviewPlaceholder = useDelayedFlag(preview.status === 'loading');

  // First course previewed when nothing is selected yet (R6).
  // Waits for the list to settle, so a saved course doesn't win over the starters.
  useEffect(() => {
    if (selectedId || listLoading || !rows.length) return;
    setSelectedId(rows[0].identifier);
  }, [rows, selectedId, listLoading]);

  const levels = useMemo(
    () => levelOptions([...rows, ...starters.courses].map((course) => course.identifier)),
    [rows, starters.courses],
  );

  const tickedIds = ticked.map((course) => course.identifier);
  const full = ticked.length >= MAX_TICKED;

  const toggleTick = (course) => {
    setTicked((current) => {
      if (current.some((item) => item.identifier === course.identifier)) {
        return current.filter((item) => item.identifier !== course.identifier);
      }
      if (current.length >= MAX_TICKED) return current;
      return [...current, { identifier: course.identifier, title: course.title || '' }];
    });
  };

  const removeChip = (index) => {
    focusChip.current = index;
    setTicked((current) => current.filter((_, i) => i !== index));
  };

  const openPreview = (id) => {
    setSelectedId(id);
    // The inline preview follows the row; the URL keeps it without a history entry.
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set('selected', id);
      return next;
    }, { replace: true });
    if (isPhone()) {
      listScroll.current = window.scrollY;
      setPhoneView('preview');
      window.scrollTo?.(0, 0);
      setTimeout(() => headingRef.current?.focus(), 0);
    }
  };

  /** The full course pop-up (app-wide host, `?course=`), as a new history entry. */
  const openDetails = useOpenCourse();

  const backToResults = () => {
    setPhoneView('list');
    setTimeout(() => window.scrollTo?.(0, listScroll.current), 0);
  };

  const ask = (code, title) => navigate('/chat', { state: askState(askCoursePrompt(code, title)) });
  const goCompare = () => navigate(compareUrl(tickedIds));
  const clearFilters = () => {
    if (level != null || openOnly) {
      setLevel(null);
      setOpenOnly(false);
    } else {
      setQuery('');
    }
    searchRef.current?.focus();
  };

  const listSource = sourceName(catalog.source);
  // Before any response names the source, the backend's 502 message does.
  const listError = (error) => {
    if (!catalog.source && typeof error?.message === 'string' && error.message.startsWith("Couldn't load")) {
      return error.message;
    }
    return `Couldn't load courses from ${catalog.source ? listSource : 'the course catalog'}`;
  };
  const listAsOf = mode === 'search' ? results.asOf : null;
  const seatChipLabel = `Had open seats${catalog.asOf ? ` (${shortDate(catalog.asOf)})` : ''}`;

  let listBody;
  if (listLoading && showListPlaceholder) {
    listBody = (
      <ul className="cc-rows" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <li key={index} className="cc-row cc-row-ph"><Placeholder lines={2} /></li>
        ))}
      </ul>
    );
  } else if (mode === 'search' && results.status === 'error') {
    listBody = (
      <InlineError message={listError(results.error)} onRetry={() => setSearchTry((n) => n + 1)} />
    );
  } else if (mode === 'start' && starters.status === 'error' && !startList.length) {
    listBody = (
      <InlineError message={listError(starters.error)} onRetry={() => setStartersTry((n) => n + 1)} />
    );
  } else if (mode === 'search' && results.status === 'hint') {
    listBody = <p className="cc-empty">{results.error?.message || `Try a course code at ${school}.`}</p>;
  } else if (!listLoading && rows.length === 0) {
    listBody = mode === 'search' ? (
      <div className="cc-empty">
        <p>No courses match &ldquo;{results.q}&rdquo;</p>
        <button type="button" className="cc-btn" onClick={clearFilters}>
          {level != null || openOnly ? 'Clear filters' : 'Clear search'}
        </button>
      </div>
    ) : (
      <p className="cc-empty">Search by course code or title to get started.</p>
    );
  } else {
    listBody = (
      <ul className="cc-rows">
        {rows.map((course) => (
          <BrowseRow
            key={course.identifier}
            course={course}
            isTicked={tickedIds.includes(course.identifier)}
            isSelected={course.identifier === selectedId}
            full={full}
            onTick={toggleTick}
            onOpen={openPreview}
          />
        ))}
      </ul>
    );
  }

  let previewBody;
  if (preview.status === 'loading' && showPreviewPlaceholder) {
    previewBody = <PreviewPlaceholder />;
  } else if (preview.status === 'error') {
    previewBody = preview.error?.notFound ? (
      <p className="cc-empty">We couldn&apos;t find {preview.id} at {school}.</p>
    ) : (
      <InlineError
        message={`Couldn't load ${preview.id} from ${listSource}`}
        onRetry={() => setPreviewTry((n) => n + 1)}
      />
    );
  } else if (preview.data) {
    previewBody = (
      <CoursePreview
        data={preview.data}
        school={school}
        headingRef={headingRef}
        onSelectCourse={(id) => setSelectedId(id)}
        onAsk={ask}
        onDetails={openDetails}
      />
    );
  } else {
    previewBody = <p className="cc-empty">Pick a course to see grades and seats.</p>;
  }

  return (
    <CampusPageShell className={`cc-courses is-${phoneView}`}>
      <div className="cc-page">
        <header className="cc-page-head">
          <div>
            <p className="cc-kicker">{school}</p>
            <h1>Courses</h1>
          </div>
          {tabs({ count: ticked.length, onCompare: goCompare })}
        </header>

        <div className="cc-browse">
          <section className="cc-list" aria-label="Find courses">
            <div className="cc-search">
              <Search size={18} aria-hidden="true" />
              <label htmlFor="cc-search-input" className="sr-only">Search courses</label>
              <input
                id="cc-search-input"
                ref={searchRef}
                type="search"
                value={query}
                autoComplete="off"
                placeholder="Course code or title"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            <div className="cc-filters" role="group" aria-label="Filters">
              <button
                type="button"
                className={`cc-filter ${level == null ? 'is-on' : ''}`}
                aria-pressed={level == null}
                onClick={() => setLevel(null)}
              >
                Any level
              </button>
              {levels.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`cc-filter ${level === value ? 'is-on' : ''}`}
                  aria-pressed={level === value}
                  onClick={() => setLevel(level === value ? null : value)}
                >
                  {value}s<span className="sr-only"> level</span>
                </button>
              ))}
              {caps.seat_filter && (
                <button
                  type="button"
                  className={`cc-filter ${openOnly ? 'is-on' : ''}`}
                  aria-pressed={openOnly}
                  onClick={() => setOpenOnly((on) => !on)}
                >
                  {seatChipLabel}
                </button>
              )}
            </div>

            {ticked.length > 0 && (
              <div className="cc-ticked">
                <span className="sr-only" id="cc-ticked-label">Ticked to compare</span>
                <ul className="cc-ticked-chips" aria-labelledby="cc-ticked-label">
                  {ticked.map((course, index) => (
                    <li key={course.identifier}>
                      <button
                        type="button"
                        className="cc-ticked-chip"
                        ref={(node) => { chipRefs.current[index] = node; }}
                        aria-label={`Remove ${course.identifier} from compare`}
                        onClick={() => removeChip(index)}
                      >
                        {course.identifier}
                        <X size={14} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
                {full && <p className="cc-cap-note" id="cc-cap-note">Compare up to {MAX_TICKED}</p>}
              </div>
            )}

            <span id="cc-tick-word" className="sr-only">Compare</span>
            {mode === 'start' && <h2 className="cc-list-heading">Start with</h2>}
            {mode === 'search' && <h2 className="sr-only">Results</h2>}
            {listBody}
            {listAsOf && caps.seats_historical && rows.length > 0 && (
              <p className="cc-footnote">As of {shortDate(listAsOf)}</p>
            )}
            <p className="sr-only" role="status" aria-live="polite">
              {mode === 'search' && results.status === 'ready'
                ? `${results.courses.length} ${results.courses.length === 1 ? 'course' : 'courses'} found`
                : ''}
            </p>

            {ticked.length >= 2 && ticked.length <= MAX_TICKED && (
              <div className="cc-tickbar">
                <span>{ticked.length} courses ticked</span>
                <button type="button" className="cc-btn cc-btn-light" onClick={goCompare}>
                  Compare them
                </button>
              </div>
            )}
          </section>

          <section className="cc-preview" aria-label="Course preview" aria-busy={preview.status === 'loading'}>
            <button type="button" className="cc-back" onClick={backToResults}>
              <ArrowLeft size={16} aria-hidden="true" /> Back to results
            </button>
            {previewBody}
          </section>
        </div>
      </div>
    </CampusPageShell>
  );
}

/**
 * Courses: Browse | My degree (design D5), and the semester view at
 * `?view=semester&term=<Term>`. An explicit `?view=` wins; otherwise
 * Browse while the plan is empty and My degree once it holds a course,
 * decided once per visit so the page doesn't flip under the student.
 */
export default function CoursesPage() {
  const planner = usePlanner();
  const { authToken } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const explicit = params.get('view');
  const ensureLoaded = planner?.ensureLoaded;
  const decided = useRef(null);

  useEffect(() => { ensureLoaded?.(); }, [ensureLoaded]);

  let mode = MODES.includes(explicit) ? explicit : null;
  // Links into Browse (a course to preview, a search) land in Browse.
  if (!mode && (params.has('selected') || params.has('q'))) mode = 'browse';
  if (!mode) {
    if (!planner || !authToken) decided.current = decided.current || 'browse';
    else if (!decided.current && (planner.status === 'ready' || planner.status === 'error')) {
      decided.current = planner.view?.plan?.courses?.length ? 'degree' : 'browse';
    }
    mode = decided.current;
  }

  const show = (next) => setParams({ view: next });
  const tabs = ({ count, onCompare }) => (
    <CoursesTabs
      active={mode === 'semester' ? 'degree' : mode}
      count={count}
      onBrowse={() => show('browse')}
      onDegree={planner ? () => show('degree') : undefined}
      onCompare={onCompare}
    />
  );

  if (mode === 'browse') return <BrowseView tabs={tabs} />;

  const ticked = readTicked();
  const goCompare = () => navigate(compareUrl(ticked.map((course) => course.identifier)));
  const head = (
    <>
      <h1 className="sr-only">Courses</h1>
      {tabs({ count: ticked.length, onCompare: goCompare })}
    </>
  );

  let body = null;
  if (mode === 'degree') body = <DegreeBoard head={head} />;
  else if (mode === 'semester') {
    body = (
      <>
        <div className="dg-toolbar">{head}</div>
        <Suspense fallback={null}>
          <SemesterView term={params.get('term')} />
        </Suspense>
      </>
    );
  }

  return (
    <CampusPageShell className={`cc-courses is-${mode || 'loading'}`}>
      <div className="cc-page cc-page-wide">{body}</div>
    </CampusPageShell>
  );
}
