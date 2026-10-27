import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import useCourseDetail from '../../hooks/useCourseDetail';
import {
  calculateCompletionRate,
  calculateGpa,
  courseLabel,
  courseRoute,
  resolveGradeContext,
} from '../course/courseUtils';

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
const GRADE_BARS = [
  { key: 'a', label: 'A', bg: '#0B3D91', fg: '#FFFFFF' },
  { key: 'ab', label: 'AB', bg: '#1A5CC8', fg: '#FFFFFF' },
  { key: 'b', label: 'B', bg: '#4C86E0', fg: '#FFFFFF' },
  { key: 'bc', label: 'BC', bg: '#8DB3EE', fg: '#0B2559' },
  { key: 'c', label: 'C', bg: '#BCD2F5', fg: '#0B2559' },
  { key: 'd', label: 'D', bg: '#F2B48A', fg: '#5A2A05' },
  { key: 'f', label: 'F', bg: '#D9692B', fg: '#FFFFFF' },
];

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

function GradeBar({ grades, termLabel }) {
  const total = Number(grades?.total || 0);
  const rows = GRADE_BARS
    .map((bar) => ({ ...bar, pct: percent(Number(grades?.[bar.key] || 0), total) }))
    .filter((bar) => bar.pct > 0);
  if (!total || !rows.length) return null;
  const gpa = calculateGpa(grades);
  const completion = calculateCompletionRate(grades);
  const rounded = (value) => `${Math.round(value)}%`;

  return (
    <div className="cc-grades">
      <div className="cc-grades-head">
        <strong>Grades{termLabel ? `, ${termLabel}` : ''}</strong>
        <span>
          {gpa != null && `GPA ${gpa.toFixed(2)} · `}
          {completion != null && `${rounded(completion)} completed · `}
          {total.toLocaleString()} students
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

function InstructorTile({ instructors, onMore }) {
  const rated = instructors.filter((instructor) => instructor?.rmp_data?.average_rating != null);
  const [top] = rated.length ? rated : instructors;
  if (!top) return null;
  const rmp = top.rmp_data;
  const others = instructors.length - 1;

  return (
    <div className="cc-tile">
      <span className="cc-tile-label">Instructor</span>
      <strong>{top.name}</strong>
      {rmp?.average_rating != null && (
        <>
          <span>
            {rmp.average_rating.toFixed(1)} quality
            {rmp.average_difficulty != null && ` · ${rmp.average_difficulty.toFixed(1)} difficulty`}
            {rmp.num_ratings != null && ` · ${rmp.num_ratings} reviews`}
          </span>
          <small>Rate My Professors, out of 5</small>
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

function SeatsTile({ meetings }) {
  const sections = meetings.filter((meeting) => meeting?.location?.capacity);
  if (!sections.length) return null;

  return (
    <div className="cc-tile">
      <span className="cc-tile-label">Seats</span>
      {sections.slice(0, 4).map((meeting, index) => {
        const capacity = meeting.location.capacity;
        const taken = Number(meeting.current_enrollment || 0);
        const full = taken >= capacity;
        return (
          <div className="cc-seat" key={`${meeting.name}-${index}`}>
            <span className="cc-seat-name">{meeting.name}</span>
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
  const navigate = useNavigate();
  const { authToken } = useAuth();
  const courseId = (visual?.course || '').trim();
  const types = visual?.types || [];
  const { data, error, loading, retry } = useCourseDetail(courseId, authToken, visual?.term);

  const openCourse = useCallback((identifier) => {
    if (onSelectCourse) onSelectCourse(identifier);
    else navigate(courseRoute(identifier));
  }, [navigate, onSelectCourse]);

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

  const { selectedGrades, termLabel } = resolveGradeContext(data);
  const label = courseLabel(data.course?.course_reference) || courseId;
  const showGrades = types.some((type) => GRADE_TYPES.has(type));
  const instructors = types.includes('course_instructors') ? data.instructors || [] : [];
  const meetings = types.includes('course_schedule') ? data.meetings || [] : [];

  return (
    <section className="cc-card cc-course" aria-label={label}>
      <div className="cc-course-head">
        <div>
          <span className="cc-course-code">{label}</span>
          <strong>{titleCase(data.course?.course_title || '')}</strong>
        </div>
        <button type="button" className="cc-soft-btn" onClick={() => openCourse(label)}>
          Course page
        </button>
      </div>
      {showGrades && <GradeBar grades={selectedGrades} termLabel={termLabel} />}
      {(instructors.length > 0 || meetings.length > 0) && (
        <div className="cc-tiles">
          <InstructorTile instructors={instructors} onMore={() => openCourse(label)} />
          <SeatsTile meetings={meetings} />
        </div>
      )}
    </section>
  );
}
