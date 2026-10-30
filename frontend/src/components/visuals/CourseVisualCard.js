import React, {
  useCallback, useEffect, useMemo, useRef,
} from 'react';
import { Icon, RefreshCw } from '../icons';
import { useSchool } from '../../modules/campus';
import { usePlanner } from '../../contexts/PlannerContext';
import {
  difficultyOf, gpaText, pctText, prereqCourses, useCourse, useCourseRatings,
} from '../../modules/course';
import { useOpenCourse } from '../../utils/openCourse';
import {
  GpaByTerm, GradeDistribution, instructorRows, InstructorsTab, SectionsTab,
} from '../../modules/course/popupTabs';
import PrereqGraph from '../course/PrereqGraph';
import { dateIn, prereqStates } from '../planner/semester/semesterData';
import { titleCase } from './CourseAnswerCard';
import '../../modules/sheet/BandSheet.css';
import '../../styles/CoursePopup.css';
import '../../styles/CourseVisuals.css';

const COURSE_VISUAL_TYPES = new Set([
  'course_gpa',
  'course_completion_rate',
  'course_a_rate',
  'course_class_size',
  'course_grade_distribution',
  'course_similar',
  'course_schedule',
  'course_prereq_map',
  'course_instructors',
  'course_trends',
]);

export function isCourseVisualType(type) {
  return COURSE_VISUAL_TYPES.has(type);
}

function CompactStatus({ children }) {
  return <div className="vc-card vc-status">{children}</div>;
}

/** One big number in a tile, labelled as in the course pop-up (D6). */
function MetricTile({ label, value, tone }) {
  if (value == null) return null;
  return (
    <section className="pop-tile cc-metric" aria-label={label}>
      <span className="cc-metric-label">{label}</span>
      <strong className={`cc-metric-value ${tone ? `is-${tone}` : ''}`.trim()}>{value}</strong>
    </section>
  );
}

const NONE = [];

/**
 * The prerequisite graph card: done and this-term states from the student's
 * plan when there is one (PlannerProvider), plain nodes otherwise.
 */
function PrereqCard({
  payload, tree, chain, unlocks, onCourse,
}) {
  const planner = usePlanner();
  const { timezone } = useSchool();
  const plan = planner?.view?.plan;
  const plannerRef = useRef(planner);
  plannerRef.current = planner;
  useEffect(() => { plannerRef.current?.ensureLoaded?.(); }, []);
  const states = useMemo(() => (plan ? prereqStates(plan, dateIn(timezone)) : undefined), [plan, timezone]);
  const titles = useMemo(() => ({ [payload.identifier]: titleCase(payload.title || '') }), [payload]);
  const hasPrereqs = Boolean(tree || chain);
  const heading = hasPrereqs ? `Prerequisites for ${payload.identifier}` : 'Unlocks';

  return (
    <section className="vc-card vc-prereq" aria-label={hasPrereqs ? 'Prerequisites' : 'Unlocks'}>
      <div className="vc-head">
        <Icon name="account_tree" size={20} />
        <h3>{heading}</h3>
      </div>
      <PrereqGraph
        course={payload.identifier}
        tree={tree}
        chain={chain}
        unlocks={unlocks}
        states={states}
        titles={titles}
        onOpenCourse={onCourse}
        label={heading}
        size="tile"
        variant="chat"
      />
    </section>
  );
}

/**
 * The chain under a course: `prereq_chain` when the catalog sent one, else
 * the courses its prerequisite text names (UVA) as one level; null without either.
 */
export function chainOf(payload) {
  const chain = payload?.prereq_chain;
  if (chain?.courses?.some((c) => c?.id && c.depth >= 1)) return chain;
  const named = (payload?.prerequisites?.courses || []).filter((c) => c?.identifier);
  if (!named.length) return null;
  return {
    root: payload.identifier,
    courses: named.map((c) => ({
      id: c.identifier, title: c.title || null, depth: 1, requires: [], known: true,
    })),
    complete: false,
  };
}

/** The card for one `course_*` ref, from the catalog summary; null when the school lacks the data. */
function HydratedCard({
  type, payload, ratings, onCourse,
}) {
  const grades = payload.grades || null;
  const term = grades?.term ? ` · ${grades.term}` : '';
  const instructors = useMemo(
    () => instructorRows(payload.instructor_grades, ratings),
    [payload.instructor_grades, ratings],
  );
  switch (type) {
    case 'course_gpa':
      return <MetricTile label={`Avg GPA${term}`} value={gpaText(grades?.gpa)} tone={difficultyOf(payload)} />;
    case 'course_a_rate':
      return <MetricTile label="Got an A" value={pctText(grades?.pct_a)} />;
    case 'course_completion_rate':
      return <MetricTile label="D or F" value={pctText(grades?.pct_df)} />;
    case 'course_class_size':
      return (
        <MetricTile
          label={`Students${term}`}
          value={grades?.students ? Number(grades.students).toLocaleString('en-US') : null}
        />
      );
    case 'course_grade_distribution':
      return <GradeDistribution grades={grades} cumulative={payload.cumulative} />;
    case 'course_trends':
      return <GpaByTerm history={payload.grade_history} difficulty={difficultyOf(payload)} />;
    case 'course_schedule':
      return payload.sections?.rows?.length ? <SectionsTab sections={payload.sections} /> : null;
    case 'course_instructors':
      return instructors.length ? <InstructorsTab rows={instructors} /> : null;
    case 'course_prereq_map': {
      const tree = payload.prereq_tree && prereqCourses(payload.prereq_tree).length ? payload.prereq_tree : null;
      const chain = chainOf(payload);
      const unlocks = payload.next_courses?.length ? payload.next_courses : NONE;
      if (!tree && !chain && !unlocks.length) return null;
      return <PrereqCard payload={payload} tree={tree} chain={chain} unlocks={unlocks} onCourse={onCourse} />;
    }
    // No catalog source lists similar courses.
    default:
      return null;
  }
}

/**
 * Hydrates a lightweight `{ type, course }` visual ref from `/api/catalog/{id}`
 * and renders the matching pop-up piece in the chat.
 */
export default function CourseVisualCard({ visual, onSelectCourse }) {
  const openPopup = useOpenCourse();
  const courseId = (visual?.course || '').trim();
  const { data, error, loading, retry } = useCourse(courseId);
  const ratings = useCourseRatings(data?.identifier || courseId, {
    enabled: Boolean(data) && visual?.type === 'course_instructors',
  });

  const openCourse = useCallback((identifier) => {
    if (onSelectCourse) onSelectCourse(identifier);
    else openPopup(identifier);
  }, [openPopup, onSelectCourse]);

  if (!courseId || !isCourseVisualType(visual?.type)) return null;

  if (loading) {
    return <CompactStatus>Loading course card…</CompactStatus>;
  }
  if (error || !data) {
    return (
      <CompactStatus>
        <span>{error?.message || 'Course card unavailable.'}</span>
        <button type="button" className="vc-btn" onClick={retry}>
          <RefreshCw size={18} aria-hidden="true" /> Retry
        </button>
      </CompactStatus>
    );
  }

  return (
    <div className="advisor-course-visual">
      <HydratedCard
        type={visual.type}
        payload={data}
        ratings={ratings.data?.ratings || NONE}
        onCourse={openCourse}
      />
    </div>
  );
}
