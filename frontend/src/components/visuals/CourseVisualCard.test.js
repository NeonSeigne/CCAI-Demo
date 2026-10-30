import React from 'react';
import {
  fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CourseVisualCard from './CourseVisualCard';
import { memoryAdapter, setCourseAdapter } from '../../modules/course';
import { PlannerContext } from '../../contexts/PlannerContext';
import { cuPopupCourse, uvaPopupCourse, uwPopupCourse } from '../../pages/__fixtures__/popups';

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ authToken: 'token' }),
}));

const serve = (data, ratings = { ratings: [] }) => setCourseAdapter(memoryAdapter({
  courses: { [data.identifier]: data }, ratings: { [data.identifier]: ratings },
}));

const renderCard = (visual, props) => render(
  <MemoryRouter><CourseVisualCard visual={visual} {...props} /></MemoryRouter>,
);

afterEach(() => setCourseAdapter(null));

describe('CourseVisualCard', () => {
  it('shows loading state while hydrating', () => {
    setCourseAdapter(memoryAdapter({ courses: { 'COMP SCI 400': () => new Promise(() => {}) } }));
    renderCard({ type: 'course_gpa', course: 'COMP SCI 400' });
    expect(screen.getByText(/loading course card/i)).toBeInTheDocument();
  });

  it('renders the GPA from the catalog summary with the pop-up label', async () => {
    serve(uwPopupCourse());
    renderCard({ type: 'course_gpa', course: 'COMP SCI 400' });
    expect(await screen.findByText('Avg GPA · Spring 2026')).toBeInTheDocument();
    expect(screen.getByText('3.41')).toBeInTheDocument();
  });

  it('renders GPA by term, the prerequisite web and sections', async () => {
    serve(uwPopupCourse());
    const { unmount } = renderCard({ type: 'course_trends', course: 'COMP SCI 400' });
    expect(await screen.findByRole('heading', { name: 'Average GPA by term' })).toBeInTheDocument();
    unmount();

    const onSelectCourse = jest.fn();
    const web = renderCard({ type: 'course_prereq_map', course: 'COMP SCI 400' }, { onSelectCourse });
    fireEvent.click(screen.getByRole('button', { name: 'MATH 240' }));
    expect(onSelectCourse).toHaveBeenCalledWith('MATH 240');
    web.unmount();

    renderCard({ type: 'course_schedule', course: 'COMP SCI 400' });
    expect(screen.getByText('LEC 001')).toBeInTheDocument();
  });

  it('marks prerequisites the plan has done', async () => {
    serve(uwPopupCourse());
    const planner = { view: { plan: { profile: { completed: [{ id: 'MATH 240' }] }, courses: [] } }, ensureLoaded: jest.fn() };
    render(
      <MemoryRouter>
        <PlannerContext.Provider value={planner}>
          <CourseVisualCard visual={{ type: 'course_prereq_map', course: 'COMP SCI 400' }} />
        </PlannerContext.Provider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Prerequisites for COMP SCI 400' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'MATH 240' })).toHaveAccessibleDescription('done');
    expect(screen.getByRole('group', { name: 'One of' })).toBeInTheDocument();
    expect(planner.ensureLoaded).toHaveBeenCalled();
  });

  it('renders UVA grades by instructor, with ratings when they arrive', async () => {
    serve(uvaPopupCourse(), { ratings: [{ name: 'Ada Byron', rating: 4.2, num_ratings: 9 }] });
    renderCard({ type: 'course_instructors', course: 'CS 2100' });
    expect(await screen.findByText('Ada Byron')).toBeInTheDocument();
    expect(await screen.findByText('★ 4.2')).toBeInTheDocument();
  });

  it('renders nothing for data the school lacks', async () => {
    serve(cuPopupCourse());
    const { container } = renderCard({ type: 'course_gpa', course: 'CSCI 1300' });
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    await waitFor(() => expect(container.querySelector('.advisor-course-visual')).toBeEmptyDOMElement());
  });

  it('exposes retry on error', async () => {
    let down = true;
    setCourseAdapter(memoryAdapter({
      courses: { 'MUSIC 113': () => (down ? Object.assign(new Error('Course details unavailable.'), { status: 503 }) : cuPopupCourse()) },
    }));
    renderCard({ type: 'course_schedule', course: 'MUSIC 113' });
    const retry = await screen.findByRole('button', { name: /retry/i });
    expect(screen.getByText('Course details unavailable.')).toBeInTheDocument();
    down = false;
    fireEvent.click(retry);
    expect(await screen.findByText('LEC 100')).toBeInTheDocument();
  });
});

describe('prerequisite card in chat', () => {
  it('draws the UVA chain from prereq_chain with the plan\'s states and "Also opens"', async () => {
    serve({
      identifier: 'ECON 4010',
      title: 'GAME THEORY',
      prerequisites: { text: 'Prerequisite: ECON 3010.', courses: [{ identifier: 'ECON 3010', title: 'Intermediate Micro' }] },
      prereq_chain: {
        root: 'ECON 4010',
        courses: [
          { id: 'ECON 4010', depth: 0, requires: ['ECON 3010'] },
          { id: 'ECON 3010', title: 'Intermediate Micro', depth: 1, requires: ['MATH 1210'] },
          { id: 'MATH 1210', title: 'Calculus I', depth: 2, requires: [] },
        ],
        complete: true,
      },
      next_courses: [{ identifier: 'ECON 4190', title: 'Industrial Org.' }],
    });
    const planner = {
      view: { plan: { profile: { completed: [{ id: 'MATH 1210' }] }, courses: [] } },
      ensureLoaded: jest.fn(),
    };
    render(
      <MemoryRouter>
        <PlannerContext.Provider value={planner}>
          <CourseVisualCard visual={{ type: 'course_prereq_map', course: 'ECON 4010' }} />
        </PlannerContext.Provider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Prerequisites for ECON 4010' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'MATH 1210' })).toHaveAccessibleDescription('done');
    // eslint-disable-next-line testing-library/no-node-access
    expect(document.querySelector('[data-from="MATH 1210"][data-to="ECON 3010"]')).toHaveClass('is-done');
    expect(screen.getByText('Also opens')).toBeInTheDocument();
  });

  it('falls back to the courses the prerequisite text names', async () => {
    serve({
      identifier: 'CS 2100',
      title: 'DATA STRUCTURES',
      prerequisites: { text: 'Prerequisite: CS 1110 or CS 1111.', courses: [{ identifier: 'CS 1110' }, { identifier: 'CS 1111' }] },
    });
    renderCard({ type: 'course_prereq_map', course: 'CS 2100' });
    expect(await screen.findByRole('heading', { name: 'Prerequisites for CS 2100' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CS 1110' })).toBeInTheDocument();
  });
});
