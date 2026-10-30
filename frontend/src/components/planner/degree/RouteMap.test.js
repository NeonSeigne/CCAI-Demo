import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import RouteMap, { RouteList } from './RouteMap';
import { DetailCard, RequirementsPanel } from './RoutePanels';
import { routeModel } from './routeModel';
import { degree, planCourses } from './routeFixture';

const model = routeModel(degree, planCourses, { start_term: 'Fall 2025' });

const stop = (name) => screen.getByRole('button', { name });

/** The map with its selection held, as the board holds it. */
function Selectable({ onOpen, initial = 'STAT 2120' }) {
  const [selected, setSelected] = useState(initial);
  return <RouteMap model={model} selected={selected} onSelect={setSelected} onOpen={onOpen} />;
}

describe('RouteMap', () => {
  test('draws every line, every stop and the open stops', () => {
    const { container } = render(<RouteMap model={model} />);
    ['Foundations', 'Core theory', 'Electives'].forEach((name) => expect(screen.getByText(name)).toBeInTheDocument());
    expect(screen.getByText('Not placed')).toBeInTheDocument();
    expect(screen.getByText('2 more')).toBeInTheDocument();
    expect(container.querySelectorAll('.rt-stop')).toHaveLength(7);
    expect(container.querySelectorAll('.rt-stop.is-done')).toHaveLength(2);
    expect(container.querySelectorAll('.rt-stop.is-now')).toHaveLength(2);
    expect(screen.queryByText('Earlier')).not.toBeInTheDocument();
  });

  test('mockup measurements: 8px lines, the full-height now column, the deadline from y=54', () => {
    const { container } = render(<RouteMap model={model} />);
    const band = container.querySelector('.rt-now-band');
    expect(band).toHaveAttribute('rx', '12');
    expect(band).toHaveAttribute('width', '108');
    expect(container.querySelector('.rt-due line')).toHaveAttribute('y1', '54');
    // A track is drawn even for a line with one placed stop.
    expect(container.querySelectorAll('.rt-track')).toHaveLength(3);
    expect(container.querySelector('.rt-stop.is-now .rt-dot')).toHaveAttribute('r', '12');
    expect(container.querySelector('.rt-stop.is-done .rt-dot')).toHaveAttribute('r', '10');
  });

  test('grades stay for stops drawn above, and the first of two stops goes above', () => {
    const { container } = render(<RouteMap model={model} />);
    // ECON 2010 and MATH 1210 share Fall 2025 on Foundations: ECON 2010 above, MATH 1210 below.
    const first = container.querySelector('[data-stop="ECON 2010"]');
    const code = within(first).getByText('ECON 2010');
    const grade = within(first).getByText('A-');
    expect(Number(grade.getAttribute('y'))).toBeLessThan(Number(code.getAttribute('y')));
    expect(within(container.querySelector('[data-stop="MATH 1210"]')).getByText('B+')).toBeInTheDocument();
  });

  test('columns run to graduation', () => {
    const toGrad = routeModel(degree, planCourses, { class_year: '2029' });
    render(<RouteMap model={toGrad} />);
    expect(screen.getAllByText('2029')).toHaveLength(1);
    expect(toGrad.terms[toGrad.terms.length - 1]).toBe('Spring 2029');
  });

  test('marks the core deadline and links prerequisites', () => {
    const { container } = render(<RouteMap model={model} />);
    expect(screen.getByText('Core due')).toBeInTheDocument();
    expect(container.querySelectorAll('.rt-edge')).toHaveLength(2);
  });

  test('a click selects a stop; Shift+click and Shift+Enter open the course', () => {
    const onOpen = jest.fn();
    render(<Selectable onOpen={onOpen} />);
    expect(stop('STAT 2120, Fall 2026, this term')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(stop('ECON 3010, Fall 2026, this term'));
    expect(stop('ECON 3010, Fall 2026, this term')).toHaveAttribute('aria-pressed', 'true');
    expect(stop('STAT 2120, Fall 2026, this term')).toHaveAttribute('aria-pressed', 'false');
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.keyDown(stop('ECON 2010, Fall 2025, done, A-'), { key: 'Enter', shiftKey: true });
    fireEvent.click(stop('ECON 4210, Spring 2028, planned'), { shiftKey: true });
    expect(onOpen.mock.calls).toEqual([['ECON 2010'], ['ECON 4210']]);
  });

  test('keyboard: one Tab stop per line, arrows move along and between lines, Enter and Space select', () => {
    render(<Selectable onOpen={jest.fn()} />);
    const tabbable = Array.from(document.querySelectorAll('.rt-stop[tabindex="0"]')).map((n) => n.dataset.stop);
    // Foundations keeps the selected stop; the other lines their first.
    expect(tabbable).toEqual(['STAT 2120', 'ECON 3010', 'ECON 4210']);

    const stat = stop('STAT 2120, Fall 2026, this term');
    stat.focus();
    fireEvent.keyDown(stat, { key: 'ArrowLeft' });
    expect(stop('MATH 1210, done, B+')).toHaveFocus();
    expect(stop('MATH 1210, done, B+')).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(document.activeElement, { key: 'ArrowRight' });
    expect(stat).toHaveFocus();

    fireEvent.keyDown(stat, { key: 'ArrowDown' });
    const micro = stop('ECON 3010, Fall 2026, this term');
    expect(micro).toHaveFocus();
    fireEvent.keyDown(micro, { key: 'ArrowRight' });
    const macro = stop('ECON 3020, Spring 2027, planned');
    expect(macro).toHaveFocus();
    expect(macro).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(macro, { key: ' ' });
    expect(macro).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(macro, { key: 'ArrowDown' });
    const trade = stop('ECON 4210, Spring 2028, planned');
    expect(trade).toHaveFocus();
    fireEvent.keyDown(trade, { key: 'Enter' });
    expect(trade).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(trade, { key: 'ArrowUp' });
    fireEvent.keyDown(document.activeElement, { key: 'ArrowUp' });
    expect(document.activeElement.closest('[aria-label="Foundations"]')).not.toBeNull();
  });

  test('no deadline marker without a start term', () => {
    render(<RouteMap model={routeModel(degree, planCourses, {})} />);
    expect(screen.queryByText('Core due')).not.toBeInTheDocument();
  });
});

describe('RequirementsPanel', () => {
  test('rows: line-colour dot, rule name, pills and X of N', () => {
    const { container } = render(<RequirementsPanel rows={model.requirements} />);
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(7);
    expect(rows[0]).toHaveTextContent('Introductory economics1 of 2');
    expect(rows[0]).toHaveClass('rt-l1');
    expect(rows[3]).toHaveClass('rt-l2');
    expect(rows[6]).toHaveClass('rt-l3');
    expect(rows[2].querySelectorAll('.rt-pills i.is-now')).toHaveLength(1);
    expect(container.querySelectorAll('.rt-pills i')).toHaveLength(11);
  });
});

describe('DetailCard', () => {
  const micro = model.lines[1].stops.find((s) => s.id === 'ECON 3010');
  const rows = () => Array.from(document.querySelectorAll('.rt-detail-rows > div'))
    .map((row) => [row.querySelector('dt').textContent, row.querySelector('dd').textContent]);

  test('code and credits, the title as the way into the pop-up, and Term, Line, Needs', () => {
    const onOpen = jest.fn();
    render(<DetailCard stop={micro} onOpen={onOpen} />);
    expect(screen.getByText('ECON 3010 · 4 credits')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Micro' })).toHaveAttribute('aria-live', 'polite');
    fireEvent.click(screen.getByRole('button', { name: 'Micro' }));
    expect(onOpen).toHaveBeenCalledWith('ECON 3010');
    expect(rows()).toEqual([
      ['Term', 'Fall 2026'],
      ['Line', 'Core theory'],
      ['Needs', 'ECON 2010 · ECON 9999'],
      ['Opens in plan', 'ECON 4210'],
    ]);
  });

  test('a partial "opens" list says so; a whole one does not; the section shows', () => {
    const withData = {
      ...micro,
      opens: [{ id: 'ECON 4010', title: 'Game Theory', in_plan: false }],
      opensComplete: true,
      sections: [{
        id: '001', kind: 'Lecture', meetings: [{ day: 'Mo', start: '14:00', end: '15:15' }, { day: 'We', start: '14:00', end: '15:15' }], instructor: 'Troyan',
      }],
    };
    const { rerender } = render(<DetailCard stop={withData} />);
    expect(rows()).toContainEqual(['Opens', 'ECON 4010']);
    expect(rows()).toContainEqual(['Section', 'MoWe 2:00–3:15 · Troyan']);
    rerender(<DetailCard stop={{ ...withData, opensComplete: false }} />);
    expect(rows()).toContainEqual(['Opens in plan', 'ECON 4010']);
  });

  test('rows without data are left out, and a course with no known term has no Term row', () => {
    const math = model.lines[0].stops.find((s) => s.id === 'MATH 1210');
    render(<DetailCard stop={math} />);
    expect(rows()).toEqual([['Line', 'Foundations']]);
  });

  test('nothing renders without a stop', () => {
    const { container } = render(<DetailCard stop={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('RouteList (phone)', () => {
  test('"Your route" with its counts, every term with a stop in order, then the open stops', () => {
    render(<RouteList model={model} meta="7 credits done · 24 placed" />);
    expect(screen.getByRole('heading', { name: 'Your route' })).toBeInTheDocument();
    expect(screen.getByText('7 credits done · 24 placed')).toBeInTheDocument();
    const route = screen.getByRole('list', { name: 'Route' });
    const heads = within(route).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(heads).toEqual([
      'Fall 2025', 'Spring 2026', 'Fall 2026', 'Spring 2027', 'Fall 2027', 'Spring 2028', 'Not placed',
    ]);
    expect(screen.getByText('Now')).toBeInTheDocument();
    expect(screen.getByText('Core due')).toBeInTheDocument();
    // Past terms are past (deep rail and markers), even with no stops.
    expect(route.querySelectorAll('.rt-term-stop.is-past')).toHaveLength(2);
  });

  test('course rows select their stop', () => {
    const onSelect = jest.fn();
    render(<RouteList model={model} selected="ECON 4210" onSelect={onSelect} />);
    const row = screen.getByRole('button', { name: 'ECON 4210, Spring 2028, planned' });
    expect(row).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith('ECON 4210');
  });

  test('line progress counts done stops against the whole line; done pairs join in the line colour', () => {
    render(<RouteList model={model} />);
    const lines = screen.getByRole('region', { name: 'Lines' });
    expect(within(lines).getByText('2 of 4')).toBeInTheDocument();
    expect(within(lines).getAllByText('0 of 3')).toHaveLength(2);
    const foundations = lines.querySelector('.rt-line-card');
    expect(foundations.querySelectorAll('.rt-strip b.is-done')).toHaveLength(1);
  });
});
