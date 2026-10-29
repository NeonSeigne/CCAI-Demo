import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  MemoryRouter, Route, Routes, useLocation, useNavigationType,
} from 'react-router-dom';
import CoursesPage from './CoursesPage';
import { SavedContext } from '../contexts/SavedContext';
import { PlannerContext } from '../contexts/PlannerContext';
import { getCatalogCourse, getCatalogStarters, searchCatalog } from '../api/campus';
import {
  CU_CAPS, CU_SOURCE, UVA_CAPS, UVA_SOURCE, UW_CAPS, UW_SOURCE, cuCourse, row, uvaCourse, uwCourse,
} from './__fixtures__/catalog';

jest.mock('../api/campus', () => ({
  ...jest.requireActual('../api/campus'),
  searchCatalog: jest.fn(),
  getCatalogStarters: jest.fn(),
  getCatalogCourse: jest.fn(),
}));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token' }) }));
let mockSchool = 'UW–Madison';
jest.mock('../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({ config: { app: { institution: mockSchool } } }),
}));
jest.mock('../components/catalog/CampusPageShell', () => ({ children, className }) => (
  <main id="main-content" className={className}>{children}</main>
));
jest.mock('../components/planner/degree/DegreeBoard', () => ({ head }) => (
  <div data-testid="degree-board">{head}</div>
));
jest.mock('../components/planner/semester/SemesterView', () => ({ term }) => (
  <div data-testid="semester-view">{term}</div>
));

const UW_STARTERS = [
  row('COMP SCI 300', 'Programming II', { gpa: 3.17 }),
  row('COMP SCI 400', 'Programming III', { gpa: 3.42 }),
  row('COMP SCI 354', 'Machine Organization', { gpa: 3.13 }),
  row('MATH 222', 'Calculus 2', { gpa: 2.62 }),
  row('STAT 240', 'Data Science Modeling I', { gpa: 3.03 }),
];

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
      {location.state ? JSON.stringify(location.state) : ''}
    </output>
  );
}

function renderPage({ path = '/courses', savedItems = [] } = {}) {
  const saved = { items: savedItems, count: savedItems.length, isSaved: () => false, save: jest.fn(), unsave: jest.fn() };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SavedContext.Provider value={saved}>
        <Routes>
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="*" element={null} />
        </Routes>
        <LocationProbe />
      </SavedContext.Provider>
    </MemoryRouter>,
  );
}

const uwStarters = (courses = UW_STARTERS) => {
  getCatalogStarters.mockResolvedValue({ courses, capabilities: UW_CAPS, source: UW_SOURCE });
  getCatalogCourse.mockImplementation((token, id) => {
    const found = UW_STARTERS.find((course) => course.identifier === id);
    return Promise.resolve(uwCourse(id, found?.title || 'Course', found?.gpa));
  });
};

const checkbox = (code) => screen.getByRole('checkbox', { name: new RegExp(code) });

beforeEach(() => {
  mockSchool = 'UW–Madison';
  window.sessionStorage.clear();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

test('before a search it lists the starters and saved courses under "Start with" and previews the first', async () => {
  uwStarters(UW_STARTERS.slice(0, 2));
  renderPage({ savedItems: [{ kind: 'course', key: 'MATH 222', display_name: 'MATH 222 Calculus 2' }, { kind: 'event', key: 'e1' }] });

  expect(await screen.findByRole('heading', { name: 'Start with' })).toBeInTheDocument();
  expect(await screen.findByRole('checkbox', { name: 'Compare COMP SCI 300 Programming II' })).toBeInTheDocument();
  expect(checkbox('COMP SCI 400')).toBeInTheDocument();
  expect(checkbox('MATH 222 Calculus 2')).toBeInTheDocument();
  expect(searchCatalog).not.toHaveBeenCalled();

  expect(await screen.findByRole('heading', { level: 2, name: 'Programming II' })).toBeInTheDocument();
  expect(getCatalogCourse).toHaveBeenCalledWith('token', 'COMP SCI 300', expect.anything());
  expect(screen.getByText('Taught by Jim Williams')).toBeInTheDocument();
  expect(screen.getByText('Grades, Spring 2026 · 486 students')).toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Grade distribution, Spring 2026 · 486 students' })).toHaveTextContent('A 25%');
  expect(screen.getByRole('heading', { name: 'Spring 2027 lectures' })).toBeInTheDocument();
  expect(screen.getByText('Full')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Preview COMP SCI 400' })).toBeInTheDocument();
  expect(screen.getByText(/Grades, seats and requirements from UW Course Map/)).toBeInTheDocument();
});

test('search waits 300 ms after typing stops and cancels a superseded request', async () => {
  jest.useFakeTimers();
  uwStarters();
  const signals = [];
  searchCatalog.mockImplementation((token, params, { signal }) => {
    signals.push(signal);
    if (params.q === 'comp') return new Promise(() => {});
    return Promise.resolve({ courses: [row('COMP SCI 577', 'Algorithms')], capabilities: UW_CAPS, source: UW_SOURCE, as_of: null });
  });
  renderPage();
  await screen.findByRole('heading', { name: 'Start with' });

  const input = screen.getByRole('searchbox', { name: 'Search courses' });
  fireEvent.change(input, { target: { value: 'c' } });
  fireEvent.change(input, { target: { value: 'co' } });
  fireEvent.change(input, { target: { value: 'comp' } });
  act(() => { jest.advanceTimersByTime(299); });
  expect(searchCatalog).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(1); });
  expect(searchCatalog).toHaveBeenCalledTimes(1);
  expect(searchCatalog.mock.calls[0][1]).toMatchObject({ q: 'comp' });

  fireEvent.change(input, { target: { value: 'comp sci' } });
  act(() => { jest.advanceTimersByTime(300); });
  expect(searchCatalog).toHaveBeenCalledTimes(2);
  expect(signals[0].aborted).toBe(true);
  expect(signals[1].aborted).toBe(false);
  expect(await screen.findByRole('checkbox', { name: /COMP SCI 577/ })).toBeInTheDocument();
});

test('ticks persist across searches, cap at 4, and the Compare bar shows only at 2-4', async () => {
  uwStarters();
  searchCatalog.mockResolvedValue({
    courses: [row('COMP SCI 300', 'Programming II'), row('COMP SCI 577', 'Algorithms')],
    capabilities: UW_CAPS, source: UW_SOURCE, as_of: null,
  });
  renderPage();
  await screen.findByRole('checkbox', { name: /COMP SCI 300/ });

  fireEvent.click(checkbox('COMP SCI 300'));
  expect(screen.queryByText('1 courses ticked')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Compare them' })).not.toBeInTheDocument();

  fireEvent.click(checkbox('COMP SCI 400'));
  expect(screen.getByText('2 courses ticked')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Compare/ })).toHaveTextContent('2');

  fireEvent.click(checkbox('COMP SCI 354'));
  fireEvent.click(checkbox('MATH 222'));
  expect(screen.getByText('4 courses ticked')).toBeInTheDocument();
  expect(checkbox('STAT 240')).toBeDisabled();
  expect(screen.getByText('Compare up to 4')).toBeInTheDocument();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search courses' }), { target: { value: 'algorithms' } });
  expect(await screen.findByRole('checkbox', { name: /COMP SCI 577/ })).toBeDisabled();
  expect(checkbox('COMP SCI 300')).toBeChecked();
  ['COMP SCI 300', 'COMP SCI 400', 'COMP SCI 354', 'MATH 222'].forEach((code) => {
    expect(screen.getByRole('button', { name: `Remove ${code} from compare` })).toBeInTheDocument();
  });

  // Removing a chip frees a slot and moves focus to the next chip.
  fireEvent.click(screen.getByRole('button', { name: 'Remove COMP SCI 400 from compare' }));
  expect(screen.getByRole('button', { name: 'Remove COMP SCI 354 from compare' })).toHaveFocus();
  expect(checkbox('COMP SCI 577')).not.toBeDisabled();
  expect(screen.getByText('3 courses ticked')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Compare them' }));
  expect(screen.getByTestId('location')).toHaveTextContent(
    '/courses/compare?ids=COMP+SCI+300%2CCOMP+SCI+354%2CMATH+222',
  );
});

test('a search with no matches says so and offers to clear filters', async () => {
  uwStarters();
  searchCatalog.mockResolvedValue({ courses: [], capabilities: UW_CAPS, source: UW_SOURCE, as_of: null });
  renderPage();
  await screen.findByRole('heading', { name: 'Start with' });
  fireEvent.click(screen.getByRole('button', { name: '300s level' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search courses' }), { target: { value: 'zzz' } });
  expect(await screen.findByText('No courses match “zzz”')).toBeInTheDocument();
  expect(searchCatalog).toHaveBeenLastCalledWith('token', expect.objectContaining({ q: 'zzz', level: 300 }), expect.anything());
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(searchCatalog).toHaveBeenLastCalledWith(
    'token', expect.objectContaining({ q: 'zzz', level: undefined }), expect.anything(),
  ));
});

test('a failed search names the source and retries', async () => {
  uwStarters();
  const { ApiError } = jest.requireActual('../api/campus');
  searchCatalog
    .mockRejectedValueOnce(new ApiError('HTTP 502', { status: 502 }))
    .mockResolvedValue({ courses: [row('COMP SCI 577', 'Algorithms')], capabilities: UW_CAPS, source: UW_SOURCE, as_of: null });
  renderPage();
  await screen.findByRole('heading', { name: 'Start with' });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search courses' }), { target: { value: 'algo' } });
  expect(await screen.findByText("Couldn't load courses from UW Course Map")).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('checkbox', { name: /COMP SCI 577/ })).toBeInTheDocument();
});

test('the seat chip shows only where search rows carry seats', async () => {
  uwStarters();
  const { unmount } = renderPage();
  await screen.findByRole('heading', { level: 2, name: 'Programming II' });
  expect(screen.queryByRole('button', { name: /open seats/i })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Any level' })).toHaveAttribute('aria-pressed', 'true');
  unmount();

  mockSchool = 'UVA';
  getCatalogStarters.mockResolvedValue({ courses: [row('CS 2100', 'Data Structures and Algorithms 1')], capabilities: UVA_CAPS, source: UVA_SOURCE });
  getCatalogCourse.mockResolvedValue(uvaCourse());
  renderPage();
  expect(await screen.findByRole('button', { name: 'Had open seats (Sep 3)' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '2000s level' })).toBeInTheDocument();
});

test('UVA shows historical seats as of the snapshot and "Not available" for prerequisites', async () => {
  mockSchool = 'UVA';
  getCatalogStarters.mockResolvedValue({ courses: [row('CS 2100', 'Data Structures and Algorithms 1')], capabilities: UVA_CAPS, source: UVA_SOURCE });
  getCatalogCourse.mockResolvedValue(uvaCourse());
  renderPage();
  expect(await screen.findByRole('heading', { name: 'Fall 2026 · as of Sep 3' })).toBeInTheDocument();
  expect(screen.getByText('12 open')).toBeInTheDocument();
  expect(screen.getByText('got A range')).toBeInTheDocument();
  expect(screen.getByText('got DFW')).toBeInTheDocument();
  expect(screen.getAllByText('Not available for UVA (theCourseForum)')).toHaveLength(2);
  expect(screen.getByText(/from theCourseForum · as of Sep 3/)).toBeInTheDocument();
});

test('CU shows "Not available" tiles and lines and says seats are not published', async () => {
  mockSchool = 'CU Boulder';
  getCatalogStarters.mockResolvedValue({ courses: [row('CSCI 1300', 'Computer Science 1')], capabilities: CU_CAPS, source: CU_SOURCE });
  getCatalogCourse.mockResolvedValue(cuCourse());
  renderPage();
  const preview = within(await screen.findByRole('article'));
  expect(preview.getAllByText('Not available')).toHaveLength(3);
  expect(preview.getByText('avg GPA')).toBeInTheDocument();
  // Grades, prerequisites, often taken next.
  expect(preview.getAllByText('Not available for CU Boulder (CU Boulder Class Search)')).toHaveLength(3);
  expect(preview.getByRole('heading', { name: 'Spring 2026 sections, seats not published' })).toBeInTheDocument();
  expect(preview.getByText('REC 110')).toBeInTheDocument();
  expect(preview.queryByText(/left$/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /open seats/i })).not.toBeInTheDocument();
});

test('Ask about it opens a new chat with the prompt filled in, not sent', async () => {
  uwStarters();
  renderPage();
  await screen.findByRole('heading', { level: 2, name: 'Programming II' });
  fireEvent.click(screen.getByRole('button', { name: 'Ask about it COMP SCI 300' }));
  const location = screen.getByTestId('location').textContent;
  expect(location).toContain('/chat');
  const state = JSON.parse(location.slice(location.indexOf('{')));
  expect(state).toEqual({
    startNew: true,
    pendingPrompt: 'Tell me about COMP SCI 300 Programming II: how hard is it and what should I know?',
  });
  expect(state.autoSend).toBeUndefined();
});

test('?selected= previews that course first', async () => {
  uwStarters();
  renderPage({ path: '/courses?selected=COMP%20SCI%20400' });
  expect(await screen.findByRole('heading', { level: 2, name: 'Programming III' })).toBeInTheDocument();
  expect(getCatalogCourse.mock.calls[0][1]).toBe('COMP SCI 400');
  await screen.findByRole('checkbox', { name: /COMP SCI 300/ });
  expect(screen.getByRole('heading', { level: 2, name: 'Programming III' })).toBeInTheDocument();
});

test('a preview that fails to load says where from and retries', async () => {
  uwStarters();
  const { ApiError } = jest.requireActual('../api/campus');
  getCatalogCourse.mockRejectedValueOnce(new ApiError('HTTP 502', { status: 502 }));
  renderPage();
  expect(await screen.findByText("Couldn't load COMP SCI 300 from UW Course Map")).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('heading', { level: 2, name: 'Programming II' })).toBeInTheDocument();
});

test('the Browse tab is selected and ticks restore from an earlier visit', async () => {
  window.sessionStorage.setItem('cc.courses.ticked', JSON.stringify([
    { identifier: 'COMP SCI 300', title: 'Programming II' },
    { identifier: 'COMP SCI 400', title: 'Programming III' },
  ]));
  uwStarters();
  renderPage();
  expect(screen.getByRole('tab', { name: 'Browse' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: /Compare/ })).toHaveAttribute('aria-selected', 'false');
  expect(screen.getByText('2 courses ticked')).toBeInTheDocument();
  expect(await screen.findByRole('checkbox', { name: /COMP SCI 400/ })).toBeChecked();
});

function NavTypeProbe() {
  return <output data-testid="nav-type">{useNavigationType()}</output>;
}

describe('Browse | My degree (D5)', () => {
  const plannerWith = (courses, status = 'ready') => ({
    status,
    view: { plan: { revision: 1, term: 'Spring 2027', courses, profile: {} } },
    ensureLoaded: jest.fn(),
  });

  const renderWithPlanner = (planner, path = '/courses') => render(
    <MemoryRouter initialEntries={[path]}>
      <PlannerContext.Provider value={planner}>
        <SavedContext.Provider value={{ items: [], count: 0, isSaved: () => false }}>
          <Routes>
            <Route path="/courses" element={<CoursesPage />} />
          </Routes>
          <LocationProbe />
          <NavTypeProbe />
        </SavedContext.Provider>
      </PlannerContext.Provider>
    </MemoryRouter>,
  );

  test('opens in Browse while the plan is empty', async () => {
    uwStarters();
    const planner = plannerWith([]);
    renderWithPlanner(planner);
    expect(planner.ensureLoaded).toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: 'Browse' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('degree-board')).not.toBeInTheDocument();
    await screen.findByRole('checkbox', { name: /COMP SCI 300/ });
  });

  test('opens in My degree once the plan has a course', () => {
    renderWithPlanner(plannerWith([{ id: 'ECON 3020', term: 'Spring 2027' }]));
    expect(screen.getByTestId('degree-board')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'My degree' })).toHaveAttribute('aria-selected', 'true');
    expect(getCatalogStarters).not.toHaveBeenCalled();
  });

  test('waits for the plan before choosing', () => {
    renderWithPlanner(plannerWith([], 'loading'));
    expect(screen.queryByTestId('degree-board')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Browse' })).not.toBeInTheDocument();
  });

  test('an explicit ?view= wins', async () => {
    uwStarters();
    renderWithPlanner(plannerWith([{ id: 'ECON 3020', term: 'Spring 2027' }]), '/courses?view=browse');
    expect(screen.getByRole('tab', { name: 'Browse' })).toHaveAttribute('aria-selected', 'true');
    await screen.findByRole('checkbox', { name: /COMP SCI 300/ });
  });

  test('the tabs switch views through ?view=', async () => {
    uwStarters();
    renderWithPlanner(plannerWith([]));
    fireEvent.click(screen.getByRole('tab', { name: 'My degree' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/courses?view=degree');
    expect(screen.getByTestId('degree-board')).toBeInTheDocument();
  });

  test('?view=semester renders the semester view for the term', async () => {
    renderWithPlanner(plannerWith([]), '/courses?view=semester&term=Fall%202027');
    expect(await screen.findByTestId('semester-view')).toHaveTextContent('Fall 2027');
  });

  test('clicking a Browse row previews it inline and replaces ?selected=, without ?course=', async () => {
    uwStarters();
    renderWithPlanner(plannerWith([]));
    fireEvent.click(await screen.findByRole('button', { name: /^COMP SCI 400 Programming III/ }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Programming III' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('selected=COMP+SCI+400');
    expect(screen.getByTestId('location')).not.toHaveTextContent('course=');
    expect(screen.getByTestId('nav-type')).toHaveTextContent('REPLACE');
  });

  test('Details in the preview opens the course pop-up with a pushed ?course=', async () => {
    uwStarters();
    renderWithPlanner(plannerWith([]));
    fireEvent.click(await screen.findByRole('button', { name: 'Details COMP SCI 300' }));
    expect(screen.getByTestId('location')).toHaveTextContent('course=COMP+SCI+300');
    expect(screen.getByTestId('nav-type')).toHaveTextContent('PUSH');
  });

  test('a ?selected= link lands in Browse even when the plan has courses', async () => {
    uwStarters();
    renderWithPlanner(plannerWith([{ id: 'ECON 3020', term: 'Spring 2027' }]), '/courses?selected=COMP%20SCI%20400');
    expect(screen.getByRole('tab', { name: 'Browse' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('heading', { level: 2, name: 'Programming III' })).toBeInTheDocument();
  });

  test('Browse rows are drag sources with a labelled grip', async () => {
    uwStarters();
    renderWithPlanner(plannerWith([]));
    const grip = await screen.findByRole('button', { name: 'Drag COMP SCI 300' });
    expect(grip).toHaveAttribute('aria-roledescription', 'draggable');
  });
});
