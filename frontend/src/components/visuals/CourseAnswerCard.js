import React, { useCallback } from 'react';
import { useOpenCourse } from '../../utils/openCourse';
import { ArrowRight, Icon, RefreshCw } from '../icons';
import { useAuth } from '../../contexts/AuthContext';
import useCourseDetail from '../../hooks/useCourseDetail';
import ContextLink from '../ContextLink';
import SaveButton from '../SaveButton';
import { gradeSegments, primarySections, sectionName } from '../catalog/catalogFormat';
import {
  creditsText, difficultyOf, DIFFICULTY_LABEL, gpaText, pctText, termShort,
} from '../course/popupFormat';
import { useCourseRatings } from '../../hooks/useCampusDetail';
import '../../styles/CourseVisuals.css';

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

/** Grades as bars, the biggest share in the school's colour. */
function GradeBars({ grades }) {
  const rows = gradeSegments(grades?.distribution);
  if (!rows.length) return null;
  const rounded = (value) => `${Math.round(value)}%`;
  const students = Number(grades.students || 0);
  const top = Math.max(...rows.map((row) => row.pct));

  return (
    <div className="vc-grades">
      <div className="vc-cap">
        <strong>Grades{grades.term ? `, ${grades.term}` : ''}</strong>
        <span>
          {grades.gpa != null && `GPA ${Number(grades.gpa).toFixed(2)}`}
          {grades.gpa != null && students > 0 && ' · '}
          {students > 0 && `${students.toLocaleString()} students`}
        </span>
      </div>
      <div
        className="vc-bars"
        role="img"
        aria-label={rows.map((row) => `${row.label} ${rounded(row.pct)}`).join(', ')}
      >
        {rows.map((row) => (
          <span key={row.key} className="vc-bar">
            <em>{rounded(row.pct)}</em>
            <i className={row.pct === top ? 'is-top' : ''} style={{ height: `${Math.max(3, (row.pct / top) * 100)}%` }} />
            <b>{row.label}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Average GPA by term as a line, the latest value labelled. */
function GpaTrend({ history }) {
  const points = (history || []).filter((row) => row && row.gpa != null);
  if (points.length < 2) return null;
  const W = 320;
  const H = 130;
  const pad = 22;
  const values = points.map((p) => Number(p.gpa));
  const lo = Math.min(...values) - 0.1;
  const hi = Math.max(...values) + 0.1;
  const xy = values.map((v, i) => [
    pad + (i * (W - pad * 2)) / (values.length - 1),
    12 + (1 - (v - lo) / (hi - lo)) * (H - 44),
  ]);
  const [lx, ly] = xy[xy.length - 1];

  return (
    <div className="vc-trend">
      <p className="vc-cap"><strong>Average GPA by term</strong></p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={points.map((p) => `${p.term} ${gpaText(p.gpa)}`).join(', ')}
      >
        {[0, 1, 2].map((i) => (
          <line key={i} className="vc-trend-grid" x1={pad} x2={W - pad} y1={12 + (i * (H - 44)) / 2} y2={12 + (i * (H - 44)) / 2} />
        ))}
        <polyline className="vc-trend-line" points={xy.map((p) => p.join(',')).join(' ')} />
        <circle className="vc-trend-dot" cx={lx} cy={ly} r={5} />
        <text className="vc-trend-value" x={lx - 8} y={ly - 10} textAnchor="end">{gpaText(values[values.length - 1])}</text>
        {points.map((p, i) => (
          <text key={p.term} className="vc-trend-term" x={xy[i][0]} y={H - 6} textAnchor="middle">{termShort(p.term)}</text>
        ))}
      </svg>
    </div>
  );
}

function InstructorRow({ names, ratings, source, onMore }) {
  const rated = [...(ratings || [])].filter((r) => r?.rating != null).sort((a, b) => b.rating - a.rating);
  const top = rated[0] || (names[0] ? { name: names[0] } : null);
  if (!top) return null;
  const others = Math.max(names.length, rated.length) - 1;

  return (
    <div className="vc-section">
      <span className="vc-section-label">Instructor</span>
      <div className="vc-instructor">
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
          <button type="button" className="vc-link" onClick={onMore}>
            {others} more on the course page
          </button>
        )}
      </div>
    </div>
  );
}

function SeatRows({ sections }) {
  const rows = primarySections(sections?.rows || []).filter((row) => row?.capacity);
  if (!rows.length) return null;

  return (
    <div className="vc-section">
      <span className="vc-section-label">Seats</span>
      <ul className="vc-seats">
        {rows.slice(0, 4).map((row, index) => {
          const capacity = Number(row.capacity);
          const taken = Number(row.enrolled || 0);
          const full = taken >= capacity || row.is_open === false;
          return (
            <li key={`${row.section}-${index}`}>
              <span className="vc-code">{sectionName(row)}</span>
              <span className="vc-seat-track" aria-hidden="true">
                <span style={{ width: `${Math.min(100, percent(taken, capacity))}%` }} className={full ? 'is-full' : ''} />
              </span>
              <span className={`vc-tag ${full ? 'is-full' : 'is-open'}`}>
                {full ? 'Full' : `${capacity - taken} left`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Open seats across the lecture sections, when the school publishes counts. */
function seatsOpen(sections) {
  const rows = primarySections(sections?.rows || []).filter((row) => row?.capacity);
  if (!rows.length) return null;
  return rows.reduce((sum, row) => {
    const left = Number(row.capacity) - Number(row.enrolled || 0);
    return sum + (row.is_open === false ? 0 : Math.max(0, left));
  }, 0);
}

function Stat({ value, label, tone }) {
  if (value == null) return null;
  return (
    <div className={`vc-stat ${tone ? `is-${tone}` : ''}`.trim()}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function Actions({ label, onOpen }) {
  return (
    <div className="vc-foot">
      <button type="button" className="vc-btn" onClick={onOpen}>
        Course page
      </button>
      <SaveButton className="vc-save" item={{ kind: 'course', key: label, display_name: label }} />
      <ContextLink className="vc-context-link" to={`/courses?selected=${encodeURIComponent(label)}`}>
        Open in Courses <ArrowRight size={16} aria-hidden="true" />
      </ContextLink>
    </div>
  );
}

/**
 * One card per course in an answer. A grades question gets the difficulty
 * card (four tiles, grade bars, GPA by term); anything that asks about
 * instructors or sections gets the course card (band, three stats, rows).
 */
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
    return <section className="vc-card vc-status" aria-busy="true">Loading {courseId}…</section>;
  }
  if (error || !data) {
    return (
      <section className="vc-card vc-status">
        <span>{error?.message || 'Course card unavailable.'}</span>
        <button type="button" className="vc-btn" onClick={retry}>
          <RefreshCw size={18} aria-hidden="true" /> Retry
        </button>
      </section>
    );
  }

  const label = data.identifier || courseId;
  const title = titleCase(data.title || '');
  const grades = data.grades || {};
  const showGrades = types.some((type) => GRADE_TYPES.has(type));
  const names = wantsInstructors ? data.instructors || [] : [];
  const rated = wantsInstructors ? ratings.data?.ratings || [] : [];
  const sections = types.includes('course_schedule') ? data.sections : null;
  const tone = difficultyOf(grades.gpa);

  if (showGrades && !wantsInstructors && !sections) {
    const students = grades.students ? Number(grades.students).toLocaleString('en-US') : null;
    const tiles = [
      { label: 'Average GPA', value: gpaText(grades.gpa), tone },
      { label: 'Got an A', value: pctText(grades.pct_a) },
      { label: 'D or F', value: pctText(grades.pct_df) },
      { label: 'Class size', value: students },
    ].filter((tile) => tile.value != null);
    return (
      <section className="vc-card vc-difficulty" aria-label={label}>
        <div className="vc-head">
          <Icon name="bar_chart" size={20} />
          <h3><span className="vc-code">{label}</span> · {title}</h3>
        </div>
        <div className="vc-body">
          {tiles.length > 0 && (
            <div className="vc-kpis">
              {tiles.map((tile) => (
                <div key={tile.label} className="vc-tile">
                  <span>{tile.label}</span>
                  <b className={tile.tone ? `is-${tile.tone}` : undefined}>{tile.value}</b>
                </div>
              ))}
            </div>
          )}
          <div className="vc-two">
            <GradeBars grades={grades} />
            <GpaTrend history={data.grade_history} />
          </div>
        </div>
        <Actions label={label} onOpen={() => openCourse(label)} />
      </section>
    );
  }

  const credits = creditsText(data.credits);
  const topRating = rated.filter((r) => r?.rating != null).sort((a, b) => b.rating - a.rating)[0];

  return (
    <section className="vc-card vc-course" aria-label={label}>
      <div className="vc-band">
        <span className="vc-band-code">{label}{credits ? ` · ${credits} credits` : ''}</span>
        <h3>{title}</h3>
        <div className="vc-stats">
          <Stat
            value={showGrades || tone ? gpaText(grades.gpa) : null}
            label={tone ? `Average GPA · ${DIFFICULTY_LABEL[tone]}` : 'Average GPA'}
            tone={tone}
          />
          <Stat value={topRating ? Number(topRating.rating).toFixed(1) : null} label="Rating of 5" />
          <Stat value={sections ? seatsOpen(sections) : null} label="Seats open" />
        </div>
      </div>
      {showGrades && <div className="vc-section"><GradeBars grades={grades} /></div>}
      {wantsInstructors && (
        <InstructorRow
          names={names}
          ratings={rated}
          source={ratings.data?.source}
          onMore={() => openCourse(label)}
        />
      )}
      <SeatRows sections={sections} />
      <Actions label={label} onOpen={() => openCourse(label)} />
    </section>
  );
}
