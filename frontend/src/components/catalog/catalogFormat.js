/**
 * Plain helpers shared by the Courses page and Compare: labels per school
 * (design 25A), "Not available" lines (R3), Ask prompts (15A) and the ticked
 * courses that carry between the two pages (29A).
 */

export const MAX_TICKED = 4;
export const DEBOUNCE_MS = 300;
const TICK_STORE = 'cc.courses.ticked';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Ticked courses for this tab ([{identifier, title}]); empty when storage is blocked. */
export function readTicked() {
  try {
    const list = JSON.parse(window.sessionStorage.getItem(TICK_STORE) || '[]');
    if (!Array.isArray(list)) return [];
    return list.filter((item) => item && typeof item.identifier === 'string').slice(0, MAX_TICKED);
  } catch {
    return [];
  }
}

export function writeTicked(list) {
  try {
    window.sessionStorage.setItem(TICK_STORE, JSON.stringify(list.slice(0, MAX_TICKED)));
  } catch {
    // Private mode or blocked storage: ticks just won't survive a page change.
  }
}

/** "2026-09-03" (or an ISO timestamp) -> "Sep 3"; anything else unchanged. */
export function shortDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!match) return value ? String(value) : '';
  return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}`;
}

export const sourceName = (source) => source?.name || 'its course source';

export const notAvailableText = (school, source) => `Not available for ${school} (${sourceName(source)})`;

export const formatGpa = (value) => (value == null || Number.isNaN(Number(value)) ? null : Number(value).toFixed(2));

export const formatPct = (value) => (value == null ? null : `${Math.round(Number(value))}%`);

/** "COMP SCI 300 Programming II" saved as display_name -> "Programming II". */
export function titleFromSaved(item) {
  const name = (item?.display_name || '').trim();
  const key = (item?.key || '').trim();
  if (name && key && name.toUpperCase().startsWith(key.toUpperCase())) {
    return name.slice(key.length).replace(/^[\s:·-]+/, '');
  }
  return name === key ? '' : name;
}

/** "A", "A and B", "A, B and C". */
export function joinCodes(codes) {
  if (codes.length <= 1) return codes.join('');
  return `${codes.slice(0, -1).join(', ')} and ${codes[codes.length - 1]}`;
}

export const askCoursePrompt = (code, title) => (
  `Tell me about ${[code, title].filter(Boolean).join(' ')}: how hard is it and what should I know?`
);

export const askComparePrompt = (codes) => `Compare ${joinCodes(codes)} for difficulty and workload.`;

/** A new chat with the prompt in the composer, not sent (15A). */
export const askState = (prompt) => ({ startNew: true, pendingPrompt: prompt });

export const compareUrl = (ids) => (
  ids.length ? `/courses/compare?${new URLSearchParams({ ids: ids.join(',') })}` : '/courses/compare'
);

/** Level chips: hundreds for 3-digit numbers (UW), thousands for 4-digit (UVA, CU). */
export function levelOptions(identifiers) {
  const fourDigit = identifiers.some((id) => /\b\d{4}[A-Z]?$/i.test(String(id || '').trim()));
  return fourDigit ? [1000, 2000, 3000, 4000, 5000] : [100, 200, 300, 400, 500, 600, 700];
}

/** The level a course number falls in, matching the backend's course_level. */
export function levelOf(identifier) {
  const match = /(\d{3,4})[A-Z]?$/i.exec(String(identifier || '').trim());
  if (!match) return null;
  const step = match[1].length === 3 ? 100 : 1000;
  return Math.floor(Number(match[1]) / step) * step;
}

const toneOf = (bucket) => {
  const key = bucket.toLowerCase();
  if (key === 'ab') return 'ab';
  if (key === 'bc') return 'bc';
  if (key.startsWith('a')) return 'a';
  if (key.startsWith('b')) return 'b';
  if (key.startsWith('c')) return 'c';
  return 'df';
};

/** Distribution {a: 120, ab: 80, ...} -> segments with share of the graded total. */
export function gradeSegments(distribution) {
  const entries = Object.entries(distribution || {}).filter(([, count]) => Number(count) > 0);
  const total = entries.reduce((sum, [, count]) => sum + Number(count), 0);
  if (!total) return [];
  return entries.map(([bucket, count]) => ({
    key: bucket,
    label: bucket.toUpperCase(),
    count: Number(count),
    pct: (100 * Number(count)) / total,
    tone: toneOf(bucket),
  }));
}

/** "Spring 2026 · 486 students". */
export function gradesLabel(grades) {
  const parts = [];
  if (grades?.term) parts.push(grades.term);
  if (grades?.students) parts.push(`${grades.students.toLocaleString('en-US')} students`);
  return parts.join(' · ');
}

const PRIMARY = new Set(['LEC', 'LECTURE']);

export const primarySections = (rows = []) => {
  const lectures = rows.filter((row) => PRIMARY.has(String(row.type || '').toUpperCase()));
  return lectures.length ? lectures : rows;
};

/**
 * How a school's seats read (25A): UW "Spring 2027 lectures" (live), CU
 * "Spring 2026 sections, seats not published", UVA "Fall 2026 · as of Sep 3".
 */
export function seatsHeading(sections) {
  const term = sections?.term || 'Current term';
  if (!sections?.seats_published) return `${term} sections, seats not published`;
  if (sections.historical) {
    return sections.as_of ? `${term} · as of ${shortDate(sections.as_of)}` : `${term} · seats at snapshot`;
  }
  const rows = sections.rows || [];
  const lectures = rows.some((row) => PRIMARY.has(String(row.type || '').toUpperCase()));
  return `${term} ${lectures ? 'lectures' : 'sections'}`;
}

export const sectionName = (row) => [row.type, row.section].filter(Boolean).join(' ') || 'Section';

/** "4 left" (live), "4 open" (snapshot), "Full"; null when seats aren't known. */
export function seatsText(row, historical) {
  if (row.seats_open == null) return null;
  if (row.seats_open <= 0 || row.is_open === false) return 'Full';
  return `${row.seats_open} ${historical ? 'open' : 'left'}`;
}

export const safeId = (value) => String(value || '').replace(/[^A-Za-z0-9]+/g, '-');
