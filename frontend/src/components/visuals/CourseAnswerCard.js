import React, { useCallback } from 'react';
import { useOpenCourse } from '../../utils/openCourse';
import { ArrowRight, RefreshCw } from '../icons';
import { useAuth } from '../../contexts/AuthContext';
import useCourseDetail from '../../hooks/useCourseDetail';
import ContextLink from '../ContextLink';
import SaveButton from '../SaveButton';
import { gradeSegments, primarySections, sectionName } from '../catalog/catalogFormat';
import { useCourseRatings } from '../../hooks/useCampusDetail';

const GRADE_TYPES = new Set([
  'course_gpa',
  'course_completion_rate',
  'course_a_rate',
  'course_class_size',
  'course_grade_distribution',
  'course_trends',
]);

/** Course refs this card draws; other course_* types keep their own cards. */
export const COURSE_ANSWER_TYPES = new Set([...GRADE_TYPES, 'course_instructors', 'course_schedule']);

// Darkest for the best grade, orange for D and F so they read apart by lightness too.
const GRADE_COLORS = {
  a: { bg: '#0B3D91', fg: '#FFFFFF' },
  ab: { bg: '#1A5CC8', fg: '#FFFFFF' },
  b: { bg: '#4C86E0', fg: '#FFFFFF' },
  bc: { bg: '#8DB3EE', fg: '#0B2559' },
  c: { bg: '#BCD2F5', fg: '#0B2559' },
  d: { bg: '#F2B48A', fg: '#5A2A05' },
  f: { bg: '#D9692B', fg: '#FFFFFF' },
};
// Other schools' buckets (UVA's A+..C-, DFW) take their letter's shade.
const gradeColor = (bucket) => {
  const key = String(bucket).toLowerCase();
  if (GRADE_COLORS[key]) return GRADE_COLORS[key];
  if (key === 'dfw') return GRADE_COLORS.f;
  return GRADE_COLORS[key.charAt(0)] || GRADE_COLORS.c;
};

/**
 * Collapses an answer's course refs into one `course_answer` item per course,
 * placed where that course's first ref was. The backend sends one ref per
 * metric (six for a grades question); drawn apart they were six cards and six
 * fetches of the same course.
 */
export function groupCourseVisuals(visuals = []) {
  const grouped = [];
  const byCourse = new Map();
  visuals.forEach((visual) => {
    const course = (visual?.course || '').trim();
    if (!course || !COURSE_ANSWER_TYPES.has(visual.type)) {
      grouped.push(visual);
      return;
    }
    const key = course.toUpperCase();
    let item = byCourse.get(key);
    if (!item) {
      item = { type: 'course_answer', course, term: undefined, types: [] };
      byCourse.set(key, item);
      grouped.push(item);
    }
    if (!item.term && visual.term) item.term = visual.term;
    if (!item.types.includes(visual.type)) item.types.push(visual.type);
  });
  return grouped;
}

/** "PROGRAMMING II" → "Programming II"; roman numerals stay upper case. */
export function titleCase(text = '') {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (/^[ivx]+$/.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

const percent = (part, total) => (total ? (part * 100) / total : 0);

function GradeBar({ grades }) {
  const rows = gradeSegments(grades?.distribution).map((row) => ({ ...row, ...gradeColor(row.key) }));
  if (!rows.length) return null;
  const rounded = (value) => `${Math.round(value)}%`;
  const students = Number(grades.students || 0);

  return (
    <div className="cc-grades">
      <div className="cc-grades-head">
        <strong>Grades{grades.term ? `, ${grades.term}` : ''}</strong>
        <span>
          {grades.gpa != null && `GPA ${Number(grades.gpa).toFixed(2)}`}
          {grades.gpa != null && students > 0 && ' · '}
          {students > 0 && `${students.toLocaleString()} students`}
        </span>
      </div>
      <div
        className="cc-grades-bar"
        role="img"
        aria-label={rows.map((row) => `${row.label} ${rounded(row.pct)}`).join(', ')}
      >
        {rows.map((row) => (
          <span key={row.key} style={{ width: `${row.pct}%`, background: row.bg, color: row.fg }}>
            {/* Slivers stay blank; the legend names every grade. */}
            {row.pct >= 5 ? row.label : ''}
          </span>
        ))}
      </div>
      <div className="cc-grades-legend" aria-hidden="true">
        {rows.map((row) => (
          <span key={row.key}>
            <i style={{ background: row.bg }} />
            {row.label} {rounded(row.pct)}
          </span>
        ))}
      </div>
    </div>
  );
}

function InstructorTile({ names, ratings, source, onMore }) {
  const rated = [...(ratings || [])].filter((r) => r?.rating != null).sort((a, b) => b.rating - a.rating);
  const top = rated[0] || (names[0] ? { name: names[0] } : null);
  if (!top) return null;
  const others = Math.max(names.length, rated.length) - 1;

  return (
    <div className="cc-tile">
      <span className="cc-tile-label">Instructor</span>
      <strong>{top.name}</strong>
      {top.rating != null && (
        <>
          <span>
            {Number(top.rating).toFixed(1)} quality
            {top.difficulty != null && ` · ${Number(top.difficulty).toFixed(1)} difficulty`}
            {top.num_ratings != null && ` · ${top.num_ratings} reviews`}
          </span>
          {source?.name && <small>{`${source.name}, out of 5`}</small>}
        </>
      )}
      {others > 0 && (
        <button type="button" className="cc-link" onClick={onMore}>
          {others} more on the course page
        </button>
      )}
    </div>
  );
}

function SeatsTile({ sections }) {
  const rows = primarySections(sections?.rows || []).filter((row) => row?.capacity);
  if (!rows.length) return null;

  return (
    <div className="cc-tile">
      <span className="cc-tile-label">Seats</span>
      {rows.slice(0, 4).map((row, index) => {
        const capacity = Number(row.capacity);
        const taken = Number(row.enrolled || 0);
        const full = taken >= capacity || row.is_open === false;
        return (
          <div className="cc-seat" key={`${row.section}-${index}`}>
            <span className="cc-seat-name">{sectionName(row)}</span>
            <span className="cc-seat-track" aria-hidden="true">
              <span style={{ width: `${Math.min(100, percent(taken, capacity))}%` }} className={full ? 'is-full' : ''} />
            </span>
            <span className={`cc-seat-left ${full ? 'is-full' : ''}`}>
              {full ? 'Full' : `${capacity - taken} left`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** One card per course in an answer: grades, then instructor and seats. */
export default function CourseAnswerCard({ visual, onSelectCourse }) {
  const openPopup = useOpenCourse();
  const { authToken } = useAuth();
  const courseId = (visual?.course || '').trim();
  const types = visual?.types || [];
  const { data, error, loading, retry } = useCourseDetail(courseId, authToken);
  const wantsInstructors = types.includes('course_instructors');
  const ratings = useCourseRatings(data?.identifier || courseId, Boolean(data) && wantsInstructors);

  const openCourse = useCallback((identifier) => {
    if (onSelectCourse) onSelectCourse(identifier);
    else openPopup(identifier);
  }, [openPopup, onSelectCourse]);

  if (!courseId) return null;
  if (loading) {
    return <section className="cc-card cc-course cc-course--status">Loading {courseId}…</section>;
  }
  if (error || !data) {
    return (
      <section className="cc-card cc-course cc-course--status">
        <span>{error?.message || 'Course card unavailable.'}</span>
        <button type="button" className="cc-chip-btn" onClick={retry}>
          <RefreshCw size={13} aria-hidden="true" /> Retry
        </button>
      </section>
    );
  }

  const label = data.identifier || courseId;
  const showGrades = types.some((type) => GRADE_TYPES.has(type));
  const names = wantsInstructors ? data.instructors || [] : [];
  const rated = wantsInstructors ? ratings.data?.ratings || [] : [];
  const sections = types.includes('course_schedule') ? data.sections : null;
  const showInstructor = names.length > 0 || rated.length > 0;
  const showSeats = primarySections(sections?.rows || []).some((row) => row?.capacity);

  return (
    <section className="cc-card cc-course" aria-label={label}>
      <div className="cc-course-head">
        <div>
          <span className="cc-course-code">{label}</span>
          <strong>{titleCase(data.title || '')}</strong>
        </div>
        <div className="cc-course-actions">
          <button type="button" className="cc-soft-btn" onClick={() => openCourse(label)}>
            Course page
          </button>
          <SaveButton item={{ kind: 'course', key: label, display_name: label }} />
        </div>
      </div>
      {showGrades && <GradeBar grades={data.grades} />}
      {(showInstructor || showSeats) && (
        <div className="cc-tiles">
          <InstructorTile
            names={names}
            ratings={rated}
            source={ratings.data?.source}
            onMore={() => openCourse(label)}
          />
          <SeatsTile sections={sections} />
        </div>
      )}
      <ContextLink className="cc-context-link" to={`/courses?selected=${encodeURIComponent(label)}`}>
        Open in Courses <ArrowRight size={13} aria-hidden="true" />
      </ContextLink>
    </section>
  );
}
