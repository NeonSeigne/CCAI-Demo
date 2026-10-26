import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CourseVisualCard from './CourseVisualCard';
import useCourseDetail from '../../hooks/useCourseDetail';

jest.mock('../../hooks/useCourseDetail');
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ authToken: 'token' }),
}));
jest.mock('../course/CourseMetricCard', () => ({
  CourseMetricFromPayload: ({ metricType }) => <div>{metricType}</div>,
}));
jest.mock('../course/CourseVisuals', () => ({
  CourseGradeDistribution: () => <div>grade distribution</div>,
  CoursePrereqMap: () => <div>prereq map</div>,
  CourseTrends: () => <div>trends</div>,
}));
jest.mock('../course/CourseSimilarCourses', () => () => <div>similar</div>);
jest.mock('../course/CourseSchedule', () => () => <div>schedule</div>);
jest.mock('../course/CourseInstructors', () => () => <div>instructors</div>);

const payload = {
  course: {
    course_reference: { subjects: ['MUSIC'], course_number: 113 },
    cumulative_grade_data: { total: 10, a: 8 },
    term_data: {},
  },
  selected_term: '1254',
  selected_term_label: 'Spring 2025',
  similar_courses: [],
  meetings: [],
  instructors: [],
  prerequisite_graph: [],
  terms: { 1254: 'Spring 2025' },
};

describe('CourseVisualCard', () => {
  it('shows loading state while hydrating', () => {
    useCourseDetail.mockReturnValue({
      data: null, error: null, loading: true, retry: jest.fn(),
    });
    render(
      <MemoryRouter>
        <CourseVisualCard visual={{ type: 'course_gpa', course: 'MUSIC 113' }} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/loading course card/i)).toBeInTheDocument();
  });

  it('renders the hydrated metric card', () => {
    useCourseDetail.mockReturnValue({
      data: payload, error: null, loading: false, retry: jest.fn(),
    });
    render(
      <MemoryRouter>
        <CourseVisualCard visual={{ type: 'course_gpa', course: 'MUSIC 113' }} />
      </MemoryRouter>,
    );
    expect(screen.getByText('course_gpa')).toBeInTheDocument();
  });

  it('exposes retry on error', () => {
    const retry = jest.fn();
    useCourseDetail.mockReturnValue({
      data: null,
      error: { message: 'Course details unavailable.' },
      loading: false,
      retry,
    });
    render(
      <MemoryRouter>
        <CourseVisualCard visual={{ type: 'course_schedule', course: 'MUSIC 113' }} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(retry).toHaveBeenCalled();
  });
});
