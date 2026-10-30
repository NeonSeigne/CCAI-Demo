/**
 * Course module: one cached loader for catalog summaries and ratings, the
 * facts a course card shows, and the small pieces that draw them.
 */
import { useMemo } from 'react';
import { courseFacts } from './facts';
import { useCourse, useCourseRatings } from './loader';

export {
  clearCourseCache, httpAdapter, loadCourse, loadCourseRatings, memoryAdapter, peekCourse,
  setCourseAdapter, useCourse, useCourseRatings, useCourses,
} from './loader';
export {
  courseFacts, creditsText, DIFFICULTY_LABEL, difficultyFromRow, difficultyOf, gpaText, gradeGroups,
  instructorRating, meetingText, pctText, prereqCourses, prereqTags, seatTag, sectionFacts, sectionName,
} from './facts';
export {
  CourseTiles, GradeBars, PrereqTags, SectionRows,
} from './parts';

/**
 * {facts, data, error, loading, retry, ratings} for a course id: the cached
 * summary through `courseFacts`. `ratings: true` (or a term) also loads the
 * instructor rating once the summary is in; `states` adds the student's
 * prerequisite states.
 */
export function useCourseFacts(id, { ratings: wantRatings = false, term, states } = {}) {
  const course = useCourse(id);
  const ratings = useCourseRatings(course.data?.identifier || id, {
    term,
    enabled: Boolean(course.data) && Boolean(wantRatings),
  });
  const facts = useMemo(
    () => (course.data ? courseFacts(course.data, { ratings: ratings.data, states }) : null),
    [course.data, ratings.data, states],
  );
  return { ...course, facts, ratings };
}
