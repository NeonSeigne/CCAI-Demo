import React from 'react';
import {
  act, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppRoutes } from './App';
import { routeFetch } from './pages/__fixtures__/routeFetch';
import { uwPopupCourse } from './pages/__fixtures__/popups';

// Routing only: pages are stubs, the shell and the course pop-up host are real.
jest.mock('./contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, authReady: true, authToken: 'token' }),
  AuthProvider: ({ children }) => children,
}));
jest.mock('./pages/ChatPage', () => () => <div>Chat page</div>);
jest.mock('./pages/CoursesPage', () => () => <div>Courses page</div>);
jest.mock('./pages/CampusMapPage', () => () => <div>Map page</div>);
jest.mock('./pages/HomePage', () => () => <div>Home page</div>);
jest.mock('./pages/OnboardingPage', () => () => null);
jest.mock('./components/UserGuide', () => () => null);
jest.mock('./components/ChatDock', () => () => null);
jest.mock('cytoscape', () => {
  const cytoscape = jest.fn(() => ({ on: jest.fn(), destroy: jest.fn() }));
  cytoscape.use = jest.fn();
  return { __esModule: true, default: cytoscape };
});
jest.mock('cytoscape-fcose', () => ({ __esModule: true, default: {} }));

const realFetch = global.fetch;
beforeEach(() => {
  global.fetch = routeFetch([
    ['/api/catalog/ratings/', { body: { ratings: [] } }],
    ['/api/catalog/', { body: uwPopupCourse() }],
  ]);
});
afterEach(() => { global.fetch = realFetch; });

const routerAt = (entries) => createMemoryRouter([{ path: '*', element: <AppRoutes /> }], { initialEntries: entries });

it('the old /courses/:id link opens the course pop-up on Courses', async () => {
  // Courses is loaded first: in jsdom, React's act() never settles when a
  // redirect's update suspends on a lazy page that hasn't loaded yet.
  const router = routerAt(['/courses']);
  render(<RouterProvider router={router} />);
  expect(await screen.findByText('Courses page')).toBeInTheDocument();

  await act(async () => { await router.navigate('/courses/COMP%20SCI%20400'); });
  expect(await screen.findByRole('dialog', { name: 'Programming III' })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/courses');
  expect(router.state.location.search).toBe('?course=COMP+SCI+400');
});

it('Back closes a pop-up opened over a page', async () => {
  const router = routerAt(['/map']);
  render(<RouterProvider router={router} />);
  expect(await screen.findByText('Map page')).toBeInTheDocument();

  await act(async () => { await router.navigate('/map?course=COMP+SCI+400', { state: { ccPopup: 'course' } }); });
  expect(await screen.findByRole('dialog', { name: 'Programming III' })).toBeInTheDocument();

  await act(async () => { await router.navigate(-1); });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(router.state.location.pathname).toBe('/map');
  expect(screen.getByText('Map page')).toBeInTheDocument();
});

it('Close and Escape leave the page where it was', async () => {
  const router = routerAt(['/home', '/map']);
  render(<RouterProvider router={router} />);
  await screen.findByText('Map page');
  await act(async () => { await router.navigate('/map?course=COMP+SCI+400', { state: { ccPopup: 'course' } }); });
  const dialog = await screen.findByRole('dialog', { name: 'Programming III' });

  const close = screen.getByRole('button', { name: 'Close' });
  fireEvent.click(close);
  fireEvent.click(close);
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(router.state.location.pathname).toBe('/map');
});
