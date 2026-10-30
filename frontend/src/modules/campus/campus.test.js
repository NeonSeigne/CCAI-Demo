import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import {
  countdown, dateLabel, durationText, endLine, eventRange, eventTime, eventWhen, meetingClock,
  openingClock, openUntil, rangeParts, schoolFacts, spanText, walkParts, walkText, weekHours,
  StartPlaceProvider, useStartPlace, useSchool, distanceText, hasPhysicalLocation,
} from '.';
import { getCampusOrigin, setCampusOrigin } from '../../api/campus';

jest.mock('../../api/campus', () => ({
  getCampusOrigin: jest.fn(),
  setCampusOrigin: jest.fn(),
}));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token' }) }));
jest.mock('../../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({
    config: {
      app: { institution: 'University of Virginia', short_name: 'UVA', title: 'Campus Companion' },
      school: { slug: 'uva', timezone: 'America/New_York', term_dates: { 'Spring 2027': { first_day: '2027-01-20', last_day: '2027-05-04' } } },
    },
  }),
}));

const NY = 'America/New_York';
const CHICAGO = 'America/Chicago';
const DENVER = 'America/Denver';
// Wednesday Oct 29 2026, 9:20 AM in New York.
const NOW = new Date('2026-10-29T13:20:00Z');

describe('school facts', () => {
  test.each([
    [{ app: { institution: 'University of Virginia', short_name: 'UVA' }, school: { slug: 'uva', timezone: NY } }, 'UVA', 'UVA', 'Eastern Time'],
    [{ app: { institution: 'University of Colorado Boulder', short_name: 'CU Boulder' }, school: { slug: 'cu-boulder', timezone: DENVER } }, 'CU Boulder', 'CU', 'Mountain Time'],
    [{ app: { institution: 'University of Wisconsin–Madison', short_name: 'UW–Madison' }, school: { slug: 'uw-madison', timezone: CHICAGO } }, 'UW–Madison', 'UW', 'Central Time'],
  ])('reads each school', (config, shortName, mark, zoneLabel) => {
    const school = schoolFacts(config);
    expect(school.name).toBe(config.app.institution);
    expect(school.shortName).toBe(shortName);
    expect(school.mark).toBe(mark);
    expect(school.timezone).toBe(config.school.timezone);
    expect(school.zoneLabel).toBe(zoneLabel);
  });

  test('an empty config falls back without a zone', () => {
    expect(schoolFacts(null)).toMatchObject({
      name: 'Your campus', shortName: 'Your campus', mark: 'Y', timezone: null, zoneLabel: '', termDates: {},
    });
    expect(schoolFacts({ app: { title: 'Campus Companion' } }).name).toBe('Campus Companion');
  });

  test('a pack without a short name uses the full name, and the mark its capitals', () => {
    const school = schoolFacts({ app: { institution: 'Example State University', short_name: '' } });
    expect(school.shortName).toBe('Example State University');
    expect(school.mark).toBe('ESU');
  });

  test('useSchool reads the app config', () => {
    function Probe() {
      const school = useSchool();
      return <p>{`${school.shortName} ${school.mark} ${school.zoneLabel} ${Object.keys(school.termDates)}`}</p>;
    }
    render(<Probe />);
    expect(screen.getByText('UVA UVA Eastern Time Spring 2027')).toBeInTheDocument();
  });
});

describe('event times', () => {
  const lunch = { start: '2026-10-29T16:00:00Z', end: '2026-10-29T17:00:00Z' };

  test('a start and end in the campus zone', () => {
    expect(eventTime(lunch, NY)).toBe('12:00 PM');
    expect(eventRange(lunch, NY)).toBe('12:00 PM – 1:00 PM');
    expect(rangeParts(lunch, NY)).toEqual({ start: '12:00', end: '1:00 PM' });
    expect(endLine(lunch, NY)).toBe('to 1:00 PM');
    expect(eventTime(lunch, CHICAGO)).toBe('11:00 AM');
    expect(rangeParts(lunch, CHICAGO)).toEqual({ start: '11:00 AM', end: '12:00 PM' });
  });

  test('all-day and ongoing events have no clock', () => {
    const allDay = { start: '2026-10-29T04:00:00Z', end: '2026-10-30T04:00:00Z', all_day: true };
    expect(eventTime(allDay, NY)).toBe('All day');
    expect(eventRange(allDay, NY)).toBe('All day');
    expect(endLine(allDay, NY)).toBeNull();
    expect(eventTime({ ...lunch, ongoing: true }, NY)).toBe('All day');
    const when = eventWhen(allDay, NY, NOW);
    expect(when).toMatchObject({ allDay: true, countdown: null, start: null, end: null, live: false });
  });

  test('a run over several days reads "Until"', () => {
    const run = { start: '2026-10-29T14:00:00Z', end: '2026-11-30T22:00:00Z' };
    expect(eventRange(run, NY)).toBe('Until Nov 30');
    expect(endLine(run, NY)).toBe('Until Nov 30');
    expect(eventWhen(run, NY, NOW).multiDay).toBe(true);
  });

  test('no end gives the start alone', () => {
    const open = { start: '2026-10-29T23:00:00Z' };
    expect(eventRange(open, NY)).toBe('7:00 PM');
    expect(endLine(open, NY)).toBeNull();
    expect(rangeParts(open, NY)).toEqual({ start: '7:00 PM', end: null });
    expect(eventWhen(open, NY, NOW).countdown).toMatchObject({ label: 'Starts in', value: '9h 40m' });
  });

  test('no time zone uses the browser zone', () => {
    expect(eventTime(lunch, null)).toMatch(/^\d{1,2}:00 [AP]M$/);
    expect(eventTime(lunch, 'Not/AZone')).toMatch(/^\d{1,2}:00 [AP]M$/);
    expect(dateLabel(lunch.start, undefined, { month: 'short' })).toBe('Oct');
  });

  test('countdowns before, during and after', () => {
    expect(countdown(lunch, NOW)).toMatchObject({ label: 'Starts in', value: '2h 40m', live: false });
    expect(durationText(countdown(lunch, NOW).ms)).toBe('2 h 40 m');
    const during = new Date('2026-10-29T16:30:00Z');
    expect(countdown(lunch, during)).toMatchObject({ label: 'Ends in', value: '30 min', live: true });
    expect(eventWhen(lunch, NY, during).live).toBe(true);
    const after = new Date('2026-10-29T18:00:00Z');
    expect(countdown(lunch, after)).toBeNull();
    expect(eventWhen(lunch, NY, after).over).toBe(true);
  });

  test('countdowns over a day', () => {
    const later = { start: '2026-10-30T19:20:00Z' };
    expect(countdown(later, NOW).value).toBe('30h 00m');
    expect(durationText(countdown(later, NOW).ms)).toBe('30 h');
    expect(spanText(3 * 24 * 3600 * 1000)).toBe('3 days');
    expect(durationText(3 * 24 * 3600 * 1000)).toBe('3 days');
    expect(durationText(0)).toBe('Now');
  });
});

describe('clocks', () => {
  test('class meetings and opening hours', () => {
    expect(meetingClock('13:05')).toBe('1:05');
    expect(meetingClock('09:00')).toBe('9:00');
    expect(openingClock('07', '30')).toBe('7:30 am');
    expect(openingClock('24', '00')).toBe('12 am');
    expect(openingClock('12', '00')).toBe('12 pm');
  });
});

describe('walks', () => {
  test('minutes, the start place and unknown', () => {
    expect(walkText(9)).toBe('9 min');
    expect(walkText(0)).toBe('Here');
    expect(walkText(null)).toBeNull();
    expect(walkText(undefined)).toBeNull();
    expect(walkText('x')).toBeNull();
    expect(walkParts(9)).toEqual({ value: '9', unit: 'min' });
    expect(walkParts(0)).toEqual({ value: 'Here', unit: null });
    expect(walkParts(null)).toBeNull();
  });

  test('never "0 min", whatever wording a screen keeps', () => {
    expect(walkText(0, { here: 'Your starting place', suffix: ' walk' })).toBe('Your starting place');
    expect(walkText(7, { suffix: ' walk' })).toBe('7 min walk');
    expect(walkText(0.2)).toBe('Here');
  });

  test('distance and places with nowhere to walk to', () => {
    expect(distanceText(560)).toBe('560 m');
    expect(distanceText(1240)).toBe('1.2 km');
    expect(distanceText(undefined)).toBeNull();
    expect(hasPhysicalLocation('Rice Hall 130')).toBe(true);
    expect(hasPhysicalLocation('Online (Zoom)')).toBe(false);
    expect(hasPhysicalLocation('')).toBe(false);
  });
});

describe('place hours', () => {
  test('open until, open, closed and unknown', () => {
    expect(openUntil({ open_now: true, open_until: '2026-10-30T03:00:00Z' }, NY)).toBe('Open until 11:00 PM');
    expect(openUntil({ open_now: true }, NY)).toBe('Open now');
    expect(openUntil({ open_now: false }, NY)).toBe('Closed now');
    expect(openUntil({}, NY)).toBe('Hours not listed');
  });

  test('the week, today on its own row in the campus zone', () => {
    const rows = weekHours('Mo-Fr 07:00-23:00; Sa-Su 10:00-18:00', NY, NOW);
    expect(rows.map((row) => row.label)).toEqual(['Mon–Wed', 'Thu', 'Fri', 'Sat–Sun']);
    expect(rows.find((row) => row.today).label).toBe('Thu');
    expect(rows[0].text).toBe('7 am – 11 pm');
    expect(weekHours('PH off', NY, NOW)).toBeNull();
  });
});

describe('start place', () => {
  function Probe() {
    const start = useStartPlace();
    return (
      <div>
        <p>{`${start.status}:${start.place?.name || 'none'}`}</p>
        <button type="button" onClick={() => start.save({ id: 'lib', name: 'Library' })}>Save</button>
      </div>
    );
  }

  beforeEach(() => {
    getCampusOrigin.mockReset();
    setCampusOrigin.mockReset();
  });

  test('the shell loads it once for every reader', async () => {
    getCampusOrigin.mockResolvedValue({ place: { id: 'rice', name: 'Rice Hall' } });
    render(<StartPlaceProvider><Probe /><Probe /></StartPlaceProvider>);
    expect(await screen.findAllByText('ready:Rice Hall')).toHaveLength(2);
    expect(getCampusOrigin).toHaveBeenCalledTimes(1);
  });

  test('saving updates every reader', async () => {
    getCampusOrigin.mockResolvedValue({ place: null });
    setCampusOrigin.mockResolvedValue({ place: { id: 'lib', name: 'Alderman Library' } });
    render(<StartPlaceProvider><Probe /><Probe /></StartPlaceProvider>);
    await screen.findAllByText('ready:none');
    await act(async () => { screen.getAllByText('Save')[0].click(); });
    expect(screen.getAllByText('ready:Alderman Library')).toHaveLength(2);
    expect(setCampusOrigin).toHaveBeenCalledWith('token', 'lib');
  });

  test('a failed load reads as an error, and a page on its own loads it itself', async () => {
    getCampusOrigin.mockRejectedValue(new Error('down'));
    render(<Probe />);
    await waitFor(() => expect(screen.getByText('error:none')).toBeInTheDocument());
  });
});
