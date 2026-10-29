/** A UVA-style Economics plan for the route model and its renderers. */
const rule = (rule_id, title, completed_courses, planned_courses, needed) => ({
  program_id: 'econ-ba', rule_id, title, unit: 'courses', status: 'short',
  completed: completed_courses.length, planned: planned_courses.length, needed, completed_courses, planned_courses,
});

export const degree = {
  term: 'Fall 2026',
  terms: [
    { term: 'Fall 2026', courses: [
      { id: 'STAT 2120', title: 'Statistics', credits: [3, 3] },
      { id: 'ECON 3010', title: 'Micro', credits: [4, 4] },
    ] },
    { term: 'Spring 2027', courses: [
      { id: 'ECON 3020', title: 'Macro', credits: [3, 3] },
      { id: 'ECON 3720', title: 'Econometrics', credits: [4, 4] },
    ] },
    { term: 'Spring 2028', courses: [{ id: 'ECON 4210', title: 'Trade', credits: [3, 3] }] },
  ],
  completed: [
    { id: 'ECON 2010', title: 'Principles', credits: [3, 3], grade: 'A-', term: 'Fall 2025' },
    { id: 'MATH 1210', title: 'Calculus', credits: [4, 4], grade: 'B+', term: null },
  ],
  rules: [
    rule('intro', 'Introductory economics', ['ECON 2010'], [], 2),
    rule('calculus', 'Calculus I', ['MATH 1210'], [], 1),
    rule('statistics', 'Statistics', [], ['STAT 2120'], 1),
    rule('micro', 'Intermediate micro', [], ['ECON 3010'], 1),
    rule('macro', 'Intermediate macro', [], ['ECON 3020'], 1),
    rule('metrics', 'Econometrics', [], ['ECON 3720'], 1),
    rule('el', 'Economics electives', [], ['ECON 4210', 'ECON 3010'], 4),
  ],
  route: {
    lines: [
      { program_id: 'econ-ba', name: 'Foundations', rule_ids: ['intro', 'calculus', 'statistics'] },
      { program_id: 'econ-ba', name: 'Core theory', rule_ids: ['micro', 'macro', 'metrics'] },
      { program_id: 'econ-ba', name: 'Electives', rule_ids: ['el'] },
    ],
    deadline: { program_id: 'econ-ba', rule_ids: ['micro', 'metrics'], by_semester: 6 },
    slots: [
      { program_id: 'econ-ba', rule_id: 'intro', line: 'Foundations', open: 1 },
      { program_id: 'econ-ba', rule_id: 'el', line: 'Electives', open: 2 },
    ],
    edges: [
      { from: 'ECON 2010', to: 'ECON 3010' },
      { from: 'ECON 3010', to: 'ECON 4210' },
      { from: 'ECON 9999', to: 'ECON 3010' },
    ],
  },
};

export const planCourses = [
  { id: 'STAT 2120', term: 'Fall 2026' },
  { id: 'ECON 3010', term: 'Fall 2026' },
  { id: 'ECON 3020', term: 'Spring 2027' },
  { id: 'ECON 3720', term: 'Spring 2027' },
  { id: 'ECON 4210', term: 'Spring 2028' },
];
