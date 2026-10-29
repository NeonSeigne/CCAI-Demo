import { fittingPick, requiredParts, sectionOptions } from './semesterData';

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
