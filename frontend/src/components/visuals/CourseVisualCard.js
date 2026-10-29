import React, { useCallback, useMemo } from 'react';
import { RefreshCw } from '../icons';
import { useAuth } from '../../contexts/AuthContext';
import useCourseDetail from '../../hooks/useCourseDetail';
import { useCourseRatings } from '../../hooks/useCampusDetail';
import { useOpenCourse } from '../../utils/openCourse';
import {
  GpaByTerm, GradeDistribution, instructorRows, InstructorsTab, SectionsTab,
} from '../course/CoursePopup';
import PrereqWeb from '../course/PrereqWeb';
import { difficultyOf, gpaText, pctText, prereqCourses } from '../course/popupFormat';
import '../../styles/Popups.css';

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
  return <div className="pop-tile course-visual-status">{children}</div>;
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
      return <MetricTile label={`Avg GPA${term}`} value={gpaText(grades?.gpa)} tone={difficultyOf(grades?.gpa)} />;
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
      return <GpaByTerm history={payload.grade_history} />;
    case 'course_schedule':
      return payload.sections?.rows?.length ? <SectionsTab sections={payload.sections} /> : null;
    case 'course_instructors':
      return instructors.length ? <InstructorsTab rows={instructors} /> : null;
    case 'course_prereq_map': {
      const tree = payload.prereq_tree && prereqCourses(payload.prereq_tree).length ? payload.prereq_tree : null;
      const unlocks = payload.next_courses?.length ? payload.next_courses : NONE;
      if (!tree && !unlocks.length) return null;
      return (
        <section className="pop-tile" aria-label={tree ? 'Prerequisites' : 'Unlocks'}>
          <h3 className="pop-tile-title">{tree ? 'Prerequisites' : 'Unlocks'}</h3>
          <PrereqWeb course={payload.identifier} tree={tree} unlocks={unlocks} onOpenCourse={onCourse} />
        </section>
      );
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
  const { authToken } = useAuth();
  const courseId = (visual?.course || '').trim();
  const { data, error, loading, retry } = useCourseDetail(courseId, authToken);
  const ratings = useCourseRatings(data?.identifier || courseId, Boolean(data) && visual?.type === 'course_instructors');

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
        <button type="button" className="btn-secondary" onClick={retry}>
          <RefreshCw size={14} /> Retry
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
