import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CourseShortlistCard from './CourseShortlistCard';
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

const item = (id, extra = {}) => ({
  id,
  title: `Course ${id}`,
  why: 'Fills: Economics electives; Prerequisites met; Offered Spring 2027',
  labels: ['Fills: Economics electives', 'Prerequisites met', 'Offered Spring 2027'],
  prereqs: { status: 'met', reason: null },
  credits: [3, 3],
  ...extra,
});

const shortlist = (items) => ({ type: 'course_shortlist', items });

beforeEach(() => {
  jest.clearAllMocks();
  api.listPrograms.mockResolvedValue([]);
  api.getPlan.mockResolvedValue(view());
});

test('rows show code, title, why, label chips and prerequisite status; five at a time', () => {
  const items = ['A 1', 'A 2', 'A 3', 'A 4', 'A 5', 'A 6'].map((id) => item(id));
  items[1] = item('A 2', { prereqs: { status: 'short', reason: 'Needs ECON 3010' } });
  render(<PlannerProvider><CourseShortlistCard visual={shortlist(items)} /></PlannerProvider>);

  expect(screen.getAllByRole('button', { name: /^Choose / })).toHaveLength(5);
  expect(screen.getByText('Course A 1')).toBeInTheDocument();
  expect(screen.getAllByText('Fills: Economics electives').length).toBeGreaterThan(0);
  expect(screen.getByText('Prerequisites not met yet · Needs ECON 3010')).toHaveClass('is-short');
  fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
  expect(screen.getAllByRole('button', { name: /^Choose / })).toHaveLength(6);
});

test('Choose posts a proposal that adds the course and shows its card', async () => {
  api.createProposal.mockResolvedValue({
    proposal: proposal({
      id: 'p9',
      ops: [{ op: 'add', course: 'ECON 3300' }],
      diff: diff({ heading: 'Add ECON 3300', courses: { added: ['ECON 3300'], removed: [], moved: [] } }),
    }),
  });
  render(<PlannerProvider><VisualBlock visual={shortlist([item('ECON 3300')])} /></PlannerProvider>);

  fireEvent.click(screen.getByRole('button', { name: 'Choose ECON 3300' }));
  await waitFor(() => expect(api.createProposal).toHaveBeenCalledWith('token', {
    ops: [{ op: 'add', course: 'ECON 3300' }],
    expected_revision: 4,
  }));
  expect(await screen.findByRole('heading', { name: 'Add ECON 3300' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
});

test('an empty shortlist says so and offers example prompts', () => {
  const onAsk = jest.fn();
  render(<CourseShortlistCard visual={shortlist([])} onAsk={onAsk} />);
  expect(screen.getByText('No courses matched; try other words')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Suggest an economics elective' }));
  expect(onAsk).toHaveBeenCalledWith('Suggest an economics elective');
});
