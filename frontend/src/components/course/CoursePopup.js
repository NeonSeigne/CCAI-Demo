import React, {
  useEffect, useId, useMemo, useState,
} from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import SaveButton from '../SaveButton';
import {
  useCourseDetail, useCoursePreview, useCourseRatings,
} from '../../hooks/useCampusDetail';
import {
  gradeSegments, primarySections, sectionName, seatsText,
} from '../catalog/catalogFormat';
import PrereqWeb from './PrereqWeb';
import {
  CouldntLoad, DragGrip, isNotFound, NotFound, usePopupDrag,
} from '../popup/PopupParts';
import {
  creditsHigh, creditsText, difficultyOf, DIFFICULTY_LABEL, gpaText, nameKey, pctText,
  prereqCourses, termShort,
} from './popupFormat';
import '../../styles/Popups.css';

/**
 * The course pop-up's body (r5-course-1 / r5-course-2): black band with the
 * five big numbers, Grades / Instructors / Sections tabs, and the Fits and
 * prerequisite-web tiles. The dialog shell is the host's (CoursePopupHost).
 *
 * D7: a field the school lacks is not rendered (tile, tab, row or number);
 * a failed request shows "Couldn't load · Retry". Skeletons cover only the
 * band, the numbers and the Grades tab.
 *
 * Props
 *   courseId                    the catalog identifier ("COMP SCI 400")
 *   term                        the planning term ("Spring 2027"), for the band and Add / Fits
 *   plan                        {revision} when a plan is loaded: enables the Fits tile
 *   requirements                requirement chip labels ("Comp Sci B.S. · Core")
 *   onAdd(id) / onAsk(item) / onClose()   action callbacks; a missing one hides its button
 *   onSave(item), saved         optional; without onSave the shared SaveButton is used
 *   onOpenCourse(id)            another course from the prerequisite web
 *   titleId                     id for the title, for the host's aria-labelledby
 */

const BAND_LOW = 12;
const BAND_HIGH = 18;
const SCALE_MAX = 24;

export { CouldntLoad };

const NONE = [];

function Clamp({ text, lines = 2, className = '' }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > lines * 110 || text.split('\n').length > lines;
  return (
    <div className={className}>
      <p className={`pop-clamp ${open ? '' : 'is-clamped'}`} style={{ '--pop-lines': lines }}>{text}</p>
      {long && (
        <button type="button" className="pop-more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? 'Less' : 'More'}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Band

function BigNumber({ label, children, tone }) {
  return (
    <div className="pop-number">
      <span className="pop-number-label">{label}</span>
      <span className={`pop-number-value ${tone ? `is-${tone}` : ''}`.trim()}>{children}</span>
    </div>
  );
}

function bigNumbers(data) {
  const grades = data.grades || null;
  const sections = data.sections || null;
  const out = [];
  const gradeTerm = grades?.term ? ` · ${termShort(grades.term)}` : '';
  const gpa = gpaText(grades?.gpa);
  if (gpa) {
    const level = difficultyOf(grades.gpa);
    out.push(
      <BigNumber key="gpa" label={`Avg GPA${gradeTerm}`} tone={level}>
        {gpa}
        {level && <small> {DIFFICULTY_LABEL[level]}</small>}
      </BigNumber>,
    );
  }
  const pctA = pctText(grades?.pct_a);
  if (pctA) out.push(<BigNumber key="a" label="Got an A" tone="a">{pctA}</BigNumber>);
  const pctDf = pctText(grades?.pct_df);
  if (pctDf) out.push(<BigNumber key="df" label="D or F" tone="df">{pctDf}</BigNumber>);
  if (sections?.seats_published && sections.seats_open != null) {
    const rows = primarySections(sections.rows || []);
    const capacity = rows.every((row) => row.capacity != null)
      ? rows.reduce((sum, row) => sum + Number(row.capacity || 0), 0)
      : null;
    const when = sections.historical && sections.term ? ` · ${termShort(sections.term)}` : '';
    out.push(
      <BigNumber key="seats" label={`Seats left${when}`}>
        {sections.seats_open.toLocaleString('en-US')}
        {capacity ? <small> of {capacity.toLocaleString('en-US')}</small> : null}
      </BigNumber>,
    );
  }
  if (grades?.students) {
    out.push(
      <BigNumber key="students" label={`Students${gradeTerm}`}>
        {Number(grades.students).toLocaleString('en-US')}
      </BigNumber>,
    );
  }
  return out;
}

function Band({
  data, courseId, term, requirements, onAdd, onSave, saved, onAsk, onClose, titleId,
}) {
  const id = data?.identifier || courseId;
  const credits = creditsText(data?.credits);
  const eyebrow = [id, credits ? `${credits} credits` : null, term].filter(Boolean).join(' · ');
  const item = { type: 'course', id, title: data?.title || '' };
  const chips = [
    ...(requirements || []).map((label) => ({ label, kind: 'req' })),
    ...(data?.gen_ed || []).map((label) => ({ label, kind: 'gen' })),
  ];
  const numbers = data ? bigNumbers(data) : null;
  const drag = usePopupDrag(item);

  return (
    <header ref={drag.ref} className={`pop-band ${drag.className}`}>
      <div className="pop-band-top">
        <DragGrip drag={drag} label={`Drag ${id}`} />
        <div className="pop-band-text">
          <p className="pop-eyebrow">{eyebrow}</p>
          {data ? (
            <h2 id={titleId} className="pop-title">{data.title || id}</h2>
          ) : (
            <h2 id={titleId} className="pop-title"><span className="sr-only">{id}</span><span className="pop-skel pop-skel--title" /></h2>
          )}
          {data ? (
            <Clamp text={data.description} lines={2} className="pop-desc" />
          ) : (
            <span className="pop-skel pop-skel--line" />
          )}
          {chips.length > 0 && (
            <ul className="pop-chips">
              {chips.map((chip) => (
                <li key={`${chip.kind}-${chip.label}`} className={`pop-chip pop-chip--${chip.kind}`}>{chip.label}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="pop-actions">
          {onAdd && term && (
            <button type="button" className="pop-btn pop-btn--primary" onClick={() => onAdd(id)}>
              <Plus size={15} aria-hidden="true" /> Add to {term}
            </button>
          )}
          {onSave ? (
            <button type="button" className="pop-btn" aria-pressed={Boolean(saved)} onClick={() => onSave(item)}>
              {saved ? 'Saved' : 'Save'}
            </button>
          ) : (
            <SaveButton className="pop-save" item={{ kind: 'course', key: id, display_name: id }} />
          )}
          {onAsk && (
            <button type="button" className="pop-btn" onClick={() => onAsk(item)}>Ask</button>
          )}
          {onClose && (
            <button type="button" className="pop-icon-btn" aria-label="Close" title="Close" onClick={onClose}>
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {numbers === null && (
        <div className="pop-numbers" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((n) => (
            <div key={n} className="pop-number"><span className="pop-skel pop-skel--label" /><span className="pop-skel pop-skel--number" /></div>
          ))}
        </div>
      )}
      {numbers && numbers.length > 0 && <div className="pop-numbers">{numbers}</div>}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Grades tab

/** Average GPA by term, each point and the segment into it coloured by difficulty. */
export function GpaByTerm({ history }) {
  const titleId = useId();
  const points = (history || []).filter((row) => row && row.gpa != null);
  if (!points.length) return null;
  const width = 600;
  const height = 230;
  const pad = { left: 36, right: 24, top: 26, bottom: 44 };
  const values = points.map((p) => Number(p.gpa));
  const lo = Math.min(2.8, Math.floor((Math.min(...values) - 0.1) * 5) / 5);
  const hi = Math.max(3.6, Math.ceil((Math.max(...values) + 0.1) * 5) / 5);
  const x = (i) => (points.length === 1
    ? (pad.left + width - pad.right) / 2
    : pad.left + (i * (width - pad.left - pad.right)) / (points.length - 1));
  const y = (v) => pad.top + ((hi - v) * (height - pad.top - pad.bottom)) / (hi - lo);
  const ticks = [];
  for (let t = lo; t <= hi + 1e-9; t += 0.2) ticks.push(Number(t.toFixed(1)));
  const right = width - pad.right;

  return (
    <section className="pop-tile cp-gpa" aria-labelledby={titleId}>
      <div className="pop-tile-head">
        <h3 id={titleId} className="pop-tile-title">Average GPA by term</h3>
        <ul className="cp-legend" aria-hidden="true">
          <li className="is-easier">Easier</li>
          <li className="is-typical">Typical</li>
          <li className="is-harder">Harder</li>
        </ul>
      </div>
      <svg className="cp-gpa-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden="true" focusable="false">
        <rect className="cp-zone is-easier" x={pad.left} y={y(hi)} width={right - pad.left} height={Math.max(0, y(3.4) - y(hi))} />
        <rect className="cp-zone is-harder" x={pad.left} y={y(3.0)} width={right - pad.left} height={Math.max(0, y(lo) - y(3.0))} />
        {ticks.map((t) => (
          <g key={t}>
            <line className="cp-grid" x1={pad.left} x2={right} y1={y(t)} y2={y(t)} />
            <text className="cp-axis" x={pad.left - 8} y={y(t) + 4} textAnchor="end">{t.toFixed(1)}</text>
          </g>
        ))}
        {points.slice(1).map((p, i) => (
          <line
            key={`seg-${p.term}`}
            className={`cp-seg is-${difficultyOf(p.gpa)}`}
            x1={x(i)}
            y1={y(points[i].gpa)}
            x2={x(i + 1)}
            y2={y(p.gpa)}
          />
        ))}
        {points.map((p, i) => (
          <g key={p.term}>
            <circle className={`cp-dot is-${difficultyOf(p.gpa)}`} cx={x(i)} cy={y(p.gpa)} r="5" />
            <text className={`cp-value is-${difficultyOf(p.gpa)}`} x={x(i)} y={y(p.gpa) - 10} textAnchor="middle">
              {gpaText(p.gpa)}
            </text>
            <text className="cp-axis" x={x(i)} y={height - 24} textAnchor="middle">{termShort(p.term)}</text>
            {p.students ? (
              <text className="cp-axis cp-axis--soft" x={x(i)} y={height - 10} textAnchor="middle">{p.students}</text>
            ) : null}
          </g>
        ))}
      </svg>
      <ul className="sr-only">
        {points.map((p) => (
          <li key={p.term}>{`${p.term}: ${gpaText(p.gpa)}${p.students ? `, ${p.students} students` : ''}`}</li>
        ))}
      </ul>
    </section>
  );
}

const DF_KEYS = new Set(['d', 'f', 'dfw', 'd+', 'd-', 'w']);

/** The grade distribution with a term picker (latest term, all terms). */
export function GradeDistribution({ grades, cumulative }) {
  const titleId = useId();
  const options = [];
  if (grades?.distribution && gradeSegments(grades.distribution).length) {
    options.push({ id: 'term', label: grades.term ? termShort(grades.term) : 'Latest', distribution: grades.distribution });
  }
  if (cumulative?.distribution && gradeSegments(cumulative.distribution).length) {
    options.push({ id: 'all', label: 'All terms', distribution: cumulative.distribution });
  }
  const [picked, setPicked] = useState(null);
  const current = options.find((o) => o.id === picked) || options[0];
  if (!current) return null;
  const segments = gradeSegments(current.distribution);
  const top = Math.max(...segments.map((s) => s.pct));

  return (
    <section className="pop-tile cp-dist" aria-labelledby={titleId}>
      <div className="pop-tile-head">
        <h3 id={titleId} className="pop-tile-title">Grades</h3>
        {options.length > 1 && (
          <div className="pop-seg" role="group" aria-label="Term">
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                className="pop-seg-btn"
                aria-pressed={o.id === current.id}
                onClick={() => setPicked(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <ol className="cp-bars">
        {segments.map((s) => (
          <li key={s.key} className={`cp-bar ${DF_KEYS.has(s.key.toLowerCase()) ? 'is-df' : ''}`.trim()}>
            <span className="cp-bar-pct">{`${Math.round(s.pct)}%`}</span>
            <span className="cp-bar-fill" style={{ height: `${Math.max(2, (s.pct / top) * 100)}%` }} />
            <span className="cp-bar-label">{s.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function GradesSkeleton() {
  return (
    <div className="cp-grades" aria-hidden="true">
      <div className="pop-tile"><span className="pop-skel pop-skel--chart" /></div>
      <div className="pop-tile"><span className="pop-skel pop-skel--chart" /></div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Instructors tab

export function instructorRows(gradesRows, ratings) {
  const rows = (gradesRows || []).map((row) => ({ name: row.name, gpa: row.gpa, students: row.students }));
  const byKey = new Map(rows.map((row) => [nameKey(row.name), row]));
  (ratings || []).forEach((rating) => {
    const key = nameKey(rating.name);
    const row = byKey.get(key);
    if (row) row.rating = rating;
    else {
      const added = { name: rating.name, rating };
      rows.push(added);
      byKey.set(key, added);
    }
  });
  return rows;
}

export function InstructorsTab({ rows }) {
  const top = Math.max(1, ...rows.map((r) => Number(r.students) || 0));
  return (
    <section className="pop-tile" aria-label="Instructors">
      <ul className="cp-instructors">
        {rows.map((row) => {
          const level = difficultyOf(row.gpa);
          const rating = row.rating;
          return (
            <li key={row.name} className="cp-instructor">
              <span className="cp-instructor-name">{row.name}</span>
              {row.students ? (
                <span className="cp-instructor-bar" aria-hidden="true">
                  <span style={{ width: `${(100 * Number(row.students)) / top}%` }} />
                </span>
              ) : <span />}
              {row.students ? <span className="cp-instructor-meta">{`${Number(row.students).toLocaleString('en-US')} students`}</span> : <span />}
              {rating && rating.rating != null ? (
                <span className="cp-instructor-rating">
                  {rating.url ? (
                    <a href={rating.url} target="_blank" rel="noopener noreferrer">{`★ ${Number(rating.rating).toFixed(1)}`}</a>
                  ) : `★ ${Number(rating.rating).toFixed(1)}`}
                  {rating.num_ratings ? <small>{` (${rating.num_ratings})`}</small> : null}
                </span>
              ) : <span />}
              {gpaText(row.gpa) ? (
                <span className={`cp-instructor-gpa is-${level}`}>{gpaText(row.gpa)}</span>
              ) : <span />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sections tab

export function SectionsTab({ sections }) {
  const historical = sections.historical;
  return (
    <section className="pop-tile" aria-label="Sections">
      <ul className="cp-sections">
        {(sections.rows || []).map((row, index) => {
          const meetings = (row.meetings || []).filter(Boolean).join(', ');
          const seats = sections.seats_published ? seatsText(row, historical) : null;
          const filled = row.enrolled != null && row.capacity ? Math.min(100, (100 * row.enrolled) / row.capacity) : null;
          const sub = [row.instructors, row.bldg].filter(Boolean).join(' · ');
          return (
            <li key={`${row.type}-${row.section}-${index}`} className="cp-section">
              <div className="cp-section-head">
                <strong>{[sectionName(row), meetings].filter(Boolean).join(' · ')}</strong>
                {seats && <span className="cp-section-seats">{seats}</span>}
              </div>
              {sub && <p className="cp-section-sub">{sub}</p>}
              {filled != null && (
                <>
                  <span className="cp-seatbar" aria-hidden="true"><span style={{ width: `${filled}%` }} /></span>
                  <p className="cp-section-sub">
                    {`${row.enrolled} of ${row.capacity}`}
                    {historical && sections.term ? ` · ${sections.term}` : ''}
                  </p>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Right column

const LOAD_TONE = { Heavy: 'harder', Light: 'easier' };
const fmtCredits = (value) => creditsText(value);

/** A failed preview: shown for a server or network failure, hidden for 404 / 409 / 422. */
export const previewFailed = (error) => Boolean(error) && (error.network || error.status >= 500);

export function FitsTile({
  diff, courseId, term, error, onRetry,
}) {
  if (!diff && previewFailed(error)) {
    return (
      <section className="pop-tile cp-fits" aria-labelledby="cp-fits-title">
        <h3 id="cp-fits-title" className="pop-tile-title">{term ? `Fits ${term}` : 'Fits'}</h3>
        <CouldntLoad onRetry={onRetry} />
      </section>
    );
  }
  if (!diff) return null;
  const before = diff.credits?.before;
  const after = diff.credits?.after;
  const afterHigh = creditsHigh(after);
  const rows = [];
  const load = diff.difficulty;
  if (load?.after) {
    rows.push(
      <div key="load" className="cp-fit-row">
        <span>Load</span>
        <span>
          {load.before && load.before !== load.after ? `${load.before} → ` : ''}
          <strong className={LOAD_TONE[load.after] ? `is-${LOAD_TONE[load.after]}` : ''}>{load.after}</strong>
        </span>
      </div>,
    );
  }
  const clash = diff.clashes;
  if (clash && ['none', 'found'].includes(clash.after) && clash.before !== 'unknown') {
    rows.push(
      <div key="clash" className="cp-fit-row">
        <span>Clashes</span>
        <strong className={clash.after === 'found' ? 'is-harder' : ''}>{clash.after === 'found' ? 'Clash' : 'None'}</strong>
      </div>,
    );
  }
  const added = (diff.added_courses || []).find((row) => row?.id === courseId);
  const prereq = added?.prereqs?.status;
  if (prereq === 'met' || prereq === 'short') {
    rows.push(
      <div key="prereq" className="cp-fit-row">
        <span>Prerequisites</span>
        <strong className={prereq === 'met' ? 'is-easier' : 'is-harder'}>{prereq === 'met' ? '✓ Met' : 'Short'}</strong>
      </div>,
    );
  }
  (diff.rules || []).forEach((rule) => {
    const done = (side) => (side ? (Number(side.completed) || 0) + (Number(side.planned) || 0) : null);
    const b = done(rule.before);
    const a = done(rule.after);
    if (a == null) return;
    const needed = rule.after?.needed;
    rows.push(
      <div key={`rule-${rule.rule_id || rule.title}`} className="cp-fit-row">
        <span>{rule.title}</span>
        <span>
          {b != null && b !== a ? `${b} → ` : ''}
          <strong>{needed ? `${a} of ${needed}` : a}</strong>
        </span>
      </div>,
    );
  });
  if (after == null && !rows.length) return null;
  const pct = (v) => `${Math.min(100, (100 * v) / SCALE_MAX)}%`;

  return (
    <section className="pop-tile cp-fits" aria-labelledby="cp-fits-title">
      <h3 id="cp-fits-title" className="pop-tile-title">{term ? `Fits ${term}` : 'Fits'}</h3>
      {after != null && (
        <>
          <p className="cp-fits-credits">
            {before != null && <span className="cp-fits-before">{fmtCredits(before)}</span>}
            {before != null && <span aria-hidden="true"> → </span>}
            <span className="cp-fits-after">{fmtCredits(after)}</span>
            <small> credits</small>
            <span className="cp-fits-band">{`${BAND_LOW}–${BAND_HIGH}`}</span>
          </p>
          <div
            className="cp-band"
            role="meter"
            aria-label="Credits"
            aria-valuemin={0}
            aria-valuemax={SCALE_MAX}
            aria-valuenow={afterHigh ?? 0}
          >
            <span className="cp-band-ok" style={{ left: pct(BAND_LOW), width: `${(100 * (BAND_HIGH - BAND_LOW)) / SCALE_MAX}%` }} />
            <span className="cp-band-fill" style={{ width: pct(afterHigh ?? 0) }} />
          </div>
        </>
      )}
      {rows}
    </section>
  );
}

function WebTile({
  course, tree, unlocks, onOpenCourse, onExpand,
}) {
  return (
    <section className="pop-tile cp-web-tile" aria-labelledby="cp-web-title">
      <div className="pop-tile-head">
        <h3 id="cp-web-title" className="pop-tile-title">{tree ? 'Prerequisites' : 'Unlocks'}</h3>
        <button type="button" className="pop-chevron" aria-label="Open the full prerequisite graph" title="Full graph" onClick={onExpand}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <PrereqWeb course={course} tree={tree} unlocks={tree ? NONE : unlocks} onOpenCourse={onOpenCourse} />
    </section>
  );
}

// ---------------------------------------------------------------------------

function useTabs(available) {
  const [tab, setTab] = useState(null);
  const current = available.includes(tab) ? tab : available[0] || null;
  return [current, setTab];
}

const TAB_LABELS = { grades: 'Grades', instructors: 'Instructors', sections: 'Sections' };

export default function CoursePopup({
  courseId,
  term,
  plan,
  requirements,
  onAdd,
  onSave,
  saved,
  onAsk,
  onClose,
  onOpenCourse,
  titleId = 'course-popup-title',
}) {
  const detail = useCourseDetail(courseId);
  const data = detail.data;
  const id = data?.identifier || courseId;
  const ratings = useCourseRatings(id, Boolean(data));
  const preview = useCoursePreview(id, { revision: plan?.revision, enabled: Boolean(data && plan) });
  const [fullGraph, setFullGraph] = useState(false);

  useEffect(() => { setFullGraph(false); }, [courseId]);

  const instructors = useMemo(
    () => instructorRows(data?.instructor_grades, ratings.data?.ratings),
    [data, ratings.data],
  );
  const history = (data?.grade_history || []).filter((row) => row?.gpa != null);
  const hasGrades = Boolean(history.length || (data?.grades && gradeSegments(data.grades.distribution).length));
  const sectionRows = data?.sections?.rows || [];
  const tree = data?.prereq_tree && prereqCourses(data.prereq_tree).length ? data.prereq_tree : null;
  const unlocks = data?.next_courses?.length ? data.next_courses : NONE;

  const available = [];
  if (hasGrades) available.push('grades');
  if (instructors.length) available.push('instructors');
  if (sectionRows.length) available.push('sections');
  const [tab, setTab] = useTabs(available);
  const counts = { instructors: instructors.length, sections: sectionRows.length };

  const band = (
    <Band
      data={data}
      courseId={courseId}
      term={term}
      requirements={requirements}
      onAdd={onAdd}
      onSave={onSave}
      saved={saved}
      onAsk={onAsk}
      onClose={onClose}
      titleId={titleId}
    />
  );

  if (detail.error) {
    const missing = isNotFound(detail.error);
    return (
      <article className="pop cp" aria-labelledby={titleId}>
        <header className="pop-band">
          <div className="pop-band-top">
            <div className="pop-band-text">
              <p className="pop-eyebrow">{courseId}</p>
              <h2 id={titleId} className="pop-title">{courseId}</h2>
            </div>
            <div className="pop-actions">
              {onClose && (
                <button type="button" className="pop-icon-btn" aria-label="Close" title="Close" onClick={onClose}>
                  <X size={18} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </header>
        <div className="pop-body">
          {missing ? <NotFound>Course not found</NotFound> : <CouldntLoad onRetry={detail.retry} />}
        </div>
      </article>
    );
  }

  if (!data) {
    return (
      <article className="pop cp" aria-labelledby={titleId} aria-busy="true">
        {band}
        <div className="pop-body cp-body">
          <div className="cp-main">
            <div className="pop-tabs" aria-hidden="true"><span className="pop-skel pop-skel--tab" /></div>
            <GradesSkeleton />
          </div>
        </div>
      </article>
    );
  }

  const diff = preview.data?.diff || null;
  const showFits = Boolean(diff) || previewFailed(preview.error);
  const showWeb = Boolean(tree || unlocks.length);
  let main;
  if (fullGraph && showWeb) {
    main = (
      <section className="pop-tile cp-fullgraph" aria-labelledby="cp-fullgraph-title">
        <div className="pop-tile-head">
          <button type="button" className="pop-chevron" aria-label="Back" title="Back" onClick={() => setFullGraph(false)}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <h3 id="cp-fullgraph-title" className="pop-tile-title">{tree ? 'Prerequisites' : 'Unlocks'}</h3>
        </div>
        <PrereqWeb course={id} tree={tree} unlocks={unlocks} onOpenCourse={onOpenCourse} size="full" />
      </section>
    );
  } else if (tab) {
    main = (
      <>
        <div className="pop-tabs" role="tablist" aria-label="Course details">
          {available.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              id={`cp-tab-${name}`}
              aria-selected={tab === name}
              aria-controls={`cp-panel-${name}`}
              className="pop-tab"
              onClick={() => setTab(name)}
            >
              {TAB_LABELS[name]}
              {counts[name] ? <span className="pop-tab-count">{counts[name]}</span> : null}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`cp-panel-${tab}`} aria-labelledby={`cp-tab-${tab}`} className="cp-panel">
          {tab === 'grades' && (
            <div className="cp-grades">
              <GpaByTerm history={history} />
              <GradeDistribution grades={data.grades} cumulative={data.cumulative} />
            </div>
          )}
          {tab === 'instructors' && <InstructorsTab rows={instructors} />}
          {tab === 'sections' && <SectionsTab sections={data.sections} />}
        </div>
      </>
    );
  } else {
    main = null;
  }

  return (
    <article className="pop cp" aria-labelledby={titleId}>
      {band}
      {(main || showFits || showWeb) && (
        <div className={`pop-body cp-body ${showFits || showWeb ? '' : 'is-single'}`.trim()}>
          {main && <div className="cp-main">{main}</div>}
          {(showFits || showWeb) && (
            <aside className="cp-side">
              {showFits && (
                <FitsTile diff={diff} courseId={id} term={term} error={preview.error} onRetry={preview.retry} />
              )}
              {showWeb && (
                <WebTile
                  course={id}
                  tree={tree}
                  unlocks={unlocks}
                  onOpenCourse={onOpenCourse}
                  onExpand={() => setFullGraph(true)}
                />
              )}
            </aside>
          )}
        </div>
      )}
    </article>
  );
}
