/**
 * My degree as a transit map (Phase 2; eng R2, R4, R9, R10; alignment Phase 8).
 * One pure model feeds every renderer: RouteMap (desktop), RouteList (phone),
 * the Requirements panel, the detail card and the counts row.
 *
 * Lines are the program's requirement lines (`degree.route.lines`). A course
 * rides the line of the first rule that took it; courses no rule took stay on
 * the Semesters board. Stops are done (completed), now (planned in the plan's
 * term) or planned; each line ends in an open stop for the courses its rules
 * still need but the plan hasn't chosen (`route.slots`). Columns run from the
 * first term to graduation (`route.terms`, `degree.graduation`).
 */
import { meetingText } from '../../../modules/course/facts';
import {
  creditMin, nextTerm, parseTerm, sortTerms, termOrder,
} from './degreeFormat';

export const NOT_PLACED = 'Not placed';
const MAX_TERMS = 40;
/** Credits one pill stands for in a credits rule (eng R14's course size). */
export const COURSE_CREDITS = 3;

/** Tone key for line `index`: the school's line colours in order. */
export const lineTone = (index) => `l${(index % 6) + 1}`;

/** The start term: the saved one, else Fall four years before the class year (R10). */
export function startTermOf(profile) {
  if (profile?.start_term && parseTerm(profile.start_term)) return profile.start_term;
  const year = Number(profile?.class_year);
  return Number.isFinite(year) && year > 0 ? `Fall ${year - 4}` : null;
}

/** Graduation: the server's term, else the spring of the class year. */
export function graduationOf(degree, profile) {
  const term = degree?.graduation?.term;
  if (term && parseTerm(term)) return term;
  const year = Number(profile?.class_year);
  return Number.isFinite(year) && year > 0 ? `Spring ${year}` : null;
}

/** The `n`th regular semester (Fall or Spring) from `start`; 1 is `start`. */
export function nthSemester(start, n) {
  let term = parseTerm(start) ? start : null;
  for (let i = 1; term && i < n; i += 1) term = nextTerm(term);
  return term;
}

/** Courses a rule still needs, as "open" stops. */
const lineSlots = (route, line) => (route?.slots || [])
  .filter((s) => s.program_id === line.program_id && line.rule_ids.includes(s.rule_id));

/** Every regular term from the first to the last of `terms`, in order. */
function spanTerms(terms) {
  const known = sortTerms([...new Set(terms)].filter((t) => parseTerm(t)));
  if (!known.length) return [];
  const out = [known[0]];
  const last = termOrder(known[known.length - 1]);
  let term = known[0];
  for (let i = 0; i < MAX_TERMS && term && termOrder(term) < last; i += 1) {
    term = nextTerm(term);
    if (term && termOrder(term) <= last) out.push(term);
  }
  // Summer or Winter terms that hold courses stay in their place.
  return sortTerms([...new Set([...out, ...known])]);
}

const ruleKey = (programId, ruleId) => `${programId}:${ruleId}`;

/** "MoWe 2:00–3:15 · Troyan" for the plan's chosen sections, or null. */
export function sectionText(sections) {
  const list = (sections || []).map((s) => [meetingText(s.meetings), s.instructor].filter(Boolean).join(' · '))
    .filter(Boolean);
  return list.length ? list[0] : null;
}

/** "4 credits", "1–3 credits", or null. */
export function creditsLabel(credits) {
  if (!Array.isArray(credits) || credits[0] == null) return null;
  const [lo, hi] = credits;
  const span = hi == null || hi === lo ? `${lo}` : `${lo}–${hi}`;
  return `${span} ${span === '1' ? 'credit' : 'credits'}`;
}

/**
 * Open stops as rows: one per course still needed, with the slot's own
 * wording ("Any ECON course, 2000 or above") and a code mask ("ECON ····").
 */
function openRows(slots, rules, line, tone) {
  return slots.flatMap((slot) => {
    const rule = rules.get(ruleKey(slot.program_id, slot.rule_id));
    const subject = /^Any ([A-Z]{2,})\b/.exec(slot.wording || '')?.[1];
    const code = subject ? `${subject} ····` : '····';
    return Array.from({ length: slot.open || 0 }, (_, i) => ({
      key: `${slot.rule_id}:${i}`,
      code,
      title: slot.wording || rule?.title || null,
      line: line.name,
      tone,
    }));
  });
}

/**
 * The route for `degree` with the plan's `planCourses` ([{id, term}]) and the
 * student's `profile`. Returns {terms, current, graduation, lines, edges,
 * deadline, notPlaced, requirements, ruleTones}.
 */
export function routeModel(degree, planCourses = [], profile = {}) {
  const route = degree?.route;
  const current = degree?.term || null;
  const graduation = graduationOf(degree, profile);
  if (!degree || !route?.lines?.length) {
    return {
      terms: [], current, graduation, lines: [], edges: [], deadline: null, notPlaced: 0, requirements: [], ruleTones: {},
    };
  }

  const rows = new Map();
  (degree.terms || []).forEach((t) => (t.courses || []).forEach((c) => rows.set(c.id, c)));
  const completed = new Map((degree.completed || []).map((c) => [c.id, c]));
  const planned = new Map(planCourses.filter((c) => !completed.has(c.id)).map((c) => [c.id, c.term]));

  const rules = new Map((degree.rules || []).map((r) => [ruleKey(r.program_id, r.rule_id), r]));
  const ruleOf = (line, ruleId) => rules.get(ruleKey(line.program_id, ruleId));

  // Columns: the server's terms to graduation, stretched to hold every stop.
  const knownStopTerms = [
    ...[...completed.values()].map((c) => c.term),
    ...[...planned.values()],
  ].filter((t) => parseTerm(t));
  const start = startTermOf(profile);
  const due = route.deadline && start ? nthSemester(start, route.deadline.by_semester) : null;
  const terms = spanTerms([
    ...(route.terms || []), ...knownStopTerms, current, graduation, start, due,
  ].filter(Boolean));
  const first = terms[0] || null;

  // Each course rides the first line whose rules took it.
  const placed = new Set();
  const ruleTones = {};
  const lines = route.lines.map((line, index) => {
    const tone = lineTone(index);
    line.rule_ids.forEach((id) => { ruleTones[ruleKey(line.program_id, id)] = tone; });
    const ids = [];
    line.rule_ids.forEach((ruleId) => {
      const rule = ruleOf(line, ruleId);
      [...(rule?.completed_courses || []), ...(rule?.planned_courses || [])].forEach((id) => {
        if (!placed.has(id) && (completed.has(id) || planned.has(id))) {
          placed.add(id);
          ids.push({ id, ruleId });
        }
      });
    });
    const key = `${line.program_id}:${line.name}`;
    const stops = ids.map(({ id, ruleId }) => {
      const done = completed.get(id);
      const row = done || rows.get(id) || {};
      // A completed course with no term sits in the first column; the card leaves its term out.
      const knownTerm = done ? (parseTerm(done.term) ? done.term : null) : planned.get(id);
      let state = 'planned';
      if (done) state = 'done';
      else if (knownTerm === current) state = 'now';
      return {
        id,
        title: row.title || rows.get(id)?.title || null,
        credits: row.credits || rows.get(id)?.credits || null,
        grade: done?.grade || null,
        term: knownTerm || first,
        termKnown: Boolean(knownTerm),
        state,
        ruleId,
        line: line.name,
        lineKey: key,
        tone,
        sections: row.sections || null,
        opens: Array.isArray(row.opens) ? row.opens : null,
        opensComplete: row.opens_complete === true,
      };
    });
    const slots = lineSlots(route, line);
    const open = slots.reduce((sum, s) => sum + (s.open || 0), 0);
    const ruleRows = line.rule_ids.map((ruleId) => ruleOf(line, ruleId)).filter(Boolean).map((rule) => ({
      id: rule.rule_id,
      title: rule.title,
      completed: rule.completed,
      needed: rule.needed,
    }));
    const doneCount = stops.filter((s) => s.state === 'done').length;
    return {
      key,
      name: line.name,
      tone,
      programId: line.program_id,
      ruleIds: line.rule_ids,
      stops,
      open,
      openRows: openRows(slots, rules, line, tone),
      done: doneCount,
      total: stops.length + open,
      rules: ruleRows,
      openRules: slots.map((slot) => ruleOf(line, slot.rule_id)?.title).filter(Boolean),
    };
  });

  // The core deadline (R10): only when a start term is known.
  let deadline = null;
  if (due) {
    const keys = lines.filter((l) => l.ruleIds.some((id) => route.deadline.rule_ids.includes(id))).map((l) => l.key);
    if (keys.length) deadline = { term: due, lines: keys };
  }

  // Order stops by term, keeping rule order inside a term.
  lines.forEach((line) => {
    line.stops = line.stops
      .map((stop, index) => ({ stop, index }))
      .sort((a, b) => terms.indexOf(a.stop.term) - terms.indexOf(b.stop.term) || a.index - b.index)
      .map(({ stop }) => stop);
  });

  const onRoute = new Map(lines.flatMap((l) => l.stops.map((s) => [s.id, l.key])));
  const allEdges = route.edges || [];
  const edges = allEdges.filter((e) => onRoute.has(e.from) && onRoute.has(e.to));
  const notPlaced = lines.reduce((sum, l) => sum + l.open, 0);

  // Prerequisites of each course in the plan, and the plan courses each opens.
  lines.forEach((line) => line.stops.forEach((stop) => {
    stop.needs = allEdges.filter((e) => e.to === stop.id).map((e) => e.from);
    if (!stop.opens) {
      stop.opens = allEdges.filter((e) => e.from === stop.id).map((e) => ({ id: e.to, in_plan: true }));
      stop.opensComplete = false;
    }
  }));

  const requirements = requirementRows(lines, rules, planned, current);

  return {
    terms, current, graduation, lines, edges, deadline, notPlaced, requirements, ruleTones,
  };
}

/**
 * The Requirements panel's rows, line by line: the rule's pills (done in the
 * line colour, this term in signal, placed in track, the rest empty) and
 * "X of N". A credits rule counts one pill per COURSE_CREDITS credits.
 */
function requirementRows(lines, rules, planned, current) {
  return lines.flatMap((line) => line.ruleIds.map((id) => rules.get(ruleKey(line.programId, id))).filter(Boolean)
    .map((rule) => {
      const credits = rule.unit === 'credits';
      const nowIds = (rule.planned_courses || []).filter((c) => planned.get(c) === current);
      let size;
      let done;
      let now;
      let placedCount;
      if (credits) {
        const per = (value) => Math.round((Number(value) || 0) / COURSE_CREDITS);
        size = Math.max(1, Math.ceil((Number(rule.needed) || 0) / COURSE_CREDITS));
        done = per(rule.completed);
        now = nowIds.length;
        placedCount = done + per(rule.planned);
      } else {
        size = Math.max(1, Number(rule.needed) || 0);
        done = Number(rule.completed) || 0;
        now = nowIds.length;
        placedCount = done + (Number(rule.planned) || 0);
      }
      const pills = Array.from({ length: size }, (_, i) => {
        if (i < done) return 'done';
        if (i < done + now) return 'now';
        if (i < placedCount) return 'planned';
        return 'open';
      });
      return {
        key: ruleKey(rule.program_id, rule.rule_id),
        title: rule.title,
        tone: line.tone,
        pills,
        count: credits ? `${rule.completed || 0} of ${rule.needed} cr` : `${rule.completed || 0} of ${rule.needed}`,
      };
    }));
}

/** Every stop on the route, line by line. */
export const allStops = (model) => model.lines.flatMap((l) => l.stops);

/** The stop shown first (design Q7): the first this-term stop, else the first planned, else none. */
export function firstStop(model) {
  const stops = allStops(model);
  return stops.find((s) => s.state === 'now') || stops.find((s) => s.state === 'planned') || null;
}

/** Credits of a stop list: the low end of each span, 0 when unknown. */
export const stopCredits = (stops) => stops.reduce((sum, s) => sum + (creditMin(s.credits) ?? 0), 0);

/**
 * The counts row (Phase 8.2): credits done, this term and planned, and the
 * courses not placed. Done counts every completed course; this term and
 * planned count every plan course, on the route or not.
 */
export function degreeCounts(degree, planCourses = [], notPlaced = 0) {
  const done = (degree?.completed || []).reduce((sum, c) => sum + (creditMin(c.credits) ?? 0), 0);
  const credits = new Map();
  (degree?.terms || []).forEach((t) => (t.courses || []).forEach((c) => credits.set(c.id, creditMin(c.credits) ?? 0)));
  const completedIds = new Set((degree?.completed || []).map((c) => c.id));
  let now = 0;
  let planned = 0;
  planCourses.filter((c) => !completedIds.has(c.id)).forEach((c) => {
    const value = credits.get(c.id) ?? 0;
    if (c.term === degree?.term) now += value;
    else planned += value;
  });
  return {
    done, now, planned, notPlaced,
  };
}

/**
 * One entry per term for the phone route (P.2), then the open stops. Terms
 * after the last one that holds a stop, the deadline or now are left off.
 */
export function routeByTerm(model) {
  const stops = allStops(model);
  const currentIndex = model.terms.indexOf(model.current);
  const byTerm = model.terms.map((term, index) => {
    const here = stops.filter((s) => s.term === term);
    let state = 'planned';
    if (currentIndex !== -1 && index < currentIndex) state = 'done';
    else if (index === currentIndex) state = 'now';
    return {
      term,
      stops: here,
      credits: stopCredits(here),
      now: term === model.current,
      due: model.deadline?.term === term,
      state,
    };
  });
  let last = byTerm.length - 1;
  while (last > 0 && !byTerm[last].stops.length && !byTerm[last].now && !byTerm[last].due) last -= 1;
  const open = model.lines.flatMap((l) => l.openRows);
  return { terms: byTerm.slice(0, last + 1), open };
}
