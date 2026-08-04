import React from 'react';
import { render, screen } from '@testing-library/react';
import VisualBlock from './VisualBlock';

jest.mock('./CourseVisualCard', () => {
  const React = require('react');
  const Mock = ({ visual }) => (
    <div data-testid={`course-visual-${visual.type}`}>{visual.course}</div>
  );
  Mock.isCourseVisualType = (type) => String(type || '').startsWith('course_');
  return {
    __esModule: true,
    default: Mock,
    isCourseVisualType: Mock.isCourseVisualType,
  };
});

jest.mock('../course/CourseVisuals', () => ({
  CourseGradeDistribution: ({ titleSuffix, termLabel }) => (
    <div data-testid="legacy-gpa">{titleSuffix || termLabel}</div>
  ),
}));

jest.mock('./PrereqTree', () => () => <div data-testid="prereq-tree" />);

describe('VisualBlock', () => {
  it('routes course_* refs to CourseVisualCard', () => {
    render(
      <VisualBlock visual={{ type: 'course_gpa', course: 'MUSIC 113', term: '1254' }} />,
    );
    expect(screen.getByTestId('course-visual-course_gpa')).toHaveTextContent('MUSIC 113');
  });

  it('still renders legacy gpa_chart specs', () => {
    render(
      <VisualBlock
        visual={{
          type: 'gpa_chart',
          course: 'COMPSCI 300',
          average_gpa: 3.2,
          total: 100,
          distribution: { a: 40, b: 20 },
        }}
      />,
    );
    expect(screen.getByTestId('legacy-gpa')).toHaveTextContent('COMPSCI 300');
  });

  it('still renders legacy prereq_tree specs', () => {
    render(
      <VisualBlock
        visual={{
          type: 'prereq_tree',
          course: 'COMPSCI 300',
          prerequisites: [],
        }}
      />,
    );
    expect(screen.getByTestId('prereq-tree')).toBeInTheDocument();
  });

  it('ignores unknown types', () => {
    const { container } = render(<VisualBlock visual={{ type: 'mystery' }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
