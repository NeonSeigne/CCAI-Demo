import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  ChatProvider, TITLE_MAX, attachmentLine, titleFor, useChat,
} from './ChatContext';
import { PlannerContext } from './PlannerContext';

let mockAuthToken = 'token';
jest.mock('./AuthContext', () => ({
  useAuth: () => ({ authToken: mockAuthToken }),
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
  global.fetch = jest.fn((url, options) => {
    const path = url.replace(process.env.REACT_APP_API_URL, '');
    if (handlers[path]) return handlers[path](options);
    if (path === '/api/chat-sessions') return json({ id: 'session-1', title: 'Question...' });
    if (path === '/chat-stream') return Promise.resolve(streamOf(advisorLine('Answer.')));
    return new Promise(() => {});
  });
};
// A /chat-stream response the test feeds line by line; aborting the request
// rejects the pending read the way fetch does.
const controllableStream = () => {
  const queue = [];
  let waiting = null;
  let signal = null;
  const next = () => new Promise((resolve, reject) => {
    if (queue.length) { resolve(queue.shift()); return; }
    waiting = { resolve, reject };
    signal?.addEventListener('abort', () => {
      const error = new Error('The user aborted a request.');
      error.name = 'AbortError';
      reject(error);
    });
  });
  const feed = (item) => {
    if (waiting) { const { resolve } = waiting; waiting = null; resolve(item); } else queue.push(item);
  };
  return {
    respond: (options) => {
      signal = options.signal;
      return Promise.resolve({ ok: true, body: { getReader: () => ({ read: next }) } });
    },
    push: (line) => feed({ done: false, value: encodeLine(line) }),
    end: () => feed({ done: true }),
    get signal() { return signal; },
  };
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
      <button type="button" onClick={() => chat.newChat().catch(() => {})}>New chat</button>
      <button type="button" onClick={() => chat.openSession('saved-1')}>Open saved</button>
      <output aria-label="Loading">{chat.isLoading ? 'loading' : 'idle'}</output>
      <output aria-label="Term">{chat.activeTerm || ''}</output>
      <output aria-label="Session">{chat.sessionId || ''}</output>
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

beforeEach(() => {
  mockAuthToken = 'token';
});

const status = (name) => screen.getByRole('status', { name });

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
  // Chips clear once the stream opens; the session is titled after the question.
  expect(JSON.parse(callsTo('/api/chat-sessions')[0][1].body).title).toBe('What should I know?');
});

test('a chat is titled with the whole question, up to the server limit', () => {
  const long = 'Which of the economics electives offered next spring fit around my lab schedule?';
  expect(titleFor(`  ${long}  `)).toBe(long);
  expect(titleFor('Where   is\nClark Hall?')).toBe('Where is Clark Hall?');
  expect(titleFor('x'.repeat(250))).toHaveLength(TITLE_MAX);
});

test('a streamed answer keeps the stored message id for feedback', async () => {
  routeFetch({
    '/chat-stream': () => Promise.resolve(streamOf({
      type: 'advisor',
      data: {
        persona_id: 'guide', content: 'Answer.', is_aggregated: true, message_id: 'msg-7',
      },
    })),
  });
  function Ids() {
    const { messages, send } = useChat();
    return (
      <>
        <button type="button" onClick={() => send('Hi')}>Send</button>
        <output aria-label="Ids">{messages.filter((m) => m.type === 'advisor').map((m) => m.message_id).join(',')}</output>
      </>
    );
  }
  renderProvider(<Ids />);
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(screen.getByRole('status', { name: 'Ids' })).toHaveTextContent('msg-7'));
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

test('a reply still streaming after New chat never lands in the new conversation', async () => {
  const first = controllableStream();
  const second = controllableStream();
  const streams = [first, second];
  let sessions = 0;
  routeFetch({
    '/chat-stream': (options) => streams.shift().respond(options),
    '/new-chat': () => json({ status: 'success' }),
    '/api/chat-sessions': () => { sessions += 1; return json({ id: `session-${sessions}`, title: 'Chat' }); },
    // The first send in a new chat retitles it.
    '/api/chat-sessions/session-2': () => json({}),
  });
  renderProvider();

  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(callsTo('/chat-stream')).toHaveLength(1));
  expect(status('Loading')).toHaveTextContent('loading');

  fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
  await waitFor(() => expect(status('Session')).toHaveTextContent('session-2'));
  expect(first.signal.aborted).toBe(true);
  expect(screen.queryByText('What should I know?')).not.toBeInTheDocument();
  expect(status('Loading')).toHaveTextContent('idle');

  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(callsTo('/chat-stream')).toHaveLength(2));
  await act(async () => { first.push(advisorLine('Old answer.')); first.end(); });
  expect(screen.queryByText('Old answer.')).not.toBeInTheDocument();
  expect(status('Loading')).toHaveTextContent('loading');

  await act(async () => { second.push(advisorLine('New answer.')); second.end(); });
  expect(await screen.findByText('New answer.')).toBeInTheDocument();
  expect(status('Loading')).toHaveTextContent('idle');
  expect(screen.queryByText('Old answer.')).not.toBeInTheDocument();
  expect(screen.queryByText(/Failed to send message/)).not.toBeInTheDocument();
});

test('signing out clears the conversation, chips and open term', async () => {
  routeFetch();
  const { rerender } = renderProvider();
  fireEvent.click(screen.getByRole('button', { name: 'Open Fall 2027' }));
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(await screen.findByText('Answer.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Attach course' }));

  mockAuthToken = null;
  rerender(<ChatProvider><Probe /></ChatProvider>);
  expect(screen.queryByText('Answer.')).not.toBeInTheDocument();
  expect(screen.queryByText('What should I know?')).not.toBeInTheDocument();
  expect(status('Attachments')).toHaveTextContent('');
  expect(status('Term')).toHaveTextContent('');
  expect(status('Session')).toHaveTextContent('');
});

test('signing out mid-stream drops the reply', async () => {
  const stream = controllableStream();
  routeFetch({ '/chat-stream': (options) => stream.respond(options) });
  const { rerender } = renderProvider();
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(callsTo('/chat-stream')).toHaveLength(1));

  mockAuthToken = null;
  rerender(<ChatProvider><Probe /></ChatProvider>);
  expect(stream.signal.aborted).toBe(true);
  await act(async () => { stream.push(advisorLine('Late answer.')); stream.end(); });
  expect(screen.queryByText('Late answer.')).not.toBeInTheDocument();
  expect(screen.queryByText('What should I know?')).not.toBeInTheDocument();
  expect(status('Loading')).toHaveTextContent('idle');
});

describe('proposals', () => {
  const proposal = { id: 'prop-1', status: 'pending', ops: [] };
  const proposalLine = (content) => ({
    type: 'advisor',
    data: {
      persona_id: 'guide',
      content,
      is_aggregated: true,
      visuals: [{ type: 'proposed_change', proposal }],
    },
  });

  test('one streamed while on another route reaches the planner once', async () => {
    const stream = controllableStream();
    routeFetch({ '/chat-stream': (options) => stream.respond(options) });
    const receiveProposal = jest.fn();
    render(
      <MemoryRouter initialEntries={['/chat']}>
        <PlannerContext.Provider value={{ receiveProposal }}>
          <ChatProvider>
            <Routes>
              <Route path="/chat" element={<><Probe label="Chat" /><Link to="/map">Map</Link></>} />
              <Route path="/map" element={<p>Map page</p>} />
            </Routes>
          </ChatProvider>
        </PlannerContext.Provider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(callsTo('/chat-stream')).toHaveLength(1));
    fireEvent.click(screen.getByRole('link', { name: 'Map' }));
    expect(screen.getByText('Map page')).toBeInTheDocument();

    await act(async () => {
      stream.push(proposalLine('Here is a change.'));
      stream.push(proposalLine('The same change again.'));
      stream.end();
    });
    expect(receiveProposal).toHaveBeenCalledTimes(1);
    expect(receiveProposal).toHaveBeenCalledWith(proposal);
  });

  test('one in a reopened saved session is not handed off', async () => {
    routeFetch({
      '/switch-chat': () => json({
        status: 'success',
        context: { messages: [{ id: 'm1', type: 'advisor', content: 'Old change.', visuals: [{ type: 'proposed_change', proposal }] }] },
      }),
      '/api/chat-sessions/saved-1': () => json({ id: 'saved-1', title: 'Saved' }),
    });
    const receiveProposal = jest.fn();
    render(
      <PlannerContext.Provider value={{ receiveProposal }}>
        <ChatProvider><Probe /></ChatProvider>
      </PlannerContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open saved' }));
    expect(await screen.findByText('Old change.')).toBeInTheDocument();
    expect(receiveProposal).not.toHaveBeenCalled();
  });
});

test('a failed stream keeps the chips', async () => {
  routeFetch({ '/chat-stream': () => Promise.resolve({ ok: false, status: 502 }) });
  renderProvider();
  fireEvent.click(screen.getByRole('button', { name: 'Attach course' }));
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(await screen.findByText('Failed to send message: HTTP error! status: 502')).toBeInTheDocument();
  expect(status('Attachments')).toHaveTextContent('course:ECON 3720');
  expect(status('Loading')).toHaveTextContent('idle');
});

test('a session that cannot be created shows the send error and keeps the chips', async () => {
  routeFetch({ '/api/chat-sessions': () => Promise.resolve({ ok: false, status: 500 }) });
  renderProvider();
  fireEvent.click(screen.getByRole('button', { name: 'Attach place' }));
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(await screen.findByText('Failed to send message: Could not start a chat session')).toBeInTheDocument();
  expect(status('Attachments')).toHaveTextContent('place:pl-2');
  expect(callsTo('/chat-stream')).toHaveLength(0);
  expect(status('Loading')).toHaveTextContent('idle');
});

test('a term opened while a send is creating its session is still sent', async () => {
  let createSession;
  routeFetch({
    '/api/chat-sessions': () => new Promise((resolve) => {
      createSession = () => resolve({ ok: true, json: () => Promise.resolve({ id: 'session-1', title: 'Q' }) });
    }),
  });
  renderProvider();
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(callsTo('/api/chat-sessions')).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: 'Open Fall 2027' }));
  await act(async () => { createSession(); });

  expect(await screen.findByText('Answer.')).toBeInTheDocument();
  expect(streamBody()).toMatchObject({ active_term: 'Fall 2027' });
});
