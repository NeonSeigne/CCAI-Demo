import React from 'react';
import {
  act, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Composer from './Composer';
import Thread from './Thread';
import { mentionQuery } from './AdvisorMenu';
import { ChatProvider, restoredPanel, restoredReply, useChat } from '../../contexts/ChatContext';

// Choosing the panel (panel-answers phase 4) and talking to one advisor (phase 5).

const PERSONAS = [
  { id: 'academic_planner', name: 'Academic Planner', image: 'icon://BookOpen' },
  { id: 'career_coach', name: 'Career Coach', image: 'icon://Briefcase' },
  { id: 'study_strategist', name: 'Study Strategist', image: 'icon://Brain' },
  { id: 'campus_guide', name: 'Campus Guide', image: 'icon://MapPin' },
];

let mockUser = {};
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token', user: mockUser }) }));
jest.mock('../../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({ config: { personas: { items: PERSONAS } } }),
}));

const { TextDecoder: UtilTextDecoder, TextEncoder } = require('util');

const api = (path) => `${process.env.REACT_APP_API_URL}${path}`;
const json = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const encodeLine = (line) => new TextEncoder().encode(`${JSON.stringify(line)}\n`);
const streamOf = (...lines) => {
  const chunks = lines.map(encodeLine);
  return Promise.resolve({
    ok: true,
    body: { getReader: () => ({ read: () => Promise.resolve(chunks.length ? { done: false, value: chunks.shift() } : { done: true }) }) },
  });
};
// A stream the test feeds line by line.
const controllableStream = () => {
  const queue = [];
  let waiting = null;
  const feed = (item) => {
    if (waiting) { const resolve = waiting; waiting = null; resolve(item); } else queue.push(item);
  };
  return {
    respond: () => Promise.resolve({
      ok: true,
      body: {
        getReader: () => ({
          read: () => new Promise((resolve) => { if (queue.length) resolve(queue.shift()); else waiting = resolve; }),
        }),
      },
    }),
    push: (line) => feed({ done: false, value: encodeLine(line) }),
    end: () => feed({ done: true }),
  };
};

const REPLY_TO = { advisorId: 'study_strategist', advisorName: 'Study Strategist', messageId: 'p2' };
const SAVED = [
  { id: 'm1', type: 'user', content: 'How do I plan my week?', response_group_id: 'g1' },
  {
    id: 'p1', type: 'advisor', persona_id: 'academic_planner', advisorName: 'Academic Planner', content: 'Block your classes first.', response_group_id: 'g1',
  },
  {
    id: 'p2', type: 'advisor', persona_id: 'study_strategist', advisorName: 'Study Strategist', content: 'Plan study blocks.', response_group_id: 'g1',
  },
  {
    id: 'm2',
    type: 'advisor',
    persona_id: 'aggregated',
    advisorName: 'Panel',
    is_aggregated: true,
    source_personas: ['study_strategist', 'academic_planner'],
    content: 'Start with a weekly plan.',
    response_group_id: 'g1',
  },
];
const REPLY_SAVED = [
  ...SAVED,
  {
    id: 'u2', type: 'user', content: 'How long should a block be?', isReply: true, replyTo: REPLY_TO,
  },
  {
    id: 'r1', type: 'advisor', persona_id: 'study_strategist', advisorName: 'Study Strategist', content: 'Try 50-minute blocks.', isReply: true, replyTo: REPLY_TO,
  },
];

let saved = SAVED;
let handlers = {};

function Harness() {
  const { openSession } = useChat();
  return (
    <>
      <button type="button" onClick={() => openSession('s1')}>Open saved chat</button>
      <Thread variant="page" />
      <Composer surface="chat" />
    </>
  );
}

const renderChat = () => render(
  <MemoryRouter initialEntries={['/chat']}>
    <ChatProvider>
      <Harness />
    </ChatProvider>
  </MemoryRouter>,
);

const openSaved = async (text = 'Start with a weekly plan.') => {
  fireEvent.click(screen.getByRole('button', { name: 'Open saved chat' }));
  await screen.findByText(text);
};

const box = () => screen.getByRole('textbox', { name: 'Message' });
const type = (text) => fireEvent.change(box(), { target: { value: text } });
const sendText = (text) => {
  type(text);
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
};
const callsTo = (path) => global.fetch.mock.calls.filter(([url]) => url === api(path));
const bodyOf = (path, index = 0) => JSON.parse(callsTo(path)[index][1].body);
const askedNames = (row) => within(row).getAllByRole('listitem').map((li) => li.lastChild.textContent);
const labels = (rows) => rows.map((row) => row.querySelector('.cc-menu-label').textContent);
const chip = () => screen.getByRole('button', { name: /^Panel: / });

beforeAll(() => {
  if (!global.TextDecoder) global.TextDecoder = UtilTextDecoder;
});

beforeEach(() => {
  mockUser = {};
  saved = SAVED;
  handlers = {};
  Element.prototype.scrollIntoView = jest.fn();
  global.fetch = jest.fn((url, options) => {
    const path = url.replace(process.env.REACT_APP_API_URL, '');
    if (handlers[path]) return handlers[path](options);
    if (path === '/api/me/advisor-preferences') {
      return json({
        available_advisors: ['academic_planner', 'career_coach', 'study_strategist', 'campus_guide'],
        disabled_advisors: ['campus_guide'],
        show_panel: true,
      });
    }
    if (path === '/switch-chat') return json({ status: 'success', context: { messages: saved } });
    if (path === '/api/chat-sessions/s1') return json({ id: 's1', title: 'My week' });
    if (path === '/api/chat-sessions') return json({ id: 'session-1', title: 'Question' });
    if (path === '/chat-stream') return streamOf({ type: 'progress', data: { phase: 'complete' } });
    return new Promise(() => {});
  });
});

describe('Asked', () => {
  test('lists the answer\'s source_personas in order, then Add', async () => {
    renderChat();
    await openSaved();
    const row = screen.getByRole('group', { name: 'Asked' });
    expect(askedNames(row)).toEqual(['Study Strategist', 'Academic Planner']);
    expect(within(row).getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  test('shows the panel event\'s advisors while the answer streams, then who answered', async () => {
    const stream = controllableStream();
    handlers['/chat-stream'] = stream.respond;
    renderChat();
    sendText('How do I balance a job and classes?');

    await act(async () => {
      stream.push({ type: 'progress', data: { phase: 'panel', advisors: ['career_coach', 'academic_planner'] } });
    });
    const pending = await screen.findByRole('group', { name: 'Asked' });
    expect(askedNames(pending)).toEqual(['Career Coach', 'Academic Planner']);

    await act(async () => {
      stream.push({
        type: 'advisor',
        data: {
          persona_id: 'aggregated', persona_name: 'Panel', content: 'Keep shifts under 15 hours.', is_aggregated: true, source_personas: ['career_coach'],
        },
      });
      stream.end();
    });
    await screen.findByText('Keep shifts under 15 hours.');
    await waitFor(() => expect(screen.getAllByRole('group', { name: 'Asked' })).toHaveLength(1));
    expect(askedNames(screen.getByRole('group', { name: 'Asked' }))).toEqual(['Career Coach']);
  });

  test('is hidden when the panel is off', async () => {
    mockUser = { show_panel: false };
    renderChat();
    await openSaved();
    expect(screen.queryByRole('group', { name: 'Asked' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Panel: / })).not.toBeInTheDocument();
  });
});

describe('choosing the panel', () => {
  test('Add lists the advisors the student can ask and sets the next message\'s active_advisors', async () => {
    renderChat();
    await openSaved();
    fireEvent.click(within(screen.getByRole('group', { name: 'Asked' })).getByRole('button', { name: 'Add' }));

    const menu = await screen.findByRole('menu', { name: 'Advisors' });
    expect(labels(within(menu).getAllByRole('menuitemradio'))).toEqual(['Auto']);
    expect(labels(within(menu).getAllByRole('menuitemcheckbox'))).toEqual(['Academic Planner', 'Career Coach', 'Study Strategist']);
    expect(within(menu).queryByText('Campus Guide')).not.toBeInTheDocument();
    expect(within(menu).getByRole('menuitemcheckbox', { name: 'Study Strategist' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'Career Coach' }));
    fireEvent.keyDown(menu, { key: 'Escape' });

    sendText('What about internships?');
    await waitFor(() => expect(callsTo('/chat-stream')).toHaveLength(1));
    expect(bodyOf('/chat-stream').active_advisors).toEqual(['study_strategist', 'academic_planner', 'career_coach']);
  });

  test('the chip says Auto in a new chat and Same panel after an answer', async () => {
    renderChat();
    expect(chip()).toHaveTextContent('Auto');
    sendText('Hi');
    await waitFor(() => expect(callsTo('/chat-stream')).toHaveLength(1));
    expect(bodyOf('/chat-stream').active_advisors).toBeNull();

    await openSaved();
    expect(chip()).toHaveTextContent('Same panel');
    expect(chip()).toHaveAccessibleName('Panel: Same panel (Study Strategist, Academic Planner)');
    sendText('And on weekends?');
    await waitFor(() => expect(callsTo('/chat-stream')).toHaveLength(2));
    expect(bodyOf('/chat-stream', 1).active_advisors).toEqual(['study_strategist', 'academic_planner']);
  });

  test('Auto in the chip\'s menu goes back to automatic choice', async () => {
    renderChat();
    await openSaved();
    fireEvent.click(chip());
    const menu = await screen.findByRole('menu', { name: 'Advisors' });
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Auto' }));
    await waitFor(() => expect(chip()).toHaveTextContent('Auto'));
    sendText('Anything else?');
    await waitFor(() => expect(callsTo('/chat-stream')).toHaveLength(1));
    expect(bodyOf('/chat-stream').active_advisors).toBeNull();
  });
});

describe('@ in the composer', () => {
  test('mentionQuery reads the @ before the caret', () => {
    expect(mentionQuery('Hi @car')).toBe('car');
    expect(mentionQuery('@')).toBe('');
    expect(mentionQuery('mail me@school.edu')).toBeNull();
    expect(mentionQuery('Hi @car and more')).toBeNull();
  });

  test('suggests advisors by what follows the @; picking one drops the @query and chooses them', async () => {
    renderChat();
    await waitFor(() => expect(callsTo('/api/me/advisor-preferences')).toHaveLength(1));
    type('@');
    const all = await screen.findByRole('listbox', { name: 'Advisors' });
    expect(labels(within(all).getAllByRole('option')))
      .toEqual(['Academic Planner', 'Career Coach', 'Study Strategist']);

    type('Internship advice @car');
    const list = screen.getByRole('listbox', { name: 'Advisors' });
    expect(within(list).getAllByRole('option')).toHaveLength(1);
    fireEvent.keyDown(box(), { key: 'Enter' });

    expect(box()).toHaveValue('Internship advice ');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(chip()).toHaveTextContent('Career Coach');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(callsTo('/chat-stream')).toHaveLength(1));
    expect(bodyOf('/chat-stream').active_advisors).toEqual(['career_coach']);
  });
});

describe('talking to one advisor', () => {
  const enterReply = async () => {
    renderChat();
    await openSaved();
    fireEvent.click(screen.getByRole('button', { name: 'Study Strategist', pressed: false }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reply to Study Strategist' }));
  };

  test('Reply to {name} shows the banner and the placeholder; Back to the panel leaves', async () => {
    await enterReply();
    const banner = screen.getByRole('region', { name: 'Study Strategist' });
    expect(within(banner).getByText('Study Strategist')).toBeInTheDocument();
    expect(box()).toHaveAttribute('placeholder', 'Reply to Study Strategist');
    expect(screen.queryByRole('button', { name: /^Panel: / })).not.toBeInTheDocument();

    fireEvent.click(within(banner).getByRole('button', { name: 'Back to the panel' }));
    expect(screen.queryByRole('region', { name: 'Study Strategist' })).not.toBeInTheDocument();
    expect(box()).toHaveAttribute('placeholder', 'Ask a follow-up');
    expect(chip()).toBeInTheDocument();
  });

  test('messages go to /reply-to-advisor and the reply shows as one advisor\'s answer', async () => {
    handlers['/reply-to-advisor'] = () => streamOf(
      { type: 'progress', data: { phase: 'received' } },
      { type: 'progress', data: { phase: 'panel', advisors: ['study_strategist'] } },
      {
        type: 'advisor',
        data: {
          persona_id: 'study_strategist', persona_name: 'Study Strategist', content: 'Try 50-minute blocks.', is_reply: true, reply_to: REPLY_TO, message_id: 'r9',
        },
      },
      { type: 'progress', data: { phase: 'complete' } },
    );
    await enterReply();
    sendText('How long should a block be?');

    await screen.findByText('Try 50-minute blocks.');
    expect(callsTo('/chat-stream')).toHaveLength(0);
    expect(bodyOf('/reply-to-advisor')).toEqual({
      user_input: 'How long should a block be?',
      advisor_id: 'study_strategist',
      original_message_id: 'p2',
      chat_session_id: 's1',
    });
    const reply = screen.getByText('Try 50-minute blocks.').closest('.answer');
    expect(within(reply).getByText('Study Strategist')).toBeInTheDocument();
    expect(within(reply).queryByRole('group', { name: 'Asked' })).not.toBeInTheDocument();
    expect(within(reply).queryByRole('region', { name: 'The panel' })).not.toBeInTheDocument();
    // Still talking to them.
    expect(box()).toHaveAttribute('placeholder', 'Reply to Study Strategist');
  });

  test('reopening a chat whose last message is a reply restores the mode', async () => {
    saved = REPLY_SAVED;
    renderChat();
    await openSaved('Try 50-minute blocks.');
    expect(screen.getByRole('region', { name: 'Study Strategist' })).toBeInTheDocument();
    expect(box()).toHaveAttribute('placeholder', 'Reply to Study Strategist');
  });
});

describe('restoring a saved chat', () => {
  test('restoredPanel and restoredReply read the last answer and the last message', () => {
    expect(restoredPanel(SAVED)).toEqual(['study_strategist', 'academic_planner']);
    expect(restoredReply(SAVED)).toBeNull();
    expect(restoredReply(REPLY_SAVED)).toEqual({ id: 'study_strategist', name: 'Study Strategist', messageId: 'p2' });
  });
});
