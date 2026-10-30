import React from 'react';
import {
  act, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppRoutes } from './App';
import { routeFetch } from './pages/__fixtures__/routeFetch';
import { uvaEvent, uwPopupCourse } from './pages/__fixtures__/popups';

// Routing: the shell, the course pop-up host and EventsPage are real; other
// pages are stubs. The map stub carries a course chip, the real way in.
jest.mock('./contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, authReady: true, authToken: 'token' }),
  AuthProvider: ({ children }) => children,
}));
jest.mock('./contexts/AppConfigContext', () => ({
  useAppConfig: () => ({ config: { app: { institution: 'UVA' }, school: { timezone: 'UTC' } } }),
  AppConfigProvider: ({ children }) => children,
}));
jest.mock('./pages/ChatPage', () => () => <div>Chat page</div>);
jest.mock('./pages/CoursesPage', () => () => <div>Courses page</div>);
jest.mock('./pages/CampusMapPage', () => {
  const CourseChip = jest.requireActual('./components/visuals/CourseChip').default;
  return () => (
    <div>
      Map page
      <CourseChip identifier="COMP SCI 400" />
    </div>
  );
});
jest.mock('./pages/HomePage', () => () => <div>Home page</div>);
jest.mock('./pages/OnboardingPage', () => () => null);
jest.mock('./components/UserGuide', () => () => null);
jest.mock('./components/ChatDock', () => () => <aside data-testid="dock">Ask</aside>);

const realFetch = global.fetch;
beforeEach(() => {
  global.fetch = routeFetch([
    ['/api/catalog/ratings/', { body: { ratings: [] } }],
    ['/api/catalog/', { body: uwPopupCourse() }],
    ['/api/me/campus-origin', { body: { place: null } }],
    ['/api/events/', { body: { event: uvaEvent, timezone: 'UTC' } }],
    ['/api/events', { body: { events: [], timezone: 'UTC', source: [] } }],
    ['/api/places/', { body: { place: { id: 'old-cabell', name: 'Old Cabell Hall', lat: 38.03, lon: -78.5 } } }],
  ]);
});
afterEach(() => { global.fetch = realFetch; });

const routerAt = (entries) => createMemoryRouter([{ path: '*', element: <AppRoutes /> }], { initialEntries: entries });

/** True when the element or an ancestor is hidden from assistive tech. */
const ariaHidden = (element) => Boolean(element.closest('[aria-hidden="true"]'));

it('a chip on the map opens the pop-up without changing the path; Back closes it', async () => {
  const router = routerAt(['/map']);
  render(<RouterProvider router={router} />);
  expect(await screen.findByText(/Map page/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /COMP SCI 400/ }));
  expect(await screen.findByRole('dialog', { name: 'Programming III' })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/map');
  expect(router.state.location.search).toBe('?course=COMP+SCI+400');

  await act(async () => { await router.navigate(-1); });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(router.state.location.pathname).toBe('/map');
  expect(router.state.location.search).toBe('');
});

it('Close leaves the page where it was', async () => {
  const router = routerAt(['/home', '/map']);
  render(<RouterProvider router={router} />);
  await screen.findByText(/Map page/);
  fireEvent.click(screen.getByRole('button', { name: /COMP SCI 400/ }));
  const dialog = await screen.findByRole('dialog', { name: 'Programming III' });

  const close = screen.getByRole('button', { name: 'Close' });
  fireEvent.click(close);
  fireEvent.click(close);
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(router.state.location.pathname).toBe('/map');
});

it('the old /courses/:id link opens the course pop-up on Courses', async () => {
  // Not a cold load: in jsdom, act() never settles when the redirect's update
  // suspends on a lazy page that hasn't loaded yet (a cold /courses/:id hung
  // the runner), so Courses loads first and the redirect follows.
  const router = routerAt(['/courses']);
  render(<RouterProvider router={router} />);
  expect(await screen.findByText('Courses page')).toBeInTheDocument();

  await act(async () => { await router.navigate('/courses/COMP%20SCI%20400'); });
  expect(await screen.findByRole('dialog', { name: 'Programming III' })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/courses');
  expect(router.state.location.search).toBe('?course=COMP+SCI+400');
});

it('a cold load with ?course= keeps the rail and the dock visible to assistive tech', async () => {
  const router = routerAt(['/map?course=COMP+SCI+400']);
  const { container } = render(<RouterProvider router={router} />);
  expect(await screen.findByRole('dialog', { name: 'Programming III' })).toBeInTheDocument();
  expect(ariaHidden(container.querySelector('.cc-shell-rail'))).toBe(false);
  expect(ariaHidden(screen.getByTestId('dock'))).toBe(false);
});

it('?event= opens the event pop-up on Home, not only on Events; Escape closes it there', async () => {
  const router = routerAt([`/home?event=${encodeURIComponent(uvaEvent.id)}`]);
  const { container } = render(<RouterProvider router={router} />);
  const dialog = await screen.findByRole('dialog', { name: uvaEvent.title });
  expect(screen.getByText('Home page')).toBeInTheDocument();
  expect(dialog).toHaveAttribute('aria-modal', 'false');
  expect(ariaHidden(container.querySelector('.cc-shell-rail'))).toBe(false);

  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(router.state.location.pathname).toBe('/home');
  expect(router.state.location.search).toBe('');
});

it('?place= opens the place card on Home, with the rail and the dock live', async () => {
  const router = routerAt(['/home?place=old-cabell']);
  const { container } = render(<RouterProvider router={router} />);
  const dialog = await screen.findByRole('dialog', { name: 'Old Cabell Hall' });
  expect(within(dialog).getByRole('link', { name: /Directions/ })).toHaveAttribute('href', '/map?to=old-cabell');
  expect(ariaHidden(container.querySelector('.cc-shell-rail'))).toBe(false);
  expect(ariaHidden(screen.getByTestId('dock'))).toBe(false);
});

it('?place= on the map is left to the map’s own card', async () => {
  const router = routerAt(['/map?place=old-cabell']);
  render(<RouterProvider router={router} />);
  expect(await screen.findByText(/Map page/)).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('an event opened over a place card goes back to the card when it closes', async () => {
  const router = routerAt(['/home?place=old-cabell']);
  render(<RouterProvider router={router} />);
  await screen.findByRole('dialog', { name: 'Old Cabell Hall' });
  await act(async () => {
    await router.navigate(`/home?place=old-cabell&event=${encodeURIComponent(uvaEvent.id)}`, { state: { ccPopup: 'event' } });
  });
  const dialog = await screen.findByRole('dialog', { name: uvaEvent.title });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  expect(await screen.findByRole('dialog', { name: 'Old Cabell Hall' })).toBeInTheDocument();
  expect(router.state.location.search).toBe('?place=old-cabell');
});

it('a cold load with ?event= keeps the rail and the dock visible to assistive tech', async () => {
  const router = routerAt([`/events?event=${encodeURIComponent(uvaEvent.id)}`]);
  const { container } = render(<RouterProvider router={router} />);
  expect(await screen.findByRole('dialog', { name: uvaEvent.title })).toBeInTheDocument();
  expect(ariaHidden(container.querySelector('.cc-shell-rail'))).toBe(false);
  expect(ariaHidden(screen.getByTestId('dock'))).toBe(false);
});
