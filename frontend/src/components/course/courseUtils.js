/**
 * Grade formulas are a clean-room JavaScript translation of the documented
 * UW Course Map data contract:
 * https://github.com/twangodev/uw-coursemap/blob/main/src/lib/types/madgrades.ts
 */
export const GRADE_KEYS = ['other', 'f', 'd', 'c', 'bc', 'b', 'ab', 'a'];

const count = (grades, key) => Number(grades?.[key] || 0);

export function calculateGpa(grades) {
  if (!grades?.total) return null;
  const points = count(grades, 'a') * 4
    + count(grades, 'ab') * 3.5
    + count(grades, 'b') * 3
    + count(grades, 'bc') * 2.5
    + count(grades, 'c') * 2
    + count(grades, 'd');
  return points / grades.total;
}

export function calculateCompletionRate(grades) {
  if (!grades?.total) return null;
  const completed = ['a', 'ab', 'b', 'bc', 'c', 'passed', 'satisfactory', 'credit']
    .reduce((sum, key) => sum + count(grades, key), 0);
  return (completed * 100) / grades.total;
}

export function calculateARate(grades) {
  return grades?.total ? (count(grades, 'a') * 100) / grades.total : null;
}

export function formatMetric(value, digits = 2, suffix = '') {
  return value == null || Number.isNaN(value) ? '—' : `${value.toFixed(digits)}${suffix}`;
}

export function getHistoricalAverageClassSize(termData) {
  const totals = Object.values(termData || {})
    .map((data) => data?.grade_data?.total)
    .filter(Boolean);
  return totals.length ? totals.reduce((sum, total) => sum + total, 0) / totals.length : null;
}

/** Resolve selected-term vs cumulative grade rows from a course aggregate payload. */
export function resolveGradeContext(payload) {
  const course = payload?.course || {};
  const selectedTerm = payload?.selected_term;
  const selectedGrades = course.term_data?.[selectedTerm]?.grade_data || course.cumulative_grade_data;
  return {
    course,
    selectedTerm,
    termLabel: payload?.selected_term_label,
    selectedGrades,
    historical: course.cumulative_grade_data,
  };
}

export function courseLabel(reference) {
  const subjects = reference?.subjects || [];
  return `${subjects.join('/')} ${reference?.course_number ?? ''}`.trim();
}

export function courseRoute(referenceOrLabel) {
  const label = typeof referenceOrLabel === 'string'
    ? referenceOrLabel
    : courseLabel(referenceOrLabel);
  return `/courses/${encodeURIComponent(label)}`;
}

export function termGradeRows(termData, terms) {
  return Object.entries(termData || {})
    .filter(([, data]) => data?.grade_data)
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([code, data]) => ({
      code,
      term: terms?.[code] || code,
      ...data.grade_data,
    }));
}

const icsDate = (timestamp) => new Date(timestamp)
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d{3}Z$/, 'Z');

const escapeIcs = (value = '') => String(value)
  .replace(/\\/g, '\\\\')
  .replace(/\n/g, '\\n')
  .replace(/,/g, '\\,')
  .replace(/;/g, '\\;');

export function createScheduleIcs(courseName, meetings) {
  const events = (meetings || []).map((meeting, index) => [
    'BEGIN:VEVENT',
    `UID:${Date.now()}-${index}@co-panel`,
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(meeting.start_time)}`,
    `DTEND:${icsDate(meeting.end_time)}`,
    `SUMMARY:${escapeIcs(`${courseName} · ${meeting.name}`)}`,
    `LOCATION:${escapeIcs([meeting.location?.building, meeting.location?.room].filter(Boolean).join(' '))}`,
    `DESCRIPTION:${escapeIcs((meeting.instructors || []).join(', '))}`,
    'END:VEVENT',
  ].join('\r\n'));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Co-Panel//Course Schedule//EN', ...events, 'END:VCALENDAR'].join('\r\n');
}
