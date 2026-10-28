import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PlanPanel from './PlanPanel';
import { PlannerProvider } from '../../contexts/PlannerContext';
import * as api from '../../api/planner';
import { PROGRAMS, apiError, plan, proposal, report, view } from './plannerFixtures';

jest.mock('../../api/planner', () => {
  const actual = jest.requireActual('../../api/planner');
  return {
    ...actual,
    getPlan: jest.fn(),
    listPrograms: jest.fn(),
    postEdits: jest.fn(),
    createProposal: jest.fn(),
    acceptProposal: jest.fn(),
    discardProposal: jest.fn(),
    undoEdit: jest.fn(),
    getSuggestions: jest.fn(),
  };
});
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token' }) }));
let mockSlug = 'uva';
jest.mock('../../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({ config: { app: { institution: 'A University' }, school: { slug: mockSlug } } }),
}));

const renderPanel = (props = {}) => render(
  <PlannerProvider>
    <PlanPanel {...props} />
  </PlannerProvider>,
);

beforeEach(() => {
  jest.clearAllMocks();
  mockSlug = 'uva';
  api.listPrograms.mockResolvedValue(PROGRAMS);
});

test('shows a skeleton, then the error with Retry when the plan will not load', async () => {
  api.getPlan.mockRejectedValueOnce(apiError(503, 'down')).mockResolvedValueOnce(view());
  renderPanel();
  expect(screen.getByLabelText('Loading your plan')).toBeInTheDocument();
  expect(await screen.findByText("Couldn't load your plan")).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('heading', { name: 'Spring 2027' })).toBeInTheDocument();
});

test('first visit: heading, one line, program chips that prefill the chat, and the checklist', async () => {
  const onPrefill = jest.fn();
  api.getPlan.mockResolvedValue(view({
    plan: plan({ courses: [], profile: { program_ids: [], completed: [], interests: { text: '', tags: [] } } }),
    report: report({ courses: [], rules: [] }),
  }));
  api.postEdits.mockResolvedValue({ ...view(), notes: [] });
  renderPanel({ onPrefill });

  expect(await screen.findByRole('heading', { name: 'Plan your Spring 2027' })).toBeInTheDocument();
  expect(screen.getByText("Tell me your major and what you've taken, in your own words.")).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Economics B.A.' }));
  expect(onPrefill).toHaveBeenCalledWith(expect.stringContaining('Economics B.A.'));

  fireEvent.click(screen.getByRole('button', { name: 'Tick off courses' }));
  expect(screen.getByText('Pick your program first')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Economics B.A.'));
  fireEvent.change(screen.getByLabelText('Course code'), { target: { value: 'econ 2010' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(screen.getByLabelText('ECON 2010')).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(api.postEdits).toHaveBeenCalled());
  expect(api.postEdits.mock.calls[0][1].ops).toEqual([{
    op: 'set_profile',
    completed: [{ id: 'ECON 2010', grade: null, term: null }],
    program_ids: ['econ-ba'],
  }]);
});

test('saved plan: region, provenance, courses with neutral tags, summary and requirements', async () => {
  api.getPlan.mockResolvedValue(view());
  renderPanel();
  const region = await screen.findByRole('region', { name: 'Your plan' });
  await within(region).findByRole('heading', { name: 'Spring 2027' });

  expect(screen.queryByText('Preview · not applied')).not.toBeInTheDocument();
  expect(screen.getByText(/Curated requirements, not an official audit · UVA sections as of Oct 2026/)).toBeInTheDocument();
  expect(screen.getByText('Harder')).toBeInTheDocument();
  expect(screen.getByText('Typical')).toBeInTheDocument();
  expect(screen.getByText('No grade data')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add a course' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Suggest courses' })).toBeInTheDocument();
  expect(screen.getByText(/Difficulty estimate:/)).toHaveTextContent('Difficulty estimate: Heavy · from past grades');
  expect(screen.getByText(/^Clashes:/)).toHaveTextContent('Clashes: none');

  const short = screen.getByText('Economics electives').closest('li');
  expect(short).toHaveTextContent('Short · 1 of 4');
  expect(short.querySelector('.pp-bar')).toBeInTheDocument();
  expect(screen.getByText('Introductory economics').closest('li')).toHaveTextContent('Met · 2 of 2');
  expect(screen.getAllByText('Weekly schedule').length).toBeGreaterThan(0);
  expect(screen.getByText('Mon 9:00–9:50 CHEM 2410')).toBeInTheDocument();
});

test('an unknown rule shows ? Unknown with its reason and no bar', async () => {
  api.getPlan.mockResolvedValue(view());
  renderPanel();
  const row = (await screen.findByText('Prerequisites')).closest('li');
  expect(row).toHaveTextContent('?');
  expect(row).toHaveTextContent('Unknown · not published');
  expect(row.querySelector('.pp-bar')).not.toBeInTheDocument();
});

test('a pending proposal shows the Preview label, before → after, and proposed rows in words', async () => {
  api.getPlan.mockResolvedValue(view({ proposal: proposal() }));
  renderPanel();
  expect(await screen.findByText('Preview · not applied')).toBeInTheDocument();

  const electives = screen.getByText('Economics electives').closest('li');
  expect(electives.querySelector('.pp-change')).toHaveTextContent(/^1 →.*2$/);
  expect(screen.getByText(/Difficulty estimate:/).querySelector('.pp-change')).toHaveTextContent(/^Heavy →.*Balanced$/);
  expect(screen.getByText('ECON 3010').closest('li')).toHaveTextContent('Proposed removal');
  const addition = screen.getByText('ECON 3300').closest('li');
  expect(addition).toHaveTextContent('Proposed addition');
  expect(addition).toHaveTextContent('Labor Economics');
  expect(addition).toHaveTextContent('3 cr');
  expect(screen.getByText(/ECON 3010 · moves to Fall 2027 · Proposed/)).toBeInTheDocument();
});

test('UW: the schedule says class times are not published, with no empty grid', async () => {
  api.getPlan.mockResolvedValue(view({
    report: report({ schedule: { published: false, reason: 'class times not published', blocks: [] } }),
  }));
  mockSlug = 'uw-madison';
  renderPanel();
  expect(await screen.findByText("UW doesn't publish class times")).toBeInTheDocument();
  expect(document.querySelector('.pp-week')).not.toBeInTheDocument();
});

test('the header names the undo, and Undo and Cmd+Z walk the edit back', async () => {
  const withUndo = view({ undo_label: 'Undo: removed ECON 3010' });
  api.getPlan.mockResolvedValue(withUndo);
  api.undoEdit.mockResolvedValue({ plan: plan({ revision: 5 }), report: report(), undo_label: null });
  renderPanel();

  const undo = await screen.findByRole('button', { name: 'Undo: removed ECON 3010' });
  fireEvent.keyDown(undo, { key: 'z', metaKey: true });
  await waitFor(() => expect(api.undoEdit).toHaveBeenCalledWith('token', { expected_revision: 4 }));
  await waitFor(() => expect(screen.queryByRole('button', { name: /^Undo:/ })).not.toBeInTheDocument());
});

test('a 409 on an edit refetches and shows "Updated from another window"', async () => {
  api.getPlan.mockResolvedValue(view());
  api.postEdits.mockRejectedValue(apiError(409, { code: 'revision_conflict', revision: 6 }));
  renderPanel();
  fireEvent.click(await screen.findByRole('button', { name: 'Remove ECON 3720' }));
  expect(await screen.findByText('Updated from another window')).toBeInTheDocument();
  expect(api.getPlan).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByText('Updated from another window')).not.toBeInTheDocument();
});

test('opening a course shows its details with Back to plan', async () => {
  api.getPlan.mockResolvedValue(view());
  const onBack = jest.fn();
  renderPanel({ courseId: 'CHEM 2410', onBack });
  expect(await screen.findByText('Organic Chem I')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Back to plan' }));
  expect(onBack).toHaveBeenCalled();
});

test('a found clash outlines the blocks and says Clash', async () => {
  api.getPlan.mockResolvedValue(view({
    report: report({
      clashes: { status: 'found', pairs: [['CHEM 2410', 'ECON 3720']], reason: null },
      schedule: {
        published: true,
        reason: null,
        blocks: [
          { course: 'CHEM 2410', section: '001', kind: 'lecture', day: 'Mo', start: '09:00', end: '09:50' },
          { course: 'ECON 3720', section: '001', kind: 'lecture', day: 'Mo', start: '09:30', end: '10:45' },
        ],
      },
    }),
  }));
  renderPanel();
  expect(await screen.findByText('Mon 9:00–9:50 CHEM 2410 (Clash)')).toBeInTheDocument();
  expect(document.querySelectorAll('.pp-block.is-clash')).toHaveLength(2);
});

// Found in the browser: with no chat card in view (reload, new chat, a
// "Suggest courses" pick), a pending proposal had no Accept or Discard.
test('a pending proposal can be accepted or discarded from the panel', async () => {
  api.getPlan.mockResolvedValue(view({ proposal: proposal() }));
  api.acceptProposal.mockResolvedValue({ plan: plan({ revision: 5 }), report: report(), undo_label: 'Undo: added ECON 3300' });
  renderPanel();

  const pending = await screen.findByRole('group', { name: 'Pending change' });
  expect(pending).toHaveTextContent('Move ECON 3010 to Fall 2027, add ECON 3300');
  fireEvent.click(within(pending).getByRole('button', { name: 'Accept' }));
  await waitFor(() => expect(api.acceptProposal).toHaveBeenCalledWith('token', 'p1'));
  expect(await screen.findByRole('button', { name: 'Undo: added ECON 3300' })).toBeInTheDocument();
  expect(screen.queryByText('Preview · not applied')).not.toBeInTheDocument();
});

test('discarding from the panel clears the preview', async () => {
  api.getPlan.mockResolvedValue(view({ proposal: proposal() }));
  api.discardProposal.mockResolvedValue({ proposal: { ...proposal(), status: 'discarded' } });
  renderPanel();

  const pending = await screen.findByRole('group', { name: 'Pending change' });
  fireEvent.click(within(pending).getByRole('button', { name: 'Discard' }));
  await waitFor(() => expect(screen.queryByText('Preview · not applied')).not.toBeInTheDocument());
});
