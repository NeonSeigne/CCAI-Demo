import {
  calculateARate,
  calculateCompletionRate,
  calculateGpa,
  courseLabel,
  createScheduleIcs,
} from './courseUtils';

const grades = {
  total: 100,
  a: 40,
  ab: 20,
  b: 20,
  bc: 10,
  c: 5,
  d: 3,
  f: 2,
  passed: 0,
  satisfactory: 0,
  credit: 0,
};

it('calculates UW grade metrics from the documented contract', () => {
  expect(calculateGpa(grades)).toBeCloseTo(3.28);
  expect(calculateCompletionRate(grades)).toBe(95);
  expect(calculateARate(grades)).toBe(40);
});

it('formats cross-listed references', () => {
  expect(courseLabel({ subjects: ['COMP SCI', 'MATH'], course_number: 240 }))
    .toBe('COMP SCI/MATH 240');
});

it('creates an importable calendar payload', () => {
  const calendar = createScheduleIcs('MUSIC 113', [{
    name: 'LEC 001',
    start_time: Date.UTC(2026, 0, 1, 15),
    end_time: Date.UTC(2026, 0, 1, 16),
    location: { building: 'Humanities', room: '2340' },
    instructors: ['Jane Teacher'],
  }]);
  expect(calendar).toContain('BEGIN:VCALENDAR');
  expect(calendar).toContain('SUMMARY:MUSIC 113 · LEC 001');
  expect(calendar).toContain('LOCATION:Humanities 2340');
});
