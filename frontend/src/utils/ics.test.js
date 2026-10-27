import { createEventIcs, icsFilename } from './ics';

const EVENT = {
  title: 'Jazz Night',
  start: '2026-10-27T19:00:00-06:00',
  end: '2026-10-27T21:00:00-06:00',
  all_day: false,
  location: 'Macky Auditorium',
  url: 'https://example.edu/jazz',
};

const lines = (ics) => ics.split('\r\n');

test('calendar file holds one event with escaped text', () => {
  const ics = createEventIcs({ ...EVENT, title: 'Jazz, Blues; Night' });
  expect(ics).toContain('BEGIN:VEVENT');
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  expect(ics).toContain('DTSTART:20261028T010000Z');
  expect(ics).toContain('SUMMARY:Jazz\\, Blues\\; Night');
  expect(ics).toContain('LOCATION:Macky Auditorium');
  expect(createEventIcs({ ...EVENT, all_day: true })).toMatch(/DTSTART;VALUE=DATE:\d{8}/);
});

test('timed events keep their clock start and end, unchanged', () => {
  const out = lines(createEventIcs(EVENT));
  expect(out).toContain('DTSTART:20261028T010000Z');
  expect(out).toContain('DTEND:20261028T030000Z');
  expect(out.filter((line) => line.startsWith('DTEND'))).toHaveLength(1);
});

test('a one-day all-day event ends the next day', () => {
  const out = lines(createEventIcs({
    title: 'Homecoming', all_day: true, start: '2026-10-27T00:00:00-05:00', end: '2026-10-28T00:00:00-05:00',
  }));
  expect(out).toContain('DTSTART;VALUE=DATE:20261027');
  expect(out).toContain('DTEND;VALUE=DATE:20261028');
});

test('an all-day event without an end still covers its day', () => {
  const out = lines(createEventIcs({ title: 'Homecoming', all_day: true, start: '2026-10-27T00:00:00-05:00' }));
  expect(out).toContain('DTEND;VALUE=DATE:20261028');
});

test('a three-day exhibit keeps its whole span', () => {
  const out = lines(createEventIcs({
    title: 'Print exhibit', all_day: true, start: '2026-11-02T00:00:00-06:00', end: '2026-11-05T00:00:00-06:00',
  }));
  expect(out).toContain('DTSTART;VALUE=DATE:20261102');
  expect(out).toContain('DTEND;VALUE=DATE:20261105');
});

test('the UID is the feed id when the event has one', () => {
  const id = '2026-10-27:226193@calendar.wisc.edu';
  expect(lines(createEventIcs({ ...EVENT, id }))).toContain(`UID:${id}`);
  // A renamed event keeps its UID, so calendars update instead of duplicating.
  expect(lines(createEventIcs({ ...EVENT, title: 'Jazz Night (moved)', id }))).toContain(`UID:${id}`);
});

test('without an id the UID is built from start and title as before', () => {
  expect(lines(createEventIcs(EVENT))).toContain('UID:20261028T010000Z-Jazz Night@campus-companion');
});

test('the file is named after the event', () => {
  expect(icsFilename({ title: 'Jazz, Blues & Night' })).toBe('Jazz-Blues-Night.ics');
  expect(icsFilename({})).toBe('event.ics');
});
