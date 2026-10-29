import React from 'react';
import {
  act, fireEvent, render, renderHook, screen, waitFor,
} from '@testing-library/react';
import {
  MemoryRouter, Route, Routes, useLocation,
} from 'react-router-dom';
import CoursePopupHost, { requirementLabels, useCloseOnce } from './CoursePopupHost';
import CourseChip from '../visuals/CourseChip';
import CourseRedirect from './CourseRedirect';
import { routeFetch } from '../../pages/__fixtures__/routeFetch';
import { uwPopupCourse } from '../../pages/__fixtures__/popups';

jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token' }) }));
jest.mock('cytoscape', () => {
  const cytoscape = jest.fn(() => ({ on: jest.fn(), destroy: jest.fn() }));
  cytoscape.use = jest.fn();
  return { __esModule: true, default: cytoscape };
});
jest.mock('cytoscape-fcose', () => ({ __esModule: true, default: {} }));

const realFetch = global.fetch;
beforeEach(() => {
  global.fetch = routeFetch([
    ['/api/catalog/ratings/', { body: { ratings: [] } }],
    ['/api/catalog/', { body: uwPopupCourse() }],
  ]);
});
afterEach(() => { global.fetch = realFetch; });

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

it('a chip on the map page opens the pop-up without changing the path, and Close returns', async () => {
  render(
    <MemoryRouter initialEntries={['/map']}>
      <CourseChip identifier="COMP SCI 400" />
      <CoursePopupHost />
      <LocationProbe />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /comp sci 400/i }));
  expect(screen.getByTestId('location')).toHaveTextContent('/map?course=COMP+SCI+400');
  expect(await screen.findByRole('dialog', { name: 'Programming III' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/map$/));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('redirects /courses/:id to /courses?course=ID', () => {
  render(
    <MemoryRouter initialEntries={['/courses/COMP%20SCI%20400']}>
      <Routes>
        <Route path="/courses" element={<LocationProbe />} />
        <Route path="/courses/:courseIdentifier" element={<CourseRedirect />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByTestId('location')).toHaveTextContent('/courses?course=COMP+SCI+400');
});

it('closes once per open pop-up, however many close events arrive', () => {
  const close = jest.fn();
  const { result, rerender } = renderHook(({ value }) => useCloseOnce(value, close), {
    initialProps: { value: 'COMP SCI 400' },
  });
  act(() => { result.current(); result.current(); result.current(); });
  expect(close).toHaveBeenCalledTimes(1);
  rerender({ value: 'MATH 240' });
  act(() => { result.current(); });
  expect(close).toHaveBeenCalledTimes(2);
});

it("labels requirement chips from the student's programs", () => {
  const programs = [
    { id: 'cs', name: 'Comp Sci B.S.', rules: [{ id: 'core', title: 'Core', courses: ['COMP SCI 400'] }] },
    { id: 'math', name: 'Math B.S.', rules: [{ id: 'el', title: 'Electives', courses: ['COMP SCI 400'] }] },
  ];
  expect(requirementLabels('COMP SCI 400', programs, ['cs'])).toEqual(['Comp Sci B.S. · Core']);
});
