import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ProposalCard from './ProposalCard';
import VisualBlock from './VisualBlock';
import { MemoryRouter } from 'react-router-dom';
import SemesterView from '../planner/semester/SemesterView';
import { PlannerProvider } from '../../contexts/PlannerContext';
import * as api from '../../api/planner';
import { proposalRows } from '../planner/proposalDiff';
import { apiError, diff, plan, proposal, report, view } from '../planner/plannerFixtures';

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
jest.mock('../../api/campus', () => ({
  ...jest.requireActual('../../api/campus'),
  getCatalogCourse: jest.fn(() => Promise.reject(new Error('offline'))),
}));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token' }) }));
jest.mock('../../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({ config: { app: {}, school: { slug: 'uva' } } }),
}));

const card = (p = proposal(), extra = {}) => ({ type: 'proposed_change', proposal: p, ...extra });

// The chat-prereq mockup's change: ECON 4010 moves to Spring 2027, credits per term, prerequisites met.
const MOCKUP_DIFF = diff({
  heading: 'Move ECON 4010 to Spring 2027',
  courses: {
    added: [], removed: [], moved: [{ id: 'ECON 4010', from: 'Fall 2027', to: 'Spring 2027', title: 'Game Theory', credits: [3, 3] }],
  },
  rules: [],
  credits: { before: [7, 7], after: [10, 10] },
  terms: [
    { term: 'Spring 2027', before: { min: 7, max: 7, status: 'met' }, after: { min: 10, max: 10, status: 'met' }, limits: null },
    { term: 'Fall 2027', before: { min: 6, max: 6, status: 'met' }, after: { min: 3, max: 3, status: 'met' }, limits: null },
  ],
  prereqs: { status: 'met', courses: [{ id: 'ECON 4010', term: 'Spring 2027', status: 'met', reason: null }] },
  difficulty: { before: 'Balanced', after: 'Balanced' },
  unknowns: [],
  added_courses: [],
});

// withPanel: the card beside the semester view of the proposal's term (C1).
const renderCard = (visual = card(), { withPanel = false } = {}) => render(
  <MemoryRouter>
    <PlannerProvider>
      <ProposalCard visual={visual} />
      {withPanel && <SemesterView term="Spring 2027" />}
    </PlannerProvider>
  </MemoryRouter>,
);

// Let the plan fetch each card starts settle before the test ends.
const settle = () => act(async () => {});

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

// Each row's cells, joined with spaces, without the icons' ligature names.
const rowTexts = () => [...document.querySelectorAll('.vc-diff > li')].map((li) => [...li.children].map((cell) => cell.textContent).join(' ').replace(/arrow_forward|swap_horiz|functions|check|close|help|info|add|remove|bar_chart|school/g, '').replace(/\s+/g, ' ').trim());

beforeEach(() => {
  jest.clearAllMocks();
  api.listPrograms.mockResolvedValue([]);
  api.getPlan.mockResolvedValue(view({ proposal: proposal() }));
});

test('Checking: a message and skeleton rows, no buttons', async () => {
  renderCard(card(null, { status: 'checking' }));
  expect(screen.getByText('Checking your plan…')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  await settle();
});

test('Ready, as in the mockup: "Not applied", the move leads, credit rows per term, Prerequisites Met; Apply and Not now', async () => {
  api.getPlan.mockResolvedValue(view({ proposal: proposal({ diff: MOCKUP_DIFF }) }));
  renderCard(card(proposal({ diff: MOCKUP_DIFF })));
  expect(screen.getByRole('heading', { name: 'Proposed change' })).toBeInTheDocument();
  expect(screen.getByText('Not applied')).toHaveClass('vc-tag', 'is-now');
  expect(screen.queryByRole('heading', { level: 4 })).not.toBeInTheDocument();
  expect(rowTexts()).toEqual([
    'ECON 4010 Game Theory Fall 2027 changes to Spring 2027',
    'Spring 2027 credits 7 changes to 10',
    'Fall 2027 credits 6 changes to 3',
    'Prerequisites Met',
  ]);
  const lead = document.querySelector('.vc-diff > li');
  expect(lead.querySelector('.vc-code')).toHaveTextContent('ECON 4010');
  expect(lead.querySelector('.vc-diff-icon')).toHaveClass('is-course');
  expect(screen.getByText('Met').closest('li').querySelector('.vc-diff-icon')).toHaveClass('is-ok');
  expect(screen.getByRole('button', { name: 'Apply' })).toHaveClass('is-primary');
  expect(screen.getByRole('button', { name: 'Not now' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Drop it instead' })).not.toBeInTheDocument();
  await waitFor(() => expect(api.getPlan).toHaveBeenCalled());
});

test('rows rank: courses, "Not what you asked", problems, credits, changes, then unknowns without a "?" prefix', () => {
  const rows = proposalRows(diff({
    literal_differs: 'You said drop; I moved ECON 3010 to fall',
    prereqs: { status: 'not_met', courses: [] },
    clashes: { before: 'none', after: 'found' },
    credits: { before: [17, 17], after: [20, 20] },
  }));
  expect(rows.map((r) => [r.kind, r.label || r.code])).toEqual([
    ['course', 'ECON 3010'],
    ['course', 'ECON 3300'],
    ['literal', 'Not what you asked'],
    ['problem', 'Prerequisites'],
    ['problem', 'Clashes'],
    ['credits', 'Credits this term'],
    ['change', 'Economics electives'],
    ['change', 'Difficulty estimate'],
    ['unknown', 'Prerequisites not published for UVA'],
  ]);
  expect(rows[1]).toMatchObject({ title: 'Labor Economics', icon: 'add' });
  expect(rows[3]).toMatchObject({ value: 'Not met', icon: 'close' });
  expect(proposalRows(diff({ prereqs: { status: 'unknown', courses: [] }, unknowns: [] })).pop())
    .toMatchObject({ kind: 'unknown', label: 'Prerequisites', value: 'Unknown', icon: 'help' });
});

test('a problem row demotes Apply to secondary; the difference and unknowns show as rows', async () => {
  const problem = proposal({
    diff: diff({ prereqs: { status: 'not_met', courses: [] }, literal_differs: 'You said drop; I moved ECON 3010 to fall' }),
  });
  api.getPlan.mockResolvedValue(view({ proposal: problem }));
  renderCard(card(problem));
  expect(screen.getByText('Not met').closest('li')).toHaveClass('is-problem');
  expect(screen.getByText('Not what you asked')).toBeInTheDocument();
  expect(screen.getByText('You said drop; I moved ECON 3010 to fall')).toHaveClass('vc-diff-note');
  expect(screen.getByText('Prerequisites not published for UVA').closest('li')).toHaveClass('is-unknown');
  expect(screen.queryByText(/^\? /)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Apply' })).not.toHaveClass('is-primary');
  expect(screen.getByRole('button', { name: 'Drop it instead' })).toBeInTheDocument();
  await waitFor(() => expect(api.getPlan).toHaveBeenCalled());
});

test('Saving: a spinner, Not now disabled; then the Applied tag with Undo and My degree; the semester view agrees', async () => {
  const accept = deferred();
  api.acceptProposal.mockReturnValue(accept.promise);
  api.undoEdit.mockResolvedValue({ plan: plan({ revision: 6 }), report: report(), undo_label: null });
  renderCard(card(), { withPanel: true });
  expect(await screen.findByRole('group', { name: 'Pending change' })).toBeInTheDocument();
  expect(document.querySelector('.sv-card.is-ghost-in')).toBeInTheDocument();

  const cardEl = () => document.querySelector('.vc-proposal');
  fireEvent.click(within(cardEl()).getByRole('button', { name: 'Apply' }));
  const saving = within(cardEl()).getByRole('button', { name: 'Applying…' });
  expect(saving).toBeDisabled();
  expect(saving.querySelector('.vc-spinner')).toBeInTheDocument();
  expect(within(cardEl()).getByRole('button', { name: 'Not now' })).toBeDisabled();
  // The semester view's buttons wait on the same call.
  expect(within(screen.getByRole('group', { name: 'Pending change' })).getByRole('button', { name: 'Applying…' })).toBeDisabled();

  accept.resolve({
    plan: plan({ revision: 5, undo: { pointer: 1, stack: [{ label: 'Undo: moved ECON 3010 to Fall 2027, added ECON 3300', revision: 5 }] } }),
    report: report(),
  });
  expect(await screen.findByText('Applied')).toHaveClass('vc-tag', 'is-done');
  expect(screen.queryByText('Not applied')).not.toBeInTheDocument();
  expect(within(cardEl()).getByRole('link', { name: 'My degree' })).toHaveAttribute('href', '/courses?view=degree');
  expect(screen.queryByRole('group', { name: 'Pending change' })).not.toBeInTheDocument();
  expect(document.querySelector('.sv-card.is-ghost-in')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Undo: moved ECON 3010 to Fall 2027, added ECON 3300' })).toBeEnabled();

  fireEvent.click(within(cardEl()).getByRole('button', { name: 'Undo' }));
  expect(await screen.findByText('Undone')).toBeInTheDocument();
  expect(api.undoEdit).toHaveBeenCalledWith('token', { expected_revision: 5 }, expect.anything());
});

test('an accept with no answer at all shows "Couldn\'t save · Retry" in ink; Retry applies it', async () => {
  const down = () => Object.assign(new Error('Network request failed'), { status: 0, network: true });
  api.acceptProposal
    .mockRejectedValueOnce(down())
    .mockResolvedValueOnce({ plan: plan({ revision: 5 }), report: report() });
  api.getPlan
    .mockResolvedValueOnce(view({ proposal: proposal() }))
    .mockRejectedValueOnce(down())
    .mockRejectedValueOnce(down())
    .mockRejectedValueOnce(down());
  render(<PlannerProvider retryDelays={[0, 0, 0]}><ProposalCard visual={card()} /></PlannerProvider>);
  await waitFor(() => expect(api.getPlan).toHaveBeenCalled());

  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(await screen.findByText(/Couldn't save/)).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveClass('vc-alert');
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Applied')).toBeInTheDocument();
  expect(api.acceptProposal).toHaveBeenCalledTimes(2);
});

test('Failed: an ink error line with Retry, which applies again', async () => {
  api.acceptProposal
    .mockRejectedValueOnce(apiError(422, { error: 'bad_ops' }))
    .mockResolvedValueOnce({ plan: plan({ revision: 5 }), report: report() });
  renderCard();
  await waitFor(() => expect(api.getPlan).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  const line = await screen.findByRole('alert');
  expect(line).toHaveTextContent("Couldn't apply this change.");
  fireEvent.click(within(line).getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Applied')).toBeInTheDocument();
  expect(api.acceptProposal).toHaveBeenCalledTimes(2);
});

test('Not now: one muted "Discarded" line', async () => {
  api.discardProposal.mockResolvedValue({ proposal: proposal({ status: 'discarded' }) });
  renderCard();
  fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
  expect(await screen.findByText('Discarded')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  await settle();
});

test('Replaced and Expired: a muted reason, no buttons', async () => {
  api.getPlan.mockResolvedValue(view({ proposal: proposal({ id: 'p2' }) }));
  const { unmount } = renderCard();
  expect(await screen.findByText('Replaced by a newer suggestion')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  unmount();

  renderCard(card(proposal({ expires_at: '2020-01-01T00:00:00Z' })));
  expect(screen.getByText(/^Expired/)).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  await settle();
});

test('Needs review: changed rows highlighted, "Your plan changed, check again", Apply', async () => {
  const refreshed = proposal({
    diff: diff({ credits: { before: [17, 17], after: [14, 14] } }),
  });
  api.acceptProposal
    .mockRejectedValueOnce(apiError(409, { status: 'needs_review', proposal: refreshed }))
    .mockResolvedValueOnce({ plan: plan({ revision: 5 }), report: report() });
  renderCard();
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

  expect(await screen.findByText('Your plan changed, check again')).toBeInTheDocument();
  const credits = screen.getByText('Credits this term').closest('li');
  expect(credits).toHaveClass('is-changed');
  expect(credits).toHaveTextContent('Changed');
  expect(credits.querySelector('.vc-arrow')).toHaveTextContent(/^17.*changes to 14$/);
  expect(screen.getByText('Difficulty estimate').closest('li')).not.toHaveClass('is-changed');
  expect(screen.queryByRole('button', { name: 'Not now' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(await screen.findByText('Applied')).toBeInTheDocument();
  await settle();
});

test('Refused: the reason in ink with an icon, no buttons', async () => {
  api.acceptProposal.mockRejectedValue(apiError(409, { status: 'refused', reason: 'ECON 3300 is no longer offered' }));
  renderCard();
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  const reason = await screen.findByText('ECON 3300 is no longer offered');
  expect(reason.closest('.vc-alert')).toHaveAttribute('role', 'alert');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  await settle();
});

test('"Drop it instead" proposes the literal remove and replaces this card', async () => {
  const literal = proposal({
    diff: diff({ literal_differs: 'You said drop; I moved ECON 3010 to fall so Intermediate theory still finishes' }),
  });
  api.getPlan.mockResolvedValue(view({ proposal: literal }));
  api.createProposal.mockResolvedValue({
    proposal: proposal({
      id: 'p2',
      ops: [{ op: 'remove', course: 'ECON 3010' }, { op: 'add', course: 'ECON 3300' }],
      diff: diff({ heading: 'Remove ECON 3010, add ECON 3300', courses: { added: ['ECON 3300'], removed: ['ECON 3010'], moved: [] } }),
    }),
  });
  renderCard(card(literal));
  expect(screen.getByText(/^You said drop; I moved ECON 3010 to fall/)).toBeInTheDocument();
  await waitFor(() => expect(api.getPlan).toHaveBeenCalled());

  fireEvent.click(screen.getByRole('button', { name: 'Drop it instead' }));
  await waitFor(() => expect(api.createProposal).toHaveBeenCalledWith('token', {
    ops: [{ op: 'remove', course: 'ECON 3010' }, { op: 'add', course: 'ECON 3300' }],
    expected_revision: 4,
  }));
  expect(await screen.findByText('Replaced by a newer suggestion')).toBeInTheDocument();
  expect(screen.getByText('Removed').closest('li')).toHaveTextContent('ECON 3010');
  expect(screen.getByTestId('planner-announcer')).toHaveTextContent('Proposed change ready: remove ECON 3010, add ECON 3300');
});

test('VisualBlock renders proposed_change; outside a provider it shows no buttons', () => {
  render(<VisualBlock visual={card()} />);
  expect(screen.getByRole('heading', { name: 'Proposed change' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument();
});
