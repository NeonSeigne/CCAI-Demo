/**
 * Words and numbers shared by the plan panel and the proposal cards, so a
 * value reads the same in both places (design 1A, 9A, 12A).
 */

/** "Spring 2027" -> "Spring 27". */
export function shortTerm(term) {
  if (!term) return '';
  return String(term).replace(/\b(19|20)(\d{2})\b/, '$2');
}

/** [3, 3] -> "3", [1, 3] -> "1–3", null -> null. */
export function creditSpan(span) {
  if (!Array.isArray(span) || span[0] == null) return null;
  const [min, max] = span;
  return max == null || max === min ? `${min}` : `${min}–${max}`;
}

/** Totals from the report's credits: "17" or "15–17". */
export function creditTotal(credits) {
  if (!credits || credits.min == null) return null;
  return creditSpan([credits.min, credits.max]);
}

export const STATUS_WORDS = {
  met: { glyph: '✓', word: 'Met' },
  short: { glyph: '✕', word: 'Short' },
  unknown: { glyph: '?', word: 'Unknown' },
};

export const statusWord = (status) => (STATUS_WORDS[status] || STATUS_WORDS.unknown).word;

/** "2 of 4" or "6 of 9 credits" from a rule's counts. */
export function ruleCount(state, unit = 'courses') {
  if (!state || state.needed == null) return null;
  const have = (state.completed || 0) + (state.planned || 0);
  return `${have} of ${state.needed}${unit === 'credits' ? ' credits' : ''}`;
}

/** Just the "have" number, for "1 → 2 of 4". */
export const ruleHave = (state) => (state ? (state.completed || 0) + (state.planned || 0) : null);

/** Per-course grade tag (12A). */
export function difficultyTag(harder) {
  if (harder === true) return { label: 'Harder', key: 'harder' };
  if (harder === false) return { label: 'Typical', key: 'typical' };
  return { label: 'No grade data', key: 'none' };
}

const REASON_WORDS = {
  'class times not published': (school) => `${school} doesn't publish class times`,
};

/** A checker reason in the student's words; the school's name where it helps. */
export function reasonText(reason, school) {
  if (!reason) return null;
  const words = REASON_WORDS[String(reason).toLowerCase()];
  return words ? words(school) : reason;
}

/** "2026-10-01" -> "Oct 2026"; anything unparseable is shown as given. */
export function asOfText(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** "09:05" -> minutes since midnight. */
export function minutes(time) {
  const [h, m] = String(time || '').split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export const WEEKDAYS = [
  { key: 'Mo', short: 'Mon' },
  { key: 'Tu', short: 'Tue' },
  { key: 'We', short: 'Wed' },
  { key: 'Th', short: 'Thu' },
  { key: 'Fr', short: 'Fri' },
];

/** Course ids a clash touches, from `clashes.pairs`. */
export function clashIds(clashes) {
  const ids = new Set();
  (clashes?.pairs || []).forEach((pair) => (pair || []).forEach((id) => ids.add(id)));
  return ids;
}
