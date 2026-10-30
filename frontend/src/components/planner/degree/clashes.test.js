import { termClashes } from './clashes';

const course = (id, ...meetings) => ({
  id, sections: [{ id: '001', kind: 'Lecture', meetings, instructor: null }],
});
const at = (day, start, end) => ({ day, start, end });

describe('termClashes', () => {
  test('counts pairs that meet at the same time on the same day', () => {
    expect(termClashes([
      course('A', at('Mo', '09:00', '09:50'), at('We', '09:00', '09:50')),
      course('B', at('We', '09:30', '10:45')),
      course('C', at('Mo', '10:00', '10:50')),
    ])).toBe(1);
  });

  test('back-to-back meetings and courses with no times never clash', () => {
    expect(termClashes([
      course('A', at('Tu', '09:00', '10:00')),
      course('B', at('Tu', '10:00', '11:00')),
      { id: 'C', sections: [{ id: '1', meetings: null }] },
      { id: 'D', sections: [] },
    ])).toBe(0);
  });
});
