/* Plan views shaped like GET /api/planner/plan, for the planner tests. */

export const report = (overrides = {}) => ({
  term: 'Spring 2027',
  data_as_of: '2026-10-01',
  credits: { min: 17, max: 17, status: 'met', limits: { min: 12, max: 18 }, reason: null },
  difficulty: { label: 'Heavy', harder: 2, graded: 4, total: 4 },
  clashes: { status: 'none', pairs: [], reason: null },
  rules: [
    {
      program_id: 'econ-ba', rule_id: 'intro', title: 'Introductory economics', status: 'met', unit: 'courses',
      completed: 2, planned: 0, needed: 2, completed_courses: ['ECON 2010', 'ECON 2020'], planned_courses: [], reason: null,
    },
    {
      program_id: 'econ-ba', rule_id: 'electives', title: 'Economics electives', status: 'short', unit: 'courses',
      completed: 0, planned: 1, needed: 4, completed_courses: [], planned_courses: ['ECON 3720'], reason: null,
    },
    {
      program_id: 'econ-ba', rule_id: 'prereqs', title: 'Prerequisites', status: 'unknown', unit: 'courses',
      completed: 0, planned: 0, needed: 0, completed_courses: [], planned_courses: [], reason: 'not published',
    },
  ],
  courses: [
    {
      id: 'CHEM 2410', title: 'Organic Chem I', term: 'Spring 2027', credits: [4, 4], harder: true, gen_ed: null,
      offered: 'yes', prereqs: { status: 'met', reason: null }, fills: [],
    },
    {
      id: 'ECON 3720', title: 'Econometrics', term: 'Spring 2027', credits: [3, 3], harder: false, gen_ed: null,
      offered: 'yes', prereqs: { status: 'met', reason: null }, fills: ['Economics electives'],
    },
    {
      id: 'ECON 3010', title: 'Intermediate Micro', term: 'Spring 2027', credits: [3, 3], harder: null, gen_ed: null,
      offered: 'yes', prereqs: { status: 'unknown', reason: null }, fills: [],
    },
  ],
  later: [],
  schedule: {
    published: true,
    reason: null,
    blocks: [
      { course: 'CHEM 2410', section: '001', kind: 'lecture', day: 'Mo', start: '09:00', end: '09:50' },
      { course: 'CHEM 2410', section: '101', kind: 'lab', day: 'Tu', start: '13:00', end: '15:50' },
      { course: 'ECON 3720', section: '001', kind: 'lecture', day: 'We', start: '11:00', end: '12:15' },
    ],
  },
  ...overrides,
});

export const plan = (overrides = {}) => ({
  school: 'uva',
  revision: 4,
  term: 'Spring 2027',
  profile: {
    program_ids: ['econ-ba'],
    catalog_year: 2026,
    class_year: null,
    completed: [{ id: 'ECON 2010', grade: null, term: null }, { id: 'ECON 2020', grade: null, term: null }],
    interests: { text: '', tags: [] },
  },
  courses: [
    { id: 'CHEM 2410', term: 'Spring 2027', sections: null },
    { id: 'ECON 3720', term: 'Spring 2027', sections: null },
    { id: 'ECON 3010', term: 'Spring 2027', sections: null },
  ],
  undo: { pointer: 0, stack: [] },
  updated_at: '2026-10-27T12:00:00Z',
  ...overrides,
});

export const diff = (overrides = {}) => ({
  heading: 'Move ECON 3010 to Fall 2027, add ECON 3300',
  courses: { added: ['ECON 3300'], removed: [], moved: [{ id: 'ECON 3010', from: 'Spring 2027', to: 'Fall 2027' }] },
  rules: [
    {
      program_id: 'econ-ba', rule_id: 'electives', title: 'Economics electives',
      before: { status: 'short', completed: 0, planned: 1, needed: 4 },
      after: { status: 'short', completed: 0, planned: 2, needed: 4 },
    },
  ],
  credits: { before: [17, 17], after: [17, 17] },
  difficulty: { before: 'Heavy', after: 'Balanced' },
  clashes: { before: 'none', after: 'none' },
  unknowns: ['Prerequisites not published for UVA'],
  literal_differs: null,
  ...overrides,
});

export const proposal = (overrides = {}) => ({
  id: 'p1',
  base_revision: 4,
  status: 'pending',
  ops: [{ op: 'move', course: 'ECON 3010', to_term: 'Fall 2027' }, { op: 'add', course: 'ECON 3300' }],
  summary: 'Move ECON 3010 to Fall 2027, add ECON 3300',
  created_at: '2026-10-28T10:00:00Z',
  expires_at: '2099-01-01T00:00:00Z',
  diff: diff(),
  ...overrides,
});

export const view = (overrides = {}) => ({
  plan: plan(),
  report: report(),
  proposal: null,
  undo_label: null,
  ...overrides,
});

export const PROGRAMS = [
  { id: 'econ-ba', name: 'Economics B.A.', type: 'major' },
  { id: 'cs-bs', name: 'Computer Science B.S.', type: 'major' },
];

/** An ApiError-like rejection with a FastAPI `detail` body. */
export const apiError = (status, detail) => {
  const error = new Error(`HTTP ${status}`);
  error.status = status;
  error.body = { detail };
  return error;
};
