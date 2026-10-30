import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Icon, Plus,
} from '../icons';
import SaveButton from '../SaveButton';
import { useCoursePreview } from '../../hooks/useCampusDetail';
import {
  DIFFICULTY_LABEL, difficultyOf, useCourse, useCourseRatings,
} from '../../modules/course';
import {
  GpaByTerm, GradeDistribution, instructorRows, InstructorsTab, SectionsTab,
} from '../../modules/course/popupTabs';
import { gradeSegments, primarySections } from '../catalog/catalogFormat';
import PrereqGraph from './PrereqGraph';
import { CouldntLoad, isNotFound, usePopupDrag } from '../popup/PopupParts';
import { BandSheet, SheetActions, SheetBand } from '../../modules/sheet';
import {
  creditsHigh, creditsText, gpaText, pctText, prereqCourses, termShort,
} from './popupFormat';
import '../../styles/CoursePopup.css';

/**
 * The course pop-up's body (DESIGN.md "Course card / pop-up"): the band with
 * the code, title and stat tiles; Grades / Instructors / Sections tabs beside
 * the Fits and prerequisite tiles; then the actions. The frame is the band
 * sheet's (modules/sheet); the dialog is the shell's pop-up host (PopupHost).
 *
 * D7: a field the school lacks is not rendered (tile, tab, row or number);
 * a failed request shows the band sheet's error state with Retry. Skeletons
 * cover only the band, the numbers and the Grades tab.
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

/** The band's stat tiles (band sheet tiles); a number the course lacks is left out. */
export function courseTiles(data) {
  const grades = data.grades || null;
  const sections = data.sections || null;
  const out = [];
  const gradeTerm = grades?.term ? ` · ${termShort(grades.term)}` : '';
  const gpa = gpaText(grades?.gpa);
  if (gpa) {
    // The backend's label (R5); a course without one shows its GPA alone.
    const level = difficultyOf(data);
    out.push({
      key: 'gpa', label: `Avg GPA${gradeTerm}`, value: gpa, unit: level ? DIFFICULTY_LABEL[level] : null, tone: level,
    });
  }
  const pctA = pctText(grades?.pct_a);
  if (pctA) out.push({ key: 'a', label: 'Got an A', value: pctA, tone: 'a' });
  const pctDf = pctText(grades?.pct_df);
  if (pctDf) out.push({ key: 'df', label: 'D or F', value: pctDf, tone: 'df' });
  if (sections?.seats_published && sections.seats_open != null) {
    const rows = primarySections(sections.rows || []);
    const capacity = rows.every((row) => row.capacity != null)
      ? rows.reduce((sum, row) => sum + Number(row.capacity || 0), 0)
      : null;
    const when = sections.historical && sections.term ? ` · ${termShort(sections.term)}` : '';
    out.push({
      key: 'seats',
      label: `Seats left${when}`,
      value: sections.seats_open.toLocaleString('en-US'),
      unit: capacity ? `of ${capacity.toLocaleString('en-US')}` : null,
    });
  }
  if (grades?.students) {
    out.push({ key: 'students', label: `Students${gradeTerm}`, value: Number(grades.students).toLocaleString('en-US') });
  }
  return out;
}

/** Add, Ask and Save, under the body. */
function Actions({
  id, title, term, onAdd, onSave, saved, onAsk,
}) {
  const item = { type: 'course', id, title: title || '' };
  return (
    <SheetActions>
      {onAdd && term && (
        <button type="button" className="pop-btn pop-btn--primary" onClick={() => onAdd(id)}>
          <Plus size={20} aria-hidden="true" /> Add to {term}
        </button>
      )}
      {onAsk && (
        <button type="button" className="pop-btn" onClick={() => onAsk(item)}>
          <Icon name="forum" size={20} /> Ask
        </button>
      )}
      {onSave ? (
        <button type="button" className="pop-btn" aria-pressed={Boolean(saved)} onClick={() => onSave(item)}>
          {saved ? 'Saved' : 'Save'}
        </button>
      ) : (
        <SaveButton className="pop-save" item={{ kind: 'course', key: id, display_name: id }} />
      )}
    </SheetActions>
  );
}

function Band({
  data, courseId, term, requirements, onClose, titleId,
}) {
  const id = data?.identifier || courseId;
  const credits = creditsText(data?.credits);
  const eyebrow = [id, credits ? `${credits} credits` : null, term].filter(Boolean).join(' · ');
  const item = { type: 'course', id, title: data?.title || '' };
  const chips = [
    ...(requirements || []).map((label) => ({ label, kind: 'req' })),
    ...(data?.gen_ed || []).map((label) => ({ label, kind: 'gen' })),
  ];
  const drag = usePopupDrag(item);

  return (
    <SheetBand
      eyebrow={eyebrow}
      title={data ? data.title || id : null}
      titleId={titleId}
      titleLabel={id}
      drag={drag}
      dragLabel={`Drag ${id}`}
      onClose={onClose}
      tiles={data ? courseTiles(data) : 5}
    >
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
    </SheetBand>
  );
}

// ---------------------------------------------------------------------------
// Grades tab

function GradesSkeleton() {
  return (
    <div className="cp-grades" aria-hidden="true">
      <div className="pop-tile"><span className="pop-skel pop-skel--chart" /></div>
      <div className="pop-tile"><span className="pop-skel pop-skel--chart" /></div>
    </div>
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
  course, tree, unlocks, titles, onOpenCourse, onExpand,
}) {
  const heading = tree ? 'Prerequisites' : 'Unlocks';
  return (
    <section className="pop-tile cp-web-tile" aria-labelledby="cp-web-title">
      <div className="pop-tile-head">
        <h3 id="cp-web-title" className="pop-tile-title">{heading}</h3>
        <button type="button" className="pop-chevron" aria-label="Open the full prerequisite graph" title="Full graph" onClick={onExpand}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="cp-graph">
        <PrereqGraph
          course={course}
          tree={tree}
          unlocks={tree ? NONE : unlocks}
          titles={titles}
          onOpenCourse={onOpenCourse}
          label={tree ? `Prerequisites for ${course}` : `Unlocks after ${course}`}
          size="tile"
        />
      </div>
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
  const detail = useCourse(courseId);
  const data = detail.data;
  const id = data?.identifier || courseId;
  const ratings = useCourseRatings(id, { enabled: Boolean(data) });
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
      onClose={onClose}
      titleId={titleId}
    />
  );
  const actions = (
    <Actions
      id={id}
      title={data?.title}
      term={term}
      onAdd={onAdd}
      onSave={onSave}
      saved={saved}
      onAsk={onAsk}
    />
  );

  if (detail.error) {
    const missing = isNotFound(detail.error);
    return (
      <BandSheet
        kind="course"
        titleId={titleId}
        status="error"
        error={missing ? { message: 'Course not found' } : { onRetry: detail.retry }}
        band={<SheetBand eyebrow={courseId} title={courseId} titleId={titleId} onClose={onClose} />}
      />
    );
  }

  if (!data) {
    return (
      <BandSheet kind="course" titleId={titleId} status="loading" loadingLabel={`Loading ${courseId}`} band={band} actions={actions}>
        <div className="cp-main">
          <div className="pop-tabs"><span className="pop-skel pop-skel--tab" /></div>
          <GradesSkeleton />
        </div>
      </BandSheet>
    );
  }

  const diff = preview.data?.diff || null;
  const showFits = Boolean(diff) || previewFailed(preview.error);
  const showWeb = Boolean(tree || unlocks.length);
  const graphTitles = data.title ? { [id]: data.title } : undefined;
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
        <div className="cp-graph cp-graph--full">
          <PrereqGraph
            course={id}
            tree={tree}
            unlocks={unlocks}
            titles={graphTitles}
            onOpenCourse={onOpenCourse}
            label={tree ? `Prerequisites for ${id}` : `Unlocks after ${id}`}
          />
        </div>
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
              <GpaByTerm history={history} difficulty={difficultyOf(data)} />
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
    <BandSheet kind="course" titleId={titleId} band={band} actions={actions}>
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
                  titles={graphTitles}
                  onOpenCourse={onOpenCourse}
                  onExpand={() => setFullGraph(true)}
                />
              )}
            </aside>
          )}
        </div>
      )}
    </BandSheet>
  );
}
