/**
 * My degree as a transit map (Phase 2; eng R2, R4, R9, R10). One pure model
 * feeds both renderers: RouteMap (desktop) and RouteList (phone).
 *
 * Lines are the program's requirement lines (`degree.route.lines`). A course
 * rides the line of the first rule that took it; courses no rule took stay on
 * the Semesters board. Stops are done (completed), now (planned in the plan's
 * term) or planned; each line ends in an open stop for the courses its rules
 * still need but the plan hasn't chosen (`route.slots`).
 */
import { nextTerm, parseTerm, sortTerms, termOrder } from './degreeFormat';

export const EARLIER = 'Earlier';
export const NOT_PLACED = 'Not placed';
const MAX_TERMS = 40;

/** Tone key for line `index`: the six course colours in order. */
export const lineTone = (index) => `c${(index % 6) + 1}`;

/** The start term: the saved one, else Fall four years before the class year (R10). */
export function startTermOf(profile) {
  if (profile?.start_term && parseTerm(profile.start_term)) return profile.start_term;
  const year = Number(profile?.class_year);
  return Number.isFinite(year) && year > 0 ? `Fall ${year - 4}` : null;
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

/**
 * The route for `degree` with the plan's `planCourses` ([{id, term}]) and the
 * student's `profile`. Returns {terms, current, lines, edges, deadline, notPlaced}.
 */
export function routeModel(degree, planCourses = [], profile = {}) {
  const route = degree?.route;
  const current = degree?.term || null;
  if (!degree || !route?.lines?.length) {
    return { terms: [], current, lines: [], edges: [], deadline: null, notPlaced: 0 };
  }

  const titles = new Map();
  (degree.terms || []).forEach((t) => (t.courses || []).forEach((c) => titles.set(c.id, c)));
  const completed = new Map((degree.completed || []).map((c) => [c.id, c]));
  const planned = new Map(planCourses.filter((c) => !completed.has(c.id)).map((c) => [c.id, c.term]));

  // Each course rides the first line whose rules took it.
  const rules = degree.rules || [];
  const ruleOf = (line, ruleId) => rules.find((r) => r.program_id === line.program_id && r.rule_id === ruleId);
  const placed = new Set();
  const lines = route.lines.map((line, index) => {
    const ids = [];
    line.rule_ids.forEach((ruleId) => {
      const rule = ruleOf(line, ruleId);
      [...(rule?.completed_courses || []), ...(rule?.planned_courses || [])].forEach((id) => {
        if (!placed.has(id) && (completed.has(id) || planned.has(id))) {
          placed.add(id);
          ids.push(id);
        }
      });
    });
    const stops = ids.map((id) => {
      const done = completed.get(id);
      const term = done ? (done.term && parseTerm(done.term) ? done.term : EARLIER) : planned.get(id);
      let state = 'planned';
      if (done) state = 'done';
      else if (term === current) state = 'now';
      return {
        id,
        title: done?.title || titles.get(id)?.title || null,
        credits: done?.credits || titles.get(id)?.credits || null,
        grade: done?.grade || null,
        term,
        state,
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
      key: `${line.program_id}:${line.name}`,
      name: line.name,
      tone: lineTone(index),
      ruleIds: line.rule_ids,
      stops,
      open,
      done: doneCount,
      total: stops.length + open,
      rules: ruleRows,
      openRules: slots.map((slot) => ruleOf(line, slot.rule_id)?.title).filter(Boolean),
    };
  });

  // The core deadline (R10): only when a start term is known.
  let deadline = null;
  const start = startTermOf(profile);
  const due = route.deadline && start ? nthSemester(start, route.deadline.by_semester) : null;
  if (due) {
    const keys = lines.filter((l) => l.ruleIds.some((id) => route.deadline.rule_ids.includes(id))).map((l) => l.key);
    if (keys.length) deadline = { term: due, lines: keys };
  }

  const stopTerms = lines.flatMap((l) => l.stops.map((s) => s.term)).filter((t) => t !== EARLIER);
  const span = spanTerms([...stopTerms, ...(current ? [current] : []), ...(deadline ? [deadline.term] : [])]);
  const hasEarlier = lines.some((l) => l.stops.some((s) => s.term === EARLIER));
  const terms = [...(hasEarlier ? [EARLIER] : []), ...span];

  // Order stops by term, keeping rule order inside a term.
  lines.forEach((line) => {
    line.stops = line.stops
      .map((stop, index) => ({ stop, index }))
      .sort((a, b) => terms.indexOf(a.stop.term) - terms.indexOf(b.stop.term) || a.index - b.index)
      .map(({ stop }) => stop);
  });

  const onRoute = new Map(lines.flatMap((l) => l.stops.map((s) => [s.id, l.key])));
  const edges = (route.edges || []).filter((e) => onRoute.has(e.from) && onRoute.has(e.to));
  const notPlaced = lines.reduce((sum, l) => sum + l.open, 0);

  return { terms, current, lines, edges, deadline, notPlaced };
}

/** Credits of a stop list: the low end of each span, 0 when unknown. */
export const stopCredits = (stops) => stops.reduce(
  (sum, s) => sum + (Array.isArray(s.credits) && s.credits[0] != null ? Number(s.credits[0]) : 0), 0,
);

/** One entry per term for the phone route (P.2), then the open stops. */
export function routeByTerm(model) {
  const stops = model.lines.flatMap((line) => line.stops.map((s) => ({ ...s, tone: line.tone, line: line.name })));
  const byTerm = model.terms.map((term) => {
    const here = stops.filter((s) => s.term === term);
    return {
      term,
      stops: here,
      credits: stopCredits(here),
      now: term === model.current,
      due: model.deadline?.term === term,
      state: here.length && here.every((s) => s.state === 'done') ? 'done' : (term === model.current ? 'now' : 'planned'),
    };
  });
  const open = model.lines.filter((l) => l.open > 0)
    .map((l) => ({ line: l.name, tone: l.tone, open: l.open, rules: l.openRules }));
  return { terms: byTerm, open };
}
