import React from 'react';
import {
  fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import CoursePopup from './CoursePopup';
import { clearCourseCache } from '../../modules/course';
import { routeFetch } from '../../pages/__fixtures__/routeFetch';
import { cuPopupCourse, uvaPopupCourse, uwPopupCourse } from '../../pages/__fixtures__/popups';

jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token' }) }));

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  clearCourseCache();
});

function serve(course, { instructorRating = null } = {}) {
  global.fetch = routeFetch([
    ['/api/catalog/ratings/', { body: { identifier: course.identifier, ratings: [], source: null, instructor_rating: instructorRating } }],
    ['/api/catalog/', { body: course }],
  ]);
}

const sectionNamed = (name) => screen.getByRole('heading', { name }).closest('section');
const fetched = () => global.fetch.mock.calls.map(([url]) => String(url));

it('renders the UW course as the mockup: three tiles, grades, sections, prerequisites, footer', async () => {
  serve({ ...uwPopupCourse(), difficulty: 'harder' }, { instructorRating: { rating: 4.12, instructors: 2, term: null } });
  const onAdd = jest.fn();
  const onCompare = jest.fn();
  const onOpenCourse = jest.fn();
  const { container } = render(
    <CoursePopup
      courseId="COMP SCI 400"
      term="Spring 2027"
      states={{ 'COMP SCI 300': 'done', 'MATH 240': 'now' }}
      onAdd={onAdd}
      onCompare={onCompare}
      onSave={jest.fn()}
      onClose={jest.fn()}
      onOpenCourse={onOpenCourse}
    />,
  );

  expect(await screen.findByRole('heading', { name: 'Programming III' })).toBeInTheDocument();
  expect(screen.getByText('COMP SCI 400 · 3 credits')).toBeInTheDocument();
  // No description, requirement chips, drag grip or term in the band.
  expect(screen.queryByText(/third course/)).not.toBeInTheDocument();
  expect(screen.queryByText('Natural Science breadth')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Drag/ })).not.toBeInTheDocument();

  // Number above label. The GPA is the one the label is read from (every term), not the latest term's 3.41.
  const gpaLabel = screen.getByText('Average GPA · Harder');
  expect(gpaLabel.previousSibling).toHaveTextContent('3.29');
  expect(screen.queryByText('3.41')).not.toBeInTheDocument();
  expect(await screen.findByText('Instructor rating')).toBeInTheDocument();
  expect(screen.getByText('4.1')).toBeInTheDocument();
  expect(screen.getByText('Seats open').previousSibling).toHaveTextContent('8');
  expect(container.querySelectorAll('.crs-tile')).toHaveLength(3);
  // The rating covers the plan term's instructors (Q15).
  expect(fetched().some((url) => url.includes('/api/catalog/ratings/') && url.includes('term=Spring+2027')
    || url.includes('term=Spring%202027'))).toBe(true);

  // Grades: UW's six groups, no percentages on screen.
  const grades = sectionNamed('Grades');
  expect(within(grades).getAllByRole('listitem').map((li) => li.lastChild.textContent))
    .toEqual(['A', 'AB', 'B', 'BC', 'C', 'D/F']);
  expect(grades.querySelector('.crs-bar-pct')).toBeNull();
  expect(grades.querySelector('.crs-bars--popup .is-top')).toHaveTextContent('B');

  // Sections: code, instructor, live seat tag.
  const sections = sectionNamed('Sections');
  const rows = within(sections).getAllByRole('listitem');
  expect(rows).toHaveLength(3);
  expect(rows[0]).toHaveTextContent('001');
  expect(within(rows[0]).getByText('Jim Williams')).toBeInTheDocument();
  expect(within(rows[0]).getByText('4 seats')).toHaveClass('crs-tag--seats');
  expect(within(rows[2]).getByText('Full')).toBeInTheDocument();

  // Prerequisites: code tags with the student's states.
  const prereqs = sectionNamed('Prerequisites');
  expect(within(prereqs).getByRole('button', { name: /^COMP SCI 300.*Done/ })).toHaveClass('is-done');
  expect(within(prereqs).getByRole('button', { name: /^MATH 240.*This term/ })).toHaveClass('is-now');
  fireEvent.click(within(prereqs).getByRole('button', { name: /^COMP SCI 367/ }));
  expect(onOpenCourse).toHaveBeenCalledWith('COMP SCI 367');

  // The tabs, GPA chart, Fits column and Ask are gone.
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  expect(screen.queryByText(/Fall 2023/)).not.toBeInTheDocument();
  expect(screen.queryByText(/^Fits/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Ask' })).not.toBeInTheDocument();
  expect(fetched().some((url) => url.includes('/api/planner/preview'))).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: /Add to plan/ }));
  expect(onAdd).toHaveBeenCalledWith('COMP SCI 400');
  fireEvent.click(screen.getByRole('button', { name: /Compare/ }));
  expect(onCompare).toHaveBeenCalledWith('COMP SCI 400', 'Programming III');
  expect(screen.getByRole('button', { name: 'Save COMP SCI 400' })).toBeInTheDocument();
});

it('UVA: snapshot seats read enrolled of limit with the term, no Seats tile; DFW keeps its name', async () => {
  serve({ ...uvaPopupCourse(), difficulty: 'typical' });
  render(<CoursePopup courseId="CS 2100" term="Spring 2027" />);

  expect(await screen.findByRole('heading', { name: 'Data Structures and Algorithms 1' })).toBeInTheDocument();
  expect(screen.getByText('Average GPA · Typical').previousSibling).toHaveTextContent('3.20');
  expect(screen.queryByText('Seats open')).not.toBeInTheDocument();

  const tag = within(sectionNamed('Sections')).getByText('288 of 300 · Fall 2026');
  expect(tag).toHaveClass('crs-tag--snapshot');
  expect(screen.queryByText(/waiting|seats$/)).not.toBeInTheDocument();

  expect(within(sectionNamed('Grades')).getAllByRole('listitem').map((li) => li.lastChild.textContent))
    .toEqual(['A', 'B', 'C', 'DFW']);
});

it('hides the instructor rating tile when nobody is rated; the rest stretch', async () => {
  serve({ ...uvaPopupCourse(), difficulty: 'typical' }, { instructorRating: null });
  const { container } = render(<CoursePopup courseId="CS 2100" term="Spring 2027" />);
  await screen.findByRole('heading', { name: 'Data Structures and Algorithms 1' });
  await waitFor(() => expect(fetched().some((url) => url.includes('/api/catalog/ratings/'))).toBe(true));
  expect(screen.queryByText('Instructor rating')).not.toBeInTheDocument();
  const tiles = container.querySelector('.crs-tiles');
  expect(tiles.children).toHaveLength(1);
  expect(tiles).toHaveStyle({ '--crs-tiles': '1' });
});

it('shows no empty tiles, grades or prerequisites for a CU course', async () => {
  serve(cuPopupCourse());
  const { container } = render(<CoursePopup courseId="CSCI 1300" />);
  expect(await screen.findByRole('heading', { name: /Computer Science 1/ })).toBeInTheDocument();
  expect(container.querySelector('.crs-tiles')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Grades' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Prerequisites' })).not.toBeInTheDocument();
  const rows = within(sectionNamed('Sections')).getAllByRole('listitem');
  expect(rows[0]).toHaveTextContent('100');
  expect(rows[0].querySelector('.crs-tag')).toBeNull();
  // No plan term: no Add to plan.
  expect(screen.queryByRole('button', { name: /Add to plan/ })).not.toBeInTheDocument();
});

it('shows a not-found state with no Retry for a 404', async () => {
  global.fetch = routeFetch([['/api/catalog/', { status: 404, body: { detail: 'Course not found' } }]]);
  render(<CoursePopup courseId="NOPE 999" />);
  expect(await screen.findByText('Course not found')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
});

it("shows the sheet's error state with Retry when the course request fails, and retries", async () => {
  let calls = 0;
  global.fetch = routeFetch([
    ['/api/catalog/ratings/', { body: { ratings: [] } }],
    ['/api/catalog/', () => {
      calls += 1;
      return calls === 1 ? { status: 502, body: { detail: 'down' } } : { body: uwPopupCourse() };
    }],
  ]);
  render(<CoursePopup courseId="COMP SCI 400" />);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/Couldn.t load/);
  fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('heading', { name: 'Programming III' })).toBeInTheDocument();
});
