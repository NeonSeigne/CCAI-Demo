import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import CourseMetricCard, { CourseMetricsRow } from './CourseMetricCard';
import CourseSimilarCourses from './CourseSimilarCourses';
import CourseSchedule from './CourseSchedule';
import CourseInstructors from './CourseInstructors';

const payload = {
  course: {
    course_reference: { subjects: ['MUSIC'], course_number: 113 },
    cumulative_grade_data: {
      total: 100, a: 80, ab: 5, b: 5, bc: 0, c: 3, d: 2, f: 5,
      passed: 0, satisfactory: 0, credit: 0,
    },
    term_data: {
      1254: {
        grade_data: {
          total: 20, a: 18, ab: 1, b: 0, bc: 0, c: 0, d: 0, f: 1,
          passed: 0, satisfactory: 0, credit: 0,
        },
      },
    },
  },
  selected_term: '1254',
  selected_term_label: 'Spring 2025',
  similar_courses: [{
    course_reference: { subjects: ['MUSIC'], course_number: 269 },
    course_title: 'STRING ENSEMBLE',
    description: 'Ensemble literature.',
  }],
  meetings: [{
    name: 'LEC 001',
    type: 'CLASS',
    start_time: Date.UTC(2026, 0, 1, 15),
    end_time: Date.UTC(2026, 0, 1, 16),
    instructors: ['Tom Curry'],
    location: { building: 'Humanities', room: '2340' },
  }],
  instructors: [{
    name: 'Johanna Wienholts',
    email: 'teacher@wisc.edu',
    rmp_data: { average_rating: 4.8 },
  }],
};

describe('shared course cards', () => {
  it('renders metric cards from a hydrated payload', () => {
    render(<CourseMetricsRow payload={payload} />);
    expect(screen.getByText('Grade Point Average')).toBeInTheDocument();
    expect(screen.getByText('Completion Rate')).toBeInTheDocument();
    expect(screen.getByText('A Rate')).toBeInTheDocument();
    expect(screen.getByText('Class Size')).toBeInTheDocument();
  });

  it('renders a standalone metric card', () => {
    render(
      <CourseMetricCard
        label="Grade Point Average"
        value="3.80"
        current={3.8}
        historical={3.5}
      />,
    );
    expect(screen.getByText('3.80')).toBeInTheDocument();
  });

  it('navigates similar courses', () => {
    const onCourse = jest.fn();
    render(<CourseSimilarCourses courses={payload.similar_courses} onCourse={onCourse} />);
    fireEvent.click(screen.getByRole('button', { name: /string ensemble/i }));
    expect(onCourse).toHaveBeenCalledWith('MUSIC 269');
  });

  it('renders schedule meetings', () => {
    render(<CourseSchedule meetings={payload.meetings} courseName="MUSIC 113" />);
    expect(screen.getByText('LEC 001')).toBeInTheDocument();
    expect(screen.getByText(/Tom Curry/)).toBeInTheDocument();
  });

  it('renders instructor cards', () => {
    render(
      <CourseInstructors
        instructors={payload.instructors}
        termLabel="Spring 2025"
        limit={3}
        showKeywords={false}
      />,
    );
    expect(screen.getByText('Johanna Wienholts')).toBeInTheDocument();
    expect(screen.getByText('4.8')).toBeInTheDocument();
  });
});
