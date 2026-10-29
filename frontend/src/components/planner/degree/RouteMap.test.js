import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import RouteMap, { RouteList } from './RouteMap';
import { routeModel } from './routeModel';
import { degree, planCourses } from './routeFixture';

const model = routeModel(degree, planCourses, { start_term: 'Fall 2025' });

describe('RouteMap', () => {
  test('draws every line, every stop and the open stops', () => {
    const { container } = render(<RouteMap model={model} />);
    ['Foundations', 'Core theory', 'Electives'].forEach((name) => expect(screen.getByText(name)).toBeInTheDocument());
    expect(screen.getByText('Not placed')).toBeInTheDocument();
    expect(screen.getByText('2 more')).toBeInTheDocument();
    expect(container.querySelectorAll('.rt-stop')).toHaveLength(7);
    expect(container.querySelectorAll('.rt-stop.is-done')).toHaveLength(2);
    expect(container.querySelectorAll('.rt-stop.is-now')).toHaveLength(2);
  });

  test('marks the core deadline and links prerequisites across lines', () => {
    const { container } = render(<RouteMap model={model} />);
    expect(screen.getByText('Core due')).toBeInTheDocument();
    // ECON 2010 (Foundations) → ECON 3010 (Core theory), ECON 3010 → ECON 4210 (Electives).
    expect(container.querySelectorAll('.rt-edge')).toHaveLength(2);
  });

  test('a stop opens its course by click or keyboard', () => {
    const onOpen = jest.fn();
    render(<RouteMap model={model} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'ECON 3010, Fall 2026, this term' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'ECON 2010, Fall 2025, done, A-' }), { key: 'Enter' });
    expect(onOpen.mock.calls).toEqual([['ECON 3010'], ['ECON 2010']]);
  });

  test('no deadline marker without a start term', () => {
    render(<RouteMap model={routeModel(degree, planCourses, {})} />);
    expect(screen.queryByText('Core due')).not.toBeInTheDocument();
  });
});

describe('RouteList (phone)', () => {
  test('renders every term in order, then the open stops', () => {
    render(<RouteList model={model} />);
    const route = screen.getByRole('list', { name: 'Route' });
    const heads = within(route).getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(heads).toEqual([
      'Earlier', 'Fall 2025', 'Spring 2026', 'Fall 2026', 'Spring 2027', 'Fall 2027', 'Spring 2028', 'Not placed',
    ]);
    expect(screen.getByText('Now')).toBeInTheDocument();
    expect(screen.getByText('Core due')).toBeInTheDocument();
  });

  test('course rows open the course pop-up', () => {
    const onOpen = jest.fn();
    render(<RouteList model={model} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'ECON 4210, Spring 2028, planned' }));
    expect(onOpen).toHaveBeenCalledWith('ECON 4210');
  });

  test('line progress counts done stops against the whole line', () => {
    render(<RouteList model={model} />);
    const lines = screen.getByRole('region', { name: 'Lines' });
    expect(within(lines).getByText('2 of 4')).toBeInTheDocument();
    // Core theory: three planned stops; Electives: one planned and two open.
    expect(within(lines).getAllByText('0 of 3')).toHaveLength(2);
  });
});
