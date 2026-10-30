import React from 'react';
import {
  fireEvent, render, screen, within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EventPopup, { relatedEvents } from './EventPopup';
import { routeFetch } from '../../pages/__fixtures__/routeFetch';
import { richPlace, uvaEvent, uwEvent } from '../../pages/__fixtures__/popups';

jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token' }) }));

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

const NOW = new Date('2026-10-28T21:25:00Z');
const TZ = 'America/New_York';

const others = [
  {
    id: 'q', title: 'Rivanna String Quartet', start: '2026-10-29T23:00:00Z', end: null, location: 'Old Cabell Hall', place_id: 'old-cabell', categories: ['Music'],
  },
  {
    id: 'm', title: 'Open Mic Night', start: '2026-10-30T23:00:00Z', end: null, location: 'Newcomb Hall', place_id: 'newcomb', categories: ['Music'],
  },
];

function serve(event, list = others) {
  global.fetch = routeFetch([
    ['/api/events/', { body: { event, timezone: TZ } }],
    ['/api/events?', { body: { events: [event, ...list], timezone: TZ } }],
    ['/api/places/', { body: { place: { ...richPlace, id: 'old-cabell', name: 'Old Cabell Hall' } } }],
  ]);
}

const renderPopup = (props) => render(
  <MemoryRouter>
    <EventPopup now={NOW} timezone={TZ} onAsk={jest.fn()} onClose={jest.fn()} {...props} />
  </MemoryRouter>,
);

it('renders the UVA event: image, categories, details, map and both lists', async () => {
  serve(uvaEvent);
  const onOpenEvent = jest.fn();
  const { container } = renderPopup({ eventId: uvaEvent.id, onOpenEvent });

  expect(await screen.findByRole('heading', { name: uvaEvent.title })).toBeInTheDocument();
  expect(screen.getByText('Music', { selector: '.pop-chip' })).toBeInTheDocument();
  expect(screen.getByText('Performance')).toBeInTheDocument();
  expect(screen.getByText('Starts in')).toBeInTheDocument();
  expect(screen.getByText('2h 05m')).toBeInTheDocument();
  expect(screen.getByText('Cost')).toBeInTheDocument();
  expect(screen.getByText('Free')).toBeInTheDocument();
  expect(container.querySelector('.ep-image img')).toHaveAttribute('src', uvaEvent.image_url);

  const details = screen.getByRole('heading', { name: 'Details' }).closest('section');
  expect(within(details).getByText('Concert')).toBeInTheDocument();
  expect(within(details).getByText('McIntire Dept. of Music')).toBeInTheDocument();
  expect(within(details).getByText('Auditorium')).toBeInTheDocument();
  expect(within(details).getByRole('link', { name: /Register/ })).toHaveAttribute('href', uvaEvent.details.registration_url);

  expect(screen.getByRole('link', { name: /Directions/ })).toHaveAttribute('href', '/map?to=old-cabell');

  const also = await screen.findByRole('region', { name: /Also at/ });
  expect(within(also).getByText('Rivanna String Quartet')).toBeInTheDocument();
  const more = screen.getByRole('region', { name: 'More in Music' });
  expect(within(more).getByText('Open Mic Night')).toBeInTheDocument();
  fireEvent.click(within(more).getByRole('button'));
  expect(onOpenEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'm' }));

  // R3: no Tonight tile.
  expect(screen.queryByText(/Tonight/i)).not.toBeInTheDocument();
});

it('drops a broken image with no placeholder', async () => {
  serve(uvaEvent);
  const { container } = renderPopup({ eventId: uvaEvent.id });
  await screen.findByRole('heading', { name: uvaEvent.title });
  fireEvent.error(container.querySelector('.ep-image img'));
  expect(container.querySelector('.ep-image')).toBeNull();
});

it('renders the UW event without image, categories or details, and no empty tiles', async () => {
  serve(uwEvent, []);
  const { container } = renderPopup({ eventId: uwEvent.id });

  expect(await screen.findByRole('heading', { name: uwEvent.title })).toBeInTheDocument();
  expect(screen.getByText('Happening now')).toBeInTheDocument();
  expect(screen.getByText('Ends in')).toBeInTheDocument();
  expect(screen.getByText('Room')).toBeInTheDocument();
  expect(screen.getByText('2241 Chamberlin')).toBeInTheDocument();
  expect(container.querySelector('.ep-image')).toBeNull();
  expect(container.querySelector('.pop-chips')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Details' })).not.toBeInTheDocument();
  expect(container.querySelector('.ep-map')).toBeNull();
  expect(screen.queryByText(/Also at/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Tonight/i)).not.toBeInTheDocument();
  container.querySelectorAll('.pop-tile').forEach((tile) => expect(tile.textContent.trim()).not.toBe(''));
});

it("shows the sheet's error state with Retry when the event request fails", async () => {
  global.fetch = routeFetch([['/api/events/', { status: 502, body: { detail: 'down' } }]]);
  renderPopup({ eventId: 'x' });
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/Couldn.t load/);
  expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
});

it('shows a not-found state with no Retry for a 404', async () => {
  global.fetch = routeFetch([['/api/events/', { status: 404, body: { detail: 'Event not found.' } }]]);
  renderPopup({ eventId: 'gone' });
  expect(await screen.findByText('Event not found')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
});

it('links the event page and makes the header a drag source', async () => {
  serve({ ...uwEvent, url: 'https://today.wisc.edu/events/1' });
  renderPopup({ eventId: uwEvent.id });
  expect(await screen.findByRole('link', { name: /Open/ })).toHaveAttribute('href', 'https://today.wisc.edu/events/1');
  expect(screen.getByRole('button', { name: `Drag ${uwEvent.title}` })).toBeInTheDocument();
});

it('lists related events once each and never the event itself', () => {
  const { atVenue, inCategory } = relatedEvents(uvaEvent, [uvaEvent, ...others], NOW);
  expect(atVenue.map((e) => e.id)).toEqual(['q']);
  expect(inCategory.map((e) => e.id)).toEqual(['m']);
});
