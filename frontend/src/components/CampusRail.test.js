import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CampusRail from './CampusRail';
import { SavedContext } from '../contexts/SavedContext';
import { ThemeProvider } from '../contexts/ThemeContext';

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ authToken: 'token', user: { firstName: 'Ada', lastName: 'Lovelace' } }),
}));
let mockApp = { institution: 'UW–Madison' };
jest.mock('../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({ config: { app: mockApp, school: { slug: 'uw-madison' } } }),
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

test('Saved has no count in the rail or the tab bar (D5)', async () => {
  jest.spyOn(global, 'fetch').mockImplementation(() => ok([]));
  renderRail({ saved: { count: 3 } });
  expect(within(rail()).getByRole('link', { name: 'Saved' })).toHaveTextContent(/^bookmarkSaved$/);
  const tabs = within(screen.getByRole('navigation', { name: 'Main tabs' }));
  expect(tabs.getByRole('link', { name: /Saved/ })).not.toHaveTextContent('3');
  expect(tabs.getAllByRole('link')).toHaveLength(5);
  await screen.findByText('Your chats will show up here.');
});

test('six plain recent rows; no New chat or All chats (D5)', async () => {
  jest.spyOn(global, 'fetch').mockImplementation(() => ok(SESSIONS));
  const onSelectSession = jest.fn();
  renderRail({ currentSessionId: 's1', onSelectSession });

  const nav = within(rail());
  await nav.findByText('Chat 0');
  const rows = nav.getAllByRole('button', { name: /^Chat \d/ });
  expect(rows).toHaveLength(6);
  rows.forEach((row) => expect(row.querySelector('.ms')).toBeNull());
  expect(nav.queryByText('Chat 6')).not.toBeInTheDocument();
  expect(nav.getByRole('button', { name: 'Chat 1' })).toHaveAttribute('aria-current', 'page');
  expect(nav.queryByRole('button', { name: /New chat/ })).not.toBeInTheDocument();
  expect(nav.queryByRole('button', { name: 'All chats' })).not.toBeInTheDocument();

  fireEvent.click(nav.getByRole('button', { name: 'Chat 2' }));
  expect(onSelectSession).toHaveBeenCalledWith('s2');
});

test('the rail user row and the phone header avatar open the account menu', async () => {
  jest.spyOn(global, 'fetch').mockImplementation(() => ok([]));
  const onOpenAccount = jest.fn();
  renderRail({ onOpenAccount });
  const user = within(rail()).getByRole('button', { name: 'Account' });
  expect(user).toHaveAttribute('aria-haspopup', 'menu');
  expect(user).toHaveTextContent('AL');
  expect(user).toHaveTextContent('Ada');
  fireEvent.click(user);
  expect(onOpenAccount).toHaveBeenCalledTimes(1);
  expect(within(rail()).queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();

  const header = screen.getByRole('banner');
  expect(within(header).getByText('Campus Companion')).toBeInTheDocument();
  expect(within(header).queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
  fireEvent.click(within(header).getByRole('button', { name: 'Account' }));
  expect(onOpenAccount).toHaveBeenCalledTimes(2);
  await screen.findByText('Your chats will show up here.');
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

test('the phone tab bar puts Ask in the centre', async () => {
  jest.spyOn(global, 'fetch').mockImplementation(() => ok([]));
  renderRail({ path: '/map' });
  const tabs = within(screen.getByRole('navigation', { name: 'Main tabs' })).getAllByRole('link');
  expect(tabs.map((tab) => tab.querySelector('.campus-tab-label').textContent)).toEqual(['Courses', 'Events', 'Ask', 'Map', 'Saved']);
  expect(tabs[3]).toHaveAttribute('aria-current', 'page');
  await screen.findByText('Your chats will show up here.');
});

test('the rail shows the school mark and name, and the theme toggle above the profile row', async () => {
  jest.spyOn(global, 'fetch').mockImplementation(() => ok([]));
  window.localStorage.removeItem('cc.theme.v1');
  render(
    <MemoryRouter initialEntries={['/home']}>
      <ThemeProvider>
        <SavedContext.Provider value={{ count: 0 }}>
          <CampusRail />
        </SavedContext.Provider>
      </ThemeProvider>
    </MemoryRouter>,
  );
  const nav = within(rail());
  expect(nav.getByText('UW')).toBeInTheDocument();
  expect(nav.getByText('UW–Madison')).toBeInTheDocument();

  const toggle = nav.getByRole('group', { name: 'Theme' });
  const account = nav.getByRole('button', { name: 'Account' });
  // eslint-disable-next-line no-bitwise
  expect(toggle.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(toggle.contains(account)).toBe(false);

  const stop = (name) => within(toggle).getByRole('button', { name });
  expect(stop('Auto')).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(stop('Dark'));
  expect(stop('Dark')).toHaveAttribute('aria-pressed', 'true');
  expect(stop('Auto')).toHaveAttribute('aria-pressed', 'false');
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  expect(window.localStorage.getItem('cc.theme.v1')).toBe('dark');

  // The phone header carries the same toggle.
  expect(screen.getAllByRole('group', { name: 'Theme' })).toHaveLength(2);
  await screen.findByText('Your chats will show up here.');
});

test('the rail names the school by its short name, else the institution', async () => {
  jest.spyOn(global, 'fetch').mockImplementation(() => ok([]));
  mockApp = { institution: 'University of Wisconsin–Madison', short_name: 'UW–Madison' };
  const { unmount } = renderRail();
  expect(within(rail()).getByText('UW–Madison')).toBeInTheDocument();
  await screen.findByText('Your chats will show up here.');
  unmount();

  mockApp = { institution: 'University of Wisconsin–Madison' };
  renderRail();
  expect(within(rail()).getByText('University of Wisconsin–Madison')).toBeInTheDocument();
  await screen.findByText('Your chats will show up here.');
  mockApp = { institution: 'UW–Madison' };
});
