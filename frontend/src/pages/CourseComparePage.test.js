import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import CourseComparePage from './CourseComparePage';
import { getCatalogCourse, searchCatalog } from '../api/campus';
import { UW_CAPS, UW_SOURCE, cuCourse, row, uvaCourse, uwCourse } from './__fixtures__/catalog';

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

const COURSES = {
  'COMP SCI 300': uwCourse('COMP SCI 300', 'Programming II', 3.17),
  'COMP SCI 400': uwCourse('COMP SCI 400', 'Programming III', 3.42),
  'COMP SCI 354': uwCourse('COMP SCI 354', 'Machine Organization', 3.13),
};

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

const renderPage = (ids) => render(
  <MemoryRouter initialEntries={[`/courses/compare${ids ? `?ids=${encodeURIComponent(ids)}` : ''}`]}>
    <Routes>
      <Route path="/courses/compare" element={<CourseComparePage />} />
      <Route path="*" element={null} />
    </Routes>
    <LocationProbe />
  </MemoryRouter>,
);

beforeEach(() => {
  mockSchool = 'UW–Madison';
  window.sessionStorage.clear();
  jest.clearAllMocks();
  getCatalogCourse.mockImplementation((token, id) => Promise.resolve(COURSES[id]));
});

test('Compare is a real table with course column headers and labelled rows', async () => {
  renderPage('COMP SCI 300,COMP SCI 400');
  const table = await screen.findByRole('table', { name: 'Comparing COMP SCI 300, COMP SCI 400' });
  const t = within(table);
  expect(t.getByRole('columnheader', { name: /COMP SCI 300.*Programming II/ })).toBeInTheDocument();
  expect(t.getByRole('columnheader', { name: /COMP SCI 400.*Programming III/ })).toBeInTheDocument();
  ['Avg GPA', 'Grades', 'Got A/AB', 'Got D/F', 'Students', 'Seats'].forEach((name) => {
    expect(t.getByRole('rowheader', { name })).toBeInTheDocument();
  });
  expect(await t.findByText('3.17')).toBeInTheDocument();
  expect(t.getByText('3.42')).toBeInTheDocument();
  expect(t.getAllByText('3.29 across all terms')).toHaveLength(2);
  expect(t.getAllByText('Spring 2026').length).toBeGreaterThan(0);
  expect(t.getAllByText('8 open')).toHaveLength(2);
  expect(t.getAllByText('Spring 2027 · 3 lectures')).toHaveLength(2);
  // No "better value" marking (30A).
  expect(table.querySelector('.is-best, .is-better, [data-best]')).toBeNull();

  expect(screen.getByRole('tab', { name: /Compare/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: /Compare/ })).toHaveTextContent('2');
});

test('rows read "Not available" where a school lacks the data and name the snapshot date', async () => {
  mockSchool = 'CU Boulder';
  getCatalogCourse.mockImplementation((token, id) => Promise.resolve(id === 'CS 2100' ? uvaCourse() : cuCourse()));
  renderPage('CSCI 1300,CS 2100');
  const table = await screen.findByRole('table');
  expect(await within(table).findAllByText('Not available for CU Boulder (CU Boulder Class Search)')).toHaveLength(5);
  expect(within(table).getByText('Seats not published')).toBeInTheDocument();
  expect(within(table).getByText('Spring 2026 · 2 sections')).toBeInTheDocument();
  expect(within(table).getByText('Fall 2026 · as of Sep 3')).toBeInTheDocument();
});

test('with fewer than 2 courses it asks for more and links back to Browse', async () => {
  renderPage('COMP SCI 300');
  expect(screen.getByText('Tick at least 2 courses to compare.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to Browse' })).toHaveAttribute('href', '/courses?view=browse');
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Ask Campus Companion/ })).not.toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Add COMP SCI 400 to compare' })).toBeInTheDocument();
});

test('a column that fails to load shows its own error and retries', async () => {
  const { ApiError } = jest.requireActual('../api/campus');
  getCatalogCourse.mockImplementation((token, id) => (id === 'COMP SCI 400' && getCatalogCourse.mock.calls.length <= 2
    ? Promise.reject(new ApiError('HTTP 502', { status: 502 }))
    : Promise.resolve(COURSES[id])));
  renderPage('COMP SCI 300,COMP SCI 400');
  expect(await screen.findByText("Couldn't load COMP SCI 400 from UW Course Map")).toBeInTheDocument();
  expect(screen.getByText('3.17')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('3.42')).toBeInTheDocument();
  expect(screen.queryByText("Couldn't load COMP SCI 400 from UW Course Map")).not.toBeInTheDocument();
});

test('removing a course moves focus to the next column, then to Add a course', async () => {
  renderPage('COMP SCI 300,COMP SCI 400,COMP SCI 354');
  await screen.findByText('3.13');
  fireEvent.click(screen.getByRole('button', { name: 'Remove COMP SCI 300 from compare' }));
  expect(screen.getByRole('button', { name: 'Remove COMP SCI 400 from compare' })).toHaveFocus();
  expect(screen.getByTestId('location')).toHaveTextContent('ids=COMP+SCI+400%2CCOMP+SCI+354');

  fireEvent.click(screen.getByRole('button', { name: 'Remove COMP SCI 354 from compare' }));
  expect(screen.getByRole('searchbox', { name: 'Add a course: code or title' })).toHaveFocus();
  expect(JSON.parse(window.sessionStorage.getItem('cc.courses.ticked'))).toEqual([
    { identifier: 'COMP SCI 400', title: 'Programming III' },
  ]);
});

test('Add a course searches and adds a column', async () => {
  searchCatalog.mockResolvedValue({ courses: [row('COMP SCI 354', 'Machine Organization')], capabilities: UW_CAPS, source: UW_SOURCE });
  renderPage('COMP SCI 300,COMP SCI 400');
  await screen.findByText('3.42');
  expect(screen.getByText('Often taken after COMP SCI 300')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Add a course: code or title' }), { target: { value: 'machine' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Add COMP SCI 354 to compare' }));
  expect(await screen.findByText('3.13')).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: /COMP SCI 354/ })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('tab', { name: /Compare/ })).toHaveTextContent('3'));
});

test('the footer Ask opens a new chat with the compare prompt, not sent', async () => {
  renderPage('COMP SCI 300,COMP SCI 400');
  await screen.findByText('3.42');
  fireEvent.click(screen.getByRole('button', { name: /Ask Campus Companion/ }));
  const location = screen.getByTestId('location').textContent;
  expect(location).toContain('/chat');
  const state = JSON.parse(location.slice(location.indexOf('{')));
  expect(state).toEqual({
    startNew: true,
    pendingPrompt: 'Compare COMP SCI 300 and COMP SCI 400 for difficulty and workload.',
  });
});

test('the Browse tab goes back to Browse, and My degree is a tab too', async () => {
  renderPage('COMP SCI 300,COMP SCI 400');
  await screen.findByText('3.42');
  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Browse', 'My degree', expect.stringMatching(/^Compare/)]);
  fireEvent.click(screen.getByRole('tab', { name: 'Browse' }));
  expect(screen.getByTestId('location')).toHaveTextContent(/^\/courses\?view=browse$/);
});

test('the My degree tab opens the degree board', async () => {
  renderPage('COMP SCI 300,COMP SCI 400');
  await screen.findByText('3.42');
  fireEvent.click(screen.getByRole('tab', { name: 'My degree' }));
  expect(screen.getByTestId('location')).toHaveTextContent(/^\/courses\?view=degree$/);
});
