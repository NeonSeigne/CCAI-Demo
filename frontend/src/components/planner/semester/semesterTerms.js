/**
 * Term labels around the open semester ("Spring 2027" -> "Fall 2026" /
 * "Fall 2027"), for the ‹ › term buttons and Move to…. Spring and Fall only.
 */
const SEASONS = ['Spring', 'Fall'];

function parse(term) {
  const match = String(term || '').trim().match(/^(spring|fall)\s+(\d{4})$/i);
  if (!match) return null;
  const season = SEASONS.findIndex((s) => s.toLowerCase() === match[1].toLowerCase());
  return { season, year: Number(match[2]) };
}

/** The term `step` terms after `term` (negative: before); null for a label it can't read. */
export function shiftTerm(term, step) {
  const parsed = parse(term);
  if (!parsed) return null;
  const index = parsed.year * 2 + parsed.season + step;
  return `${SEASONS[((index % 2) + 2) % 2]} ${Math.floor(index / 2)}`;
}

const order = (term) => {
  const parsed = parse(term);
  return parsed ? parsed.year * 2 + parsed.season : Number.MAX_SAFE_INTEGER;
};

/** Terms a course can move to: the board's terms and the next two, without `term`, in order. */
export function moveTargets(term, boardTerms = []) {
  const all = [...boardTerms, shiftTerm(term, -1), shiftTerm(term, 1), shiftTerm(term, 2)].filter(Boolean);
  const key = (t) => String(t).trim().toLowerCase();
  const seen = new Set([key(term)]);
  return all
    .filter((t) => {
      if (seen.has(key(t))) return false;
      seen.add(key(t));
      return true;
    })
    .sort((a, b) => order(a) - order(b));
}
