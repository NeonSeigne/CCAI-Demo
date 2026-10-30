import React from 'react';
import {
  act, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AppShell from '../shell/AppShell';
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

jest.mock('../../contexts/ChatContext', () => ({
  useChat: () => mockChat,
  ChatContext: jest.requireActual('react').createContext(null),
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ authToken: 'token', user: { firstName: 'Ada' } }),
}));
jest.mock('../../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({ config: { app: { institution: 'UVA' } } }),
}));

const COURSE = { type: 'course', id: 'ECON 3720', title: 'Intermediate Macroeconomics' };

const mockSaveClick = jest.fn();

function Card() {
  const drag = useDraggableItem(COURSE);
  return (
    <div ref={drag.ref} {...drag.handleProps} className={drag.className} data-testid="card">
      <span>ECON 3720</span>
      <button type="button" onClick={mockSaveClick}>Save</button>
    </div>
  );
}

function AskButton() {
  const ask = useAsk();
  return <button type="button" onClick={() => ask(COURSE)}>Ask about ECON 3720</button>;
}

/** /courses has the dock; /home has no dock, only the rail's Saved target. */
const renderAt = (path, saved = { count: 0 }) => render(
  <MemoryRouter initialEntries={[path]}>
    <SavedContext.Provider value={saved}>
      <Routes>
        <Route element={<AppShell />}>
          <Route
            path={path}
            element={(
              <div>
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
async function keyboardDrag({ arrows = 1 } = {}) {
  const card = screen.getByTestId('card');
  card.focus();
  fireEvent.keyDown(card, { code: 'Space', key: ' ' });
  await tick();
  for (let i = 0; i < arrows; i += 1) {
    fireEvent.keyDown(document, { code: 'ArrowDown', key: 'ArrowDown' });
    // eslint-disable-next-line no-await-in-loop
    await tick();
  }
  fireEvent.keyDown(document, { code: 'Space', key: ' ' });
  await tick();
}

const box = (left, top, width, height) => ({
  x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => {},
});
const NONE = box(0, 0, 0, 0);

/**
 * jsdom has no layout. Give the card (and the chip that follows it), the
 * dock and the Saved rail item boxes of their own, apart from each other.
 */
function layout() {
  if (this.matches?.('[data-testid="card"]') || this.querySelector?.(':scope > .dnd-chip')) return box(400, 300, 200, 60);
  if (this.matches?.('aside.cc-dock')) return box(1080, 0, 360, 900);
  if (this.matches?.('li.dnd-target')) return box(0, 200, 260, 44);
  return NONE;
}

beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
  window.matchMedia = (media) => ({
    matches: !/max-width/.test(media), media, addEventListener: () => {}, removeEventListener: () => {},
  });
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(layout);
  jest.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));
});

afterEach(() => { jest.restoreAllMocks(); });

test('keyboard drag announces the lift and the drop politely', async () => {
  renderAt('/courses');
  const card = screen.getByTestId('card');
  card.focus();
  fireEvent.keyDown(card, { code: 'Space', key: ' ' });
  await tick();
  const region = screen.getByText(/^Picked up Intermediate Macroeconomics\./);
  expect(region).toHaveAttribute('aria-live', 'polite');
  fireEvent.keyDown(document, { code: 'ArrowRight', key: 'ArrowRight' });
  await tick();
  expect(screen.getByText(/Intermediate Macroeconomics is over Ask\.$/)).toBeInTheDocument();
  fireEvent.keyDown(document, { code: 'Space', key: ' ' });
  await tick();
  expect(screen.getByText('Dropped Intermediate Macroeconomics on Ask.')).toBeInTheDocument();
});

test('valid targets get a dashed outline at drag start, and Escape cancels', async () => {
  renderAt('/courses');
  const card = screen.getByTestId('card');
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
  expect(screen.getByTestId('card')).toBeInTheDocument();
});

test('lifting and dropping in place drops on nothing', async () => {
  renderAt('/courses');
  await keyboardDrag({ arrows: 0 });
  expect(screen.getByText('Dropped Intermediate Macroeconomics. Nothing changed.')).toBeInTheDocument();
  expect(mockChat.attach).not.toHaveBeenCalled();
});

test('arrows step between the targets that take the item', async () => {
  const saved = {
    count: 0, isSaved: jest.fn(() => false), save: jest.fn(() => Promise.resolve({})),
  };
  // /saved has both the rail's Saved item and the dock, in reading order.
  render(
    <MemoryRouter initialEntries={['/saved']}>
      <SavedContext.Provider value={saved}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/saved" element={<div><Card /></div>} />
          </Route>
        </Routes>
      </SavedContext.Provider>
    </MemoryRouter>,
  );
  const card = screen.getByTestId('card');
  card.focus();
  fireEvent.keyDown(card, { code: 'Space', key: ' ' });
  await tick();
  fireEvent.keyDown(document, { code: 'ArrowDown', key: 'ArrowDown' });
  await tick();
  expect(screen.getByText(/Intermediate Macroeconomics is over Ask\.$/)).toBeInTheDocument();
  fireEvent.keyDown(document, { code: 'ArrowDown', key: 'ArrowDown' });
  await tick();
  expect(screen.getByText(/Intermediate Macroeconomics is over Saved\.$/)).toBeInTheDocument();
  fireEvent.keyDown(document, { code: 'ArrowUp', key: 'ArrowUp' });
  await tick();
  expect(screen.getByText(/Intermediate Macroeconomics is over Ask\.$/)).toBeInTheDocument();
  fireEvent.keyDown(document, { code: 'Escape', key: 'Escape' });
  await tick();
  expect(mockChat.attach).not.toHaveBeenCalled();
  expect(saved.save).not.toHaveBeenCalled();
  await screen.findByText('Your chats will show up here.');
});

test('Enter on a button inside a draggable card clicks it and starts no drag', async () => {
  renderAt('/courses');
  const save = screen.getByRole('button', { name: 'Save' });
  save.focus();
  userEvent.keyboard('{Enter}');
  await tick();
  expect(mockSaveClick).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(save, { code: 'Space', key: ' ' });
  await tick();
  expect(screen.queryByText(/Picked up/)).not.toBeInTheDocument();
  expect(screen.getByTestId('card')).not.toHaveClass('is-dragging');
});

test('an already-saved item only pulses the count', async () => {
  const saved = { count: 1, isSaved: jest.fn(() => true), save: jest.fn() };
  renderAt('/home', saved);
  await keyboardDrag();
  expect(saved.save).not.toHaveBeenCalled();
  await waitFor(() => expect(
    screen.getByRole('link', { name: /^Saved/ }).querySelector('.campus-nav-count'),
  ).toHaveClass('dnd-pulse'));
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
