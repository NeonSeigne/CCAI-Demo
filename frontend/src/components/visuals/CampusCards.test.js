import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import EventListCard, { groupEvents } from './EventListCard';
import PlaceCard, { openUntilText } from './PlaceCard';
import SourcesChecked from './SourcesChecked';
import { SavedContext } from '../../contexts/SavedContext';
import { downloadEventIcs } from '../../utils/ics';

jest.mock('../../utils/ics', () => ({ downloadEventIcs: jest.fn() }));

// Thursday Oct 29 2026, 11:00 in Charlottesville.
const NOW = new Date('2026-10-29T15:00:00Z');
const TZ = 'America/New_York';

const EVENT = {
  title: 'Lunch and learn: Data science minor',
  start: '2026-10-29T12:30:00-04:00',
  end: '2026-10-29T13:30:00-04:00',
  all_day: false,
  location: 'Rice Hall 120',
  place_name: 'Rice Hall',
  kind: 'academic',
  url: 'https://example.edu/lunch',
};

const card = (events, extra = {}) => ({ type: 'event_list', timezone: TZ, events, ...extra });

describe('event list', () => {
  test('rows group by campus date: Later today, Tomorrow, then the weekday and date', () => {
    const events = [
      EVENT,
      { ...EVENT, title: 'Concert', start: '2026-10-31T19:00:00-04:00', end: '2026-10-31T21:00:00-04:00' },
      { ...EVENT, title: 'Hack night', start: '2026-10-30T18:00:00-04:00', end: '2026-10-30T19:30:00-04:00' },
      // 11:30 PM Eastern is still Thursday on campus, though Friday in UTC.
      { ...EVENT, title: 'Stargazing', start: '2026-10-29T23:30:00-04:00', end: null },
    ];
    expect(groupEvents(events, TZ, NOW).map((g) => [g.label, g.events.map((e) => e.title)])).toEqual([
      ['Later today', ['Lunch and learn: Data science minor', 'Stargazing']],
      ['Tomorrow', ['Hack night']],
      ['Saturday, Oct 31', ['Concert']],
    ]);

    render(<EventListCard visual={card(events)} now={NOW} />);
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Later today', 'Tomorrow', 'Saturday, Oct 31']);
    expect(screen.getByText('Times in Eastern Time')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Tomorrow' })).getByText('Hack night')).toBeInTheDocument();
  });

  test('a running event and one without a start sit with today', () => {
    const groups = groupEvents([
      { ...EVENT, title: 'Exhibit', start: '2026-10-20T10:00:00-04:00', end: '2026-11-30T17:00:00-05:00', ongoing: true },
      { title: 'Undated' },
    ], TZ, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Later today');
  });

  test('the time reads "12:30" over "to 1:30 PM"; no date badge', () => {
    render(<EventListCard visual={card([EVENT])} now={NOW} />);
    const time = document.querySelector('.vc-time');
    expect(time.firstChild.textContent).toBe('12:30');
    expect(within(time).getByText('to 1:30 PM')).toBeInTheDocument();
    expect(screen.queryByText('OCT')).not.toBeInTheDocument();
    expect(screen.queryByText('29')).not.toBeInTheDocument();
  });

  test('an event without an end shows its full start time', () => {
    render(<EventListCard visual={card([{ ...EVENT, end: null }])} now={NOW} />);
    expect(document.querySelector('.vc-time')).toHaveTextContent(/^12:30\sPM$/);
  });

  test('the place line names the campus place with the domain dot for its kind', () => {
    render(<EventListCard visual={card([EVENT, { ...EVENT, title: 'Concert', kind: 'arts' }, { ...EVENT, title: 'UW', kind: null, place_name: null }])} now={NOW} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Rice Hall');
    expect(rows[0].querySelector('.vc-kd')).toHaveClass('is-academics');
    expect(rows[1].querySelector('.vc-kd')).toHaveClass('is-life');
    expect(rows[2].querySelector('.vc-kd')).toBeNull();
    expect(rows[2]).toHaveTextContent('Rice Hall 120');
    expect(document.querySelector('.ms')?.textContent).not.toBe('location_on');
  });

  test('a walk pill shows the minutes when they are known; never a Directions button', () => {
    render(
      <EventListCard
        visual={card([{ ...EVENT, walk_minutes: 9 }, { ...EVENT, title: 'No walk' }, { ...EVENT, title: 'Online', location: 'Zoom', walk_minutes: 3 }])}
        now={NOW}
        onAsk={jest.fn()}
      />,
    );
    const pills = document.querySelectorAll('.vc-walk');
    expect(pills).toHaveLength(1);
    expect(pills[0]).toHaveTextContent(/9 min walk$/);
    expect(screen.queryByRole('button', { name: /Directions/ })).not.toBeInTheDocument();
  });

  test('calendar and bookmark icon buttons; no text chips, details link or footer', () => {
    const saved = { count: 0, isSaved: () => false, save: jest.fn(() => Promise.resolve({})), unsave: jest.fn() };
    render(
      <SavedContext.Provider value={saved}>
        <EventListCard visual={card([{ ...EVENT, id: 'e1' }, { ...EVENT, title: 'No id' }], { more: 3, query: { when: 'today' } })} now={NOW} />
      </SavedContext.Provider>,
    );
    const calendar = screen.getByRole('button', { name: 'Add Lunch and learn: Data science minor to calendar' });
    expect(calendar).toHaveClass('vc-icon-btn');
    fireEvent.click(calendar);
    expect(downloadEventIcs).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));

    expect(screen.getAllByRole('button', { name: /^Save / })).toHaveLength(1);
    const save = screen.getByRole('button', { name: 'Save Lunch and learn: Data science minor' });
    expect(save).toHaveClass('vc-icon-btn');
    fireEvent.click(save);
    expect(saved.save).toHaveBeenCalledWith({
      kind: 'event', key: 'e1', display_name: EVENT.title, event_start: EVENT.start, event_end: EVENT.end,
    });

    expect(screen.queryByText(/Add to calendar$/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/more on the calendar/)).not.toBeInTheDocument();
  });
});

describe('place card', () => {
  const PLACE = {
    id: 'way/1', name: 'Food Carts', category: 'dining', lat: 38.03, lon: -78.51, map_url: 'https://www.openstreetmap.org/?mlat=1',
  };

  test('Walk, Open until and Access tiles; the category pin; Directions and Open in map', () => {
    render(
      <PlaceCard
        visual={{
          type: 'place_card',
          from: { id: 'way/9', name: 'Clark Hall' },
          places: [{ ...PLACE, walk_minutes_estimate: 2, distance_m: 160, hours: 'Mo-Su 07:00-21:00', access: 'yes' }],
        }}
        now={NOW}
      />,
    );
    expect(screen.getByText('Dining')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Food Carts' })).toBeInTheDocument();
    const tiles = [...document.querySelectorAll('.vc-tile')];
    expect(tiles.map((t) => t.querySelector('span').textContent)).toEqual(['Walk', 'Open until', 'Access']);
    expect(tiles[0].querySelector('b')).toHaveTextContent('2 min');
    expect(tiles[1].querySelector('b')).toHaveTextContent('9 PM');
    expect(within(tiles[2]).getByRole('img', { name: 'Wheelchair accessible' })).toBeInTheDocument();
    expect(screen.queryByText(/straight line/)).not.toBeInTheDocument();
    expect(document.querySelector('.mini-map-pin')).toHaveTextContent('restaurant');

    expect(screen.getByRole('link', { name: /Directions/ })).toHaveAttribute('href', '/map?from=way%2F9&to=way%2F1');
    expect(screen.getByRole('link', { name: /Open in map/ })).toHaveAttribute('href', PLACE.map_url);
    expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument();
  });

  test('tiles without data are left out', () => {
    render(<PlaceCard visual={{ type: 'place_card', from: null, places: [{ ...PLACE, walk_minutes_estimate: 2, hours: 'Mo-Su 07:00-10:00' }] }} now={NOW} />);
    expect(document.querySelector('.vc-place-tiles')).toBeNull();
    expect(screen.queryByText('Walk')).not.toBeInTheDocument();
  });

  test('a place with no id or map link has no actions; the start place reads "Here"', () => {
    render(<PlaceCard visual={{ type: 'place_card', from: { name: 'Clark Hall' }, places: [{ name: 'Clark Hall', category: 'academic', walk_minutes_estimate: 0 }] }} now={NOW} />);
    expect(screen.getByText('Building')).toBeInTheDocument();
    expect(screen.getByText('Here')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  test('open until reads the live flags first, then the hours, past midnight too', () => {
    expect(openUntilText({ open_now: true, open_until: '2026-10-29T23:00:00-04:00' }, TZ, NOW)).toBe('11:00 PM');
    expect(openUntilText({ open_now: false, hours: 'Mo-Su 07:00-21:00' }, TZ, NOW)).toBeNull();
    expect(openUntilText({ hours: 'Mo-Su 07:30-21:30' }, TZ, NOW)).toBe('9:30 PM');
    expect(openUntilText({ hours: '24/7' }, TZ, NOW)).toBeNull();
    // Friday 1 AM, a Thursday shift that runs to 2 AM.
    expect(openUntilText({ hours: 'Th 18:00-02:00' }, TZ, new Date('2026-10-30T05:00:00Z'))).toBe('2 AM');
  });
});

test('checked line names each domain', () => {
  render(<SourcesChecked visual={{ type: 'sources_checked', domains: [{ id: 'student_life', label: 'Events' }, { id: 'campus', label: 'Campus map' }] }} />);
  expect(screen.getByText('Events')).toBeInTheDocument();
  expect(screen.getByText('Campus map')).toBeInTheDocument();
});

test('empty cards render nothing', () => {
  const { container } = render(
    <>
      <EventListCard visual={{ events: [] }} />
      <PlaceCard visual={{ places: [] }} />
      <SourcesChecked visual={{ domains: [] }} />
    </>,
  );
  expect(container).toBeEmptyDOMElement();
});
