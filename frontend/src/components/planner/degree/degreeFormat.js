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

const round = (value) => Math.max(0, Math.round(Number(value) || 0));

/**
 * Credits of a group's completed courses with no grade on record, so the
 * waffle can hatch those squares. Counted-elsewhere courses add nothing.
 */
export function ungradedCredits(group, completed) {
  if (!group?.unknown_grade) return 0;
  const elsewhere = new Set(group.counted_elsewhere || []);
  const byId = new Map((completed || []).map((c) => [c.id, c]));
  let total = 0;
  let found = 0;
  (group.courses || []).forEach((id) => {
    const course = byId.get(id);
    if (!course || elsewhere.has(id) || course.grade) return;
    found += 1;
    total += creditMin(course.credits) ?? 3;
  });
  if (!found) total = group.unknown_grade * 3;
  return Math.min(round(group.earned), round(total));
}

/**
 * One square per credit, group after group: earned, earned without a grade
 * (hatched), planned, open. Sizes are whole credits.
 */
export function waffleSquares(waffle, completed) {
  const squares = [];
  (waffle?.groups || []).forEach((group, index) => {
    const tone = groupTone(group, index);
    const earned = round(group.earned);
    const hatched = ungradedCredits(group, completed);
    const planned = round(group.planned);
    const open = round(group.open);
    const push = (count, state) => {
      for (let i = 0; i < count; i += 1) squares.push({ group: index, tone, state });
    };
    push(hatched, 'unknown');
    push(earned - hatched, 'earned');
    push(planned, 'planned');
    push(open, 'open');
  });
  return squares;
}

/** Totals across the waffle's groups. */
export function waffleTotals(waffle) {
  const totals = { earned: 0, planned: 0, open: 0 };
  (waffle?.groups || []).forEach((group) => {
    totals.earned += round(group.earned);
    totals.planned += round(group.planned);
    totals.open += round(group.open);
  });
  totals.size = waffle?.total_credits ?? totals.earned + totals.planned + totals.open;
  return totals;
}

/** Rule groups not yet met: the count shown when there's no Finish date (D13). */
export const openRequirements = (waffle) => (waffle?.groups || [])
  .filter((group) => group.rule_id && group.status !== 'met').length;

/** "Economics B.A.: 70 earned, 44 planned, 6 open; Statistics 0 of 1" (D22). */
export function waffleSummary(name, waffle) {
  const totals = waffleTotals(waffle);
  const head = `${name ? `${name}: ` : ''}${totals.earned} earned, ${totals.planned} planned, ${totals.open} open`;
  const short = (waffle?.groups || [])
    .filter((group) => group.rule_id && group.status !== 'met')
    .map((group) => `${group.title} ${round(group.earned) + round(group.planned)} of ${round(group.size)}`);
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
