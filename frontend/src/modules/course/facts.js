/**
 * What a course's catalog payload says, in the words every screen uses:
 * stat tiles, grade groups per school, section rows with their seat tag,
 * prerequisite tags with the student's states, difficulty and the instructor
 * rating. Difficulty is the backend's (`/api/catalog/{id}` `difficulty`,
 * eng review R5); nothing here computes it from a GPA.
 */
import { meetingClock } from '../campus/time';

export const DIFFICULTY_LABEL = { easier: 'Easier', typical: 'Typical', harder: 'Harder' };

const DIFFICULTIES = new Set(Object.keys(DIFFICULTY_LABEL));

/** 'easier' | 'typical' | 'harder' | null, as the backend sent it. */
export function difficultyOf(payload) {
  const value = payload?.difficulty;
  return DIFFICULTIES.has(value) ? value : null;
}

/**
 * For rows that carry only the planner's `harder` flag (degree board, plan
 * report): 'harder' when set, 'typical' when false, null when unknown.
 * `difficulty`, when a row has it, wins.
 */
export function difficultyFromRow(row) {
  if (DIFFICULTIES.has(row?.difficulty)) return row.difficulty;
  if (row?.harder === true) return 'harder';
  if (row?.harder === false) return 'typical';
  return null;
}

export const gpaText = (value) => (value == null || Number.isNaN(Number(value)) ? null : Number(value).toFixed(2));

export const pctText = (value) => (value == null || Number.isNaN(Number(value)) ? null : `${Math.round(Number(value))}%`);

const countText = (value) => Number(value).toLocaleString('en-US');

/** Credits `{min, max}`, `[min, max]` or a number -> "3" / "1–3"; null when absent. */
export function creditsText(credits) {
  if (credits == null) return null;
  if (typeof credits === 'number') return String(credits);
  const [min, max] = Array.isArray(credits) ? credits : [credits.min, credits.max];
  if (min == null && max == null) return null;
  if (min == null || max == null || min === max) return String(min ?? max);
  return `${min}–${max}`;
}

// ---------------------------------------------------------------------------
// Grades (eng review R11)

const SPLIT = new Set(['AB', 'BC']);

/** The group a bucket key falls in: "AB" stays, "A-" -> "A", "DFW" stays, "D+" -> "D". */
function groupOf(key, scale) {
  const upper = String(key || '').trim().toUpperCase();
  if (scale === 'uw') {
    if (SPLIT.has(upper)) return upper;
    if (upper === 'D' || upper === 'F') return 'D/F';
  }
  if (upper === 'DFW') return 'DFW';
  const letter = upper.match(/^([A-F])[+-]?$/);
  return letter ? letter[1] : upper;
}

const GROUP_ORDER = ['A', 'AB', 'B', 'BC', 'C', 'D', 'D/F', 'F', 'DFW'];
const rank = (group) => {
  const at = GROUP_ORDER.indexOf(group);
  return at < 0 ? GROUP_ORDER.length : at;
};

/**
 * A distribution grouped by letter, keeping every student:
 *   UW  (a, ab, b, bc, c, d, f)   -> A, AB, B, BC, C, D/F
 *   UVA (A+ … C-, DFW)            -> A, B, C, DFW (DFW keeps its name: it counts withdrawals too)
 *   any other school              -> +/- folded into the letter; D and F merged when both are separate
 * Returns [{key, label, count, pct, top}] best grade first (`top`: the largest
 * group), or [] without graded students. `buckets` (the payload's order) breaks ties.
 */
export function gradeGroups(distribution, buckets) {
  const entries = Object.entries(distribution || {}).filter(([, count]) => Number(count) > 0);
  const total = entries.reduce((sum, [, count]) => sum + Number(count), 0);
  if (!total) return [];
  const keys = entries.map(([key]) => String(key).toUpperCase());
  const scale = keys.some((key) => SPLIT.has(key)) ? 'uw' : 'letters';
  const groups = new Map();
  const order = (buckets || []).map((b) => String(b?.key || '').toUpperCase());
  entries.forEach(([key, count]) => {
    const group = groupOf(key, scale);
    const at = order.indexOf(String(key).toUpperCase());
    const current = groups.get(group) || { key: group, label: group, count: 0, first: at < 0 ? Infinity : at };
    current.count += Number(count);
    current.first = Math.min(current.first, at < 0 ? Infinity : at);
    groups.set(group, current);
  });
  // Other schools: D and F merge only when both came as separate letters.
  if (scale === 'letters' && groups.has('D') && groups.has('F')) {
    const d = groups.get('D');
    const f = groups.get('F');
    groups.delete('D');
    groups.delete('F');
    groups.set('D/F', { key: 'D/F', label: 'D/F', count: d.count + f.count, first: Math.min(d.first, f.first) });
  }
  const list = [...groups.values()].sort((a, b) => rank(a.key) - rank(b.key) || a.first - b.first);
  const most = Math.max(...list.map((g) => g.count));
  let marked = false;
  return list.map(({ key, label, count }) => {
    const top = !marked && count === most;
    if (top) marked = true;
    return { key, label, count, pct: (100 * count) / total, top };
  });
}

// ---------------------------------------------------------------------------
// Sections (eng review R8, design Q14)

const PRIMARY = new Set(['LEC', 'LECTURE']);

// Long type names (UVA's "Lecture") shortened to the codes the mockups use.
const TYPE_CODE = {
  LECTURE: 'LEC', DISCUSSION: 'DIS', LABORATORY: 'LAB', SEMINAR: 'SEM', STUDIO: 'STU', WORKSHOP: 'WKS',
  'INDEPENDENT STUDY': 'IND', PRACTICUM: 'PRA', CLINICAL: 'CLN', DRILL: 'DRL',
};
const typeCode = (type) => {
  if (!type) return null;
  const upper = String(type).trim().toUpperCase();
  return TYPE_CODE[upper] || (upper.length > 4 ? upper.slice(0, 3) : upper);
};

/** "LEC 001": the section's type code and number. */
export const sectionName = (row) => [typeCode(row?.type), row?.section].filter(Boolean).join(' ') || 'Section';

/** "MoWe 9:30–10:45" from parsed meeting times; null without them. */
export function meetingText(times) {
  const list = (times || []).filter((t) => t?.day && t.start && t.end);
  if (!list.length) return null;
  const slots = new Map();
  list.forEach((t) => {
    const slot = `${t.start}-${t.end}`;
    slots.set(slot, [...(slots.get(slot) || []), t.day]);
  });
  return [...slots.entries()]
    .map(([slot, days]) => {
      const [start, end] = slot.split('-');
      return `${days.join('')} ${meetingClock(start)}–${meetingClock(end)}`;
    })
    .join(', ');
}

/**
 * A section's tag: live data reads {text: "84 seats", kind: 'seats'},
 * {text: "4 waiting", kind: 'waiting'} or {text: 'Full', kind: 'full'};
 * snapshot data reads {text: "41 of 60 · Fall 2025", kind: 'snapshot'} (a
 * neutral tag, never the seats style); null when the school publishes no seats.
 */
export function seatTag(row, sections) {
  if (!sections?.seats_published) return null;
  if (sections.historical) {
    if (row?.enrolled == null || !row?.capacity) return null;
    const term = sections.term ? ` · ${sections.term}` : '';
    return { text: `${countText(row.enrolled)} of ${countText(row.capacity)}${term}`, kind: 'snapshot' };
  }
  const open = row?.seats_open;
  if (open != null && open > 0 && row.is_open !== false) return { text: `${countText(open)} seats`, kind: 'seats' };
  if (Number(row?.waitlist) > 0) return { text: `${countText(row.waitlist)} waiting`, kind: 'waiting' };
  if (open != null) return { text: 'Full', kind: 'full' };
  return null;
}

/**
 * {term, historical, asOf, primary, rows: [{key, name, type, when, instructors, place, tag, row}]}
 * or null when the course lists no sections. `primary` are the lecture rows
 * (all rows when none is a lecture).
 */
export function sectionFacts(sections) {
  const rows = sections?.rows || [];
  if (!rows.length) return null;
  const lectures = rows.filter((row) => PRIMARY.has(String(row.type || '').toUpperCase()));
  const shaped = rows.map((row, index) => ({
    key: `${row.type || ''}-${row.section || ''}-${index}`,
    name: sectionName(row),
    type: row.type || null,
    // Parsed times read "MoWe 2:00–3:15"; the feed's own text is the fallback.
    when: meetingText(row.meeting_times) || (row.meetings || []).filter(Boolean).join(', '),
    instructors: row.instructors || null,
    place: row.bldg || null,
    tag: seatTag(row, sections),
    row,
  }));
  return {
    term: sections.term || null,
    historical: Boolean(sections.historical),
    asOf: sections.as_of || null,
    primary: lectures.length ? lectures : rows,
    rows: shaped,
  };
}

// ---------------------------------------------------------------------------
// Prerequisites

/** Leaf course ids of a prerequisite tree, in order, without repeats. */
export function prereqCourses(node) {
  if (!node) return [];
  if (node.kind === 'course') return node.course ? [node.course] : [];
  const out = [];
  (node.children || []).forEach((child) => {
    prereqCourses(child).forEach((id) => { if (!out.includes(id)) out.push(id); });
  });
  return out;
}

/**
 * [{id, title, timing, state}] for the courses a course requires: the tree's
 * leaves (UW), else the courses its prerequisite text names (UVA). `state`
 * is the student's ('done' | 'now') from `states` (`prereqStates(plan, today)`), else null.
 */
export function prereqTags(payload, states) {
  const fromTree = prereqCourses(payload?.prereq_tree).map((id) => ({ id, title: null, timing: null }));
  const named = (payload?.prerequisites?.courses || [])
    .filter((c) => c?.identifier)
    .map((c) => ({ id: c.identifier, title: c.title || null, timing: c.timing || null }));
  const list = fromTree.length ? fromTree : named;
  const byKey = new Map(Object.entries(states || {}).map(([id, state]) => [id.toUpperCase(), state]));
  const titles = new Map(named.map((c) => [c.id.toUpperCase(), c.title]));
  return list.map((c) => ({
    ...c,
    title: c.title || titles.get(c.id.toUpperCase()) || null,
    state: byKey.get(c.id.toUpperCase()) || null,
  }));
}

// ---------------------------------------------------------------------------
// The whole course

/** {rating: "3.6", instructors, term} from a ratings payload; null when nobody is rated (Q15). */
export function instructorRating(ratings) {
  const value = ratings?.instructor_rating;
  if (!value || value.rating == null || Number.isNaN(Number(value.rating))) return null;
  return { rating: Number(value.rating).toFixed(1), instructors: value.instructors ?? null, term: value.term ?? null };
}

/**
 * Everything a course card shows, from `/api/catalog/{id}` (and optionally
 * its ratings payload and the student's prerequisite states):
 *
 *   id, title, credits ("3"), description, genEd
 *   difficulty ('easier'|'typical'|'harder'|null), difficultyLabel ("Harder"|null)
 *   gpa ("3.41"|null, latest term), averageGpa (the GPA the difficulty is read from), gradesTerm
 *   tiles      [{key, label, value, tone?, sub?}] in order gpa, rating, seats, a, df, students;
 *              a tile with no data is left out (design Q5); seats only for live data (R8)
 *   grades     {term, students, groups} | null (latest term), gradesAll (every term) | null
 *   sections   see `sectionFacts`
 *   prereqs    see `prereqTags`
 *   rating     see `instructorRating`
 */
export function courseFacts(payload, { ratings, states } = {}) {
  if (!payload) return null;
  const grades = payload.grades || null;
  const difficulty = difficultyOf(payload);
  const difficultyLabel = difficulty ? DIFFICULTY_LABEL[difficulty] : null;
  const gpa = gpaText(grades?.gpa);
  // The GPA the difficulty label is read from: the backend's rule uses the
  // course's average over every term (`cumulative`), not the latest term's.
  const averageGpa = gpaText(payload.cumulative?.gpa) || gpa;
  const rating = instructorRating(ratings);
  const sections = payload.sections || null;
  const tiles = [];
  if (averageGpa) {
    tiles.push({
      key: 'gpa',
      label: difficultyLabel ? `Average GPA · ${difficultyLabel}` : 'Average GPA',
      value: averageGpa,
      tone: difficulty,
    });
  }
  if (rating) tiles.push({ key: 'rating', label: 'Instructor rating', value: rating.rating });
  if (sections?.seats_published && !sections.historical && sections.seats_open != null) {
    tiles.push({ key: 'seats', label: 'Seats open', value: countText(sections.seats_open) });
  }
  const pctA = pctText(grades?.pct_a);
  if (pctA) tiles.push({ key: 'a', label: 'Got an A', value: pctA, tone: 'a' });
  const pctDf = pctText(grades?.pct_df);
  if (pctDf) tiles.push({ key: 'df', label: grades?.labels?.df === 'DFW' ? 'DFW' : 'D or F', value: pctDf, tone: 'df' });
  if (grades?.students) tiles.push({ key: 'students', label: 'Students', value: countText(grades.students) });

  const groupsOf = (figure) => {
    const groups = gradeGroups(figure?.distribution, figure?.buckets || grades?.buckets);
    return groups.length ? { term: figure.term || null, students: figure.students ?? null, groups } : null;
  };

  return {
    id: payload.identifier || null,
    title: payload.title || null,
    credits: creditsText(payload.credits),
    description: payload.description || null,
    genEd: payload.gen_ed || [],
    difficulty,
    difficultyLabel,
    gpa,
    averageGpa,
    gradesTerm: grades?.term || null,
    tiles,
    grades: groupsOf(grades),
    gradesAll: groupsOf(payload.cumulative),
    sections: sectionFacts(sections),
    prereqs: prereqTags(payload, states),
    rating,
  };
}
