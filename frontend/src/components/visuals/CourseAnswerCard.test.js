import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CourseAnswerCard, { groupCourseVisuals, titleCase } from './CourseAnswerCard';
import { sourceLines } from './AnswerSources';
import { SavedContext } from '../../contexts/SavedContext';
import { PlannerContext } from '../../contexts/PlannerContext';
import { memoryAdapter, setCourseAdapter } from '../../modules/course';
import { proposal } from '../planner/plannerFixtures';

jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token' }) }));

// GET /api/catalog/{id} at UW (live seats).
const PAYLOAD = {
  identifier: 'COMPSCI 300',
  title: 'PROGRAMMING II',
  credits: { min: 3, max: 3 },
  difficulty: 'harder',
  source: { name: 'UW Course Map', url: 'https://uwcourses.com' },
  grades: {
    gpa: 3.23,
    students: 100,
    pct_a: 50,
    pct_df: 5,
    term: 'Spring 2026',
    distribution: { a: 50, ab: 20, b: 20, bc: 0, c: 5, d: 3, f: 2 },
  },
  grade_history: [{ term: 'Fall 2025', gpa: 3.1 }, { term: 'Spring 2026', gpa: 3.23 }],
  instructors: ['Jim Williams', 'Another Person'],
  sections: {
    term: 'Spring 2026',
    seats_published: true,
    seats_open: 4,
    rows: [
      { section: '001', type: 'LEC', enrolled: 146, capacity: 150, seats_open: 4, is_open: true, instructors: 'Williams' },
      { section: '003', type: 'LEC', enrolled: 60, capacity: 60, seats_open: 0, waitlist: 4, is_open: false },
      { section: '311', type: 'LAB', enrolled: 20, capacity: 24, seats_open: 4 },
    ],
  },
};
const RATINGS = {
  ratings: [{ name: 'Jim Williams', rating: 2.98, difficulty: 3.39, num_ratings: 155 }],
  source: { name: 'Rate My Professors' },
  instructor_rating: { rating: 3.64, instructors: 2, term: null },
};

// UVA snapshot: historical sections, ten grade buckets with DFW.
const UVA = {
  identifier: 'ECON 3010',
  title: 'Intermediate Microeconomics',
  difficulty: 'typical',
  grades: {
    gpa: 3.18,
    students: 182,
    term: '2025 Fall',
    distribution: { 'A+': 10, A: 30, 'A-': 20, 'B+': 30, B: 40, 'B-': 20, 'C+': 10, C: 10, 'C-': 5, DFW: 7 },
  },
  sections: {
    term: 'Fall 2025',
    seats_published: true,
    historical: true,
    as_of: '2025-09-01',
    rows: [{ section: '001', type: 'Lecture', enrolled: 41, capacity: 60, meeting_times: [{ day: 'Mo', start: '14:00', end: '15:15' }, { day: 'We', start: '14:00', end: '15:15' }] }],
  },
};

let adapter;
const serve = (courses = { 'COMPSCI 300': PAYLOAD }) => {
  adapter = memoryAdapter({ courses, ratings: { 'COMPSCI 300': RATINGS, 'ECON 3010': { ratings: [] } } });
  setCourseAdapter(adapter);
};

afterEach(() => setCourseAdapter(null));

const COURSE = { type: 'course_answer', course: 'COMPSCI 300', types: ['course_schedule', 'course_instructors'] };
const GRADES = { type: 'course_answer', course: 'COMPSCI 300', types: ['course_gpa', 'course_grade_distribution', 'course_trends'] };

const renderCard = (visual, props = {}, wrap = (node) => node) => render(
  <MemoryRouter>{wrap(<CourseAnswerCard visual={visual} {...props} />)}</MemoryRouter>,
);

const fakePlanner = (overrides = {}) => ({
  status: 'ready',
  view: { plan: { revision: 4 }, proposal: null },
  ensureLoaded: jest.fn(),
  proposalState: () => null,
  propose: jest.fn(() => Promise.resolve(proposal())),
  ...overrides,
});

test('course refs collapse into one card per course, in place', () => {
  const grouped = groupCourseVisuals([
    { type: 'course_gpa', course: 'COMPSCI 300', term: '1264' },
    { type: 'event_list', events: [] },
    { type: 'course_grade_distribution', course: 'compsci 300', term: '1264' },
    { type: 'course_instructors', course: 'COMPSCI 300' },
    { type: 'course_prereq_map', course: 'COMPSCI 300' },
  ]);
  expect(grouped.map((v) => v.type)).toEqual(['course_answer', 'event_list', 'course_prereq_map']);
  expect(grouped[0]).toMatchObject({
    course: 'COMPSCI 300', term: '1264', types: ['course_gpa', 'course_grade_distribution', 'course_instructors'],
  });
});

test('titles lose the catalog capitals but keep roman numerals', () => {
  expect(titleCase('PROGRAMMING II')).toBe('Programming II');
});

test('course card: band with three tiles, lecture rows with seat tags, no instructor section or bars', async () => {
  serve();
  const onSelectCourse = jest.fn();
  renderCard(COURSE, { onSelectCourse });
  expect(await screen.findByText('Programming II')).toBeInTheDocument();
  expect(screen.getByText('COMPSCI 300 · 3 credits')).toBeInTheDocument();
  expect(await screen.findByText('Instructor rating')).toBeInTheDocument();
  expect(screen.getByText('3.6')).toBeInTheDocument();
  expect(screen.getByText('Average GPA · Harder').previousSibling).toHaveTextContent('3.23');
  expect(screen.getByText('Average GPA · Harder').closest('.vc-stat')).toHaveClass('is-harder');
  expect(screen.getByText('Seats open').previousSibling).toHaveTextContent('4');

  const rows = within(screen.getByRole('list', { name: 'Sections' })).getAllByRole('listitem');
  expect(rows).toHaveLength(2); // lectures only; the lab is in the pop-up
  expect(rows[0]).toHaveTextContent('001');
  expect(rows[0]).toHaveTextContent('Williams');
  expect(within(rows[0]).getByText('4 seats')).toHaveClass('crs-tag--seats');
  expect(within(rows[1]).getByText('4 waiting')).toHaveClass('crs-tag--waiting');

  expect(screen.queryByText('Jim Williams')).not.toBeInTheDocument();
  expect(screen.queryByText(/quality/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Grades/)).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Open in Courses/ })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Programming II' }));
  expect(onSelectCourse).toHaveBeenCalledWith('COMPSCI 300');
});

test('course card leaves out tiles without data, and snapshot seats read enrolled of capacity', async () => {
  serve({ 'ECON 3010': UVA });
  renderCard({ type: 'course_answer', course: 'ECON 3010', types: ['course_schedule'] });
  expect(await screen.findByText('Average GPA · Typical')).toBeInTheDocument();
  expect(screen.queryByText('Seats open')).not.toBeInTheDocument();
  expect(screen.queryByText('Instructor rating')).not.toBeInTheDocument();
  expect(document.querySelector('.vc-stats').style.getPropertyValue('--vc-stats')).toBe('1');
  const tag = screen.getByText('41 of 60 · Fall 2025');
  expect(tag).toHaveClass('crs-tag--snapshot');
  expect(tag).not.toHaveClass('crs-tag--seats');
  expect(screen.getByText('MoWe 2:00–3:15')).toBeInTheDocument();
});

test('course card footer: Add to plan proposes the course and shows the proposal; Save saves it', async () => {
  serve();
  const planner = fakePlanner();
  const save = jest.fn(() => Promise.resolve({}));
  renderCard(COURSE, {}, (node) => (
    <PlannerContext.Provider value={planner}>
      <SavedContext.Provider value={{ count: 0, isSaved: () => false, save, unsave: jest.fn() }}>{node}</SavedContext.Provider>
    </PlannerContext.Provider>
  ));
  const saveButton = await screen.findByRole('button', { name: 'Save COMPSCI 300' });
  expect(saveButton).toHaveTextContent('Save');
  expect(saveButton).toHaveClass('vc-btn');
  fireEvent.click(saveButton);
  expect(save).toHaveBeenCalledWith({ kind: 'course', key: 'COMPSCI 300', display_name: 'COMPSCI 300' });

  const add = screen.getByRole('button', { name: /Add to plan/ });
  expect(add).toHaveClass('is-primary');
  fireEvent.click(add);
  expect(planner.propose).toHaveBeenCalledWith([{ op: 'add', course: 'COMPSCI 300' }]);
  expect(await screen.findByText('Proposed change')).toBeInTheDocument();
});

test('course card: a failed Add to plan says so in ink with an icon', async () => {
  serve();
  const planner = fakePlanner({ propose: jest.fn(() => Promise.reject(new Error('boom'))) });
  renderCard(COURSE, {}, (node) => <PlannerContext.Provider value={planner}>{node}</PlannerContext.Provider>);
  fireEvent.click(await screen.findByRole('button', { name: /Add to plan/ }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
});

test('outside a planner the course card has no Add to plan', async () => {
  serve();
  renderCard(COURSE);
  await screen.findByText('Programming II');
  expect(screen.queryByRole('button', { name: /Add to plan/ })).not.toBeInTheDocument();
});

test('difficulty card: GPA, A and class size tiles (no Finished), bars scaled to the largest group, no footer', async () => {
  serve();
  renderCard(GRADES);
  expect(await screen.findByText('Average GPA')).toBeInTheDocument();
  expect(adapter.calls).toEqual([{ kind: 'course', id: 'COMPSCI 300' }]);
  expect(screen.getByText('Average GPA').nextSibling).toHaveClass('is-harder');
  expect(screen.getByText('Got an A').nextSibling).toHaveTextContent('50%');
  expect(screen.getByText('Class size').nextSibling).toHaveTextContent('100');
  expect(screen.queryByText('Finished')).not.toBeInTheDocument();
  expect(screen.queryByText('D or F')).not.toBeInTheDocument();
  expect(document.querySelector('.vc-kpis').style.getPropertyValue('--vc-kpis')).toBe('3');

  // Caption without GPA or students.
  expect(screen.getByText('Grades, Spring 2026')).toBeInTheDocument();
  expect(screen.queryByText(/GPA 3\.23/)).not.toBeInTheDocument();
  expect(screen.queryByText(/students/)).not.toBeInTheDocument();

  // UW groups: A, AB, B, C, D/F (D and F merged); A, the largest, fills the box in signal.
  const bars = screen.getByRole('figure', { name: 'A 50%, AB 20%, B 20%, C 5%, D/F 5%' });
  const items = within(bars).getAllByRole('listitem');
  expect(items.map((li) => li.querySelector('.crs-bar-label').textContent)).toEqual(['A', 'AB', 'B', 'C', 'D/F']);
  expect(items[0]).toHaveClass('is-top');
  expect(items[0].querySelector('.crs-bar-fill').style.height).toBe('100%');
  expect(items[1].querySelector('.crs-bar-fill').style.height).toBe('40%');
  expect(bars.querySelector('ol').style.getPropertyValue('--crs-bars-h')).toBe('110px');

  expect(screen.getByRole('img', { name: 'Fall 2025 3.10, Spring 2026 3.23' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Course page/ })).not.toBeInTheDocument();
});

test('difficulty card at UVA: A, B, C and DFW bars', async () => {
  serve({ 'ECON 3010': UVA });
  renderCard({ type: 'course_answer', course: 'ECON 3010', types: ['course_grade_distribution'] });
  const bars = await screen.findByRole('figure');
  expect([...bars.querySelectorAll('.crs-bar-label')].map((el) => el.textContent)).toEqual(['A', 'B', 'C', 'DFW']);
  expect(bars.querySelector('.is-top .crs-bar-label')).toHaveTextContent('B');
});

test('loading shows the card layout in raised; a failed card offers Retry', async () => {
  let down = true;
  serve({ 'COMPSCI 300': () => (down ? new Error('Course details are unavailable right now.') : PAYLOAD) });
  renderCard(GRADES);
  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  const retry = await screen.findByRole('button', { name: /Retry/ });
  expect(screen.getByText('Course details are unavailable right now.')).toBeInTheDocument();
  down = false;
  fireEvent.click(retry);
  expect(await screen.findByText('Average GPA')).toBeInTheDocument();
});

test('sources name each feed the cards came from', () => {
  const lines = sourceLines([
    { type: 'course_answer', course: 'COMPSCI 300', types: ['course_gpa', 'course_instructors'] },
    { type: 'event_list', events: [{ calendar: 'UW–Madison Today' }, { calendar: 'UW–Madison Today' }] },
    { type: 'place_card', places: [{ map_url: 'https://www.openstreetmap.org/?mlat=1' }] },
  ], PAYLOAD.source);
  expect(lines.map((l) => `${l.label}: ${l.name}`)).toEqual([
    'Grades: UW Course Map',
    'Instructor ratings: Rate My Professors',
    'Events: UW–Madison Today calendar',
    'Map: OpenStreetMap contributors',
  ]);
});
