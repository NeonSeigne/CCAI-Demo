import React, {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { useOpenCourse } from '../../utils/openCourse';
import { usePlanner } from '../../contexts/PlannerContext';
import { plannerError } from '../../api/planner';
import { Icon } from '../icons';
import SaveButton from '../SaveButton';
import PanelState from '../panel/PanelState';
import ProposalCard from './ProposalCard';
import { termShort } from '../course/popupFormat';
import {
  DIFFICULTY_LABEL, GradeBars, SectionRows, gpaText, useCourseFacts,
} from '../../modules/course';
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

/** Section rows the course card lists (the pop-up has the rest). */
const SECTION_ROWS = 4;

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

/** The element's width in px, 0 until measured (jsdom never measures). */
function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/**
 * Average GPA by term as a line, the latest value labelled. Drawn at the
 * column's real width, so its 11.5px labels stay 11.5px.
 */
function GpaTrend({ history }) {
  const ref = useRef(null);
  const measured = useWidth(ref);
  const points = (history || []).filter((row) => row && row.gpa != null);
  const W = measured || 320;
  const H = 130;
  const pad = 22;
  if (points.length < 2) return null;
  const values = points.map((p) => Number(p.gpa));
  const lo = Math.min(...values) - 0.1;
  const hi = Math.max(...values) + 0.1;
  const xy = values.map((v, i) => [
    pad + (i * (W - pad * 2)) / (values.length - 1),
    12 + (1 - (v - lo) / (hi - lo)) * (H - 44),
  ]);
  const [lx, ly] = xy[xy.length - 1];
  // About six term labels, counted back from the latest.
  const step = Math.ceil(points.length / 6);
  const labelled = (i) => (points.length - 1 - i) % step === 0;

  return (
    <div className="vc-trend" ref={ref}>
      <p className="vc-cap">Average GPA by term</p>
      <svg
        width={measured || undefined}
        height={H}
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
        {points.map((p, i) => labelled(i) && (
          <text key={p.term} className="vc-trend-term" x={xy[i][0]} y={H - 6} textAnchor="middle">{termShort(p.term)}</text>
        ))}
      </svg>
    </div>
  );
}

/** A band tile: the number, then its label (ask-chat `.stats`). */
function Stat({ value, label, tone }) {
  return (
    <div className={`vc-stat ${tone ? `is-${tone}` : ''}`.trim()}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

/** The card's name: opens the course pop-up, drawn as the plain heading text. */
function Opener({ onOpen, children }) {
  return <button type="button" className="vc-opener" onClick={onOpen}>{children}</button>;
}

/** The difficulty card (chat-grades): four tiles at most, the grade bars and GPA by term. */
function DifficultyCard({ facts, data, label, title, onOpen }) {
  const tile = (key) => facts.tiles.find((t) => t.key === key);
  // "Finished" has no completion data behind it at any school, so it is left out (Q5).
  const tiles = [
    tile('gpa') && { key: 'gpa', label: 'Average GPA', value: tile('gpa').value, tone: facts.difficulty },
    tile('a') && { key: 'a', label: 'Got an A', value: tile('a').value },
    tile('students') && { key: 'students', label: 'Class size', value: tile('students').value },
  ].filter(Boolean);
  const grades = facts.grades;
  const caption = grades?.term ? `Grades, ${grades.term}` : 'Grades';

  return (
    <section className="vc-card vc-difficulty" aria-label={label}>
      <div className="vc-head">
        <Icon name="bar_chart" size={20} />
        <h3>
          <Opener onOpen={onOpen}>
            <span className="vc-code">{label}</span>
            {title ? ` · ${title}` : ''}
          </Opener>
        </h3>
      </div>
      <div className="vc-body">
        {tiles.length > 0 && (
          <div className="vc-kpis" style={{ '--vc-kpis': tiles.length }}>
            {tiles.map((t) => (
              <div key={t.key} className="vc-tile">
                <span>{t.label}</span>
                <b className={t.tone ? `is-${t.tone}` : undefined}>{t.value}</b>
              </div>
            ))}
          </div>
        )}
        <div className="vc-two">
          {grades && (
            <div className="vc-grades">
              <p className="vc-cap">{caption}</p>
              <GradeBars
                groups={grades.groups}
                size="chat"
                label={grades.groups.map((g) => `${g.label} ${Math.round(g.pct)}%`).join(', ')}
              />
            </div>
          )}
          <GpaTrend history={data.grade_history} />
        </div>
      </div>
    </section>
  );
}

/** The course card (ask-chat): band with up to three tiles, section rows, Add to plan and Save. */
function CourseCard({ facts, label, title, onOpen }) {
  const planner = usePlanner();
  const [adding, setAdding] = useState(false);
  const [chosen, setChosen] = useState(null);
  const [failed, setFailed] = useState(null);

  const gpa = facts.tiles.find((t) => t.key === 'gpa');
  const seats = facts.tiles.find((t) => t.key === 'seats');
  const stats = [
    gpa && {
      key: 'gpa',
      value: gpa.value,
      label: facts.difficulty ? `Average GPA · ${DIFFICULTY_LABEL[facts.difficulty]}` : 'Average GPA',
      tone: facts.difficulty,
    },
    facts.rating && { key: 'rating', value: facts.rating.rating, label: 'Instructor rating' },
    seats && { key: 'seats', value: seats.value, label: 'Seats open' },
  ].filter(Boolean);

  // The chat rows lead with the section number alone ("001"); the pop-up keeps "LEC 001".
  const sections = facts.sections && {
    ...facts.sections,
    rows: facts.sections.rows
      .filter((row) => facts.sections.primary.includes(row.row))
      .slice(0, SECTION_ROWS)
      .map((row) => ({ ...row, name: row.row.section || row.name })),
  };

  const add = async () => {
    setAdding(true);
    setFailed(null);
    try {
      setChosen(await planner.propose([{ op: 'add', course: label }]));
    } catch (err) {
      setFailed(plannerError(err).message || "Couldn't add that course. Try again.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <section className="vc-card vc-course" aria-label={label}>
      <div className="vc-band">
        <span className="vc-band-code">{label}{facts.credits ? ` · ${facts.credits} credits` : ''}</span>
        <h3><Opener onOpen={onOpen}>{title || label}</Opener></h3>
        {stats.length > 0 && (
          <div className="vc-stats" style={{ '--vc-stats': stats.length }}>
            {stats.map((s) => <Stat key={s.key} value={s.value} label={s.label} tone={s.tone} />)}
          </div>
        )}
      </div>
      <SectionRows sections={sections} label="Sections" />
      <div className="vc-foot">
        {planner && (
          <button type="button" className="vc-btn is-primary" disabled={adding} onClick={add}>
            {adding ? <span className="vc-spinner" aria-hidden="true" /> : <Icon name="add" size={20} />}
            Add to plan
          </button>
        )}
        <SaveButton className="vc-btn vc-save-btn" label="Save" item={{ kind: 'course', key: label, display_name: label }} />
      </div>
      {failed && (
        <p className="vc-alert vc-line" role="alert"><Icon name="error" size={20} />{failed}</p>
      )}
      {chosen && (
        <div className="vc-chosen">
          <ProposalCard visual={{ type: 'proposed_change', proposal: chosen }} />
        </div>
      )}
    </section>
  );
}

/**
 * One card per course in an answer. A grades question gets the difficulty
 * card (tiles, grade bars, GPA by term); anything that asks about
 * instructors or sections gets the course card (band, tiles, section rows).
 */
export default function CourseAnswerCard({ visual, onSelectCourse }) {
  const openPopup = useOpenCourse();
  const courseId = (visual?.course || '').trim();
  const types = visual?.types || [];
  const gradesOnly = types.some((type) => GRADE_TYPES.has(type))
    && !types.includes('course_instructors') && !types.includes('course_schedule');
  const {
    facts, data, error, loading, retry,
  } = useCourseFacts(courseId, { ratings: !gradesOnly });

  const openCourse = useCallback((identifier) => {
    if (onSelectCourse) onSelectCourse(identifier);
    else openPopup(identifier);
  }, [openPopup, onSelectCourse]);

  if (!courseId) return null;
  if (loading) {
    return (
      <section className="vc-card vc-status-card">
        <PanelState status="loading" label={`Loading ${courseId}`} rows={3} />
      </section>
    );
  }
  if (error || !facts) {
    return (
      <section className="vc-card vc-status-card">
        <PanelState status="error" message={error?.message || 'Course card unavailable.'} onRetry={retry} />
      </section>
    );
  }

  const label = facts.id || courseId;
  const title = titleCase(facts.title || '');
  const onOpen = () => openCourse(label);
  if (gradesOnly) {
    return <DifficultyCard facts={facts} data={data} label={label} title={title} onOpen={onOpen} />;
  }
  return <CourseCard facts={facts} label={label} title={title} onOpen={onOpen} />;
}
