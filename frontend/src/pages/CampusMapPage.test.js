import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import * as campus from '../api/campus';
import CampusMapPage, { OSM_ATTRIBUTION } from './CampusMapPage';

jest.mock('../api/campus', () => ({
  listPlaces: jest.fn(),
  getPlace: jest.fn(),
  getRoute: jest.fn(),
  getCampusOrigin: jest.fn(),
  setCampusOrigin: jest.fn(),
}));

// Leaflet needs a real layout engine; the map is aria-hidden and the list is
// its accessible equivalent, so tests stub the map and assert on the list.
jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="leaflet-map">{children}</div>,
  TileLayer: ({ attribution }) => <div data-testid="tiles">{attribution}</div>,
  CircleMarker: ({ className }) => <div data-testid="map-marker" className={className} />,
  Polyline: ({ positions }) => <div data-testid="route-line" data-points={positions.length} />,
  useMap: () => ({ fitBounds: jest.fn(), setView: jest.fn(), getContainer: () => global.document.createElement('div') }),
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ authToken: 'test-token', user: { firstName: 'Dev' } }),
}));
jest.mock('../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({
    config: { app: { institution: 'UW–Madison' }, school: { timezone: 'America/Chicago' } },
    advisors: [],
  }),
}));
jest.mock('../components/CampusRail', () => () => <nav aria-label="Main" />);
jest.mock('../components/SettingsModal', () => () => null);
jest.mock('../components/SaveButton', () => ({ item }) => (
  <button type="button" aria-label={`Save ${item.display_name}`}>Save</button>
));

const ORIGIN = { id: 'college-library', name: 'College Library', category: 'library', lat: 43.0766, lon: -89.4012 };
const LIBRARIES = [
  { id: 'geography', name: 'Geography Library', category: 'library', lat: 43.0757, lon: -89.4040, hours: null, open_now: null, open_until: null, walk_minutes: 2, distance_m: 210 },
  { id: 'memorial', name: 'Memorial Library', category: 'library', lat: 43.0751, lon: -89.3984, hours: 'Mo-Su 08:00-21:45', open_now: true, open_until: '2026-10-27T21:45:00-05:00', walk_minutes: 5, distance_m: 412 },
  { id: 'steenbock', name: 'Steenbock Library', category: 'library', lat: 43.0763, lon: -89.4128, hours: null, open_now: null, open_until: null, walk_minutes: 16, distance_m: 1200 },
  { id: 'business', name: 'Business Library', category: 'library', lat: 43.0730, lon: -89.4020, hours: null, open_now: null, open_until: null, walk_minutes: 18, distance_m: 1350 },
  { id: 'law', name: 'Law Library', category: 'library', lat: 43.0748, lon: -89.4011, hours: null, open_now: null, open_until: null, walk_minutes: 20, distance_m: 1500 },
];
const CATEGORIES = { library: 5, dining: 26, health: 0 };
const ROUTE = {
  geometry: { type: 'LineString', coordinates: [[-89.4012, 43.0766], [-89.4000, 43.0760], [-89.3984, 43.0751]] },
  distance_m: 412,
  minutes: 5,
  source: 'osrm',
  attribution: 'Routes © OSRM, data © OpenStreetMap contributors (ODbL)',
};

function placesResponse({ category, limit }) {
  if (limit === 1) {
    return { places: [LIBRARIES[0]], categories: CATEGORIES, suggested: null, from: ORIGIN, default_category: 'library' };
  }
  if (category === 'library') {
    return {
      places: LIBRARIES,
      categories: CATEGORIES,
      suggested: { id: 'memorial', label: 'Nearest open library' },
      from: ORIGIN,
      default_category: 'library',
    };
  }
  return { places: [], categories: CATEGORIES, suggested: null, from: ORIGIN, default_category: 'library' };
}

function LocationProbe() {
  const location = useLocation();
  return <pre data-testid="location">{JSON.stringify({ pathname: location.pathname, state: location.state })}</pre>;
}

function renderPage(entry = '/map') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/map" element={<CampusMapPage />} />
        <Route path="/chat" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const rowButton = (name) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

beforeEach(() => {
  jest.clearAllMocks();
  campus.getCampusOrigin.mockResolvedValue({ place: ORIGIN, is_default: true });
  campus.listPlaces.mockImplementation((token, params) => Promise.resolve(placesResponse(params)));
  campus.getRoute.mockResolvedValue(ROUTE);
  campus.getPlace.mockImplementation((token, id) => Promise.resolve({
    place: id === ORIGIN.id ? ORIGIN : { id, name: 'Union South', category: 'dining', lat: 43.0716, lon: -89.4077, open_now: null },
  }));
  campus.setCampusOrigin.mockImplementation((token, id) => Promise.resolve({
    place: { id, name: 'Union South', category: 'dining', lat: 43.0716, lon: -89.4077 },
    is_default: false,
  }));
});

test('titles the page and selects the suggested place with its label, route and minutes', async () => {
  renderPage();
  expect(screen.getByRole('heading', { level: 1, name: 'Campus map' })).toBeInTheDocument();
  expect(await screen.findByText('Nearest open library')).toBeInTheDocument();
  expect(screen.getByText('Starting from')).toBeInTheDocument();
  expect(screen.getByText('College Library')).toBeInTheDocument();
  expect(rowButton('Memorial Library')).toHaveAttribute('aria-pressed', 'true');
  expect(await screen.findByText('412 m along paths')).toBeInTheDocument();
  expect(screen.getByText('Walking to Memorial Library')).toBeInTheDocument();
  expect(campus.getRoute).toHaveBeenCalledWith('test-token', { from: 'college-library', to: 'memorial' }, expect.anything());
  expect(screen.getByTestId('route-line')).toHaveAttribute('data-points', '3');
  // Rows: hours copy and walk times (R9), only Save beside each row (31A).
  expect(screen.getByText('Open until 9:45 PM')).toBeInTheDocument();
  expect(screen.getAllByText('Hours not listed').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'Save Memorial Library' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Directions/ })).not.toBeInTheDocument();
  // Category from default_category, counts from `categories`.
  expect(screen.getByRole('button', { name: /^Libraries\s*5/ })).toHaveAttribute('aria-pressed', 'true');
  // Map is hidden from assistive tech; OSM attribution is visible.
  expect(screen.getByTestId('leaflet-map').closest('[aria-hidden="true"]')).not.toBeNull();
  expect(screen.getAllByText(OSM_ATTRIBUTION).length).toBeGreaterThan(0);
  expect(screen.getByText(/Routes © OSRM/)).toBeInTheDocument();
});

test('labels the fallback suggestion exactly as the API gives it', async () => {
  campus.listPlaces.mockImplementation((token, params) => {
    const data = placesResponse(params);
    return Promise.resolve(params.limit === 1 ? data : { ...data, suggested: { id: 'geography', label: 'Nearest library' } });
  });
  renderPage();
  expect(await screen.findByText('Nearest library')).toBeInTheDocument();
  expect(rowButton('Geography Library')).toHaveAttribute('aria-pressed', 'true');
});

test('?to= overrides the suggestion and ?from= sets the start for this view', async () => {
  renderPage('/map?from=college-library&to=steenbock&category=library');
  await waitFor(() => expect(rowButton('Steenbock Library')).toHaveAttribute('aria-pressed', 'true'));
  expect(screen.queryByText('Nearest open library')).not.toBeInTheDocument();
  expect(campus.getCampusOrigin).not.toHaveBeenCalled();
  expect(campus.getPlace).toHaveBeenCalledWith('test-token', 'college-library', expect.anything());
  await waitFor(() => expect(campus.getRoute).toHaveBeenCalledWith(
    'test-token', { from: 'college-library', to: 'steenbock' }, expect.anything(),
  ));
});

test('clicking a row selects it, redraws the route and updates the panel', async () => {
  renderPage();
  await screen.findByText('412 m along paths');
  campus.getRoute.mockResolvedValueOnce({ ...ROUTE, minutes: 16, distance_m: 1200 });
  fireEvent.click(rowButton('Steenbock Library'));
  expect(rowButton('Steenbock Library')).toHaveAttribute('aria-pressed', 'true');
  expect(rowButton('Memorial Library')).toHaveAttribute('aria-pressed', 'false');
  expect(await screen.findByText('1.2 km along paths')).toBeInTheDocument();
  expect(screen.getByText('Walking to Steenbock Library')).toBeInTheDocument();
  expect(screen.queryByText('Nearest open library')).not.toBeInTheDocument();
  expect(campus.getRoute).toHaveBeenLastCalledWith('test-token', { from: 'college-library', to: 'steenbock' }, expect.anything());
});

test('a failed route shows "Walking route unavailable" and drops the old line and time', async () => {
  renderPage();
  await screen.findByText('412 m along paths');
  expect(screen.getByTestId('route-line')).toBeInTheDocument();
  campus.getRoute.mockRejectedValueOnce(Object.assign(new Error('Walking route unavailable.'), { status: 503 }));
  fireEvent.click(rowButton('Geography Library'));
  expect(await screen.findByText('Walking route unavailable')).toBeInTheDocument();
  expect(screen.queryByTestId('route-line')).not.toBeInTheDocument();
  expect(screen.queryByText(/along paths/)).not.toBeInTheDocument();
  const panel = screen.getByRole('region', { name: 'Walking route' });
  expect(within(panel).queryByText(/\d+ min/)).not.toBeInTheDocument();
});

test('Ask about this route opens a new chat prefilled, not sent', async () => {
  renderPage();
  await screen.findByText('Nearest open library');
  fireEvent.click(screen.getByRole('button', { name: 'Ask about this route' }));
  const state = JSON.parse(screen.getByTestId('location').textContent);
  expect(state.pathname).toBe('/chat');
  expect(state.state).toEqual({
    startNew: true,
    pendingPrompt: 'How do I get from College Library to Memorial Library?',
  });
  expect(state.state.autoSend).toBeUndefined();
});

test('Change opens a place search; picking saves the start with PUT; Escape closes', async () => {
  jest.useFakeTimers();
  try {
    renderPage();
    await act(async () => { await Promise.resolve(); });
    await screen.findByText('Nearest open library');
    fireEvent.click(screen.getByRole('button', { name: /Change starting place/ }));
    const dialog = screen.getByRole('dialog', { name: 'Choose a starting place' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Change starting place/ }));
    campus.listPlaces.mockImplementationOnce(() => Promise.resolve({
      places: [{ id: 'union-south', name: 'Union South', category: 'dining', lat: 43.0716, lon: -89.4077 }],
      categories: CATEGORIES,
      suggested: null,
    }));
    fireEvent.change(screen.getByLabelText('Start from'), { target: { value: 'union' } });
    await act(async () => { jest.advanceTimersByTime(300); });
    fireEvent.click(await screen.findByRole('button', { name: /Union South/ }));
    await act(async () => { jest.runOnlyPendingTimers(); });
    expect(campus.setCampusOrigin).toHaveBeenCalledWith('test-token', 'union-south');
    await waitFor(() => expect(screen.getByText('Union South')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(campus.getRoute).toHaveBeenLastCalledWith(
      'test-token', { from: 'union-south', to: 'memorial' }, expect.anything(),
    ));
  } finally {
    jest.useRealTimers();
  }
});

test('shows "Choose a starting point" when no start is set', async () => {
  campus.getCampusOrigin.mockResolvedValue({ place: null, is_default: true });
  renderPage();
  expect(await screen.findByRole('button', { name: 'Choose a starting point' })).toBeInTheDocument();
  await screen.findByText('Nearest open library');
  expect(campus.getRoute).not.toHaveBeenCalled();
});

test('an empty category says so and offers Show all', async () => {
  renderPage('/map?category=health');
  expect(await screen.findByText('No health places on the campus map')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
  await waitFor(() => expect(campus.listPlaces).toHaveBeenLastCalledWith(
    'test-token', { category: '', from: 'college-library', limit: 25 }, expect.anything(),
  ));
  expect(screen.getByRole('button', { name: /^All places/ })).toHaveAttribute('aria-pressed', 'true');
});

test('a failed list shows "Couldn\'t load places" and Retry reloads it', async () => {
  campus.listPlaces.mockRejectedValueOnce(new Error('down'));
  renderPage('/map?category=library');
  expect(await screen.findByText("Couldn't load places")).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: 'Campus map' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Nearest open library')).toBeInTheDocument();
  expect(screen.queryByText("Couldn't load places")).not.toBeInTheDocument();
});

test('shows the 3 nearest and "See N more" expands the list inline', async () => {
  renderPage();
  await screen.findByText('Nearest open library');
  expect(screen.queryByText('Business Library')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'See 2 more libraries' }));
  expect(screen.getByText('Business Library')).toBeInTheDocument();
  expect(screen.getByText('Law Library')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /See \d+ more/ })).not.toBeInTheDocument();
});

test('Open in OpenStreetMap opens walking directions in a new tab', async () => {
  renderPage();
  await screen.findByText('Nearest open library');
  const link = screen.getByRole('link', { name: /Open in OpenStreetMap/ });
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  expect(link.getAttribute('href')).toBe(
    'https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=43.076600,-89.401200;43.075100,-89.398400',
  );
});
