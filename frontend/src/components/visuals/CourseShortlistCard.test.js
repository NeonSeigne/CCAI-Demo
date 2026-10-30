import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CourseShortlistCard, { fitTime, orderByFit } from './CourseShortlistCard';
import VisualBlock from './VisualBlock';
import { PlannerProvider } from '../../contexts/PlannerContext';
import * as api from '../../api/planner';
import { diff, proposal, view } from '../planner/plannerFixtures';

jest.mock('../../api/planner', () => {
  const actual = jest.requireActual('../../api/planner');
  return {
    ...actual,
    getPlan: jest.fn(),
    listPrograms: jest.fn(),
    createProposal: jest.fn(),
    acceptProposal: jest.fn(),
    discardProposal: jest.fn(),
  };
});
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token' }) }));

const TUTH_8 = {
  ids: ['001'],
  meetings: [
    { section: '001', kind: 'LEC', day: 'Th', start: '08:00', end: '09:15' },
    { section: '001', kind: 'LEC', day: 'Tu', start: '08:00', end: '09:15' },
    { section: '101', kind: 'DIS', day: 'We', start: '13:00', end: '13:50' },
  ],
};

const item = (id, extra = {}) => ({
  id,
  title: `Course ${id}`,
  why: 'Fills: Economics electives; Prerequisites met; Offered Spring 2027',
  labels: ['Fills: Economics electives', 'Prerequisites met', 'Offered Spring 2027'],
  prereqs: { status: 'met', reason: null },
  credits: [3, 3],
  gpa: 3.46,
  difficulty: 'easier',
  fit: 'fits',
  fit_reason: null,
  section: TUTH_8,
  clashes_with: [],
  ...extra,
});

const shortlist = (items) => ({ type: 'course_shortlist', items });

beforeEach(() => {
  jest.clearAllMocks();
  api.listPrograms.mockResolvedValue([]);
  api.getPlan.mockResolvedValue(view());
});

test('fitTime reads the lecture days and start; orderByFit puts fits, then unknown, then clashes', () => {
  expect(fitTime(TUTH_8)).toBe('TuTh 8:00');
  expect(fitTime({ meetings: [{ kind: 'LEC', day: 'Mo', start: '14:00' }, { kind: 'LEC', day: 'We', start: '14:00' }] })).toBe('MoWe 2:00');
  expect(fitTime(null)).toBeNull();
  const ordered = orderByFit([
    item('C', { fit: 'clashes' }), item('U', { fit: 'unknown' }), item('F1'), item('F2'),
  ]);
  expect(ordered.map((i) => i.id)).toEqual(['F1', 'F2', 'U', 'C']);
});

test('"Fits your schedule": code over title, the time tag, GPA in the difficulty colour, a round + per row; no why text', () => {
  render(
    <PlannerProvider>
      <CourseShortlistCard
        visual={shortlist([
          item('ECON 3430', { fit: 'clashes', section: null, clashes_with: ['ECON 3010'], gpa: 3.12, difficulty: 'typical' }),
          item('ECON 4300'),
          item('ECON 3040', { fit: 'unknown', fit_reason: 'class times not published', gpa: 3.39 }),
        ])}
      />
    </PlannerProvider>,
  );
  expect(screen.getByRole('heading', { name: 'Fits your schedule' })).toBeInTheDocument();
  const rows = screen.getAllByRole('listitem');
  expect(rows.map((row) => row.querySelector('.vc-srow-code').textContent)).toEqual(['ECON 4300', 'ECON 3040', 'ECON 3430']);

  expect(within(rows[0]).getByText('TuTh 8:00')).toHaveClass('vc-tag', 'is-plan');
  expect(within(rows[0]).getByText('3.46')).toHaveClass('vc-srow-gpa', 'is-easier');
  expect(within(rows[0]).getByRole('button', { name: 'Add ECON 4300' })).toHaveClass('is-icon');
  // Unknown: no time tag.
  expect(rows[1].querySelector('.vc-tag')).toBeNull();
  // Clash: after the rest, tagged.
  expect(within(rows[2]).getByText('Clashes')).toHaveClass('vc-tag');
  expect(within(rows[2]).getByText('3.12')).toHaveClass('is-typical');

  expect(screen.queryByText(/Fills: Economics electives/)).not.toBeInTheDocument();
  expect(screen.queryByText('Prerequisites met')).not.toBeInTheDocument();
  expect(screen.queryByText(/ cr$/)).not.toBeInTheDocument();
});

test('the title is "Suggested courses" when nothing fits; unmet prerequisites still say so', () => {
  render(
    <PlannerProvider>
      <CourseShortlistCard visual={shortlist([item('A 1', { fit: 'unknown' }), item('A 2', { fit: 'clashes', prereqs: { status: 'short', reason: 'Needs ECON 3010' } })])} />
    </PlannerProvider>,
  );
  expect(screen.getByRole('heading', { name: 'Suggested courses' })).toBeInTheDocument();
  expect(screen.getByText('Prerequisites not met yet')).toBeInTheDocument();
});

test('five rows at a time; Show more for the rest', () => {
  const items = ['A 1', 'A 2', 'A 3', 'A 4', 'A 5', 'A 6'].map((id) => item(id));
  render(<PlannerProvider><CourseShortlistCard visual={shortlist(items)} /></PlannerProvider>);
  expect(screen.getAllByRole('button', { name: /^Add / })).toHaveLength(5);
  fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
  expect(screen.getAllByRole('button', { name: /^Add / })).toHaveLength(6);
});

test('+ posts a proposal that adds the course and shows its card', async () => {
  api.createProposal.mockResolvedValue({
    proposal: proposal({
      id: 'p9',
      ops: [{ op: 'add', course: 'ECON 3300' }],
      diff: diff({ heading: 'Add ECON 3300', courses: { added: ['ECON 3300'], removed: [], moved: [] } }),
    }),
  });
  render(<PlannerProvider><VisualBlock visual={shortlist([item('ECON 3300')])} /></PlannerProvider>);

  fireEvent.click(screen.getByRole('button', { name: 'Add ECON 3300' }));
  await waitFor(() => expect(api.createProposal).toHaveBeenCalledWith('token', {
    ops: [{ op: 'add', course: 'ECON 3300' }],
    expected_revision: 4,
  }));
  expect(await screen.findByRole('heading', { name: 'Proposed change' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
});

test('+ sends the term the shortlist was checked for', async () => {
  api.createProposal.mockResolvedValue({
    proposal: proposal({
      id: 'p10',
      ops: [{ op: 'add', course: 'ECON 3300', term: 'Fall 2027' }],
      term: 'Fall 2027',
      diff: diff({ heading: 'Add ECON 3300 to Fall 2027', courses: { added: ['ECON 3300'], removed: [], moved: [] } }),
    }),
  });
  render(<PlannerProvider><VisualBlock visual={{ ...shortlist([item('ECON 3300')]), term: 'Fall 2027' }} /></PlannerProvider>);

  fireEvent.click(screen.getByRole('button', { name: 'Add ECON 3300' }));
  await waitFor(() => expect(api.createProposal).toHaveBeenCalledWith('token', {
    ops: [{ op: 'add', course: 'ECON 3300', term: 'Fall 2027' }],
    expected_revision: 4,
    term: 'Fall 2027',
  }));
  expect(await screen.findByRole('heading', { name: 'Proposed change' })).toBeInTheDocument();
});

test('an empty shortlist says so and offers example prompts', () => {
  const onAsk = jest.fn();
  render(<CourseShortlistCard visual={shortlist([])} onAsk={onAsk} />);
  expect(screen.getByText('No courses matched; try other words')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Suggest an economics elective' }));
  expect(onAsk).toHaveBeenCalledWith('Suggest an economics elective');
});
