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
  }),
}));

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
  <MemoryRouter initialEntries={['/map']}>
    <ChatProvider>
      <Link to="/chat">Chat</Link>
      <Link to="/map">Map</Link>
      <Link to="/chat" state={{ startNew: true, pendingPrompt: 'Plan my semester', autoSend: true }}>Ask from home</Link>
      <AttachCourse />
      <Routes>
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/map" element={<p>Map page</p>} />
        <Route path="/home" element={<p>Ask home</p>} />
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
    return new Promise(() => {});
  });
});

test('the conversation is still there after leaving the chat page and coming back', async () => {
  renderApp();
  fireEvent.click(screen.getByRole('link', { name: 'Chat' }));
  // No chat yet: /chat goes to the Ask home.
  expect(await screen.findByText('Ask home')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('link', { name: 'Ask from home' }));
  expect(await screen.findByText('Take ECON 1010 first.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('link', { name: 'Map' }));
  expect(screen.getByText('Map page')).toBeInTheDocument();
  expect(screen.queryByText('Take ECON 1010 first.')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('link', { name: 'Chat' }));
  expect(screen.getByText('Take ECON 1010 first.')).toBeInTheDocument();
  expect(screen.getByText('Plan my semester', { selector: '.user-message p' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveAttribute('placeholder', 'Ask a follow-up');
});
