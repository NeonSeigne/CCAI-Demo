// Regression: ISSUE-001 — Compare columns stuck on placeholders in development
// Found by /qa on 2026-10-27
// Report: .gstack/qa-reports/run-20261027T211619Z/qa-report-localhost-2026-10-27.md
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CourseComparePage from './CourseComparePage';
import { getCatalogCourse } from '../api/campus';
import { uwCourse } from './__fixtures__/catalog';

jest.mock('../api/campus', () => ({
  ...jest.requireActual('../api/campus'),
  searchCatalog: jest.fn(),
  getCatalogStarters: jest.fn(),
  getCatalogCourse: jest.fn(),
}));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token' }) }));
jest.mock('../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({ config: { app: { institution: 'UW–Madison' } } }),
}));
jest.mock('../components/catalog/CampusPageShell', () => ({ children, className }) => (
  <main id="main-content" className={className}>{children}</main>
));

const COURSES = {
  'COMP SCI 300': uwCourse('COMP SCI 300', 'Programming II', 3.17),
  'COMP SCI 400': uwCourse('COMP SCI 400', 'Programming III', 3.42),
};

// Like fetch: an aborted request rejects and never resolves.
function abortableCourse(token, id, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(COURSES[id]), 0);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });
  });
}

test('columns load under StrictMode, which mounts, unmounts and remounts effects', async () => {
  getCatalogCourse.mockImplementation(abortableCourse);
  render(
    <React.StrictMode>
      <MemoryRouter initialEntries={[`/courses/compare?ids=${encodeURIComponent('COMP SCI 300,COMP SCI 400')}`]}>
        <Routes>
          <Route path="/courses/compare" element={<CourseComparePage />} />
        </Routes>
      </MemoryRouter>
    </React.StrictMode>,
  );
  const table = await screen.findByRole('table');
  expect(await within(table).findByText('3.17')).toBeInTheDocument();
  expect(within(table).getByText('3.42')).toBeInTheDocument();
});

test('a single section reads "1 section", not "1 sections"', async () => {
  const one = uwCourse('COMP SCI 400', 'Programming III', 3.42);
  one.sections = { ...one.sections, rows: one.sections.rows.slice(0, 1) };
  getCatalogCourse.mockImplementation((token, id) => Promise.resolve(id === 'COMP SCI 400' ? one : COURSES[id]));
  render(
    <MemoryRouter initialEntries={[`/courses/compare?ids=${encodeURIComponent('COMP SCI 300,COMP SCI 400')}`]}>
      <Routes>
        <Route path="/courses/compare" element={<CourseComparePage />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByText(/· 1 lecture$/)).toBeInTheDocument();
});
