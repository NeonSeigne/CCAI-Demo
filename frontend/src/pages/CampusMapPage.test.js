import React from 'react';
import {
  act, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as campus from '../api/campus';
import CampusMapPage, { OSM_ATTRIBUTION } from './CampusMapPage';

jest.mock('../api/campus', () => ({
  listPlaces: jest.fn(),
  getPlace: jest.fn(),
  getRoute: jest.fn(),
  getCampusOrigin: jest.fn(),
  setCampusOrigin: jest.fn(),
  listEvents: jest.fn(() => Promise.resolve({ events: [] })),
}));

// Leaflet needs a real layout engine; the map is aria-hidden and the list is
// its accessible equivalent, so tests stub the map and assert on the list.
const mockMap = {
  setView: jest.fn(),
  getContainer: () => global.document.createElement('div'),
  attributionControl: { setPrefix: jest.fn() },
};
jest.mock('react-leaflet', () => ({
  MapContainer: ({ children, zoomControl }) => (
    <div data-testid="leaflet-map" data-zoom-control={String(zoomControl)}>{children}</div>
  ),
  TileLayer: ({ attribution }) => <div data-testid="tiles">{attribution}</div>,
  // Pins are mouse-only in the app; the stub exposes Leaflet's click handler as a button.
  Marker: ({ position, icon, eventHandlers }) => (
    <button
      type="button"
      data-testid="map-marker"
      data-center={position.join(',')}
      className={icon?.options?.className}
      onClick={eventHandlers?.click}
    />
  ),
  useMap: () => mockMap,
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ authToken: 'test-token', user: { firstName: 'Dev' } }),
}));
jest.mock('../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({
    config: { app: { institution: 'UW–Madison' }, school: { timezone: 'America/Chicago' } },
  }),
}));
const mockAsk = jest.fn();
jest.mock('../hooks/useAsk', () => () => mockAsk);
jest.mock('../components/SaveButton', () => ({ item }) => (
  <button type="button" aria-label={`Save ${item.display_name}`}>Save</button>
));

const ORIGIN = {
  id: 'college-library', name: 'College Library', category: 'library', lat: 43.0766, lon: -89.4012,
};
const place = (id, name, category, minutes, extra = {}) => ({
  id, name, category, lat: 43.07 + minutes / 1000, lon: -89.40, hours: null, open_now: null, walk_minutes: minutes, ...extra,
});
const PLACES = [
  { ...ORIGIN, walk_minutes: 0, distance_m: 0 },
  place('memorial', 'Memorial Library', 'library', 5, {
    hours: 'Mo-Su 08:00-21:45', open_now: true, open_until: '2026-10-27T21:45:00-05:00',
  }),
  place('union', 'Memorial Union', 'dining', 6),
  place('bascom', 'Bascom Hall', 'academic', 7),
  place('lakeshore', 'Lakeshore Path', 'landmark', 8),
  place('nick', 'The Nick', 'recreation', 9),
  place('chazen', 'Chazen Museum', 'arts', 10),
  place('steenbock', 'Steenbock Library', 'library', 16),
  place('business', 'Business Library', 'library', 18),
  place('law', 'Law Library', 'library', 20),
];

function placesResponse({ category, q }) {
  let places = category ? PLACES.filter((p) => p.category === category) : PLACES;
  if (q) places = places.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  return { places, from: ORIGIN };
}

function renderPage(entry = '/map') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/map" element={<CampusMapPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const rowButton = (name) => screen.getByRole('button', { name: new RegExp(`^${name}`) });
const card = (name) => screen.findByRole('region', { name });

beforeEach(() => {
  jest.clearAllMocks();
  campus.getCampusOrigin.mockResolvedValue({ place: ORIGIN, is_default: true });
  campus.listPlaces.mockImplementation((token, params) => Promise.resolve(placesResponse(params)));
  campus.getPlace.mockImplementation((token, id) => Promise.resolve({
    place: PLACES.find((p) => p.id === id) || {
      id, name: 'Union South', category: 'dining', lat: 43.0716, lon: -89.4077, open_now: null,
    },
  }));
  campus.setCampusOrigin.mockImplementation((token, id) => Promise.resolve({
    place: { id, name: 'Union South', category: 'dining', lat: 43.0716, lon: -89.4077 },
    is_default: false,
  }));
});

test('lays out the list column as the mockup and opens the card for the nearest place on load', async () => {
  renderPage();
  expect(screen.getByRole('heading', { level: 1, name: 'Campus map' })).toBeInTheDocument();

  // Four chips, All on.
  const chips = screen.getByRole('group', { name: 'Place categories' });
  expect(within(chips).getAllByRole('button').map((b) => b.lastChild.textContent))
    .toEqual(['All', 'Dining', 'Study', 'Rec']);
  expect(within(chips).getByRole('button', { name: /All/ })).toHaveAttribute('aria-pressed', 'true');

  // Eight rows: name, category, walk; "Here" for the start place; no Save on rows.
  await screen.findByText('Memorial Library');
  const list = screen.getByRole('region', { name: 'All, nearest first' });
  expect(within(list).getAllByRole('button')).toHaveLength(8);
  const here = rowButton('College Library');
  expect(within(here).getByText('Here')).toBeInTheDocument();
  expect(within(here).getByText('Library')).toBeInTheDocument();
  expect(within(rowButton('Memorial Union')).getByText('Dining')).toBeInTheDocument();
  expect(within(rowButton('Memorial Union')).getByText('6 min')).toBeInTheDocument();
  expect(within(list).queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument();
  expect(screen.queryByText('Business Library')).not.toBeInTheDocument();
  expect(screen.queryByText(/See \d+ more/)).not.toBeInTheDocument();

  // The card is open for the selection without a click, and focus stays put.
  expect(here).toHaveAttribute('aria-pressed', 'true');
  const sheet = await card('College Library');
  expect(within(sheet).getByRole('heading', { name: 'College Library' })).not.toHaveFocus();
  expect(within(sheet).getByText('Here')).toBeInTheDocument();

  // No route panel, no route request, no footnote; the attribution stays without Leaflet's prefix.
  expect(campus.getRoute).not.toHaveBeenCalled();
  expect(screen.queryByRole('region', { name: 'Walking route' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Places and walking routes/)).not.toBeInTheDocument();
  expect(screen.getByTestId('tiles')).toHaveTextContent(OSM_ATTRIBUTION);
  expect(mockMap.attributionControl.setPrefix).toHaveBeenCalledWith(false);
  expect(screen.getByTestId('leaflet-map')).toHaveAttribute('data-zoom-control', 'false');
  expect(screen.getByTestId('leaflet-map').closest('[aria-hidden="true"]')).not.toBeNull();
});

test('keeps one "Starting from {place} · Change" line under the title', async () => {
  renderPage();
  const line = (await screen.findByText(/Starting from/)).closest('p');
  expect(line).toHaveTextContent('Starting from College Library · Change');
  expect(within(line).getByRole('button', { name: 'Change starting place (now College Library)' })).toBeInTheDocument();
});

test('Change opens a place search; picking saves the start with PUT; Escape closes', async () => {
  jest.useFakeTimers();
  try {
    renderPage();
    await act(async () => { await Promise.resolve(); });
    await screen.findByText('Memorial Library');
    fireEvent.click(screen.getByRole('button', { name: /Change starting place/ }));
    const dialog = screen.getByRole('dialog', { name: 'Choose a starting place' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Change starting place/ }));
    campus.listPlaces.mockImplementationOnce(() => Promise.resolve({
      places: [{ id: 'union-south', name: 'Union South', category: 'dining', lat: 43.0716, lon: -89.4077 }],
    }));
    fireEvent.change(screen.getByLabelText('Start from'), { target: { value: 'union' } });
    await act(async () => { jest.advanceTimersByTime(300); });
    fireEvent.click(await screen.findByRole('button', { name: /Union South/ }));
    await act(async () => { jest.runOnlyPendingTimers(); });
    expect(campus.setCampusOrigin).toHaveBeenCalledWith('test-token', 'union-south');
    await waitFor(() => expect(screen.getByText(/Starting from/).closest('p')).toHaveTextContent('Union South'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(campus.listPlaces).toHaveBeenLastCalledWith(
      'test-token', { category: '', from: 'union-south', limit: 25 }, expect.anything(),
    ));
  } finally {
    jest.useRealTimers();
  }
});

test('offers "Choose a starting point" when no start is set', async () => {
  campus.getCampusOrigin.mockResolvedValue({ place: null, is_default: true });
  renderPage();
  expect(await screen.findByRole('button', { name: 'Choose a starting point' })).toBeInTheDocument();
  expect(screen.queryByText(/Starting from/)).not.toBeInTheDocument();
});

test('?to= selects that place and opens its card; ?from= sets the start for this view', async () => {
  renderPage('/map?from=college-library&to=steenbock');
  expect(await card('Steenbock Library')).toBeInTheDocument();
  expect(campus.getPlace).toHaveBeenCalledWith('test-token', 'college-library', expect.anything());
});

test('a row opens its card; Ask attaches; closing returns focus to the row', async () => {
  renderPage();
  await card('College Library');
  fireEvent.click(rowButton('Memorial Union'));
  const sheet = await card('Memorial Union');
  await waitFor(() => expect(within(sheet).getByRole('heading', { name: 'Memorial Union' })).toHaveFocus());
  expect(rowButton('Memorial Union')).toHaveAttribute('aria-pressed', 'true');
  expect(rowButton('College Library')).toHaveAttribute('aria-pressed', 'false');

  fireEvent.click(within(sheet).getByRole('button', { name: 'Ask about Memorial Union' }));
  expect(mockAsk).toHaveBeenCalledWith({ type: 'place', id: 'union', title: 'Memorial Union' });

  fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('region', { name: 'Memorial Union' })).not.toBeInTheDocument();
  await waitFor(() => expect(rowButton('Memorial Union')).toHaveFocus());
});

test('Directions opens OpenStreetMap walking directions from the start in a new tab', async () => {
  const open = jest.spyOn(window, 'open').mockImplementation(() => null);
  try {
    renderPage();
    await card('College Library');
    fireEvent.click(rowButton('Memorial Library'));
    const sheet = await card('Memorial Library');
    fireEvent.click(within(sheet).getByRole('button', { name: /Directions/ }));
    expect(open).toHaveBeenCalledWith(
      expect.stringContaining('openstreetmap.org/directions?engine=fossgis_osrm_foot&route=43.076600,-89.401200;'),
      '_blank',
      'noopener,noreferrer',
    );
  } finally {
    open.mockRestore();
  }
});

test('clicking a pin opens its card', async () => {
  renderPage();
  await card('College Library');
  const pin = screen.getAllByTestId('map-marker')
    .find((marker) => marker.dataset.center === `${PLACES[3].lat},${PLACES[3].lon}`);
  fireEvent.click(pin);
  expect(await card('Bascom Hall')).toBeInTheDocument();
  expect(rowButton('Bascom Hall')).toHaveAttribute('aria-pressed', 'true');
});

test('the start place gets its own marker and the selected pin is drawn large', async () => {
  const { container } = renderPage();
  await card('College Library');
  expect(container.querySelector('.map-start')).not.toBeNull();
  expect(container.querySelectorAll('.map-pin.is-selected')).toHaveLength(1);
});

test('Study filters to libraries; an empty category says so and offers Show all', async () => {
  renderPage();
  await screen.findByText('Memorial Library');
  fireEvent.click(screen.getByRole('button', { name: /Study/ }));
  await waitFor(() => expect(campus.listPlaces).toHaveBeenLastCalledWith(
    'test-token', { category: 'library', from: 'college-library', limit: 25 }, expect.anything(),
  ));
  expect(await screen.findByText('Business Library')).toBeInTheDocument();
  expect(screen.queryByText('Memorial Union', { selector: '.map-row-name' })).not.toBeInTheDocument();

  campus.listPlaces.mockImplementation((token, params) => Promise.resolve(
    params.category === 'recreation' ? { places: [] } : placesResponse(params),
  ));
  fireEvent.click(screen.getByRole('button', { name: /Rec/ }));
  expect(await screen.findByText('No recreation places on the campus map')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /All/ })).toHaveAttribute('aria-pressed', 'true'));
});

test('a failed list shows "Couldn\'t load places" and Retry reloads it', async () => {
  campus.listPlaces.mockRejectedValueOnce(new Error('down'));
  renderPage();
  expect(await screen.findByText("Couldn't load places")).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Memorial Library')).toBeInTheDocument();
  expect(screen.queryByText("Couldn't load places")).not.toBeInTheDocument();
});

test('Search places asks for matching places and opens the first match', async () => {
  renderPage();
  await card('College Library');
  fireEvent.change(screen.getByLabelText('Search places'), { target: { value: 'law' } });
  await waitFor(() => expect(campus.listPlaces).toHaveBeenLastCalledWith(
    'test-token', { category: '', from: 'college-library', limit: 25, q: 'law' }, expect.anything(),
  ));
  expect(await card('Law Library')).toBeInTheDocument();
  expect(rowButton('Law Library')).toHaveAttribute('aria-pressed', 'true');
});
