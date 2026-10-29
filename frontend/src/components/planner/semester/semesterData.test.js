import {
  classesOn, dateIn, fittingPick, meetingDates, meetingsOnDate, prereqStates, requiredParts, sectionOptions, termSpans,
} from './semesterData';

const row = (section, type, meetings, extra = {}) => ({ id: `c${section}`, section, type, meetings, ...extra });
const busy = [{ course: 'ECON 3720', section: '1', kind: 'lecture', day: 'We', start: '11:00', end: '12:15' }];

test('one fitting lecture is picked by its planner id', () => {
  expect(fittingPick([
    row('001', 'LEC', ['MoWe 11:00am - 12:15pm']),
    row('002', 'LEC', ['TuTh 9:30am - 10:45am']),
  ], busy, 'ECON 3300')).toEqual({ sections: ['c002'] });
});

test('a meeting string that cannot be read makes the row unknown, and its group asks', () => {
  const rows = [
    row('001', 'LEC', ['TuTh 9:30am - 10:45am']),
    row('002', 'LEC', ['TBA by arrangement']),
  ];
  expect(sectionOptions(rows, busy, 'X')[0].options[1].fits).toBeNull();
  expect(fittingPick(rows, busy, 'X')).toEqual({ choose: true });
  // One readable and one unreadable string on the same row is still unknown.
  expect(fittingPick([row('001', 'LEC', ['TuTh 9:30am - 10:45am', 'Fr ???'])], busy, 'X')).toEqual({ choose: true });
});

test('without any times there is nothing to pick', () => {
  expect(fittingPick([row('001', 'LEC', [])], busy, 'X')).toEqual({ sections: null });
});

test('optional kinds are left out of the auto-pick; lecture plus lab / discussion are required', () => {
  const rows = [
    row('001', 'LEC', ['TuTh 9:30am - 10:45am']),
    row('101', 'LAB', ['Fr 1:00pm - 2:50pm']),
    row('201', 'SEM', ['Mo 3:00pm - 3:50pm']),
    row('202', 'SEM', ['Tu 3:00pm - 3:50pm']),
  ];
  expect([...requiredParts(rows)].sort()).toEqual(['LAB', 'LEC']);
  expect(fittingPick(rows, busy, 'X')).toEqual({ sections: ['c001', 'c101'] });
});

test('bundle data (`requires`) decides the required parts when present', () => {
  const rows = [
    row('001', 'LEC', ['TuTh 9:30am - 10:45am'], { requires: ['seminar'] }),
    row('201', 'SEM', ['Mo 3:00pm - 3:50pm'], { requires: [] }),
    row('301', 'DIS', ['We 3:00pm - 3:50pm'], { requires: [] }),
  ];
  expect([...requiredParts(rows)].sort()).toEqual(['LEC', 'SEM']);
  expect(fittingPick(rows, busy, 'X')).toEqual({ sections: ['c001', 'c201'] });
});

// "Your classes today" (R12). 2026-10-29 is a Thursday.
const THURSDAY = '2026-10-29';
const uvaRow = (id, meetings, extra = {}) => ({ id, section: '001', type: 'Lecture', meetings, ...extra });
const summary = (title, term, rows) => ({ title, sections: { term, rows } });
const uvaPlan = (term = 'Fall 2026') => ({
  courses: [
    { id: 'ENWR 1510', term, sections: ['11001'] },
    { id: 'HIUS 2061', term, sections: ['11002'] },
    { id: 'ECON 3010', term: 'Spring 2027', sections: ['20001'] },
  ],
});
const uvaSummaries = (term = 'Fall 2026') => new Map([
  ['ENWR 1510', summary('Writing and Critical Inquiry', term, [
    uvaRow('11001', ['tuth 11:00am - 12:15pm (08/25/2026 - 12/08/2026)'], { bldg: 'Bryan Hall' }),
  ])],
  ['HIUS 2061', summary('Capitalism and Democracy', term, [
    uvaRow('11002', ['mowe 9:00am - 9:50am (08/25/2026 - 12/08/2026)', 'th 2:00pm - 2:50pm (08/25/2026 - 12/08/2026)']),
  ])],
]);

test('meeting dates are read from the parenthesis', () => {
  expect(meetingDates('tuth 12:30pm - 1:45pm (01/20/2027 - 05/04/2027)')).toEqual({ from: '2027-01-20', to: '2027-05-04' });
  expect(meetingDates('MoWe 11:00am - 12:15pm')).toBeNull();
  expect(termSpans('Fall 2026', THURSDAY)).toBe(true);
  expect(termSpans('Spring 2027', THURSDAY)).toBe(false);
  expect(dateIn('America/New_York', new Date('2026-10-30T02:00:00Z'))).toBe(THURSDAY);
});

test('a section meets today only inside its dates and on its weekday', () => {
  const row = uvaRow('1', ['tuth 11:00am - 12:15pm (08/25/2026 - 12/08/2026)']);
  expect(meetingsOnDate(row, THURSDAY)).toEqual([{ day: 'Th', start: '11:00', end: '12:15' }]);
  expect(meetingsOnDate(row, '2026-10-28')).toEqual([]);
  expect(meetingsOnDate(row, '2026-12-10')).toEqual([]);
  expect(meetingsOnDate(uvaRow('1', ['tuth 11:00am - 12:15pm']), THURSDAY)).toBeNull();
  expect(meetingsOnDate(uvaRow('1', []), THURSDAY)).toBeNull();
});

test("today's classes come from the current term's chosen sections, earliest first", () => {
  expect(classesOn(uvaPlan(), uvaSummaries(), THURSDAY)).toEqual([
    { id: 'ENWR 1510', title: 'Writing and Critical Inquiry', part: 'LEC', start: '11:00', end: '12:15', place: 'Bryan Hall' },
    { id: 'HIUS 2061', title: 'Capitalism and Democracy', part: 'LEC', start: '14:00', end: '14:50', place: null },
  ]);
});

test('a plan whose only terms are in the future shows no classes', () => {
  expect(classesOn(uvaPlan('Spring 2027'), uvaSummaries('Spring 2027'), THURSDAY)).toBeNull();
});

test('sections whose dates have ended show no class that day', () => {
  const summaries = new Map([
    ['ENWR 1510', summary('Writing', 'Fall 2026', [uvaRow('11001', ['tuth 11:00am - 12:15pm (08/25/2026 - 10/16/2026)'])])],
    ['HIUS 2061', summary('Capitalism', 'Fall 2026', [uvaRow('11002', ['tuth 9:00am - 9:50am (10/19/2026 - 12/08/2026)'])])],
  ]);
  expect(classesOn(uvaPlan(), summaries, THURSDAY).map((c) => c.id)).toEqual(['HIUS 2061']);
});

test('UW sections without meeting times hide the board', () => {
  const plan = { courses: [{ id: 'COMP SCI 400', term: 'Fall 2026', sections: ['001'] }] };
  const summaries = new Map([['COMP SCI 400', summary('Programming III', 'Fall 2026', [{ id: '001', section: '001', type: 'LEC' }])]]);
  expect(classesOn(plan, summaries, THURSDAY)).toBeNull();
});

test('a summary for another term, a missing summary or no plan hides the board', () => {
  expect(classesOn(uvaPlan(), uvaSummaries('Spring 2027'), THURSDAY)).toBeNull();
  expect(classesOn(uvaPlan(), new Map(), THURSDAY)).toBeNull();
  expect(classesOn(null, uvaSummaries(), THURSDAY)).toBeNull();
});

test('the prerequisite graph marks completed and earlier courses done, this term now', () => {
  const plan = {
    profile: { completed: [{ id: 'MATH 1210' }] },
    courses: [
      { id: 'ECON 2010', term: 'Spring 2026' },
      { id: 'ECON 3010', term: 'Fall 2026' },
      { id: 'ECON 4010', term: 'Spring 2027' },
    ],
  };
  expect(prereqStates(plan, THURSDAY)).toEqual({ 'MATH 1210': 'done', 'ECON 2010': 'done', 'ECON 3010': 'now' });
  expect(prereqStates(null, THURSDAY)).toEqual({});
});
