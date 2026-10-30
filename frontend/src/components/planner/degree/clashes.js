/**
 * Clashes on a Semesters column (r7's "1 clash" pill): pairs of courses whose
 * chosen sections meet at the same time on the same day. Read from the
 * degree rows' `sections` (CONTRACTS.md, degree board); a course with no
 * section chosen, or no published times, can't clash.
 */
const minutes = (time) => {
  const [h, m] = String(time || '').split(':').map(Number);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : null;
};

const meetingsOf = (course) => (course.sections || []).flatMap((section) => section.meetings || [])
  .map((m) => ({ day: m.day, start: minutes(m.start), end: minutes(m.end) }))
  .filter((m) => m.day && m.start != null && m.end != null);

const overlaps = (a, b) => a.some((x) => b.some((y) => x.day === y.day && x.start < y.end && y.start < x.end));

/** The number of clashing course pairs among `courses`. */
export function termClashes(courses) {
  const timed = (courses || []).map(meetingsOf);
  let count = 0;
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      if (timed[i].length && timed[j].length && overlaps(timed[i], timed[j])) count += 1;
    }
  }
  return count;
}
