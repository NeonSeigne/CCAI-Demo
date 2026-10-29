/**
 * Pure helpers for the semester view: course colours, difficulty classes,
 * section times and seats, fits and clashes, requirement gains, terms.
 */
import { WEEKDAYS, minutes } from '../planFormat';

const COURSE_COLOURS = 6;

const hash = (text) => {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = ((h * 31) + text.charCodeAt(i)) >>> 0; // eslint-disable-line no-bitwise
  return h;
};

/**
 * A course colour index (1–6) per id: hashed, so a course keeps its colour
 * when others come and go; a clash with an earlier course takes the next free one.
 */
export function courseColours(ids) {
  const taken = new Set();
  const out = new Map();
  ids.forEach((id) => {
    if (out.has(id)) return;
    let slot = hash(String(id)) % COURSE_COLOURS;
    for (let i = 0; i < COURSE_COLOURS && taken.has(slot); i += 1) slot = (slot + 1) % COURSE_COLOURS;
    if (taken.size < COURSE_COLOURS) taken.add(slot);
    out.set(id, slot + 1);
  });
  return out;
}

/** CSS custom properties for a course's colour, used only by its code, day strip and week blocks. */
export const colourVars = (index) => (index ? {
  '--sv-course': `var(--course-${index})`,
  '--sv-course-ink': `var(--course-${index}-ink)`,
  '--sv-course-tint': `var(--course-${index}-tint)`,
} : {});

/**
 * 'harder' | 'typical' | 'easier' | null for one course. The report's
 * `harder` flag (the school's hardest third) wins, so the chips agree with
 * the Load label; otherwise the average GPA: ≥ 3.4 easier, < 3.0 harder.
 */
export function difficultyOf(harder, gpa) {
  if (harder === true) return 'harder';
  const value = gpa == null ? null : Number(gpa);
  if (value != null && Number.isFinite(value)) {
    if (value >= 3.4) return 'easier';
    if (value < 3.0 && harder !== false) return 'harder';
    return 'typical';
  }
  if (harder === false) return 'typical';
  return null;
}

export const LOAD_LEVELS = ['Light', 'Balanced', 'Heavy'];

/** "MoWeFr 9:00am - 9:50am (01/14-05/01)" -> [{day, start, end}]; anything else -> []. */
export function parseMeeting(text) {
  const clean = String(text || '').replace(/\(.*?\)/g, '').trim();
  const match = clean.match(/^([A-Za-z]+)\s+(\d{1,2}):(\d{2})\s*([ap])m\s*-\s*(\d{1,2}):(\d{2})\s*([ap])m$/i);
  if (!match) return [];
  const letters = match[1].toLowerCase();
  if (letters.length % 2) return [];
  const days = [];
  for (let i = 0; i < letters.length; i += 2) {
    const key = letters[i].toUpperCase() + letters[i + 1];
    if (!['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].includes(key)) return [];
    days.push(key);
  }
  const clock = (h, m, half) => {
    const hour = (Number(h) % 12) + (half.toLowerCase() === 'p' ? 12 : 0);
    return `${String(hour).padStart(2, '0')}:${m}`;
  };
  const start = clock(match[2], match[3], match[4]);
  const end = clock(match[5], match[6], match[7]);
  return days.map((day) => ({ day, start, end }));
}

/**
 * Every meeting of a catalog section row: [] when the school gives no times,
 * null when a time is given but can't be read (never guess around it).
 */
export const meetingsOf = (row) => {
  const texts = (row?.meetings || []).filter((text) => typeof text === 'string' && text.trim());
  const out = [];
  for (const text of texts) {
    const parsed = parseMeeting(text);
    if (!parsed.length) return null;
    out.push(...parsed);
  }
  return out;
};

// ---------------------------------------------------------------------------
// Dates (R12): "today" for the Ask home and the prerequisite graph.

const SEASON_MONTHS = {
  winter: [1, 1], january: [1, 1], spring: [1, 5], summer: [5, 8], fall: [8, 12], autumn: [8, 12],
};

/** Today in the school's time zone, as YYYY-MM-DD. */
export function dateIn(timezone, now = new Date()) {
  try {
    return now.toLocaleDateString('en-CA', timezone ? { timeZone: timezone } : {});
  } catch {
    return now.toLocaleDateString('en-CA');
  }
}

const parseTerm = (label) => {
  const match = /^([a-z]+)\s+(\d{4})$/i.exec(String(label || '').trim());
  const months = match && SEASON_MONTHS[match[1].toLowerCase()];
  return months ? { year: Number(match[2]), months } : null;
};

/** "Fall 2026" -> a number that orders terms; null for a label that isn't a season and year. */
export function termRank(label) {
  const term = parseTerm(label);
  return term ? term.year * 12 + term.months[0] : null;
}

/** Does "Fall 2026" (August to December 2026) take in `date`? False for unreadable labels. */
export function termSpans(label, date) {
  const term = parseTerm(label);
  const match = /^(\d{4})-(\d{2})/.exec(String(date || ''));
  if (!term || !match) return false;
  const month = Number(match[2]);
  return Number(match[1]) === term.year && month >= term.months[0] && month <= term.months[1];
}

/** "(01/20/2027 - 05/04/2027)" in a meeting string -> {from: '2027-01-20', to: '2027-05-04'}; null without full dates. */
export function meetingDates(text) {
  const match = /\((\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})\)/.exec(String(text || ''));
  if (!match) return null;
  const [, m1, d1, y1, m2, d2, y2] = match;
  return { from: `${y1}-${m1}-${d1}`, to: `${y2}-${m2}-${d2}` };
}

const DAY_KEYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * A section row's meetings on `date` (YYYY-MM-DD): [] when it doesn't meet
 * that day, null when any of its times or date ranges is missing or can't be
 * read (the Ask home then shows nothing rather than guess).
 */
export function meetingsOnDate(row, date) {
  const texts = (row?.meetings || []).filter((text) => typeof text === 'string' && text.trim());
  if (!texts.length) return null;
  const [y, m, d] = String(date).split('-').map(Number);
  const day = DAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const out = [];
  for (const text of texts) {
    const meetings = parseMeeting(text);
    const dates = meetingDates(text);
    if (!meetings.length || !dates) return null;
    if (date >= dates.from && date <= dates.to) out.push(...meetings.filter((meeting) => meeting.day === day));
  }
  return out;
}

/** The plan's courses in the term that takes in `date`, with chosen sections. */
export function coursesOnDate(plan, date) {
  return (plan?.courses || []).filter((c) => c?.id && c.sections?.length && termSpans(c.term, date));
}

/**
 * "Your classes today" (R12): the chosen sections of `coursesOnDate` that
 * meet on `date`, earliest first, from `summaries` (id -> /api/catalog/{id}).
 * Null when anything needed is unknown: no such courses, a summary missing or
 * for another term, a chosen section not listed, or a time or date range
 * that can't be read.
 */
export function classesOn(plan, summaries, date) {
  const courses = coursesOnDate(plan, date);
  if (!courses.length) return null;
  const out = [];
  for (const course of courses) {
    const summary = summaries?.get(course.id);
    const sections = summary?.sections;
    if (!sections || String(sections.term || '').trim().toLowerCase() !== String(course.term).trim().toLowerCase()) return null;
    const rows = (sections.rows || []).filter((row) => sectionMatches(row, course.sections));
    if (!rows.length) return null;
    for (const row of rows) {
      const meetings = meetingsOnDate(row, date);
      if (!meetings) return null;
      meetings.forEach((meeting) => out.push({
        id: course.id,
        title: summary.title,
        part: partLabel(row),
        start: meeting.start,
        end: meeting.end,
        place: row.bldg || null,
      }));
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * {id: 'done' | 'now'} for the prerequisite graph: completed courses and
 * courses planned in earlier terms are done; courses in the term that takes
 * in `date` are this term's.
 */
export function prereqStates(plan, date) {
  const states = {};
  (plan?.profile?.completed || []).forEach((entry) => {
    const id = typeof entry === 'string' ? entry : entry?.id;
    if (id) states[id] = 'done';
  });
  const now = (plan?.courses || []).find((c) => termSpans(c.term, date))?.term;
  const nowRank = termRank(now);
  (plan?.courses || []).forEach((c) => {
    if (!c?.id || states[c.id]) return;
    if (now && c.term === now) states[c.id] = 'now';
    else if (nowRank != null && termRank(c.term) != null && termRank(c.term) < nowRank) states[c.id] = 'done';
  });
  return states;
}

/**
 * The id the planner knows a catalog section by: `id` (or `class_number`)
 * when the catalog sends one, else the section number.
 */
export const sectionId = (row) => String(row?.id ?? row?.class_number ?? row?.section ?? '');

/** Does this catalog row match one of the plan's chosen section ids? */
export const sectionMatches = (row, ids) => {
  if (!ids?.length) return false;
  const wanted = new Set(ids.map(String));
  return wanted.has(sectionId(row)) || wanted.has(String(row?.section ?? ''));
};

const PRIMARY = new Set(['LEC', 'LECTURE']);
export const isPrimary = (row) => PRIMARY.has(String(row?.type || '').toUpperCase());

/** "LEC" for the lecture part, the row's type otherwise ("DIS", "LAB"). */
export const partLabel = (row) => {
  const type = String(row?.type || '').toUpperCase();
  if (type === 'LECTURE') return 'LEC';
  if (type === 'DISCUSSION') return 'DIS';
  if (type === 'LABORATORY') return 'LAB';
  return type || 'Sec';
};

/**
 * The sections a card shows: the chosen ones, else the only primary
 * section when there is just one (nothing is guessed).
 */
export function shownSections(rows, chosen) {
  const list = rows || [];
  if (chosen?.length) return list.filter((row) => sectionMatches(row, chosen));
  const primary = list.filter(isPrimary);
  const pool = primary.length ? primary : list;
  return pool.length === 1 ? pool : [];
}

/** "12 of 90 left", with the fill (taken share) for the bar; null when the school gives no counts. */
export function seatsOf(row) {
  const open = row?.seats_open;
  const capacity = row?.capacity;
  if (open == null || capacity == null || !capacity) return null;
  const taken = Math.max(0, Math.min(1, (capacity - open) / capacity));
  return { open, capacity, taken, low: open <= Math.max(5, capacity * 0.1) };
}

/** "Lee Marsh, Ann Wu" -> "L. Marsh". */
export function shortName(names) {
  const first = String(names || '').split(/[,;]/)[0].trim();
  if (!first || /^(staff|tba|tbd)$/i.test(first)) return null;
  const parts = first.split(/\s+/);
  if (parts.length < 2) return first;
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

/** The rating for a section's instructor from `/api/catalog/ratings/{id}`, matched by last name. */
export function ratingFor(names, ratings) {
  const first = String(names || '').split(/[,;]/)[0].trim().toLowerCase();
  if (!first || !ratings?.length) return null;
  const last = first.split(/\s+/).pop();
  const found = ratings.find((r) => {
    const name = String(r?.name || '').toLowerCase();
    return name === first || name.split(/\s+/).pop() === last;
  });
  return found?.rating != null ? Number(found.rating) : null;
}

const overlaps = (a, b) => a.day === b.day && minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end);

/** Courses whose blocks a set of meetings runs into. */
export function clashesWith(meetings, blocks, course) {
  const hit = new Set();
  meetings.forEach((m) => blocks.forEach((b) => {
    if (b.course !== course && overlaps(m, b)) hit.add(b.course);
  }));
  return [...hit];
}

const KIND_PARTS = {
  lecture: 'LEC', lab: 'LAB', laboratory: 'LAB', discussion: 'DIS', seminar: 'SEM',
};
const CORE_PARTS = new Set(['LEC', 'LAB', 'DIS']);

/**
 * The parts a full enrolment takes: from the rows' `requires` (the
 * backend's bundle data) when any row carries it, else lecture plus lab /
 * discussion. Optional kinds (SEM, IND…) are left out.
 */
export function requiredParts(rows) {
  const list = rows || [];
  const parts = new Set(list.map(partLabel));
  if (list.some((row) => Array.isArray(row?.requires))) {
    const out = new Set(list.filter(isPrimary).map(partLabel));
    if (!out.size) list.filter((row) => Array.isArray(row?.requires)).forEach((row) => out.add(partLabel(row)));
    list.forEach((row) => (row?.requires || []).forEach((kind) => {
      const part = KIND_PARTS[String(kind).toLowerCase()] || String(kind).toUpperCase();
      if (parts.has(part)) out.add(part);
    }));
    return out;
  }
  return new Set([...parts].filter((part) => CORE_PARTS.has(part)));
}

/**
 * Sections of a course grouped by part, each with its meetings and whether
 * it fits the week's other blocks. `fits` is null where the section has no
 * published times, or times that can't be read (D23: no Fits or Clash then).
 * `required` marks the parts a full enrolment takes.
 */
export function sectionOptions(rows, blocks, course) {
  const groups = new Map();
  const required = requiredParts(rows);
  (rows || []).forEach((row) => {
    const meetings = meetingsOf(row);
    const known = meetings && meetings.length ? meetings : null;
    const clash = known ? clashesWith(known, blocks, course) : [];
    const option = {
      id: sectionId(row),
      row,
      meetings: known || [],
      clash,
      fits: known ? clash.length === 0 : null,
    };
    const part = partLabel(row);
    if (!groups.has(part)) groups.set(part, []);
    groups.get(part).push(option);
  });
  return [...groups.entries()].map(([part, options]) => ({ part, options, required: required.has(part) }));
}

/**
 * Where a dropped course goes in the week (D4): `{sections}` when exactly one
 * section of every required part fits and every one of them has readable
 * times; else `{choose: true}` (several fit, none fit, or a time we can't
 * read). Without any times at all: `{sections: null}` (nothing to pick from).
 */
export function fittingPick(rows, blocks, course) {
  const list = rows || [];
  const anyTimes = list.some((row) => (row?.meetings || []).some((text) => typeof text === 'string' && text.trim()));
  if (!list.length || !anyTimes) return { sections: null };
  const groups = sectionOptions(list, blocks, course).filter((g) => g.required);
  if (!groups.length) return { choose: true };
  const picked = [];
  for (const group of groups) {
    if (group.options.some((o) => o.fits === null)) return { choose: true };
    const fit = group.options.filter((o) => o.fits);
    if (fit.length !== 1) return { choose: true };
    picked.push(fit[0].id);
  }
  return { sections: picked };
}

/** "M T W T F" with the days a course meets, from its blocks. */
export function dayStrip(blocks) {
  const on = new Set(blocks.map((b) => b.day));
  return WEEKDAYS.map((d) => ({ key: d.key, letter: d.short[0], on: on.has(d.key), name: d.short }));
}

/** The time range of the first primary meeting, "9:00–9:50". */
export function timeRange(blocks, clockText) {
  const block = blocks.find((b) => !b.kind || b.kind === 'lecture') || blocks[0];
  return block ? `${clockText(block.start)}–${clockText(block.end)}` : null;
}

/**
 * Per rule, this term's gain (D11 tile): `before` is everything counted
 * without this term's courses, `after` with them. Credit rules add this
 * term's course credits; course rules count courses.
 */
export function ruleGains(rules, termIds, creditsOf) {
  const inTerm = new Set(termIds);
  return (rules || [])
    .filter((rule) => rule.status !== 'unknown' && (rule.needed || 0) > 0)
    .map((rule) => {
      const mine = (rule.planned_courses || []).filter((id) => inTerm.has(id));
      const gain = rule.unit === 'credits'
        ? mine.reduce((sum, id) => sum + (creditsOf(id) || 0), 0)
        : mine.length;
      const after = (rule.completed || 0) + (rule.planned || 0);
      return {
        key: `${rule.program_id || ''}:${rule.rule_id}`,
        title: rule.title || rule.rule_id,
        unit: rule.unit,
        needed: rule.needed,
        completed: rule.completed || 0,
        before: Math.max(0, after - gain),
        after,
        gain,
      };
    });
}
