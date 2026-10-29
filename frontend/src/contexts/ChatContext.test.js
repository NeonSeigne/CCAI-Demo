import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { ChatProvider, attachmentLine, useChat } from './ChatContext';

jest.mock('./AuthContext', () => ({
  useAuth: () => ({ authToken: 'token' }),
}));

const { TextDecoder: UtilTextDecoder, TextEncoder } = require('util');

const api = (path) => `${process.env.REACT_APP_API_URL}${path}`;
const json = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const encodeLine = (line) => new TextEncoder().encode(`${JSON.stringify(line)}\n`);
const advisorLine = (content) => ({
  type: 'advisor',
  data: { persona_id: 'guide', persona_name: 'Guide', content, is_aggregated: true },
});
const streamOf = (...lines) => {
  const chunks = lines.map(encodeLine);
  return {
    ok: true,
    body: { getReader: () => ({ read: () => Promise.resolve(chunks.length ? { done: false, value: chunks.shift() } : { done: true }) }) },
  };
};

const routeFetch = (handlers = {}) => {
  global.fetch = jest.fn((url) => {
    const path = url.replace(process.env.REACT_APP_API_URL, '');
    if (handlers[path]) return handlers[path]();
    if (path === '/api/chat-sessions') return json({ id: 'session-1', title: 'Question...' });
    if (path === '/chat-stream') return Promise.resolve(streamOf(advisorLine('Answer.')));
    return new Promise(() => {});
  });
};
const callsTo = (path) => global.fetch.mock.calls.filter(([url]) => url === api(path));
const streamBody = (index = 0) => JSON.parse(callsTo('/chat-stream')[index][1].body);

const ECON = { type: 'course', id: 'ECON 3720', title: 'Intermediate Macroeconomics' };
const JAZZ = { type: 'event', id: 'ev-9', title: 'Jazz night', extra: { date: 'Oct 30' } };
const LIBRARY = { type: 'place', id: 'pl-2', title: 'Memorial Library' };

// A minimal view of the provider: buttons for each call, the messages as text.
function Probe({ label = 'Probe' }) {
  const chat = useChat();
  return (
    <section aria-label={label}>
      <button type="button" onClick={() => chat.send('What should I know?')}>Send</button>
      <button type="button" onClick={() => chat.attach(ECON)}>Attach course</button>
      <button type="button" onClick={() => chat.attach(JAZZ)}>Attach event</button>
      <button type="button" onClick={() => chat.attach(LIBRARY)}>Attach place</button>
      <button type="button" onClick={() => chat.removeAttachment(JAZZ)}>Remove event</button>
      <button type="button" onClick={() => chat.setActiveTerm('Fall 2027')}>Open Fall 2027</button>
      <output aria-label="Attachments">{chat.attachments.map((a) => `${a.type}:${a.id}`).join(',')}</output>
      <ul>
        {chat.messages.map((m) => <li key={m.id}>{m.content}</li>)}
      </ul>
    </section>
  );
}

const renderProvider = (ui = <Probe />) => render(<ChatProvider>{ui}</ChatProvider>);

beforeAll(() => {
  if (!global.TextDecoder) global.TextDecoder = UtilTextDecoder;
});

test('the reply lands after a route change mid-stream', async () => {
  let pushChunk;
  const pending = new Promise((resolve) => { pushChunk = resolve; });
  let sent = false;
  routeFetch({
    '/chat-stream': () => Promise.resolve({
      ok: true,
      body: {
        getReader: () => ({
          read: () => {
            if (sent) return Promise.resolve({ done: true });
            sent = true;
            return pending.then((line) => ({ done: false, value: encodeLine(line) }));
          },
        }),
      },
    }),
  });

  render(
    <MemoryRouter initialEntries={['/chat']}>
      <ChatProvider>
        <Routes>
          <Route path="/chat" element={<><Probe label="Chat" /><Link to="/map">Map</Link></>} />
          <Route path="/map" element={<><Probe label="Map" /><Link to="/chat">Chat</Link></>} />
        </Routes>
      </ChatProvider>
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(callsTo('/chat-stream')).toHaveLength(1));

  fireEvent.click(screen.getByRole('link', { name: 'Map' }));
  expect(screen.getByRole('region', { name: 'Map' })).toBeInTheDocument();
  expect(screen.getByText('What should I know?')).toBeInTheDocument();

  await act(async () => { pushChunk(advisorLine('Start with ECON 1010.')); });
  expect(await screen.findByText('Start with ECON 1010.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('link', { name: 'Chat' }));
  expect(screen.getByRole('region', { name: 'Chat' })).toBeInTheDocument();
  expect(screen.getByText('Start with ECON 1010.')).toBeInTheDocument();
});

test('attachment lines', () => {
  expect(attachmentLine(ECON)).toBe('Course: ECON 3720 Intermediate Macroeconomics');
  expect(attachmentLine(JAZZ)).toBe('Event: Jazz night · Oct 30');
  expect(attachmentLine(LIBRARY)).toBe('Place: Memorial Library');
});

test('attach adds one chip per item and never sends', () => {
  routeFetch();
  renderProvider();
  fireEvent.click(screen.getByRole('button', { name: 'Attach course' }));
  fireEvent.click(screen.getByRole('button', { name: 'Attach course' }));
  fireEvent.click(screen.getByRole('button', { name: 'Attach place' }));
  expect(screen.getByRole('status', { name: 'Attachments' })).toHaveTextContent('course:ECON 3720,place:pl-2');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('send puts each chip on its own line before the text, then clears the chips', async () => {
  routeFetch();
  renderProvider();
  fireEvent.click(screen.getByRole('button', { name: 'Attach course' }));
  fireEvent.click(screen.getByRole('button', { name: 'Attach event' }));
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  expect(await screen.findByText('Answer.')).toBeInTheDocument();
  expect(streamBody().user_input).toBe(
    'Course: ECON 3720 Intermediate Macroeconomics\nEvent: Jazz night · Oct 30\nWhat should I know?',
  );
  expect(screen.getByRole('status', { name: 'Attachments' })).toHaveTextContent('');
  // The session is titled after the question, not the chips.
  expect(JSON.parse(callsTo('/api/chat-sessions')[0][1].body).title).toBe('What should I know?...');
});

test('removing a chip drops its line', async () => {
  routeFetch();
  renderProvider();
  fireEvent.click(screen.getByRole('button', { name: 'Attach course' }));
  fireEvent.click(screen.getByRole('button', { name: 'Attach event' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove event' }));
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  expect(await screen.findByText('Answer.')).toBeInTheDocument();
  expect(streamBody().user_input).toBe('Course: ECON 3720 Intermediate Macroeconomics\nWhat should I know?');
});

test('active_term is sent only once a term is open', async () => {
  routeFetch();
  renderProvider();
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(await screen.findByText('Answer.')).toBeInTheDocument();
  expect(streamBody(0)).not.toHaveProperty('active_term');

  fireEvent.click(screen.getByRole('button', { name: 'Open Fall 2027' }));
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(callsTo('/chat-stream')).toHaveLength(2));
  expect(streamBody(1)).toMatchObject({ active_term: 'Fall 2027', chat_session_id: 'session-1' });
});
