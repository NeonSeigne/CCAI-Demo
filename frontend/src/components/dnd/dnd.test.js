import React from 'react';
import {
  act, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AppShell from '../shell/AppShell';
import CampusRail from '../CampusRail';
import { SavedContext } from '../../contexts/SavedContext';
import useDraggableItem from './useDraggableItem';
import useAsk from '../../hooks/useAsk';

const mockChat = {
  messages: [],
  thinkingAdvisors: [],
  groupViews: {},
  attachments: [],
  uploadedDocuments: [],
  sessionEpoch: 0,
  isLoading: false,
  attach: jest.fn(),
  removeAttachment: jest.fn(),
  send: jest.fn(),
  newChat: jest.fn(),
  addDocument: jest.fn(),
};

jest.mock('../../contexts/ChatContext', () => ({ useChat: () => mockChat }));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ authToken: 'token', user: { firstName: 'Ada' } }),
}));
jest.mock('../../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({ config: { app: { institution: 'UVA' } } }),
}));
jest.mock('../chat/DockConversation', () => () => <div>Conversation</div>);
jest.mock('../EnhancedChatInput', () => ({ placeholder }) => <textarea aria-label="Message" placeholder={placeholder} />);

const COURSE = { type: 'course', id: 'ECON 3720', title: 'Intermediate Macroeconomics' };

function Card() {
  const drag = useDraggableItem(COURSE);
  return <div ref={drag.ref} {...drag.handleProps} className={drag.className}>ECON 3720</div>;
}

function AskButton() {
  const ask = useAsk();
  return <button type="button" onClick={() => ask(COURSE)}>Ask about ECON 3720</button>;
}

/** /courses has the dock; /home has only the rail's Saved target. */
const renderAt = (path, saved = { count: 0 }) => render(
  <MemoryRouter initialEntries={[path]}>
    <SavedContext.Provider value={saved}>
      <Routes>
        <Route element={<AppShell />}>
          <Route
            path={path}
            element={(
              <div>
                {path === '/home' && <CampusRail />}
                <Card />
                <AskButton />
              </div>
            )}
          />
        </Route>
      </Routes>
    </SavedContext.Provider>
  </MemoryRouter>,
);

const tick = () => act(() => new Promise((resolve) => { setTimeout(resolve, 0); }));

/** Space lifts, an arrow moves, Space drops (D18). */
async function keyboardDrag() {
  const card = screen.getByText('ECON 3720');
  card.focus();
  fireEvent.keyDown(card, { code: 'Space', key: ' ' });
  await tick();
  fireEvent.keyDown(document, { code: 'ArrowRight', key: 'ArrowRight' });
  await tick();
  fireEvent.keyDown(document, { code: 'Space', key: ' ' });
  await tick();
}

const RECT = {
  x: 0, y: 0, top: 0, left: 0, right: 200, bottom: 200, width: 200, height: 200, toJSON: () => {},
};

beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
  window.matchMedia = (media) => ({
    matches: !/max-width/.test(media), media, addEventListener: () => {}, removeEventListener: () => {},
  });
  // jsdom has no layout: give every element the same box so drags overlap targets.
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(RECT);
  jest.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));
});

afterEach(() => { jest.restoreAllMocks(); });

test('keyboard drag announces the lift and the drop politely', async () => {
  renderAt('/courses');
  const card = screen.getByText('ECON 3720');
  card.focus();
  fireEvent.keyDown(card, { code: 'Space', key: ' ' });
  await tick();
  const region = screen.getByText(/^Picked up Intermediate Macroeconomics\./);
  expect(region).toHaveAttribute('aria-live', 'polite');
  fireEvent.keyDown(document, { code: 'ArrowRight', key: 'ArrowRight' });
  await tick();
  fireEvent.keyDown(document, { code: 'Space', key: ' ' });
  await tick();
  expect(screen.getByText('Dropped Intermediate Macroeconomics on Ask.')).toBeInTheDocument();
});

test('valid targets get a dashed outline at drag start, and Escape cancels', async () => {
  renderAt('/courses');
  const card = screen.getByText('ECON 3720');
  card.focus();
  fireEvent.keyDown(card, { code: 'Space', key: ' ' });
  await tick();
  const dockTarget = screen.getByRole('heading', { name: 'Ask' }).closest('aside');
  expect(dockTarget).toHaveClass('is-drop-ready');
  fireEvent.keyDown(document, { code: 'Escape', key: 'Escape' });
  await tick();
  expect(screen.getByText('Cancelled. Intermediate Macroeconomics was not moved.')).toBeInTheDocument();
  expect(dockTarget).not.toHaveClass('is-drop-ready');
  expect(mockChat.attach).not.toHaveBeenCalled();
});

test('dropping on the dock attaches the item', async () => {
  renderAt('/courses');
  await keyboardDrag();
  expect(mockChat.attach).toHaveBeenCalledTimes(1);
  expect(mockChat.attach).toHaveBeenCalledWith(expect.objectContaining(COURSE));
  expect(mockChat.send).not.toHaveBeenCalled();
});

test('dropping on Saved saves once, without navigating', async () => {
  const saved = {
    count: 1, isSaved: jest.fn(() => false), save: jest.fn(() => Promise.resolve({})),
  };
  renderAt('/home', saved);
  await keyboardDrag();
  expect(saved.save).toHaveBeenCalledTimes(1);
  expect(saved.save).toHaveBeenCalledWith({
    kind: 'course', key: 'ECON 3720', display_name: 'Intermediate Macroeconomics',
  });
  expect(screen.getByText('Dropped Intermediate Macroeconomics on Saved.')).toBeInTheDocument();
  expect(screen.getByText('ECON 3720')).toBeInTheDocument();
});

test('an already-saved item only pulses the count', async () => {
  const saved = { count: 1, isSaved: jest.fn(() => true), save: jest.fn() };
  renderAt('/home', saved);
  await keyboardDrag();
  expect(saved.save).not.toHaveBeenCalled();
  await waitFor(() => expect(
    screen.getByRole('link', { name: /^Saved/ }).querySelector('.campus-nav-count'),
  ).toHaveClass('is-pulsing'));
});

test('useAsk attaches, opens the dock and focuses the composer without sending', async () => {
  window.localStorage.setItem('cc.chatDock.collapsed', 'true');
  renderAt('/courses');
  expect(screen.queryByRole('heading', { name: 'Ask' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ask about ECON 3720' }));
  expect(mockChat.attach).toHaveBeenCalledWith(COURSE);
  expect(screen.getByRole('heading', { name: 'Ask' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Message' })).toHaveFocus();
  expect(mockChat.send).not.toHaveBeenCalled();
});
