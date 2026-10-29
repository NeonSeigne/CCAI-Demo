import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CourseVisualCard from './CourseVisualCard';
import useCourseDetail from '../../hooks/useCourseDetail';
import { useCourseRatings } from '../../hooks/useCampusDetail';
import { cuPopupCourse, uvaPopupCourse, uwPopupCourse } from '../../pages/__fixtures__/popups';

jest.mock('../../hooks/useCourseDetail');
jest.mock('../../hooks/useCampusDetail', () => ({ useCourseRatings: jest.fn() }));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ authToken: 'token' }),
}));
jest.mock('cytoscape', () => {
  const cytoscape = jest.fn(() => ({ on: jest.fn(), destroy: jest.fn() }));
  cytoscape.use = jest.fn();
  return { __esModule: true, default: cytoscape };
});
jest.mock('cytoscape-fcose', () => ({ __esModule: true, default: {} }));

const serve = (data) => useCourseDetail.mockReturnValue({
  data, error: null, loading: false, retry: jest.fn(),
});

const renderCard = (visual, props) => render(
  <MemoryRouter><CourseVisualCard visual={visual} {...props} /></MemoryRouter>,
);

beforeEach(() => {
  useCourseRatings.mockReturnValue({ data: null, error: null, loading: false });
});

describe('CourseVisualCard', () => {
  it('shows loading state while hydrating', () => {
    useCourseDetail.mockReturnValue({
      data: null, error: null, loading: true, retry: jest.fn(),
    });
    renderCard({ type: 'course_gpa', course: 'COMP SCI 400' });
    expect(screen.getByText(/loading course card/i)).toBeInTheDocument();
  });

  it('renders the GPA from the catalog summary with the pop-up label', () => {
    serve(uwPopupCourse());
    renderCard({ type: 'course_gpa', course: 'COMP SCI 400' });
    expect(screen.getByText('Avg GPA · Spring 2026')).toBeInTheDocument();
    expect(screen.getByText('3.41')).toBeInTheDocument();
  });

  it('renders GPA by term, the prerequisite web and sections', () => {
    serve(uwPopupCourse());
    const { unmount } = renderCard({ type: 'course_trends', course: 'COMP SCI 400' });
    expect(screen.getByRole('heading', { name: 'Average GPA by term' })).toBeInTheDocument();
    unmount();

    const onSelectCourse = jest.fn();
    const web = renderCard({ type: 'course_prereq_map', course: 'COMP SCI 400' }, { onSelectCourse });
    fireEvent.click(screen.getByRole('button', { name: 'MATH 240' }));
    expect(onSelectCourse).toHaveBeenCalledWith('MATH 240');
    web.unmount();

    renderCard({ type: 'course_schedule', course: 'COMP SCI 400' });
    expect(screen.getByText('LEC 001')).toBeInTheDocument();
  });

  it('renders UVA grades by instructor, with ratings when they arrive', () => {
    serve(uvaPopupCourse());
    useCourseRatings.mockReturnValue({ data: { ratings: [{ name: 'Ada Byron', rating: 4.2, num_ratings: 9 }] } });
    renderCard({ type: 'course_instructors', course: 'CS 2100' });
    expect(screen.getByText('Ada Byron')).toBeInTheDocument();
    expect(screen.getByText('★ 4.2')).toBeInTheDocument();
  });

  it('renders nothing for data the school lacks', () => {
    serve(cuPopupCourse());
    const { container } = renderCard({ type: 'course_gpa', course: 'CSCI 1300' });
    expect(container.querySelector('.advisor-course-visual')).toBeEmptyDOMElement();
  });

  it('exposes retry on error', () => {
    const retry = jest.fn();
    useCourseDetail.mockReturnValue({
      data: null,
      error: { message: 'Course details unavailable.' },
      loading: false,
      retry,
    });
    renderCard({ type: 'course_schedule', course: 'MUSIC 113' });
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(retry).toHaveBeenCalled();
  });
});
