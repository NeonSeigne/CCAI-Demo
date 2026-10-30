import React from 'react';
import {
  fireEvent, render, screen, within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomePage, { eventClock, nextUp } from './HomePage';
import { SavedContext } from '../contexts/SavedContext';
import { getCampusOrigin, getCatalogCourse, listEvents } from '../api/campus';
import { getToday } from '../api/planner';
import { clearCourseCache } from '../modules/course';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
jest.mock('../api/campus', () => ({
  ...jest.requireActual('../api/campus'),
  getCampusOrigin: jest.fn(),
  getCatalogCourse: jest.fn(),
  listEvents: jest.fn(),
}));
jest.mock('../api/planner', () => ({ getToday: jest.fn() }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Pierce' }, authToken: 'token', handleSignOut: jest.fn(), handleUserUpdate: jest.fn() }),
}));
let mockConfig;
jest.mock('../contexts/AppConfigContext', () => ({ useAppConfig: () => ({ config: mockConfig }) }));

// Thursday 29 October 2026, 11:00 in Charlottesville.
const NOW = new Date('2026-10-29T15:00:00Z');
const at = (time) => `2026-10-29T${time}:00-04:00`;
const UVA = {
  app: { institution: 'University of Virginia' },
  school: { timezone: 'America/New_York' },
  homepage: { starters: [{ domain: 'academics', title: 'Academics', prompts: ['Which ECON 3010 section fits my schedule?'] }] },
};
const EVENTS = [
  { id: 'e1', title: 'Morning yoga', start: at('07:00'), end: at('08:00'), location: 'AFC' },
  { id: 'e2', title: 'Career Center drop-in advising', start: at('12:00'), end: at('13:00'), location: 'Bryant Hall', walk_minutes: 6 },
  { id: 'e3', title: 'Hoos Hacking: intro to Git', start: at('18:00'), end: at('19:30'), location: 'Zoom' },
  { id: 'e4', title: 'Homecoming week', start: at('00:00'), end: '2026-11-01T00:00:00-04:00', ongoing: true },
];
const TODAY = {
  date: '2026-10-29',
  show: true,
  term: 'Fall 2026',
  meetings: [
    { course: 'ENWR 1510', title: 'Writing and Critical Inquiry', section: '001', kind: 'Lecture', start: '11:00', end: '12:15' },
    { course: 'HIUS 2061', title: 'Capitalism and Democracy', section: '001', kind: 'Lecture', start: '14:00', end: '14:50' },
  ],
  unscheduled: [],
};

const renderHome = ({ saved = [] } = {}) => render(
  <MemoryRouter>
    <SavedContext.Provider value={{ items: saved, count: saved.length, isSaved: () => false, save: jest.fn(), unsave: jest.fn() }}>
      <HomePage />
    </SavedContext.Provider>
  </MemoryRouter>,
);

const nextUpPanel = async () => (await screen.findByRole('heading', { name: 'Next up' })).closest('section');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  mockConfig = UVA;
  mockNavigate.mockReset();
  clearCourseCache();
  getCampusOrigin.mockResolvedValue({ place: { id: 'way/9', name: 'Clark Hall' } });
  listEvents.mockResolvedValue({ events: EVENTS, source: ['UVA Events'] });
  getToday.mockResolvedValue({ show: false, reason: 'no_term_dates', meetings: [] });
  getCatalogCourse.mockImplementation((token, id) => Promise.resolve({ identifier: id, title: `${id} title` }));
});

afterEach(() => {
  jest.useRealTimers();
});

test('Next up keeps events still ahead today, earliest first, without all-day runs', () => {
  expect(nextUp(EVENTS, NOW.getTime()).map((e) => e.id)).toEqual(['e2', 'e3']);
});

test('times read "12:00" over "to 1:00 PM"; the start keeps its meridiem when the end changes it', () => {
  expect(eventClock(EVENTS[1], 'America/New_York')).toEqual({ start: '12:00', end: 'to 1:00 PM' });
  const morning = { start: at('11:00'), end: at('13:00') };
  expect(eventClock(morning, 'America/New_York')).toEqual({ start: '11:00 AM', end: 'to 1:00 PM' });
  expect(eventClock({ start: at('11:00') }, 'America/New_York')).toEqual({ start: '11:00 AM', end: null });
});

test('the date line, the heading and the composer lead the page; asking opens the chat', async () => {
  renderHome();
  expect(screen.getByText(/^University of Virginia · Thursday, Oct 29/)).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: 'What do you need on campus today?' })).toBeInTheDocument();
  // The mockup's composer: +, the scope chip, mic and Send.
  expect(screen.getByRole('button', { name: 'Add documents or skills' })).toBeInTheDocument();
  expect(screen.getByText('Courses, events and places')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Voice input' })).toBeInTheDocument();
  const box = screen.getByRole('textbox', { name: 'Message' });
  expect(box).toHaveAttribute('placeholder', 'Try “Which ECON 3010 section fits my schedule?”');
  fireEvent.change(box, { target: { value: 'Food near Clark Hall' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(mockNavigate).toHaveBeenCalledWith('/chat', { state: { startNew: true, pendingPrompt: 'Food near Clark Hall', autoSend: true } });
  await screen.findByText('Career Center drop-in advising');
});

test('the history icon opens Search chats (phone, design Q21); no Recent card', async () => {
  renderHome();
  expect(screen.queryByRole('region', { name: 'Recent chats' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Search chats' }));
  expect(mockNavigate).toHaveBeenCalledWith('/search');
  await screen.findByText('Career Center drop-in advising');
});

test('Next up lists the coming events with times in the school zone and walking minutes; no Directions', async () => {
  renderHome();
  const board = await nextUpPanel();
  await within(board).findByText('Career Center drop-in advising');
  expect(listEvents).toHaveBeenCalledWith('token', { window: 'today', from: 'way/9' });
  expect(within(board).getByText('Times in Eastern Time')).toBeInTheDocument();
  expect(within(board).getByText('to 1:00 PM')).toBeInTheDocument();
  expect(within(board).getByText('6 min')).toBeInTheDocument();
  expect(within(board).queryByText('Morning yoga')).not.toBeInTheDocument();
  expect(within(board).queryByText('Homecoming week')).not.toBeInTheDocument();
  expect(within(board).queryByRole('button', { name: 'Directions' })).not.toBeInTheDocument();
  expect(within(board).getByRole('button', { name: 'Add Career Center drop-in advising to calendar' })).toBeInTheDocument();
  expect(within(board).getByRole('link', { name: 'All events today' })).toHaveAttribute('href', '/events');
});

test('Next up says "Nothing listed today" when nothing else is on', async () => {
  listEvents.mockResolvedValue({ events: [EVENTS[0]] });
  renderHome();
  expect(await screen.findByText('Nothing listed today')).toBeInTheDocument();
});

test('a failed events request shows the error with Retry', async () => {
  listEvents.mockRejectedValueOnce(new Error('503'));
  renderHome();
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Career Center drop-in advising')).toBeInTheDocument();
});

test('Your classes today lists the meetings from /api/planner/today when it shows', async () => {
  getToday.mockResolvedValue(TODAY);
  renderHome();
  const board = (await screen.findByRole('heading', { name: 'Your classes today' })).closest('section');
  const rows = within(board).getAllByRole('button');
  expect(rows.map((row) => row.textContent)).toEqual([
    '11:00ENWR 1510Writing and Critical Inquiry',
    '2:00HIUS 2061Capitalism and Democracy',
  ]);
});

test('with nothing today and nothing saved, both side panels hide and Next up takes the width', async () => {
  getToday.mockResolvedValue({ ...TODAY, show: false, reason: 'weekend' });
  const { container } = renderHome();
  await screen.findByText('Career Center drop-in advising');
  expect(screen.queryByRole('heading', { name: 'Your classes today' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Saved' })).not.toBeInTheDocument();
  expect(container.querySelector('.ah-bento')).toHaveClass('is-single');
});

test('Saved alone shows the side column; course rows show the code and the title', async () => {
  const { container } = renderHome({
    saved: [
      { kind: 'course', key: 'ECON 4010', display_name: 'ECON 4010' },
      { kind: 'event', key: 'e3', display_name: 'Hoos Hacking: intro to Git' },
      { kind: 'place', key: 'way/1', display_name: 'Clark Hall' },
    ],
  });
  const board = (await screen.findByRole('heading', { name: 'Saved' })).closest('section');
  expect(container.querySelector('.ah-bento')).not.toHaveClass('is-single');
  expect(await within(board).findByRole('button', { name: 'ECON 4010 ECON 4010 title' })).toBeInTheDocument();
  expect(within(board).getByRole('link', { name: 'Clark Hall' })).toHaveAttribute('href', '/map?to=way%2F1');
  expect(within(board).getByRole('link', { name: 'Hoos Hacking: intro to Git' })).toHaveAttribute('href', '/saved');
  expect(screen.queryByRole('heading', { name: 'Your classes today' })).not.toBeInTheDocument();
});
