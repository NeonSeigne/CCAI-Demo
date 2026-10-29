/**
 * Completed-course helpers shared by the plan panel's checklist and the
 * degree board's Completed editor (CEO review O2).
 */

/** Courses the checklist can offer: program rule lists when the API sends them, else what the checker named. */
export function checklistCourses(programIds, programs, report, completed) {
  const ids = [];
  (programs || [])
    .filter((p) => (programIds || []).includes(p.id))
    .forEach((p) => (p.rules || []).forEach((rule) => (rule.courses || []).forEach((id) => ids.push(id))));
  (report?.rules || []).forEach((rule) => {
    (rule.completed_courses || []).forEach((id) => ids.push(id));
    (rule.planned_courses || []).forEach((id) => ids.push(id));
  });
  (completed || []).forEach((c) => ids.push(c.id));
  return [...new Set(ids.filter(Boolean))];
}

/** Letter grades a student can record; null is "no grade". */
export const GRADES = ['A+', 'A', 'A-', 'AB', 'B+', 'B', 'B-', 'BC', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F', 'P', 'CR'];

const POINTS = {
  'A+': 4, A: 4, 'A-': 3.7, AB: 3.5, 'B+': 3.3, B: 3, 'B-': 2.7, BC: 2.5,
  'C+': 2.3, C: 2, 'C-': 1.7, 'D+': 1.3, D: 1, 'D-': 0.7, F: 0,
};

/** Grade points on a 4.0 scale, or null for pass/fail and missing grades. */
export function gradePoints(grade) {
  if (!grade) return null;
  const key = String(grade).trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(POINTS, key) ? POINTS[key] : null;
}

/** "ECON 3010" from typed text: upper case, single spaces. */
export const normalizeCourseId = (text) => String(text || '').trim().toUpperCase().replace(/\s+/g, ' ');
