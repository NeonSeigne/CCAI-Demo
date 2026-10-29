/**
 * Numbers and words for the My degree board (design D13, D14, D17, D22;
 * eng R12, R14). Pure functions, so the board and its tests agree.
 */
import { gradePoints } from '../completedCourses';

const SEASONS = { winter: 0, spring: 1, summer: 2, fall: 3, autumn: 3 };
const SEASON_NAMES = ['Winter', 'Spring', 'Summer', 'Fall'];

/** "Fall 2027" -> {season: 3, year: 2027}, or null. */
export function parseTerm(term) {
  const match = /^\s*([a-z]+)\s+(\d{4})\s*$/i.exec(String(term || ''));
  if (!match) return null;
  const season = SEASONS[match[1].toLowerCase()];
  if (season == null) return null;
  return { season, year: Number(match[2]) };
}

/** A sort key: year, then season. Unknown spellings sort last. */
export function termOrder(term) {
  const parsed = parseTerm(term);
  return parsed ? parsed.year * 10 + parsed.season : Number.MAX_SAFE_INTEGER;
}

export const sortTerms = (terms) => [...terms].sort((a, b) => termOrder(a) - termOrder(b));

/** The regular term after `term`: Spring -> Fall, Fall -> next Spring. */
export function nextTerm(term) {
  const parsed = parseTerm(term);
  if (!parsed) return null;
  if (parsed.season === 3) return `Spring ${parsed.year + 1}`;
  if (parsed.season === 0) return `Spring ${parsed.year}`;
  return `${SEASON_NAMES[3]} ${parsed.year}`;
}

/** "Spring 2026" -> "Spr 2026" for the slim Past column. */
export const pastTermLabel = (term) => String(term || '').replace(/^Spring\b/, 'Spr');

/** Difficulty by average GPA (tokens: easier >= 3.4, harder < 3.0). */
export function difficultyKey(gpa) {
  if (gpa == null || Number.isNaN(Number(gpa))) return null;
  if (gpa >= 3.4) return 'easier';
  if (gpa < 3.0) return 'harder';
  return 'typical';
}

export const formatGpa = (gpa) => (gpa == null ? null : Number(gpa).toFixed(2));

/** Low end of a credit span; null when unknown. */
export const creditMin = (credits) => (Array.isArray(credits) && credits[0] != null ? Number(credits[0]) : null);

/** Load label -> its tint key. */
export const LOAD_KEYS = { Light: 'easier', Balanced: 'typical', Heavy: 'harder' };

/** Group colours: the six course colours in file order; "Other credit" stays neutral. */
export function groupTone(group, index) {
  if (!group?.rule_id) return 'other';
  return `c${(index % 6) + 1}`;
}

const num = (value) => Math.max(0, Number(value) || 0);

/**
 * The waffle in whole squares (one per credit). Every group's parts, in
 * order (earned without a grade, earned, planned, open), are laid end to
 * end and cut at rounded running totals, so the squares add up to the
 * rounded total and every count shown (key, summary, table) matches them.
 * Hatched credits come from the server (`unknown_grade_credits`: the
 * group's own ungraded courses, never ones counted elsewhere).
 */
export function waffleModel(waffle) {
  let running = 0;
  let edge = 0;
  const cut = (value) => {
    running += num(value);
    const next = Math.round(running);
    const count = next - edge;
    edge = next;
    return count;
  };
  const groups = (waffle?.groups || []).map((group, index) => {
    const earned = num(group.earned);
    const ungraded = Math.min(earned, num(group.unknown_grade_credits));
    const hatched = cut(ungraded);
    const graded = cut(earned - ungraded);
    const planned = cut(group.planned);
    const open = cut(group.open);
    return {
      ...group,
      index,
      tone: groupTone(group, index),
      hatched,
      earned: hatched + graded,
      planned,
      open,
      size: hatched + graded + planned + open,
    };
  });
  const totals = groups.reduce((sum, g) => ({
    earned: sum.earned + g.earned, planned: sum.planned + g.planned, open: sum.open + g.open,
  }), { earned: 0, planned: 0, open: 0 });
  totals.size = totals.earned + totals.planned + totals.open;
  return { groups, totals };
}

/** One square per credit, group after group: ungraded (hatched), earned, planned, open. */
export function waffleSquares(waffle) {
  const squares = [];
  waffleModel(waffle).groups.forEach((g) => {
    const push = (count, state) => {
      for (let i = 0; i < count; i += 1) squares.push({ group: g.index, tone: g.tone, state });
    };
    push(g.hatched, 'unknown');
    push(g.earned - g.hatched, 'earned');
    push(g.planned, 'planned');
    push(g.open, 'open');
  });
  return squares;
}

/** Totals across the waffle's groups, in whole squares. */
export const waffleTotals = (waffle) => waffleModel(waffle).totals;

/** Rule groups not yet met: the count shown when there's no Finish date (D13). */
export const openRequirements = (waffle) => (waffle?.groups || [])
  .filter((group) => group.rule_id && group.status !== 'met').length;

/** "Economics B.A.: 70 earned, 44 planned, 6 open; Statistics 0 of 1" (D22). */
export function waffleSummary(name, waffle) {
  const { groups, totals } = waffleModel(waffle);
  const head = `${name ? `${name}: ` : ''}${totals.earned} earned, ${totals.planned} planned, ${totals.open} open`;
  const short = groups
    .filter((g) => g.rule_id && g.status !== 'met')
    .map((g) => `${g.title} ${g.earned + g.planned} of ${g.size}`);
  return [head, ...short].join('; ');
}

const pastKey = (term) => (parseTerm(term) ? termOrder(term) : -1);

/** Completed courses by term, newest first; courses with no term go under "Earlier". */
export function pastTerms(completed) {
  const byTerm = new Map();
  (completed || []).forEach((course) => {
    const term = course.term || 'Earlier';
    if (!byTerm.has(term)) byTerm.set(term, []);
    byTerm.get(term).push(course);
  });
  return [...byTerm.entries()]
    .map(([term, courses]) => ({
      term,
      courses,
      credits: courses.reduce((sum, c) => sum + (creditMin(c.credits) ?? 0), 0),
      gpa: termGpa(courses),
    }))
    .sort((a, b) => pastKey(b.term) - pastKey(a.term));
}

/** Credit-weighted GPA of graded courses, or null. */
export function termGpa(courses) {
  let points = 0;
  let weight = 0;
  (courses || []).forEach((course) => {
    const value = gradePoints(course.grade);
    if (value == null) return;
    const credits = creditMin(course.credits) ?? 3;
    points += value * credits;
    weight += credits;
  });
  return weight ? points / weight : null;
}

/** Sum of known credits: {min, known}. */
export function creditsOf(courses) {
  let min = 0;
  let known = true;
  courses.forEach((course) => {
    const value = creditMin(course.credits);
    if (value == null) known = false;
    else min += value;
  });
  return { min, known };
}
