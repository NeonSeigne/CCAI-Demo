// Regression: ISSUE-008 — months-long exhibitions listed under their start day, not Today
// Found by /qa on 2026-10-27
// Report: .gstack/qa-reports/run-20261027T211619Z/qa-report-localhost-2026-10-27.md
import { coversDay, listingDay } from './eventWindows';

const TZ = 'America/New_York';
const exhibition = { start: '2025-08-30T04:00:00Z', end: '2026-12-20T05:00:00Z', all_day: true };

test('an exhibition running for months covers today and is listed under it', () => {
  expect(coversDay(exhibition, '2026-10-27', TZ)).toBe(true);
  expect(listingDay(exhibition, ['2026-10-27'], TZ)).toBe('2026-10-27');
});

test('an all-day end at midnight does not cover that day', () => {
  const oneDay = { start: '2026-10-27T04:00:00Z', end: '2026-10-28T04:00:00Z', all_day: true };
  expect(coversDay(oneDay, '2026-10-27', TZ)).toBe(true);
  expect(coversDay(oneDay, '2026-10-28', TZ)).toBe(false);
  expect(listingDay(oneDay, ['2026-10-28', '2026-10-29'], TZ)).toBe('2026-10-27');
});
