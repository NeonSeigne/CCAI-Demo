/**
 * Courses a completed-course checklist can offer (O2): the program files'
 * rule lists when the API sends them, else what the checker named, plus
 * what the student already ticked. Moved out of the old plan panel.
 */
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

export default checklistCourses;
