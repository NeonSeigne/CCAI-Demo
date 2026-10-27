import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CampusRail from './CampusRail';
import { SavedContext } from '../contexts/SavedContext';

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ authToken: 'token', user: { firstName: 'Ada', lastName: 'Lovelace' } }),
}));
jest.mock('../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({ config: { app: { institution: 'UW–Madison' } } }),
}));

const SESSIONS = Array.from({ length: 8 }, (_, index) => ({ id: `s${index}`, title: `Chat ${index}` }));

const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

const renderRail = ({ path = '/home', saved = { count: 0 }, ...props } = {}) => render(
  <MemoryRouter initialEntries={[path]}>
    <SavedContext.Provider value={saved}>
      <CampusRail {...props} />
    </SavedContext.Provider>
  </MemoryRouter>,
);

const rail = () => screen.getByRole('navigation', { name: 'Main' });

afterEach(() => { jest.restoreAllMocks(); });

test('rail links to the five pages and marks the current one', async () => {
  jest.spyOn(global, 'fetch').mockImplementation(() => ok([]));
  renderRail({ path: '/events' });
  const nav = within(rail());
  const expected = [['Ask', '/home'], ['Courses', '/courses'], ['Events', '/events'], ['Campus map', '/map'], ['Saved', '/saved']];
  expected.forEach(([name, href]) => {
    expect(nav.getByRole('link', { name: new RegExp(`^${name}`) })).toHaveAttribute('href', href);
  });
  expect(nav.getByRole('link', { name: 'Events' })).toHaveAttribute('aria-current', 'page');
  expect(nav.getByRole('link', { name: 'Ask' })).not.toHaveAttribute('aria-current');
  await screen.findByText('Your chats will show up here.');
});

test('Ask is current on the chat page', async () => {
  jest.spyOn(global, 'fetch').mockImplementation(() => ok([]));
  renderRail({ path: '/chat' });
  expect(within(rail()).getByRole('link', { name: 'Ask' })).toHaveAttribute('aria-current', 'page');
  await screen.findByText('Your chats will show up here.');
});

test('Saved shows the saved count in the rail and the tab bar', async () => {
  jest.spyOn(global, 'fetch').mockImplementation(() => ok([]));
  renderRail({ saved: { count: 3 } });
  expect(within(rail()).getByRole('link', { name: /^Saved/ })).toHaveTextContent('3');
  const tabs = within(screen.getByRole('navigation', { name: 'Main tabs' }));
  expect(tabs.getByRole('link', { name: /Saved/ })).toHaveTextContent('3');
  expect(tabs.getAllByRole('link')).toHaveLength(5);
  await screen.findByText('Your chats will show up here.');
});

test('New chat, six recent chats and All chats', async () => {
  jest.spyOn(global, 'fetch').mockImplementation(() => ok(SESSIONS));
  const onNewChat = jest.fn();
  const onSelectSession = jest.fn();
  const onShowAllChats = jest.fn();
  renderRail({ currentSessionId: 's1', onNewChat, onSelectSession, onShowAllChats });

  const nav = within(rail());
  await nav.findByText('Chat 0');
  expect(nav.getAllByRole('button', { name: /^Chat \d/ })).toHaveLength(6);
  expect(nav.queryByText('Chat 6')).not.toBeInTheDocument();
  expect(nav.getByRole('button', { name: 'Chat 1' })).toHaveAttribute('aria-current', 'page');

  fireEvent.click(nav.getByRole('button', { name: /New chat/ }));
  expect(onNewChat).toHaveBeenCalled();
  fireEvent.click(nav.getByRole('button', { name: 'Chat 2' }));
  expect(onSelectSession).toHaveBeenCalledWith('s2');
  fireEvent.click(nav.getByRole('button', { name: 'All chats' }));
  expect(onShowAllChats).toHaveBeenCalled();
});

test('a failed chats request says so and retries', async () => {
  const fetchMock = jest.spyOn(global, 'fetch')
    .mockImplementationOnce(() => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }))
    .mockImplementation(() => ok(SESSIONS.slice(0, 2)));
  renderRail();

  const nav = within(rail());
  expect(await nav.findByText(/Couldn.t load chats/)).toBeInTheDocument();
  expect(nav.queryByText('Your chats will show up here.')).not.toBeInTheDocument();

  fireEvent.click(nav.getByRole('button', { name: 'Retry' }));
  expect(await nav.findByText('Chat 0')).toBeInTheDocument();
  await waitFor(() => expect(nav.queryByText(/Couldn.t load chats/)).not.toBeInTheDocument());
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('a network failure also shows the failure, not the empty line', async () => {
  jest.spyOn(global, 'fetch').mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
  renderRail();
  expect(await within(rail()).findByText(/Couldn.t load chats/)).toBeInTheDocument();
});
