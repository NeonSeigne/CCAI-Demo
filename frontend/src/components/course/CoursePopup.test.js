import React from 'react';
import {
  fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import CoursePopup from './CoursePopup';
import { routeFetch } from '../../pages/__fixtures__/routeFetch';
import { cuPopupCourse, uvaPopupCourse, uwPopupCourse } from '../../pages/__fixtures__/popups';

jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token' }) }));
jest.mock('cytoscape', () => {
  const graph = { on: jest.fn(), destroy: jest.fn() };
  const cytoscape = jest.fn(() => graph);
  cytoscape.use = jest.fn();
  return { __esModule: true, default: cytoscape };
});
jest.mock('cytoscape-fcose', () => ({ __esModule: true, default: {} }));

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });

const diff = {
  credits: { before: [13, 13], after: [16, 16] },
  difficulty: { before: 'Balanced', after: 'Heavy' },
  clashes: { before: 'unknown', after: 'unknown' },
  rules: [{
    rule_id: 'core',
    title: 'Comp Sci core',
    before: { status: 'short', completed: 2, planned: 0, needed: 4 },
    after: { status: 'short', completed: 2, planned: 1, needed: 4 },
  }],
  added_courses: [{ id: 'COMP SCI 400', prereqs: { status: 'met', reason: null } }],
  unknowns: [],
};

function serve(course, { ratings = [], preview = { status: 200, body: { diff, revision: 3 } } } = {}) {
  global.fetch = routeFetch([
    ['/api/catalog/ratings/', { body: { identifier: course.identifier, ratings, source: null } }],
    ['/api/catalog/', { body: course }],
    ['/api/planner/preview', preview],
  ]);
}

it('renders the UW course with its numbers, tabs, Fits tile and prerequisite web', async () => {
  serve(uwPopupCourse(), {
    ratings: [{ name: 'Jim Williams', rating: 4.4, difficulty: 3.1, num_ratings: 52 }],
  });
  const onAdd = jest.fn();
  const onOpenCourse = jest.fn();
  render(
    <CoursePopup
      courseId="COMP SCI 400"
      term="Spring 2027"
      plan={{ revision: 3 }}
      requirements={['Comp Sci B.S. · Core']}
      onAdd={onAdd}
      onAsk={jest.fn()}
      onClose={jest.fn()}
      onOpenCourse={onOpenCourse}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'Programming III' })).toBeInTheDocument();
  expect(screen.getByText('COMP SCI 400 · 3 credits · Spring 2027')).toBeInTheDocument();
  expect(screen.getByText('Comp Sci B.S. · Core')).toBeInTheDocument();
  expect(screen.getByText('Natural Science breadth')).toBeInTheDocument();

  // Five big numbers, same labels at every school (D6).
  expect(screen.getByText('Avg GPA · Sp 26')).toBeInTheDocument();
  expect(screen.getByText('3.41')).toBeInTheDocument();
  expect(screen.getByText('Got an A')).toBeInTheDocument();
  expect(screen.getByText('D or F')).toBeInTheDocument();
  expect(screen.getByText('Seats left')).toBeInTheDocument();
  expect(screen.getByText('Students · Sp 26')).toBeInTheDocument();

  const tabs = screen.getByRole('tablist');
  expect(within(tabs).getByRole('tab', { name: 'Grades' })).toHaveAttribute('aria-selected', 'true');
  expect(within(tabs).getByRole('tab', { name: /Sections/ })).toBeInTheDocument();
  // A value on every point of the GPA line, and a text list of them (D22).
  expect(screen.getByText('Fall 2023: 2.97, 571 students')).toBeInTheDocument();

  // Ratings arrive after the band: the Instructors tab appears.
  expect(await within(tabs).findByRole('tab', { name: /Instructors/ })).toBeInTheDocument();

  expect(await screen.findByRole('heading', { name: 'Fits Spring 2027' })).toBeInTheDocument();
  expect(screen.getByRole('meter', { name: 'Credits' })).toHaveAttribute('aria-valuenow', '16');
  expect(screen.getByText('Heavy')).toBeInTheDocument();
  expect(screen.getByText('✓ Met')).toBeInTheDocument();
  expect(screen.getByText('3 of 4')).toBeInTheDocument();
  // Clash status unknown (no published times): no Clashes row (D23).
  expect(screen.queryByText('Clashes')).not.toBeInTheDocument();

  expect(screen.getByRole('heading', { name: 'Prerequisites' })).toBeInTheDocument();
  expect(screen.getByTestId('prereq-web-graph')).toBeInTheDocument();
  expect(screen.getByText('One of')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'MATH 240' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Open the full prerequisite graph' }));
  expect(screen.getAllByText('Unlocks').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'COMP SCI 537' }));
  expect(onOpenCourse).toHaveBeenCalledWith('COMP SCI 537');
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));

  fireEvent.click(screen.getByRole('button', { name: /Add to Spring 2027/ }));
  expect(onAdd).toHaveBeenCalledWith('COMP SCI 400');
});

it('renders the UVA course without Prerequisites and with grades by instructor', async () => {
  serve(uvaPopupCourse());
  render(<CoursePopup courseId="CS 2100" term="Spring 2027" />);

  expect(await screen.findByRole('heading', { name: 'Data Structures and Algorithms 1' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Prerequisites' })).not.toBeInTheDocument();
  // No plan: no Fits tile.
  expect(screen.queryByText(/^Fits/)).not.toBeInTheDocument();
  // UVA seats carry their term (D23).
  expect(screen.getByText('Seats left · Fa 26')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: /Instructors/ }));
  expect(screen.getByText('Ada Byron')).toBeInTheDocument();
  expect(screen.getByText('3.31')).toBeInTheDocument();
  expect(screen.getByText('Nate McBurney')).toBeInTheDocument();
});

it('shows no empty tiles, tabs or numbers for a CU course', async () => {
  serve(cuPopupCourse());
  const { container } = render(<CoursePopup courseId="CSCI 1300" />);

  expect(await screen.findByRole('heading', { name: /Computer Science 1/ })).toBeInTheDocument();
  expect(screen.queryByText(/Avg GPA/)).not.toBeInTheDocument();
  expect(screen.queryByText('Seats left')).not.toBeInTheDocument();
  expect(container.querySelector('.pop-numbers')).toBeNull();
  expect(screen.queryByRole('tab', { name: 'Grades' })).not.toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Sections/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.queryByRole('heading', { name: 'Prerequisites' })).not.toBeInTheDocument();
  container.querySelectorAll('.pop-tile').forEach((tile) => expect(tile.textContent.trim()).not.toBe(''));
});

it('hides the Fits tile when the preview endpoint is missing', async () => {
  serve(uwPopupCourse(), { preview: { status: 404, body: { detail: 'Not Found' } } });
  render(<CoursePopup courseId="COMP SCI 400" term="Spring 2027" plan={{ revision: 3 }} />);
  expect(await screen.findByRole('heading', { name: 'Programming III' })).toBeInTheDocument();
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/planner/preview'), expect.anything()));
  expect(screen.queryByText(/^Fits/)).not.toBeInTheDocument();
});

it('shows "Couldn\'t load · Retry" when the course request fails, and retries', async () => {
  let calls = 0;
  global.fetch = routeFetch([
    ['/api/catalog/', () => {
      calls += 1;
      return calls === 1 ? { status: 502, body: { detail: 'down' } } : { body: uwPopupCourse() };
    }],
  ]);
  render(<CoursePopup courseId="COMP SCI 400" />);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent("Couldn't load · Retry");
  fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('heading', { name: 'Programming III' })).toBeInTheDocument();
});
