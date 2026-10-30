import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatPage from './ChatPage';
import { ChatProvider, useChat } from '../contexts/ChatContext';
import { PlannerProvider } from '../contexts/PlannerContext';
import * as plannerApi from '../api/planner';
import { view } from '../components/planner/plannerFixtures';

jest.mock('../api/planner', () => ({
  ...jest.requireActual('../api/planner'),
  getPlan: jest.fn(),
  listPrograms: jest.fn(),
}));

const mockNavigate = jest.fn();
let mockLocation = { pathname: '/chat', search: '', state: null };
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { firstName: 'Ada' },
    authToken: 'token',
    handleSignOut: jest.fn(),
    handleUserUpdate: jest.fn(),
  }),
}));

jest.mock('../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({
    config: {
      app: { title: 'Advisory' },
      chat_page: { placeholder: 'Ask anything', examples: [] },
    },
  }),
}));

const send = (text = 'Plan my semester') => {
  fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
};

// The shell's rail calls these on the chat page.
function RailControls() {
  const chat = useChat();
  return (
    <nav>
      <button type="button" onClick={() => chat.newChat()}>New chat</button>
      <button type="button" onClick={() => chat.openSession('saved-1')}>Open saved chat</button>
    </nav>
  );
}

const renderWithRail = () => render(
  <ChatProvider>
    <RailControls />
    <ChatPage />
  </ChatProvider>,
);

beforeEach(() => {
  mockNavigate.mockReset();
  mockLocation = { pathname: '/chat', search: '', state: null };
  jest.useFakeTimers();
  Element.prototype.scrollIntoView = jest.fn();
  global.fetch = jest.fn(() => new Promise(() => {}));
});

afterEach(() => {
  jest.useRealTimers();
});

test('there is no chat landing: an empty chat page goes to the Ask home', () => {
  const { container } = render(<ChatPage />);
  expect(mockNavigate).toHaveBeenCalledWith('/home', { replace: true });
  expect(container.querySelector('.welcome-state')).not.toBeInTheDocument();
});

test('the composer has no suggestion chips and says "Ask a follow-up" mid-thread', () => {
  render(<ChatPage />);
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveAttribute('placeholder', 'Ask anything');
  send();
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveAttribute('placeholder', 'Ask a follow-up');
  expect(screen.queryByLabelText('Suggested questions')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Plan my semester');
});

// C1: the plan lives in Courses now; chat has no Plan toggle, panel or sheet.
describe('no plan in chat', () => {
  beforeEach(() => {
    plannerApi.getPlan.mockResolvedValue(view());
    plannerApi.listPrograms.mockResolvedValue([]);
  });

  test.each([1440, 1000, 390])('at %ipx there is no Plan toggle, panel or peek', (innerWidth) => {
    const width = window.innerWidth;
    window.innerWidth = innerWidth;
    render(
      <PlannerProvider>
        <ChatPage />
      </PlannerProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Plan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Your plan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Open plan/ })).not.toBeInTheDocument();
    expect(document.querySelector('.plan-slot, .plan-drawer, .plan-sheet')).not.toBeInTheDocument();
    window.innerWidth = width;
  });
});

describe('chat flow (characterization)', () => {
  const { TextDecoder: UtilTextDecoder, TextEncoder } = require('util');
  const api = (path) => `${process.env.REACT_APP_API_URL}${path}`;
  const json = (body, ok = true) => Promise.resolve({
    ok, status: ok ? 200 : 500, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)),
  });
  const streamOf = (...lines) => {
    const chunks = lines.map((line) => new TextEncoder().encode(`${JSON.stringify(line)}\n`));
    return {
      ok: true,
      body: { getReader: () => ({ read: () => Promise.resolve(chunks.length ? { done: false, value: chunks.shift() } : { done: true }) }) },
    };
  };
  const advisorLine = (content) => ({
    type: 'advisor',
    data: { persona_id: 'guide', persona_name: 'Guide', content, is_aggregated: true },
  });

  // Routes each fetch by URL; `handlers` overrides the defaults per test.
  const routeFetch = (handlers = {}) => {
    global.fetch = jest.fn((url, init) => {
      const path = url.replace(process.env.REACT_APP_API_URL, '');
      const method = init?.method || 'GET';
      if (handlers[`${method} ${path}`]) return handlers[`${method} ${path}`]();
      if (handlers[path]) return handlers[path]();
      if (path === '/api/chat-sessions') return json({ id: 'session-1', title: 'Plan my semester...' });
      if (path === '/chat-stream') return Promise.resolve(streamOf(advisorLine('Take ECON 1010 first.')));
      return new Promise(() => {});
    });
  };
  // Session calls go through api/campus, which drops an unset API URL.
  const callsTo = (path) => global.fetch.mock.calls.filter(([url]) => url === api(path) || url === path);

  beforeAll(() => {
    if (!global.TextDecoder) global.TextDecoder = UtilTextDecoder;
  });

  const sendTestMessage = () => send();

  test('sending a message renders the streamed reply', async () => {
    routeFetch();
    render(<ChatPage />);
    sendTestMessage();
    expect(await screen.findByText('Take ECON 1010 first.')).toBeInTheDocument();
    expect(screen.getByText('Plan my semester', { selector: '.user-message p' })).toBeInTheDocument();
    const [[, request]] = callsTo('/chat-stream');
    expect(JSON.parse(request.body)).toMatchObject({ user_input: 'Plan my semester', chat_session_id: 'session-1' });
  });

  test('a stream error shows the error message', async () => {
    routeFetch({
      '/chat-stream': () => Promise.resolve({
        ok: true,
        body: { getReader: () => ({ read: () => Promise.reject(new Error('connection reset')) }) },
      }),
    });
    const { container } = render(<ChatPage />);
    sendTestMessage();
    expect(await screen.findByText('Failed to send message: connection reset')).toBeInTheDocument();
    expect(container.querySelector('.error-message')).toBeInTheDocument();
  });

  test('New chat clears the messages and calls /new-chat', async () => {
    routeFetch({ '/new-chat': () => json({ status: 'success' }) });
    renderWithRail();
    sendTestMessage();
    expect(await screen.findByText('Take ECON 1010 first.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    await waitFor(() => expect(screen.queryByText('Take ECON 1010 first.')).not.toBeInTheDocument());
    expect(screen.queryByText('Plan my semester', { selector: '.user-message p' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^$/);
    expect(callsTo('/new-chat')).toHaveLength(1);
  });

  test('opening a saved session loads its messages', async () => {
    routeFetch({
      '/switch-chat': () => json({
        status: 'success',
        context: { messages: [{ id: 'm1', type: 'user', content: 'Where is the library?', timestamp: '2026-10-01T12:00:00' }] },
      }),
      '/api/chat-sessions/saved-1': () => json({ id: 'saved-1', title: 'Library' }),
    });
    renderWithRail();
    fireEvent.click(screen.getByRole('button', { name: 'Open saved chat' }));
    expect(await screen.findByText('Where is the library?', { selector: '.user-message p' })).toBeInTheDocument();
    await waitFor(() => expect(callsTo('/api/chat-sessions/saved-1')).toHaveLength(1));
    expect(JSON.parse(callsTo('/switch-chat')[0][1].body)).toEqual({ chat_session_id: 'saved-1' });
  });

  describe('the header and its ⋯ menu', () => {
    const openSaved = async (handlers = {}) => {
      routeFetch({
        '/switch-chat': () => json({
          status: 'success',
          context: {
            messages: [
              { id: 'm1', type: 'user', content: 'Where is the library?' },
              { id: 'm2', type: 'advisor', is_aggregated: true, content: 'Norlin Library.' },
            ],
          },
        }),
        '/api/chat-sessions/saved-1': () => json({ id: 'saved-1', title: 'Library' }),
        ...handlers,
      });
      renderWithRail();
      fireEvent.click(screen.getByRole('button', { name: 'Open saved chat' }));
      await screen.findByText('Norlin Library.');
      await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Library'));
    };
    const menuItems = () => [...screen.getByRole('menu', { name: 'Chat' }).querySelectorAll('.cc-menu-label')]
      .map((label) => label.textContent);

    test('Share and ⋯ with Rename, Pin, Share, Export, Search chats and Delete', async () => {
      await openSaved();
      expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: 'More' }));
      expect(menuItems()).toEqual(['Rename', 'Pin', 'Share', 'Export', 'Search chats', 'Delete']);
      fireEvent.click(screen.getByRole('menuitem', { name: 'Search chats' }));
      expect(mockNavigate).toHaveBeenCalledWith('/search');
    });

    test('Rename saves the new title', async () => {
      await openSaved({ 'PUT /api/chat-sessions/saved-1': () => json({ id: 'saved-1', title: 'Study spots' }) });
      fireEvent.click(screen.getByRole('button', { name: 'More' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Study spots' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Study spots'));
      const put = callsTo('/api/chat-sessions/saved-1').find(([, init]) => init?.method === 'PUT');
      expect(JSON.parse(put[1].body)).toEqual({ title: 'Study spots' });
    });

    test('Delete asks, deletes the chat and goes to the Ask home', async () => {
      await openSaved({ 'DELETE /api/chat-sessions/saved-1': () => json({ message: 'deleted' }) });
      fireEvent.click(screen.getByRole('button', { name: 'More' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/home'));
      expect(callsTo('/api/chat-sessions/saved-1').some(([, init]) => init?.method === 'DELETE')).toBe(true);
    });
  });
});

describe('navigation intent', () => {
  test('a pop-up history marker is not an intent: the query and state stay', async () => {
    mockLocation = { pathname: '/chat', search: '?course=COMP+SCI+400', state: { ccPopup: 'course' } };
    render(<ChatPage />);
    await act(async () => { await Promise.resolve(); });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('clearing a handled intent keeps ?course=', async () => {
    mockLocation = { pathname: '/chat', search: '?course=COMP+SCI+400', state: { pendingPrompt: 'Is ECON 2010 hard?' } };
    render(<ChatPage />);
    await act(async () => { await Promise.resolve(); });
    expect(mockNavigate).toHaveBeenCalledWith(
      { pathname: '/chat', search: '?course=COMP+SCI+400' },
      { replace: true, state: null },
    );
  });
});
