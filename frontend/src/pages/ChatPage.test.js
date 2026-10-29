import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatPage from './ChatPage';
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
    advisors: {},
  }),
}));
jest.mock('../components/CampusRail', () => (props) => (
  <nav>
    <button type="button" onClick={props.onNewChat}>New chat</button>
    <button type="button" onClick={() => props.onSelectSession('saved-1')}>Open saved chat</button>
  </nav>
));
jest.mock('../components/AnswerPanel', () => ({ __esModule: true, default: () => <aside />, buildSuggestions: () => [], latestVisuals: () => [] }));
jest.mock('../components/OnboardingTour', () => ({ children }) => <>{children}</>);
jest.mock('../components/ExportButton', () => () => null);
jest.mock('../components/SettingsModal', () => () => null);
jest.mock('../components/AdvisorCarousel', () => (props) => (
  <div>
    {props.messages.map((message) => (
      <div key={message.id}>
        <p>{message.content}</p>
        <button type="button" onClick={() => props.onReply(message)}>Reply to {message.advisorName}</button>
      </div>
    ))}
  </div>
));
jest.mock('../components/MessageBubble', () => () => null);
jest.mock('../components/ThinkingIndicator', () => () => null);
jest.mock('../components/SuggestionsPanel', () => () => <div>Starter prompts</div>);
jest.mock('../components/EnhancedChatInput', () => (props) => (
  <button type="button" onClick={() => props.onSendMessage('Plan my semester')}>
    Send test message
  </button>
));

beforeEach(() => {
  mockLocation = { pathname: '/chat', search: '', state: null };
  jest.useFakeTimers();
  Element.prototype.scrollIntoView = jest.fn();
  global.fetch = jest.fn(() => new Promise(() => {}));
});

afterEach(() => {
  jest.useRealTimers();
});

test('moves the landing composer into the active chat on first submit', () => {
  const { container } = render(<ChatPage />);
  expect(container.querySelector('.phase-landing')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Send test message' }));
  expect(container.querySelector('.phase-transitioning')).toBeInTheDocument();
  expect(container.querySelector('.welcome-state.is-leaving')).toBeInTheDocument();
  expect(container.querySelector('.messages-container')).toBeInTheDocument();

  act(() => {
    jest.advanceTimersByTime(280);
  });
  expect(container.querySelector('.phase-active')).toBeInTheDocument();
  expect(container.querySelector('.welcome-state')).not.toBeInTheDocument();
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
  const json = (body, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) });
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
    global.fetch = jest.fn((url) => {
      const path = url.replace(process.env.REACT_APP_API_URL, '');
      if (handlers[path]) return handlers[path]();
      if (path === '/api/chat-sessions') return json({ id: 'session-1', title: 'Plan my semester...' });
      if (path === '/chat-stream') return Promise.resolve(streamOf(advisorLine('Take ECON 1010 first.')));
      return new Promise(() => {});
    });
  };
  const callsTo = (path) => global.fetch.mock.calls.filter(([url]) => url === api(path));

  beforeAll(() => {
    if (!global.TextDecoder) global.TextDecoder = UtilTextDecoder;
  });

  const sendTestMessage = () => fireEvent.click(screen.getByRole('button', { name: 'Send test message' }));

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
    render(<ChatPage />);
    sendTestMessage();
    expect(await screen.findByText('Take ECON 1010 first.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    await waitFor(() => expect(screen.queryByText('Take ECON 1010 first.')).not.toBeInTheDocument());
    expect(screen.queryByText('Plan my semester', { selector: '.user-message p' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'New chat' })).toBeInTheDocument();
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
    render(<ChatPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Open saved chat' }));
    expect(await screen.findByText('Where is the library?', { selector: '.user-message p' })).toBeInTheDocument();
    await waitFor(() => expect(callsTo('/api/chat-sessions/saved-1')).toHaveLength(1));
    expect(JSON.parse(callsTo('/switch-chat')[0][1].body)).toEqual({ chat_session_id: 'saved-1' });
  });

  test('a reply to an advisor posts to /reply-to-advisor', async () => {
    routeFetch({
      '/reply-to-advisor': () => json({ type: 'advisor_reply', persona_id: 'guide', persona: 'Guide', response: 'Yes, in the fall.' }),
    });
    render(<ChatPage />);
    sendTestMessage();
    fireEvent.click(await screen.findByRole('button', { name: 'Reply to Guide' }));
    expect(screen.getByText('Replying to')).toBeInTheDocument();

    sendTestMessage();
    expect(await screen.findByText('Yes, in the fall.')).toBeInTheDocument();
    const [[, request]] = callsTo('/reply-to-advisor');
    expect(JSON.parse(request.body)).toMatchObject({
      user_input: 'Plan my semester',
      advisor_id: 'guide',
      chat_session_id: 'session-1',
    });
    expect(callsTo('/chat-stream')).toHaveLength(1);
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
