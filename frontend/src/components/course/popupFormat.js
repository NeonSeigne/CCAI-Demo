/** Formatting shared by the course pop-up's band, tabs and tiles. */

/** Difficulty by average GPA (design r5): easier ≥ 3.4, harder < 3.0. */
export function difficultyOf(gpa) {
  const value = Number(gpa);
  if (gpa == null || Number.isNaN(value)) return null;
  if (value >= 3.4) return 'easier';
  if (value < 3.0) return 'harder';
  return 'typical';
}

export const DIFFICULTY_LABEL = { easier: 'Easier', typical: 'Typical', harder: 'Harder' };

const SEASON_SHORT = {
  fall: 'Fa', spring: 'Sp', summer: 'Su', winter: 'Wi', january: 'Ja',
};

/** "Fall 2025" -> "Fa 25"; anything else unchanged. */
export function termShort(term) {
  const match = /^(\w+)\s+(\d{4})$/.exec(String(term || '').trim());
  if (!match) return String(term || '');
  const season = SEASON_SHORT[match[1].toLowerCase()];
  return season ? `${season} ${match[2].slice(2)}` : String(term);
}

export const gpaText = (value) => (value == null || Number.isNaN(Number(value)) ? null : Number(value).toFixed(2));

export const pctText = (value) => (value == null || Number.isNaN(Number(value)) ? null : `${Math.round(Number(value))}%`);

/** Credits `{min, max}` or `[min, max]` or a number -> "3" / "1–3"; null when absent. */
export function creditsText(credits) {
  if (credits == null) return null;
  if (typeof credits === 'number') return String(credits);
  const [min, max] = Array.isArray(credits) ? credits : [credits.min, credits.max];
  if (min == null && max == null) return null;
  if (min == null || max == null || min === max) return String(min ?? max);
  return `${min}–${max}`;
}

/** The upper end of a credits value, for bars. */
export function creditsHigh(credits) {
  if (credits == null) return null;
  if (typeof credits === 'number') return credits;
  const [min, max] = Array.isArray(credits) ? credits : [credits.min, credits.max];
  return max ?? min ?? null;
}

/** "José Q. O'Neil" -> "jose oneil", for matching ratings to grade rows. */
export function nameKey(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length > 1)
    .join(' ');
}

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
