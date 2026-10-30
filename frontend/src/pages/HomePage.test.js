import React from 'react';
import {
  act, fireEvent, render, screen, within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomePage, { nextUp } from './HomePage';
import { PlannerContext } from '../contexts/PlannerContext';
import { SavedContext } from '../contexts/SavedContext';
import { getCampusOrigin, getCatalogCourse, listEvents } from '../api/campus';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
jest.mock('../api/campus', () => ({
  getCampusOrigin: jest.fn(),
  getCatalogCourse: jest.fn(),
  listEvents: jest.fn(),
}));
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

const section = (id, meetings, bldg) => ({ id, section: '001', type: 'Lecture', meetings, bldg });
const SUMMARIES = {
  'ENWR 1510': {
    identifier: 'ENWR 1510',
    title: 'Writing and Critical Inquiry',
    sections: { term: 'Fall 2026', rows: [section('11001', ['tuth 11:00am - 12:15pm (08/25/2026 - 12/08/2026)'], 'Bryan Hall')] },
  },
  'HIUS 2061': {
    identifier: 'HIUS 2061',
    title: 'Capitalism and Democracy',
    sections: { term: 'Fall 2026', rows: [section('11002', ['th 2:00pm - 2:50pm (08/25/2026 - 12/08/2026)'])] },
  },
};
const planWith = (courses) => ({ view: { plan: { courses } }, ensureLoaded: jest.fn() });
const FALL = [
  { id: 'ENWR 1510', term: 'Fall 2026', sections: ['11001'] },
  { id: 'HIUS 2061', term: 'Fall 2026', sections: ['11002'] },
];

const renderHome = ({ planner = null, saved = [] } = {}) => render(
  <MemoryRouter>
    <SavedContext.Provider value={{ items: saved, count: saved.length, isSaved: () => false, save: jest.fn(), unsave: jest.fn() }}>
      <PlannerContext.Provider value={planner}>
        <HomePage />
      </PlannerContext.Provider>
    </SavedContext.Provider>
  </MemoryRouter>,
);

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  mockConfig = UVA;
  mockNavigate.mockReset();
  getCampusOrigin.mockResolvedValue({ place: { id: 'way/9', name: 'Clark Hall' } });
  listEvents.mockResolvedValue({ events: EVENTS, source: ['UVA Events'] });
  getCatalogCourse.mockImplementation((token, id) => (
    SUMMARIES[id] ? Promise.resolve(SUMMARIES[id]) : Promise.reject(new Error('404'))
  ));
});

afterEach(() => {
  jest.useRealTimers();
});

test('Next up keeps events still ahead today, earliest first, without all-day runs', () => {
  expect(nextUp(EVENTS, NOW.getTime()).map((e) => e.id)).toEqual(['e2', 'e3']);
});

test('the date line, the heading and the composer lead the page; asking opens the chat', async () => {
  renderHome();
  expect(screen.getByText(/^University of Virginia · Thursday, Oct 29/)).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: 'What do you need on campus today?' })).toBeInTheDocument();
  expect(screen.getByText('Courses, events and places at University of Virginia')).toBeInTheDocument();
  const box = screen.getByLabelText('Ask a question');
  expect(box).toHaveAttribute('placeholder', 'Try “Which ECON 3010 section fits my schedule?”');
  fireEvent.change(box, { target: { value: 'Food near Clark Hall' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  expect(mockNavigate).toHaveBeenCalledWith('/chat', { state: { startNew: true, pendingPrompt: 'Food near Clark Hall', autoSend: true } });
  expect(screen.queryByText('Start with')).not.toBeInTheDocument();
  await screen.findByText('Career Center drop-in advising');
});

test('Next up lists the coming events with walking times from the start place', async () => {
  renderHome();
  const board = (await screen.findByRole('heading', { name: 'Next up' })).closest('section');
  await within(board).findByText('Career Center drop-in advising');
  expect(listEvents).toHaveBeenCalledWith('token', { window: 'today', from: 'way/9' });
  expect(within(board).getByText('6 min')).toBeInTheDocument();
  expect(within(board).queryByText('Morning yoga')).not.toBeInTheDocument();
  expect(within(board).queryByText('Homecoming week')).not.toBeInTheDocument();
  expect(within(board).getAllByRole('button', { name: 'Directions' })).toHaveLength(1);
  fireEvent.click(within(board).getByRole('button', { name: 'Directions' }));
  expect(mockNavigate).toHaveBeenCalledWith('/chat', expect.objectContaining({
    state: expect.objectContaining({ pendingPrompt: 'How do I get to Bryant Hall?' }),
  }));
  expect(within(board).getByRole('link', { name: 'All events today' })).toHaveAttribute('href', '/events');
  expect(within(board).queryByText('From UVA Events')).not.toBeInTheDocument();
});

test('Next up says so when nothing else is on', async () => {
  listEvents.mockResolvedValue({ events: [EVENTS[0]] });
  renderHome();
  expect(await screen.findByText('Nothing else on the calendar today.')).toBeInTheDocument();
});

test("Your classes today lists the current term's sections meeting today", async () => {
  renderHome({ planner: planWith(FALL) });
  const board = (await screen.findByRole('heading', { name: 'Your classes today' })).closest('section');
  const rows = within(board).getAllByRole('button');
  expect(rows.map((row) => row.textContent)).toEqual([
    '11:00ENWR 1510Writing and Critical InquiryBryan Hall',
    '2:00HIUS 2061Capitalism and Democracy',
  ]);
});

test('no plan, no classes board', async () => {
  renderHome();
  await screen.findByText('Career Center drop-in advising');
  expect(screen.queryByRole('heading', { name: 'Your classes today' })).not.toBeInTheDocument();
  expect(getCatalogCourse).not.toHaveBeenCalled();
});

test('a plan that starts next term shows no classes today', async () => {
  renderHome({ planner: planWith(FALL.map((c) => ({ ...c, term: 'Spring 2027' }))) });
  await screen.findByText('Career Center drop-in advising');
  expect(screen.queryByRole('heading', { name: 'Your classes today' })).not.toBeInTheDocument();
  expect(getCatalogCourse).not.toHaveBeenCalled();
});

test('sections whose dates have ended are not today', async () => {
  getCatalogCourse.mockImplementation((token, id) => Promise.resolve({
    ...SUMMARIES[id],
    sections: { term: 'Fall 2026', rows: [section(id === 'ENWR 1510' ? '11001' : '11002', ['tuth 11:00am - 12:15pm (08/25/2026 - 10/16/2026)'])] },
  }));
  renderHome({ planner: planWith(FALL) });
  await screen.findByText('Career Center drop-in advising');
  await act(async () => {});
  expect(getCatalogCourse).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('heading', { name: 'Your classes today' })).not.toBeInTheDocument();
});

test('UW: sections without meeting times hide the board', async () => {
  mockConfig = { app: { institution: 'University of Wisconsin–Madison' }, school: { timezone: 'America/Chicago' } };
  getCatalogCourse.mockResolvedValue({
    identifier: 'COMP SCI 400',
    title: 'Programming III',
    sections: { term: 'Fall 2026', rows: [{ id: '001', section: '001', type: 'LEC' }] },
  });
  renderHome({ planner: planWith([{ id: 'COMP SCI 400', term: 'Fall 2026', sections: ['001'] }]) });
  await screen.findByText('Career Center drop-in advising');
  await act(async () => {});
  expect(getCatalogCourse).toHaveBeenCalledWith('token', 'COMP SCI 400');
  expect(screen.queryByRole('heading', { name: 'Your classes today' })).not.toBeInTheDocument();
});

test('Saved lists the newest saved items', async () => {
  renderHome({
    saved: [
      { kind: 'course', key: 'ECON 4010', display_name: 'ECON 4010' },
      { kind: 'event', key: 'e3', display_name: 'Hoos Hacking: intro to Git' },
      { kind: 'place', key: 'way/1', display_name: 'Clark Hall' },
    ],
  });
  const board = (await screen.findByRole('heading', { name: 'Saved' })).closest('section');
  expect(within(board).getByRole('button', { name: 'ECON 4010' })).toBeInTheDocument();
  expect(within(board).getByRole('link', { name: 'Clark Hall' })).toHaveAttribute('href', '/map?to=way%2F1');
  expect(within(board).getByRole('link', { name: 'Hoos Hacking: intro to Git' })).toHaveAttribute('href', '/saved');
});
