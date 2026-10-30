import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PlaceSheet, { placeTiles } from './PlaceSheet';
import { routeFetch } from '../../pages/__fixtures__/routeFetch';
import { richPlace, sparsePlace } from '../../pages/__fixtures__/popups';
import { groupedHours, weeklyHours } from '../../utils/osmHours';

jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token' }) }));

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

// A Wednesday afternoon in Charlottesville.
const NOW = new Date('2026-10-28T19:00:00Z');
const TZ = 'America/New_York';

const todayEvents = [
  {
    id: 'e1', title: 'Thesis writing studio', start: '2026-10-28T19:00:00Z', end: '2026-10-28T20:30:00Z', place_id: 'alderman',
  },
  { id: 'e2', title: 'Open mic poetry night', start: '2026-10-28T23:00:00Z', place_id: 'alderman' },
  { id: 'e3', title: 'Elsewhere', start: '2026-10-28T23:00:00Z', place_id: 'newcomb' },
];

function serve(place, events = todayEvents) {
  global.fetch = routeFetch([
    ['/api/places/', { body: { place } }],
    ['/api/events?', { body: { events, timezone: TZ } }],
  ]);
}

const renderSheet = (props) => render(
  <MemoryRouter>
    <PlaceSheet now={NOW} timezone={TZ} onClose={jest.fn()} onAsk={jest.fn()} {...props} />
  </MemoryRouter>,
);

it('renders the mockup card: tiles, Today here with end times, hours, Directions, Ask and the bookmark', async () => {
  serve({ ...richPlace, type: 'Library', floors: '5', access: 'yes' });
  const { container } = renderSheet({ placeId: 'alderman' });

  expect(await screen.findByRole('heading', { name: 'Alderman Library' })).toBeInTheDocument();
  expect(screen.getByText('Library')).toBeInTheDocument();

  expect(screen.getByText('Walk')).toBeInTheDocument();
  expect(screen.getByText('Open until')).toBeInTheDocument();
  expect(screen.getByText('2 AM')).toBeInTheDocument();
  expect(screen.getByText('Floors')).toBeInTheDocument();
  expect(screen.getByText('5')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Wheelchair accessible' })).toBeInTheDocument();
  // No distance under the walk, no photo, address, website or operator.
  expect(screen.queryByText('450 m')).not.toBeInTheDocument();
  expect(container.querySelector('img')).toBeNull();
  expect(screen.queryByText('160 McCormick Rd')).not.toBeInTheDocument();
  expect(screen.queryByText('University of Virginia Library')).not.toBeInTheDocument();

  const today = container.querySelector('tr[aria-current="date"]');
  expect(today).toHaveTextContent('Wednesday');
  expect(today).toHaveTextContent('7:30 AM – 2 AM');
  expect(screen.getByText('Mon–Tue')).toBeInTheDocument();
  expect(screen.getByText('Friday')).toBeInTheDocument();

  const events = screen.getByRole('heading', { name: 'Today here' }).closest('section');
  expect(await within(events).findByText('Thesis writing studio')).toBeInTheDocument();
  expect(within(events).getByText('3:00')).toBeInTheDocument();
  expect(within(events).getByText('to 4:30 PM')).toBeInTheDocument();
  expect(within(events).getByText('Open mic poetry night')).toBeInTheDocument();
  expect(within(events).queryByText('Elsewhere')).not.toBeInTheDocument();

  expect(screen.getByRole('link', { name: /Directions/ })).toHaveAttribute('href', '/map?to=alderman');
  expect(screen.getByRole('button', { name: 'Ask about Alderman Library' })).toHaveTextContent(/\bAsk\b/);
  expect(screen.queryByRole('link', { name: /Call/ })).not.toBeInTheDocument();
});

it('leaves out the type label and any tile without data; the rest stretch', async () => {
  serve(sparsePlace, []);
  const { container } = renderSheet({ placeId: 'monroe' });

  expect(await screen.findByRole('heading', { name: 'Monroe Hall' })).toBeInTheDocument();
  // type is null until the places re-import: no label line at all.
  expect(container.querySelector('.ps-kind')).toBeNull();
  expect(container.querySelector('.pop-eyebrow')).toBeNull();
  expect(container.querySelectorAll('.pop-number')).toHaveLength(1);
  expect(screen.getByText('Walk')).toBeInTheDocument();
  expect(screen.queryByText('Open until')).not.toBeInTheDocument();
  expect(screen.queryByText('Floors')).not.toBeInTheDocument();
  expect(screen.queryByText('Access')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Hours' })).not.toBeInTheDocument();
});

it('says "Nothing listed today" when no event is at the place', async () => {
  serve(sparsePlace, [{ id: 'x', title: 'Elsewhere', start: '2026-10-28T23:00:00Z', place_id: 'newcomb' }]);
  renderSheet({ placeId: 'monroe' });
  const section = (await screen.findByRole('heading', { name: 'Today here' })).closest('section');
  expect(await within(section).findByText('Nothing listed today')).toBeInTheDocument();
  expect(within(section).queryByText('Elsewhere')).not.toBeInTheDocument();
});

it('builds tiles in order and omits what the place lacks', () => {
  const keys = (place) => placeTiles(place, TZ).map((t) => t.key);
  expect(keys({ walk_minutes: 0, open_now: true, open_until: '2026-10-29T03:00:00Z', floors: 3, access: 'no' }))
    .toEqual(['walk', 'open', 'floors', 'access']);
  expect(placeTiles({ walk_minutes: 0 }, TZ)[0].value).toBe('Here');
  // Closed now, or open with no closing time: no "Open until" tile.
  expect(keys({ open_now: false, open_until: '2026-10-29T03:00:00Z' })).toEqual([]);
  expect(keys({ open_now: true })).toEqual([]);
  expect(keys({ building_levels: 'x', wheelchair: 'unknown' })).toEqual([]);
  expect(keys({ building_levels: '4', wheelchair: 'designated' })).toEqual(['floors', 'access']);
});

it("shows the sheet's error state with Retry when the place request fails", async () => {
  global.fetch = routeFetch([['/api/places/', { status: 503, body: { detail: 'down' } }]]);
  renderSheet({ placeId: 'nowhere' });
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/Couldn.t load/);
  expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
});

it('reads simple opening_hours and gives up on the rest', () => {
  expect(weeklyHours('24/7')[0].text).toBe('Open 24 hours');
  expect(weeklyHours('Mo-Fr 08:00-17:00; Sa,Su off')[5].text).toBe('Closed');
  expect(weeklyHours('Mo-Fr 08:00-12:00,13:00-17:00')[0].text).toBe('8 AM – Noon, 1 PM – 5 PM');
  expect(weeklyHours('Mo-Fr 08:00-17:00; PH off')).toBeNull();
  expect(weeklyHours('Mo-Su 00:00-24:00')[3].text).toBe('Open 24 hours');
  expect(weeklyHours('Mo 07:30-02:00')[0].text).toBe('7:30 AM – 2 AM');
  // Outside the backend's pattern: no guessing.
  expect(weeklyHours('Mo 24:00-26:00')).toBeNull();
  expect(weeklyHours('Mo 07:30-26:00')).toBeNull();
  const rows = groupedHours(weeklyHours('Mo-Su 09:00-17:00'), 2);
  expect(rows.map((r) => r.label)).toEqual(['Mon–Tue', 'Wednesday', 'Thu–Sun']);
});
