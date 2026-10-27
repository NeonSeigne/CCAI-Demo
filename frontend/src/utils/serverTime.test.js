import { parseServerTime } from './serverTime';

test('zoneless backend times are read as UTC', () => {
  expect(parseServerTime('2026-10-27T17:06:00.123456').toISOString()).toBe('2026-10-27T17:06:00.123Z');
});

test('times that carry a zone are left alone', () => {
  expect(parseServerTime('2026-10-27T17:06:00Z').toISOString()).toBe('2026-10-27T17:06:00.000Z');
  expect(parseServerTime('2026-10-27T12:06:00-05:00').toISOString()).toBe('2026-10-27T17:06:00.000Z');
  const date = new Date();
  expect(parseServerTime(date)).toBe(date);
});
