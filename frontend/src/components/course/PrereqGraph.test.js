import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import PrereqGraph, { prereqItems } from './PrereqGraph';

// The UW pop-up fixture: (COMP SCI 300 or 367) and MATH 240.
const UW_TREE = {
  kind: 'all',
  children: [
    {
      kind: 'any',
      children: [
        { kind: 'course', course: 'COMP SCI 300' },
        { kind: 'course', course: 'COMP SCI 367' },
      ],
    },
    { kind: 'course', course: 'MATH 240' },
  ],
};

const course = (id) => ({ kind: 'course', course: id });
const edges = (container) => [...container.querySelectorAll('.pg-edge')]
  .map((edge) => `${edge.dataset.from} -> ${edge.dataset.to}`);
const node = (container, id) => container.querySelector(`[data-course="${id}"]`);
const rectOf = (container, id) => {
  const rect = node(container, id).querySelector('rect');
  return { x: Number(rect.getAttribute('x')), y: Number(rect.getAttribute('y')) };
};

describe('prereqItems keeps the tree\'s AND/OR meaning', () => {
  test('an OR is one group, AND parts stand alone', () => {
    expect(prereqItems('COMP SCI 400', UW_TREE)).toEqual([
      {
        kind: 'group',
        mode: 'any',
        children: [{ kind: 'course', id: 'COMP SCI 300' }, { kind: 'course', id: 'COMP SCI 367' }],
      },
      { kind: 'course', id: 'MATH 240' },
    ]);
  });

  test('an AND inside an OR is an "All of" group; one-option ORs and repeats collapse', () => {
    const tree = {
      kind: 'all',
      children: [
        { kind: 'any', children: [{ kind: 'all', children: [course('MATH 221'), course('MATH 222')] }, course('MATH 234')] },
        { kind: 'any', children: [course('STAT 240')] },
        course('MATH 221'),
        course('ECON 101'),
      ],
    };
    expect(prereqItems('ECON 310', tree)).toEqual([
      {
        kind: 'group',
        mode: 'any',
        children: [
          { kind: 'group', mode: 'all', children: [{ kind: 'course', id: 'MATH 221' }, { kind: 'course', id: 'MATH 222' }] },
          { kind: 'course', id: 'MATH 234' },
        ],
      },
      { kind: 'course', id: 'STAT 240' },
      { kind: 'course', id: 'ECON 101' },
    ]);
  });

  test('the course itself is never its own prerequisite', () => {
    expect(prereqItems('MATH 240', { kind: 'any', children: [course('MATH 240'), course('MATH 234')] }))
      .toEqual([{ kind: 'course', id: 'MATH 234' }]);
  });
});

describe('PrereqGraph', () => {
  test('draws the OR as a "One of" box with one edge, and each AND part with its own', () => {
    const { container } = render(<PrereqGraph course="COMP SCI 400" tree={UW_TREE} />);
    const group = screen.getByRole('group', { name: 'One of' });
    expect(within(group).getByRole('img', { name: 'COMP SCI 300' })).toBeInTheDocument();
    expect(within(group).getByRole('img', { name: 'COMP SCI 367' })).toBeInTheDocument();
    expect(within(group).queryByRole('img', { name: 'MATH 240' })).not.toBeInTheDocument();
    expect(screen.getByText('One of')).toBeInTheDocument();
    expect(edges(container)).toEqual(['One of -> COMP SCI 400', 'MATH 240 -> COMP SCI 400']);
  });

  test('nodes are buttons that open the course, by click, Enter or Space', () => {
    const onOpenCourse = jest.fn();
    render(<PrereqGraph course="COMP SCI 400" tree={UW_TREE} onOpenCourse={onOpenCourse} />);
    const math = screen.getByRole('button', { name: 'MATH 240' });
    expect(math).toHaveAttribute('tabindex', '0');
    fireEvent.click(math);
    fireEvent.keyDown(screen.getByRole('button', { name: 'COMP SCI 367' }), { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'COMP SCI 300' }), { key: ' ' });
    expect(onOpenCourse.mock.calls).toEqual([['MATH 240'], ['COMP SCI 367'], ['COMP SCI 300']]);
    // The course asked about is the graph's subject, not a link.
    expect(screen.queryByRole('button', { name: 'COMP SCI 400' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Prerequisites for COMP SCI 400' })).toBeInTheDocument();
  });

  test('done prerequisites come before this term\'s, then the course and what it unlocks', () => {
    const tree = { kind: 'all', children: [course('MATH 1210'), course('ECON 2010'), course('ECON 3010')] };
    const { container } = render(
      <PrereqGraph
        course="ECON 4010"
        tree={tree}
        unlocks={[{ identifier: 'ECON 4190', title: 'Industrial Organization' }, 'ECON 4210']}
        states={{ 'MATH 1210': 'done', 'econ  2010': 'done', 'ECON 3010': 'now' }}
        titles={{ 'ECON 4010': 'Game Theory' }}
        onOpenCourse={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'MATH 1210' })).toHaveAccessibleDescription('done');
    expect(screen.getByRole('button', { name: 'ECON 3010' })).toHaveAccessibleDescription('this term');
    expect(screen.getByRole('img', { name: 'ECON 4010' })).toHaveAccessibleDescription('you asked');
    expect(screen.getByRole('button', { name: 'ECON 4190' })).toHaveAccessibleDescription('unlocks');
    expect(screen.getByText('Game Theory')).toBeInTheDocument();
    expect(screen.getByText('Industrial Organi…')).toBeInTheDocument();

    const xs = ['MATH 1210', 'ECON 3010', 'ECON 4010', 'ECON 4190'].map((id) => rectOf(container, id).x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(rectOf(container, 'MATH 1210').x).toBe(rectOf(container, 'ECON 2010').x);

    expect(container.querySelector('[data-from="MATH 1210"]')).toHaveClass('is-done');
    expect(container.querySelector('[data-from="ECON 3010"]')).toHaveClass('is-now');
    expect(container.querySelector('[data-to="ECON 4210"]')).toHaveClass('is-unlock');
    expect(['Done', 'This term', 'You asked', 'Unlocks'].map((text) => screen.getByText(text))).toHaveLength(4);
  });

  test('an OR with one option done reads as done', () => {
    const { container } = render(
      <PrereqGraph course="COMP SCI 400" tree={UW_TREE} states={{ 'COMP SCI 300': 'done' }} />,
    );
    expect(container.querySelector('[data-from="One of"]')).toHaveClass('is-done');
    expect(container.querySelector('[data-from="MATH 240"]')).toHaveClass('is-plain');
  });

  test('a pop-up tile shows three unlocks and counts the rest', () => {
    render(
      <PrereqGraph
        course="COMP SCI 300"
        unlocks={['COMP SCI 354', 'COMP SCI 400', 'COMP SCI 407', 'COMP SCI 506', 'COMP SCI 537']}
        size="tile"
        onOpenCourse={jest.fn()}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('img', { name: '+2 more' })).toBeInTheDocument();
    expect(screen.getByText('Unlocks')).toBeInTheDocument();
  });

  test('stacks top to bottom in a narrow container', () => {
    const original = global.ResizeObserver;
    let report;
    global.ResizeObserver = class {
      constructor(callback) { report = callback; }

      observe() {}

      disconnect() {}
    };
    try {
      const { container } = render(<PrereqGraph course="COMP SCI 400" tree={UW_TREE} unlocks={['COMP SCI 537']} />);
      act(() => report([{ contentRect: { width: 340 } }]));
      expect(container.querySelector('.pg')).toHaveClass('is-vertical');
      const ys = ['MATH 240', 'COMP SCI 400', 'COMP SCI 537'].map((id) => rectOf(container, id).y);
      expect(ys[0]).toBeLessThan(ys[1]);
      expect(ys[1]).toBeLessThan(ys[2]);
      expect(Number(container.querySelector('svg').getAttribute('width'))).toBeLessThanOrEqual(340);
    } finally {
      global.ResizeObserver = original;
    }
  });

  test('draws nothing without prerequisites or unlocks', () => {
    const { container } = render(<PrereqGraph course="MATH 101" tree={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
