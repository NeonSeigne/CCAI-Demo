import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Composer from './Composer';
import { ChatContext } from '../../contexts/ChatContext';
import { ChatDockProvider, useChatDock } from '../../contexts/ChatDockContext';

let mockConfig = {};
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token' }) }));
jest.mock('../../contexts/AppConfigContext', () => ({ useAppConfig: () => ({ config: mockConfig }) }));

const COURSE = { type: 'course', id: 'ECON 3720', title: 'Intermediate Macroeconomics' };

const chatWith = (overrides = {}) => ({
  messages: [],
  attachments: [],
  uploadedDocuments: [],
  sessionEpoch: 0,
  isLoading: false,
  sessionId: 's1',
  send: jest.fn(),
  addDocument: jest.fn(),
  removeAttachment: jest.fn(),
  ...overrides,
});

function Where() {
  const location = useLocation();
  return <output aria-label="Location">{location.pathname}</output>;
}

function FocusButton() {
  const dock = useChatDock();
  return <button type="button" onClick={dock.requestComposerFocus}>Ask about it</button>;
}

const renderComposer = (surface, chat = chatWith(), { extra = null, prefill } = {}) => {
  const tree = (value) => (
    <MemoryRouter initialEntries={['/home']}>
      <ChatContext.Provider value={value}>
        <ChatDockProvider>
          {extra}
          <Composer surface={surface} prefill={prefill} />
          <Where />
        </ChatDockProvider>
      </ChatContext.Provider>
    </MemoryRouter>
  );
  const view = render(tree(chat));
  return { ...view, rerenderWith: (next) => view.rerender(tree(next)) };
};

const type = (text) => fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: text } });

beforeEach(() => {
  mockConfig = { app: { institution: 'UVA' } };
});

describe('each surface decides the +, mic, scope chip and placeholder', () => {
  test('chat: +, scope chip, mic and Send', () => {
    renderComposer('chat');
    expect(screen.getByRole('button', { name: 'Add documents or skills' })).toBeInTheDocument();
    expect(screen.getByText('Courses, events and places')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voice input' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveAttribute('placeholder', 'Ask about courses, events or places');
  });

  test('dock: +, mic and Send, no scope chip', () => {
    renderComposer('dock');
    expect(screen.getByRole('button', { name: 'Add documents or skills' })).toBeInTheDocument();
    expect(screen.queryByText('Courses, events and places')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voice input' })).toBeInTheDocument();
  });

  test('chat and dock take the configured placeholder', () => {
    mockConfig = { chat_page: { placeholder: 'Ask anything' } };
    renderComposer('dock');
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveAttribute('placeholder', 'Ask anything');
  });

  test('home: the school scope chip and Ask, no + or mic; the first starter as placeholder', () => {
    mockConfig = {
      app: { institution: 'UVA' },
      homepage: { starters: [{ prompts: ['Where can I study late?'] }] },
    };
    renderComposer('home');
    expect(screen.getByText('Courses, events and places at UVA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add documents or skills' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voice input' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Ask a question')).toHaveAttribute('placeholder', 'Try “Where can I study late?”');
  });
});

test('chat sends to the chat and clears the box', () => {
  const chat = chatWith();
  renderComposer('chat', chat);
  type('Plan my semester');
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(chat.send).toHaveBeenCalledWith('Plan my semester');
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');
});

test('the box is disabled while an answer streams', () => {
  const chat = chatWith({ isLoading: true });
  renderComposer('dock', chat);
  expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled();
  expect(chat.send).not.toHaveBeenCalled();
});

test('home opens the chat page with the question; an empty ask stays', () => {
  renderComposer('home');
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  expect(screen.getByLabelText('Location')).toHaveTextContent('/home');
  expect(screen.getByLabelText('Ask a question')).toHaveFocus();

  fireEvent.change(screen.getByLabelText('Ask a question'), { target: { value: 'Is ECON 2010 hard?' } });
  fireEvent.keyDown(screen.getByLabelText('Ask a question'), { key: 'Enter' });
  expect(screen.getByLabelText('Location')).toHaveTextContent('/chat');
});

test('attached items show as chips that remove themselves', () => {
  const chat = chatWith({ attachments: [COURSE, { type: 'place', id: 'pl-2', title: 'Memorial Library' }] });
  renderComposer('chat', chat);
  expect(screen.getByText('ECON 3720 Intermediate Macroeconomics')).toBeInTheDocument();
  expect(screen.getByText('Memorial Library')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove ECON 3720 Intermediate Macroeconomics' }));
  expect(chat.removeAttachment).toHaveBeenCalledWith(COURSE);
});

test('a new conversation clears the draft; a prefill fills it', () => {
  const chat = chatWith();
  const { rerenderWith } = renderComposer('chat', chat, { prefill: { text: 'Is ECON 2010 hard?' } });
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Is ECON 2010 hard?');
  rerenderWith({ ...chat, sessionEpoch: 1 });
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('');
});

test('a focus request reaches the composer through the dock state', () => {
  renderComposer('chat', chatWith(), { extra: <FocusButton /> });
  const box = screen.getByRole('textbox', { name: 'Message' });
  expect(box).not.toHaveFocus();
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Ask about it' })); });
  expect(box).toHaveFocus();
});

function DockToggle({ chat }) {
  const [open, setOpen] = React.useState(true);
  return (
    <ChatContext.Provider value={chat}>
      <ChatDockProvider>
        <button type="button" onClick={() => setOpen(!open)}>Toggle dock</button>
        {open && <Composer surface="dock" />}
      </ChatDockProvider>
    </ChatContext.Provider>
  );
}

test('the dock keeps its unsent text while it is closed', () => {
  render(<MemoryRouter><DockToggle chat={chatWith()} /></MemoryRouter>);
  type('Where is Clark Hall?');
  fireEvent.click(screen.getByRole('button', { name: 'Toggle dock' }));
  expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Toggle dock' }));
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Where is Clark Hall?');
});
