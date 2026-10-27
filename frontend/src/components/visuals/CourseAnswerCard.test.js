import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CourseAnswerCard, { groupCourseVisuals, titleCase } from './CourseAnswerCard';
import { sourceLines } from './AnswerSources';
import useCourseDetail from '../../hooks/useCourseDetail';
import { SavedContext } from '../../contexts/SavedContext';

jest.mock('../../hooks/useCourseDetail');
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token' }) }));

const PAYLOAD = {
  source: { name: 'UW Course Map', url: 'https://uwcourses.com' },
  selected_term: '1264',
  selected_term_label: 'Spring 2026',
  course: {
    course_reference: { subjects: ['COMPSCI'], course_number: 300 },
    course_title: 'PROGRAMMING II',
    term_data: { 1264: { grade_data: { a: 50, ab: 20, b: 20, bc: 0, c: 5, d: 3, f: 2, total: 100 } } },
  },
  instructors: [
    { name: 'Jim Williams', rmp_data: { average_rating: 2.98, average_difficulty: 3.39, num_ratings: 155 } },
    { name: 'Another Person' },
  ],
  meetings: [
    { name: 'LEC 001', current_enrollment: 146, location: { capacity: 150 } },
    { name: 'LEC 003', current_enrollment: 64, location: { capacity: 60 } },
  ],
};

const renderCard = (visual, props = {}) => render(
  <MemoryRouter><CourseAnswerCard visual={visual} {...props} /></MemoryRouter>,
);

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

test('course card shows grades, the top-rated instructor and seats', () => {
  useCourseDetail.mockReturnValue({ data: PAYLOAD, error: null, loading: false, retry: jest.fn() });
  const onSelectCourse = jest.fn();
  renderCard(
    { type: 'course_answer', course: 'COMPSCI 300', types: ['course_grade_distribution', 'course_instructors', 'course_schedule'] },
    { onSelectCourse },
  );
  expect(screen.getByText('Programming II')).toBeInTheDocument();
  expect(screen.getByText('Grades, Spring 2026')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /A 50%, AB 20%, B 20%, C 5%, D 3%, F 2%/ })).toBeInTheDocument();
  expect(screen.getByText('Jim Williams')).toBeInTheDocument();
  expect(screen.getByText(/3\.0 quality · 3\.4 difficulty · 155 reviews/)).toBeInTheDocument();
  expect(screen.getByText('4 left')).toBeInTheDocument();
  expect(screen.getByText('Full')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Course page' }));
  expect(onSelectCourse).toHaveBeenCalledWith('COMPSCI 300');
});

test('grades-only answers leave out instructor and seats', () => {
  useCourseDetail.mockReturnValue({ data: PAYLOAD, error: null, loading: false, retry: jest.fn() });
  renderCard({ type: 'course_answer', course: 'COMPSCI 300', types: ['course_gpa'] });
  expect(screen.getByText(/GPA 3\.43/)).toBeInTheDocument();
  expect(screen.queryByText('Jim Williams')).not.toBeInTheDocument();
  expect(screen.queryByText('Seats')).not.toBeInTheDocument();
});

test('failed course card offers a retry', () => {
  const retry = jest.fn();
  useCourseDetail.mockReturnValue({ data: null, error: new Error('Course details are unavailable right now.'), loading: false, retry });
  renderCard({ type: 'course_answer', course: 'COMPSCI 300', types: ['course_gpa'] });
  fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
  expect(retry).toHaveBeenCalled();
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

test('course card saves the course and opens it in Courses', () => {
  useCourseDetail.mockReturnValue({ data: PAYLOAD, error: null, loading: false, retry: jest.fn() });
  const save = jest.fn(() => Promise.resolve({}));
  render(
    <MemoryRouter>
      <SavedContext.Provider value={{ count: 0, isSaved: () => false, save, unsave: jest.fn() }}>
        <CourseAnswerCard visual={{ type: 'course_answer', course: 'COMPSCI 300', types: ['course_gpa'] }} />
      </SavedContext.Provider>
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: /Open in Courses/ })).toHaveAttribute('href', '/courses?selected=COMPSCI%20300');
  const button = screen.getByRole('button', { name: 'Save COMPSCI 300' });
  expect(button).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(button);
  expect(save).toHaveBeenCalledWith({ kind: 'course', key: 'COMPSCI 300', display_name: 'COMPSCI 300' });
});
