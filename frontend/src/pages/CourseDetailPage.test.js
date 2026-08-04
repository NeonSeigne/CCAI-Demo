import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import CourseDetailPage from './CourseDetailPage';
import useCourseDetail from '../hooks/useCourseDetail';

jest.mock('../hooks/useCourseDetail');
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ authToken: 'test-token' }),
}));
jest.mock('../components/course/CourseVisuals', () => ({
  CourseGradeDistribution: ({ termLabel }) => <div>{termLabel} grade distribution</div>,
  CoursePrereqMap: () => <div>Prerequisite graph</div>,
  CourseTrends: () => <div>Grade trends chart</div>,
  GradeDistribution: ({ termLabel }) => <div>{termLabel} grade distribution</div>,
  PrerequisiteGraph: () => <div>Prerequisite graph</div>,
  TrendsChart: () => <div>Grade trends chart</div>,
}));

const payload = {
  course: {
    course_reference: { subjects: ['MUSIC'], course_number: 113 },
    course_title: 'MUSIC IN PERFORMANCE',
    description: 'Descriptive lectures on chamber music.',
    cumulative_grade_data: { total: 100, a: 80, ab: 5, b: 5, bc: 0, c: 3, d: 2, f: 5 },
    prerequisites: { linked_requisite_text: ['None'], course_references: [] },
    satisfies: [
      { subjects: ['MUSIC'], course_number: 269 },
      { subjects: ['MUSIC'], course_number: 211 },
    ],
    term_data: {
      1254: { grade_data: { total: 20, a: 18, ab: 1, b: 0, bc: 0, c: 0, d: 0, f: 1 } },
    },
  },
  enrollment: { credit_count: [1, 1], typically_offered: 'Fall, Spring, Summer' },
  terms: { 1254: 'Spring 2025' },
  selected_term: '1254',
  selected_term_label: 'Spring 2025',
  instructors: [{ name: 'Johanna Wienholts', email: 'teacher@wisc.edu', rmp_data: { average_rating: 4.8 } }],
  similar_courses: [{
    course_reference: { subjects: ['MUSIC'], course_number: 269 },
    course_title: 'STRING ENSEMBLE',
    description: 'Performing ensemble literature.',
  }],
  meetings: [{ name: 'LEC 001', type: 'CLASS', start_time: 1769196000000, end_time: 1769199000000, instructors: ['Tom Curry'] }],
  prerequisite_graph: [],
};

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderPage(initialEntry = '/courses/MUSIC%20113') {
  useCourseDetail.mockReturnValue({ data: payload, error: null, loading: false, retry: jest.fn() });
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <Routes>
        <Route path="/courses/:courseIdentifier" element={<CourseDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CourseDetailPage', () => {
  it('renders overview details, metrics, instructors, and similar courses', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'MUSIC IN PERFORMANCE' })).toBeInTheDocument();
    expect(screen.getByText('Descriptive lectures on chamber music.')).toBeInTheDocument();
    expect(screen.getByText('Johanna Wienholts')).toBeInTheDocument();
    expect(screen.getByText('STRING ENSEMBLE')).toBeInTheDocument();
    expect(screen.getByText('Spring 2025 grade distribution')).toBeInTheDocument();
    expect(screen.getByText('What you can take next')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'MUSIC 269' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'MUSIC 211' })).toBeInTheDocument();
  });

  it('navigates next-course pills to another detail route', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'MUSIC 211' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/courses/MUSIC%20211');
  });

  it('stores tab selection in the URL and renders the schedule', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /schedule/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('?tab=schedule');
    expect(screen.getByRole('heading', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.getByText('LEC 001')).toBeInTheDocument();
  });

  it('navigates similar-course cards to another detail route', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /string ensemble/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('/courses/MUSIC%20269');
  });
});
