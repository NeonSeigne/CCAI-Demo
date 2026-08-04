import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import useCourseDetail from '../../hooks/useCourseDetail';
import {
  courseLabel,
  courseRoute,
  resolveGradeContext,
  termGradeRows,
} from '../course/courseUtils';
import { CourseMetricFromPayload } from '../course/CourseMetricCard';
import CourseSimilarCourses from '../course/CourseSimilarCourses';
import CourseSchedule from '../course/CourseSchedule';
import CourseInstructors from '../course/CourseInstructors';
import {
  CourseGradeDistribution,
  CoursePrereqMap,
  CourseTrends,
} from '../course/CourseVisuals';
import '../../styles/CourseDetailPage.css';

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
  return <div className="course-visual-status course-card--compact">{children}</div>;
}

function renderHydratedCard(type, payload, onCourse) {
  const { selectedGrades, termLabel } = resolveGradeContext(payload);
  const label = courseLabel(payload.course?.course_reference) || payload.course_key;

  switch (type) {
    case 'course_gpa':
    case 'course_completion_rate':
    case 'course_a_rate':
    case 'course_class_size':
      return (
        <CourseMetricFromPayload
          payload={payload}
          metricType={type}
          variant="compact"
        />
      );
    case 'course_grade_distribution':
      return (
        <CourseGradeDistribution
          grades={selectedGrades}
          termLabel={termLabel}
          variant="compact"
        />
      );
    case 'course_similar':
      return (
        <CourseSimilarCourses
          courses={payload.similar_courses}
          onCourse={onCourse}
          variant="compact"
        />
      );
    case 'course_schedule':
      return (
        <CourseSchedule
          meetings={payload.meetings}
          courseName={label}
          variant="compact"
        />
      );
    case 'course_prereq_map':
      return (
        <CoursePrereqMap
          elements={payload.prerequisite_graph}
          onNavigate={onCourse}
          variant="compact"
        />
      );
    case 'course_instructors':
      return (
        <CourseInstructors
          instructors={payload.instructors || []}
          termLabel={termLabel}
          limit={4}
          showKeywords={false}
          variant="compact"
        />
      );
    case 'course_trends':
      return (
        <CourseTrends
          rows={termGradeRows(payload.course?.term_data, payload.terms)}
          variant="compact"
        />
      );
    default:
      return null;
  }
}

/**
 * Hydrates a lightweight `{ type, course, term? }` visual ref via /api/courses
 * and renders the matching shared course card in compact chat layout.
 */
export default function CourseVisualCard({ visual, onSelectCourse }) {
  const navigate = useNavigate();
  const { authToken } = useAuth();
  const courseId = (visual?.course || '').trim();
  const term = visual?.term || undefined;
  const { data, error, loading, retry } = useCourseDetail(courseId, authToken, term);

  const openCourse = useCallback((identifier) => {
    if (onSelectCourse) onSelectCourse(identifier);
    else navigate(courseRoute(identifier));
  }, [navigate, onSelectCourse]);

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
      {renderHydratedCard(visual.type, data, openCourse)}
    </div>
  );
}
