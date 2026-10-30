/**
 * Words and numbers shared by the plan panel and the proposal cards, so a
 * value reads the same in both places (design 1A, 9A, 12A).
 */

/** [3, 3] -> "3", [1, 3] -> "1–3", null -> null. */
export function creditSpan(span) {
  if (!Array.isArray(span) || span[0] == null) return null;
  const [min, max] = span;
  return max == null || max === min ? `${min}` : `${min}–${max}`;
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
