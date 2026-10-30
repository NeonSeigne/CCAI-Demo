import React from 'react';
import {
  fireEvent, render, screen, within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EventPopup, { alsoAt, eventTiles } from './EventPopup';
import { routeFetch } from '../../pages/__fixtures__/routeFetch';
import { richPlace, uvaEvent, uwEvent } from '../../pages/__fixtures__/popups';

jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token' }) }));

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

const NOW = new Date('2026-10-28T21:25:00Z');
const TZ = 'America/New_York';

// uvaEvent runs 7:30–9:00 PM on Oct 28 (New York); the list's quartet is on
// the same evening at the same place, Open Mic is the next day elsewhere.
const others = [
  {
    id: 'q', title: 'Rivanna String Quartet', start: '2026-10-29T01:15:00Z', end: '2026-10-29T02:00:00Z', location: 'Old Cabell Hall', place_id: 'old-cabell', categories: ['Music'],
  },
  {
    id: 'm', title: 'Open Mic Night', start: '2026-10-30T23:00:00Z', end: null, location: 'Newcomb Hall', place_id: 'newcomb', categories: ['Music'],
  },
];

const uva = {
  ...uvaEvent, kind: 'arts', host: 'McIntire Dept. of Music', cost: 'Free', place_name: 'Old Cabell Hall',
};

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

it('renders the UVA event: Kind · Host, four tiles, Place row, map and Also at', async () => {
  serve(uva);
  const onOpenEvent = jest.fn();
  const onAsk = jest.fn();
  const { container } = renderPopup({ eventId: uva.id, onOpenEvent, onAsk });

  expect(await screen.findByRole('heading', { name: uva.title })).toBeInTheDocument();
  expect(container.querySelector('.pop-eyebrow')).toHaveTextContent('Arts · McIntire Dept. of Music');
  expect(container.querySelector('.pop-eyebrow .ev-kd')).toHaveClass('is-life');

  const labels = [...container.querySelectorAll('.pop-number-label')].map((n) => n.textContent);
  expect(labels).toEqual(['Starts in', 'Time', 'Walk', 'Cost']);
  expect(screen.getByText('2 h 5 m')).toBeInTheDocument();
  expect(screen.getByText('7:30')).toBeInTheDocument();
  expect(screen.getByText('to 9:00 PM')).toBeInTheDocument();
  expect(screen.getByText('Free')).toBeInTheDocument();

  // No category chips, no grip, no feed name, no pill over the map.
  expect(container.querySelector('.pop-chips')).toBeNull();
  expect(container.querySelector('.pop-grip')).toBeNull();
  expect(screen.queryByText('Arts at UVA')).not.toBeInTheDocument();
  expect(container.querySelector('.ep-map-venue')).toBeNull();
  expect(screen.queryByText(/^More in/)).not.toBeInTheDocument();

  const details = screen.getByRole('heading', { name: 'Details' }).closest('section');
  const terms = [...details.querySelectorAll('dt')].map((n) => n.textContent);
  expect(terms.slice(0, 3)).toEqual(['Place', 'Room', 'Hosted by']);
  expect(within(details).getByText('Auditorium')).toBeInTheDocument();
  expect(within(details).getByRole('link', { name: /Register/ })).toHaveAttribute('href', uva.details.registration_url);

  expect(screen.getByRole('link', { name: /Directions/ })).toHaveAttribute('href', '/map?to=old-cabell');
  fireEvent.click(screen.getByRole('button', { name: 'Ask about this' }));
  expect(onAsk).toHaveBeenCalledWith({ type: 'event', id: uva.id, title: uva.title });

  const also = await screen.findByRole('region', { name: 'Also at Old Cabell Hall' });
  expect(within(also).getByText('9:15')).toBeInTheDocument();
  expect(within(also).getByText('Rivanna String Quartet')).toBeInTheDocument();
  expect(within(also).getByText('to 10:00 PM')).toBeInTheDocument();
  expect(within(also).queryByText('Open Mic Night')).not.toBeInTheDocument();
  fireEvent.click(within(also).getByRole('button'));
  expect(onOpenEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'q' }));
});

it('says "Nothing else today" when the place has nothing else that day', async () => {
  serve(uva, [others[1]]);
  renderPopup({ eventId: uva.id });
  const also = await screen.findByRole('region', { name: 'Also at Old Cabell Hall' });
  expect(within(also).getByText('Nothing else today')).toBeInTheDocument();
  expect(within(also).queryByRole('listitem')).not.toBeInTheDocument();
});

it('drops a broken image with no placeholder', async () => {
  serve(uva);
  const { container } = renderPopup({ eventId: uva.id });
  await screen.findByRole('heading', { name: uva.title });
  fireEvent.error(container.querySelector('.ep-image img'));
  expect(container.querySelector('.ep-image')).toBeNull();
});

it('a live UW event: "Starts in Now", no kind, no Cost or Walk tile, no empty sections', async () => {
  serve(uwEvent, []);
  const { container } = renderPopup({ eventId: uwEvent.id });

  expect(await screen.findByRole('heading', { name: uwEvent.title })).toBeInTheDocument();
  expect(screen.getByText('Starts in')).toBeInTheDocument();
  expect(screen.getByText('Now')).toBeInTheDocument();
  expect(screen.queryByText('Happening now')).not.toBeInTheDocument();
  expect(screen.queryByText('Ends in')).not.toBeInTheDocument();
  const labels = [...container.querySelectorAll('.pop-number-label')].map((n) => n.textContent);
  expect(labels).toEqual(['Starts in', 'Time']);
  expect(container.querySelector('.pop-numbers').style.getPropertyValue('--pop-tiles')).toBe('2');
  expect(screen.queryByText('Free')).not.toBeInTheDocument();
  expect(screen.queryByText(/0 min/)).not.toBeInTheDocument();
  expect(container.querySelector('.pop-eyebrow')).toBeNull();
  expect(screen.queryByText('Physics Department Events')).not.toBeInTheDocument();

  const details = screen.getByRole('heading', { name: 'Details' }).closest('section');
  expect(within(details).getByText('Place')).toBeInTheDocument();
  expect(within(details).getByText('2241 Chamberlin')).toBeInTheDocument();
  expect(container.querySelector('.ep-image')).toBeNull();
  expect(container.querySelector('.ep-map')).toBeNull();
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

it('links the event page', async () => {
  serve({ ...uwEvent, url: 'https://today.wisc.edu/events/1' });
  renderPopup({ eventId: uwEvent.id });
  expect(await screen.findByRole('link', { name: /Open/ })).toHaveAttribute('href', 'https://today.wisc.edu/events/1');
});

describe('eventTiles', () => {
  const base = {
    id: 'e', title: 'Talk', start: '2026-10-29T00:05:00Z', end: '2026-10-29T01:00:00Z', location: 'Clark Hall',
  };

  it('writes the countdown as "2 h 40 m" and keeps the order', () => {
    const tiles = eventTiles({
      ...base, walk_minutes: 7, cost: 'Free',
    }, TZ, NOW);
    expect(tiles.map((t) => [t.label, t.value])).toEqual([
      ['Starts in', '2 h 40 m'], ['Time', '8:05'], ['Walk', '7'], ['Cost', 'Free'],
    ]);
  });

  it('leaves out tiles with no data and never invents "Free" or "0 min"', () => {
    expect(eventTiles(base, TZ, NOW).map((t) => t.label)).toEqual(['Starts in', 'Time']);
    const here = eventTiles({ ...base, walk_minutes: 0 }, TZ, NOW).find((t) => t.label === 'Walk');
    expect(here).toEqual(expect.objectContaining({ value: 'Here', unit: null }));
    const online = eventTiles({ ...base, location: 'Zoom', walk_minutes: 4 }, TZ, NOW);
    expect(online.map((t) => t.label)).not.toContain('Walk');
  });

  it('shows "Now" while the event runs and no Starts in once it is over', () => {
    const live = { ...base, start: '2026-10-28T21:00:00Z', end: '2026-10-28T22:00:00Z' };
    expect(eventTiles(live, TZ, NOW)[0]).toEqual(expect.objectContaining({ label: 'Starts in', value: 'Now' }));
    const over = { ...base, start: '2026-10-28T19:00:00Z', end: '2026-10-28T20:00:00Z' };
    expect(eventTiles(over, TZ, NOW).map((t) => t.label)).toEqual(['Time']);
  });

  it('gives an all-day event a Time tile and no countdown', () => {
    const allDay = { ...base, all_day: true };
    expect(eventTiles(allDay, TZ, NOW).map((t) => [t.label, t.value])).toEqual([['Time', 'All day']]);
  });
});

it('lists the same place on the same day only, never the event itself', () => {
  const list = alsoAt(uva, [uva, ...others], TZ, NOW);
  expect(list.map((e) => e.id)).toEqual(['q']);
  expect(alsoAt({ ...uva, location: '(Online)' }, others, TZ, NOW)).toEqual([]);
});
