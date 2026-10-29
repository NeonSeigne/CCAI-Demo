import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PlaceSheet from './PlaceSheet';
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
  { id: 'e1', title: 'Thesis writing studio', start: '2026-10-28T19:00:00Z', place_id: 'alderman' },
  { id: 'e2', title: 'Open mic poetry night', start: '2026-10-28T23:00:00Z', place_id: 'alderman' },
  { id: 'e3', title: 'Elsewhere', start: '2026-10-28T23:00:00Z', place_id: 'newcomb' },
];

function serve(place) {
  global.fetch = routeFetch([
    ['/api/places/', { body: { place } }],
    ['/api/events?', { body: { events: todayEvents, timezone: TZ } }],
  ]);
}

const renderSheet = (props) => render(
  <MemoryRouter>
    <PlaceSheet now={NOW} timezone={TZ} onClose={jest.fn()} onAsk={jest.fn()} {...props} />
  </MemoryRouter>,
);

it('renders a rich place: photo credit, tiles, hours with today, events, address, website, actions', async () => {
  serve(richPlace);
  const { container } = renderSheet({ placeId: 'alderman' });

  expect(await screen.findByRole('heading', { name: 'Alderman Library' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Photo: Jane Photographer · CC BY-SA 4.0' }))
    .toHaveAttribute('href', richPlace.photo.page);
  expect(screen.getByText('Library')).toBeInTheDocument();
  expect(screen.getByText('University of Virginia Library')).toBeInTheDocument();

  expect(screen.getByText('Walk')).toBeInTheDocument();
  expect(screen.getByText('450 m')).toBeInTheDocument();
  expect(screen.getByText('Open', { selector: 'strong' })).toBeInTheDocument();
  expect(screen.getByText('Floors')).toBeInTheDocument();
  expect(screen.getByText('5')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Wheelchair accessible' })).toBeInTheDocument();

  const today = container.querySelector('tr[aria-current="date"]');
  expect(today).toHaveTextContent('Wed');
  expect(today).toHaveTextContent('7:30 am – 2 am');
  expect(screen.getByText('Mon–Tue')).toBeInTheDocument();

  const events = (await screen.findByRole('heading', { name: /Today/ })).closest('section');
  expect(within(events).getByText('Thesis writing studio')).toBeInTheDocument();
  expect(within(events).getByText('Open mic poetry night')).toBeInTheDocument();
  expect(within(events).queryByText('Elsewhere')).not.toBeInTheDocument();

  expect(screen.getByText('160 McCormick Rd')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'library.virginia.edu' })).toHaveAttribute('href', richPlace.website);

  expect(screen.getByRole('link', { name: /Directions/ })).toHaveAttribute('href', '/map?to=alderman');
  expect(screen.getByRole('button', { name: 'Ask about Alderman Library' })).toHaveAttribute('title', 'Ask');
  expect(screen.getByRole('link', { name: 'Call Alderman Library' })).toHaveAttribute('href', 'tel:+14349243021');
});

it('renders a sparse place as a short sheet with no empty tiles', async () => {
  serve(sparsePlace);
  const { container } = renderSheet({ placeId: 'monroe' });

  expect(await screen.findByRole('heading', { name: 'Monroe Hall' })).toBeInTheDocument();
  expect(container.querySelector('.ps-photo')).toBeNull();
  expect(container.querySelectorAll('.ps-tile')).toHaveLength(1);
  expect(screen.getByText('Walk')).toBeInTheDocument();
  expect(screen.queryByText('Floors')).not.toBeInTheDocument();
  expect(screen.queryByText('Access')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Hours' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Call/ })).not.toBeInTheDocument();
  expect(screen.getByText('248 McCormick Rd')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Directions/ })).toBeInTheDocument();
});

it("shows \"Couldn't load · Retry\" when the place request fails", async () => {
  global.fetch = routeFetch([['/api/places/', { status: 503, body: { detail: 'down' } }]]);
  renderSheet({ placeId: 'nowhere' });
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load · Retry");
});

it('reads simple opening_hours and gives up on the rest', () => {
  expect(weeklyHours('24/7')[0].text).toBe('Open 24 hours');
  expect(weeklyHours('Mo-Fr 08:00-17:00; Sa,Su off')[5].text).toBe('Closed');
  expect(weeklyHours('Mo-Fr 08:00-12:00,13:00-17:00')[0].text).toBe('8 am – 12 pm, 1 pm – 5 pm');
  expect(weeklyHours('Mo-Fr 08:00-17:00; PH off')).toBeNull();
  expect(weeklyHours('Mo-Su 00:00-24:00')[3].text).toBe('Open 24 hours');
  expect(weeklyHours('Mo 07:30-02:00')[0].text).toBe('7:30 am – 2 am');
  // Outside the backend's pattern: no guessing.
  expect(weeklyHours('Mo 24:00-26:00')).toBeNull();
  expect(weeklyHours('Mo 07:30-26:00')).toBeNull();
  const rows = groupedHours(weeklyHours('Mo-Su 09:00-17:00'), 2);
  expect(rows.map((r) => r.label)).toEqual(['Mon–Tue', 'Wed', 'Thu–Sun']);
});
