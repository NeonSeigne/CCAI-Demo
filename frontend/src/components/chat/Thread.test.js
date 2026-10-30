import React from 'react';
import {
  fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Thread from './Thread';
import { ChatProvider, useChat } from '../../contexts/ChatContext';

jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token' }) }));

const api = (path) => `${process.env.REACT_APP_API_URL}${path}`;
const json = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

// A saved conversation with every message kind the thread shows.
const SAVED = [
  { id: 'm1', type: 'user', content: 'Is ECON 3010 hard?' },
  {
    id: 'm2',
    type: 'advisor',
    is_aggregated: true,
    response_group_id: 'g1',
    content: 'Most students find [ECON 3010](course:ECON 3010) typical.',
    visuals: [{ type: 'sources_checked', domains: [{ id: 'academics', label: 'Courses' }] }],
  },
  {
    id: 'm3', type: 'advisor', is_aggregated: false, response_group_id: 'g1', content: 'One advisor of the panel.',
  },
  { id: 'm4', type: 'clarification', content: 'Which term?', suggestions: ['Spring 2027'] },
  { id: 'm5', type: 'error', content: 'Something went wrong' },
  { id: 'm6', type: 'document_upload', content: 'Document uploaded: notes.pdf (3 sections processed)' },
];

function Harness({ variant }) {
  const { openSession } = useChat();
  const location = useLocation();
  return (
    <>
      <button type="button" onClick={() => openSession('s1')}>Open saved chat</button>
      <output aria-label="Location">{`${location.pathname}${location.search}`}</output>
      <Thread variant={variant} />
    </>
  );
}

const renderThread = (variant) => render(
  <MemoryRouter initialEntries={['/events']}>
    <ChatProvider>
      <Harness variant={variant} />
    </ChatProvider>
  </MemoryRouter>,
);

const openSaved = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Open saved chat' }));
  await screen.findByText('Is ECON 3010 hard?');
};

beforeEach(() => {
  Element.prototype.scrollIntoView = jest.fn();
  global.fetch = jest.fn((url) => {
    const path = url.replace(process.env.REACT_APP_API_URL, '');
    if (path === '/switch-chat') return json({ status: 'success', context: { messages: SAVED } });
    if (path === '/api/chat-sessions/s1') return json({ id: 's1', title: 'ECON 3010' });
    return new Promise(() => {});
  });
});

describe.each(['page', 'dock'])('the %s thread', (variant) => {
  test('shows the question, one combined answer with its Checked chips and action row', async () => {
    const { container } = renderThread(variant);
    await openSaved();

    expect(screen.getByText('Is ECON 3010 hard?', { selector: '.user-message p' })).toBeInTheDocument();
    expect(screen.getByText(/Most students find/)).toBeInTheDocument();
    expect(screen.queryByText('One advisor of the panel.')).not.toBeInTheDocument();
    const checked = screen.getByLabelText('Sources checked');
    expect(within(checked).getByText('Courses')).toBeInTheDocument();
    const answer = container.querySelector('.answer');
    expect(within(answer).getAllByRole('button', { name: /Copy|Good answer|Bad answer/ })).toHaveLength(3);
  });

  test('shows errors, uploads and clarifications; a suggestion is sent', async () => {
    renderThread(variant);
    await openSaved();

    expect(screen.getByText('Something went wrong', { selector: '.error-message p' })).toBeInTheDocument();
    expect(screen.getByText(/Document uploaded: notes.pdf/)).toBeInTheDocument();
    expect(screen.getByText('Which term?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Spring 2027' }));
    await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => url === api('/chat-stream'))).toBe(true));
    expect(screen.getByText('Spring 2027', { selector: '.user-message p' })).toBeInTheDocument();
  });

  test('a course in the answer opens the pop-up over the page (?course=)', async () => {
    renderThread(variant);
    await openSaved();

    fireEvent.click(screen.getByRole('button', { name: 'ECON 3010' }));
    expect(screen.getByLabelText('Location')).toHaveTextContent('/events?course=ECON+3010');
  });
});

test('the page thread is empty until there are messages; the dock keeps its scroll box', () => {
  const page = renderThread('page');
  expect(page.container.querySelector('.messages-container')).not.toBeInTheDocument();
  page.unmount();

  const dock = renderThread('dock');
  expect(dock.container.querySelector('.cc-dock-messages')).toBeInTheDocument();
});

describe('answer feedback', () => {
  const reply = (ok, body) => Promise.resolve({
    ok, status: ok ? 200 : 500, text: () => Promise.resolve(JSON.stringify(body)),
  });
  const feedbackCalls = () => global.fetch.mock.calls
    .filter(([url]) => url.endsWith('/api/chat-sessions/s1/messages/m2/feedback'));
  const withFeedback = (handler) => {
    const base = global.fetch.getMockImplementation();
    global.fetch.mockImplementation((url, init) => (url.endsWith('/feedback') ? handler(init) : base(url, init)));
  };

  test('thumbs are aria-pressed toggles saved to the chat', async () => {
    withFeedback((init) => reply(true, { message_id: 'm2', feedback: JSON.parse(init.body).feedback }));
    renderThread('page');
    await openSaved();
    const up = screen.getByRole('button', { name: 'Good answer' });
    const down = screen.getByRole('button', { name: 'Bad answer' });
    expect(up).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(up);
    expect(up).toHaveAttribute('aria-pressed', 'true');
    expect(feedbackCalls()[0][1].method).toBe('PUT');
    expect(JSON.parse(feedbackCalls()[0][1].body)).toEqual({ feedback: 'up' });

    fireEvent.click(down);
    await waitFor(() => expect(down).toHaveAttribute('aria-pressed', 'true'));
    expect(up).toHaveAttribute('aria-pressed', 'false');

    // Pressing the pressed one clears it.
    fireEvent.click(down);
    await waitFor(() => expect(down).toHaveAttribute('aria-pressed', 'false'));
    expect(JSON.parse(feedbackCalls()[2][1].body)).toEqual({ feedback: null });
  });

  test('a failed save puts the thumb back', async () => {
    withFeedback(() => reply(false, { detail: 'nope' }));
    renderThread('page');
    await openSaved();
    const up = screen.getByRole('button', { name: 'Good answer' });
    fireEvent.click(up);
    expect(up).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(up).toHaveAttribute('aria-pressed', 'false'));
  });

  test('an answer saved with feedback shows it pressed', async () => {
    const base = global.fetch.getMockImplementation();
    global.fetch.mockImplementation((url, init) => (url.endsWith('/switch-chat')
      ? json({ status: 'success', context: { messages: SAVED.map((m) => (m.id === 'm2' ? { ...m, feedback: 'down' } : m)) } })
      : base(url, init)));
    renderThread('page');
    await openSaved();
    expect(screen.getByRole('button', { name: 'Bad answer' })).toHaveAttribute('aria-pressed', 'true');
  });
});
