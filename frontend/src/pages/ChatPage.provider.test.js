import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import ChatPage from './ChatPage';
import { ChatProvider, useChat } from '../contexts/ChatContext';

// ChatPage as the app mounts it: a view of the app-level ChatProvider.

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
jest.mock('../components/CampusRail', () => () => <nav />);
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
jest.mock('../components/EnhancedChatInput', () => (props) => (
  <div>
    <ul aria-label="Composer chips">
      {props.attachments.map((item) => <li key={item.id}>{item.title}</li>)}
    </ul>
    <button type="button" onClick={() => props.onSendMessage('Plan my semester')}>
      Send test message
    </button>
  </div>
));

const { TextDecoder: UtilTextDecoder, TextEncoder } = require('util');

const json = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const streamOf = (...lines) => {
  const chunks = lines.map((line) => new TextEncoder().encode(`${JSON.stringify(line)}\n`));
  return {
    ok: true,
    body: { getReader: () => ({ read: () => Promise.resolve(chunks.length ? { done: false, value: chunks.shift() } : { done: true }) }) },
  };
};

function AttachCourse() {
  const { attach } = useChat();
  return (
    <button type="button" onClick={() => attach({ type: 'course', id: 'ECON 3720', title: 'Intermediate Macroeconomics' })}>
      Attach course
    </button>
  );
}

const renderApp = () => render(
  <MemoryRouter initialEntries={['/chat']}>
    <ChatProvider>
      <Link to="/chat">Chat</Link>
      <Link to="/map">Map</Link>
      <AttachCourse />
      <Routes>
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/map" element={<p>Map page</p>} />
      </Routes>
    </ChatProvider>
  </MemoryRouter>,
);

beforeAll(() => {
  if (!global.TextDecoder) global.TextDecoder = UtilTextDecoder;
});

beforeEach(() => {
  Element.prototype.scrollIntoView = jest.fn();
  global.fetch = jest.fn((url) => {
    const path = url.replace(process.env.REACT_APP_API_URL, '');
    if (path === '/api/chat-sessions') return json({ id: 'session-1', title: 'Plan my semester...' });
    if (path === '/chat-stream') {
      return Promise.resolve(streamOf({
        type: 'advisor',
        data: { persona_id: 'guide', persona_name: 'Guide', content: 'Take ECON 1010 first.', is_aggregated: true },
      }));
    }
    if (path === '/reply-to-advisor') return json({ type: 'advisor_reply', persona_id: 'guide', persona: 'Guide', response: 'Yes.' });
    return new Promise(() => {});
  });
});

test('the conversation is still there after leaving the chat page and coming back', async () => {
  const { container } = renderApp();
  fireEvent.click(screen.getByRole('button', { name: 'Send test message' }));
  expect(await screen.findByText('Take ECON 1010 first.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('link', { name: 'Map' }));
  expect(screen.getByText('Map page')).toBeInTheDocument();
  expect(screen.queryByText('Take ECON 1010 first.')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('link', { name: 'Chat' }));
  expect(screen.getByText('Take ECON 1010 first.')).toBeInTheDocument();
  expect(screen.getByText('Plan my semester', { selector: '.user-message p' })).toBeInTheDocument();
  expect(container.querySelector('.welcome-state')).not.toBeInTheDocument();
  expect(container.querySelector('.floating-input-area')).toHaveClass('phase-active');
});

test('chips are hidden while replying to an advisor and not sent with the reply', async () => {
  const { container } = renderApp();
  fireEvent.click(screen.getByRole('button', { name: 'Send test message' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Reply to Guide' }));

  fireEvent.click(screen.getByRole('button', { name: 'Attach course' }));
  const chips = screen.getByRole('list', { name: 'Composer chips' });
  expect(chips).toBeEmptyDOMElement();

  fireEvent.click(screen.getByRole('button', { name: 'Send test message' }));
  expect(await screen.findByText('Yes.')).toBeInTheDocument();
  const [, request] = global.fetch.mock.calls.find(([url]) => url.endsWith('/reply-to-advisor'));
  expect(JSON.parse(request.body).user_input).toBe('Plan my semester');
  // Out of reply mode, the chip shows again for the next send.
  fireEvent.click(container.querySelector('.cancel-reply'));
  expect(chips).toHaveTextContent('Intermediate Macroeconomics');
});
