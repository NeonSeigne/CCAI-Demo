import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ProposalCard from './ProposalCard';
import VisualBlock from './VisualBlock';
import { MemoryRouter } from 'react-router-dom';
import SemesterView from '../planner/semester/SemesterView';
import { PlannerProvider } from '../../contexts/PlannerContext';
import * as api from '../../api/planner';
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

test('Ready: label, action heading, biggest consequence first, rows, unknowns above the buttons', async () => {
  renderCard();
  expect(screen.getByText('Proposed change')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Move ECON 3010 to Fall 2027, add ECON 3300' })).toBeInTheDocument();
  // A rule count moving outranks difficulty, which outranks unchanged credits.
  expect(document.querySelector('.pc-lead')).toHaveTextContent(/^Economics electives: 1 →.*2 of 4$/);
  const rows = [...document.querySelectorAll('.pc-row')].map((row) => row.textContent);
  expect(rows[0]).toMatch(/^Difficulty estimate/);
  expect(rows[1]).toMatch(/^Credits this term/);
  expect(screen.getByText('? Prerequisites not published for UVA')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Discard' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Drop it instead' })).not.toBeInTheDocument();
  await waitFor(() => expect(api.getPlan).toHaveBeenCalled());
});

test('Applying, then Applied · Undo while it is the latest edit; the semester view agrees', async () => {
  const accept = deferred();
  api.acceptProposal.mockReturnValue(accept.promise);
  api.undoEdit.mockResolvedValue({ plan: plan({ revision: 6 }), report: report(), undo_label: null });
  renderCard(card(), { withPanel: true });
  expect(await screen.findByRole('group', { name: 'Pending change' })).toBeInTheDocument();
  expect(document.querySelector('.sv-card.is-ghost-in')).toBeInTheDocument();

  // The semester view has its own Accept for the same proposal; act on the card's.
  const cardEl = () => document.querySelector('.proposal-card');
  fireEvent.click(within(cardEl()).getByRole('button', { name: 'Accept' }));
  expect(within(cardEl()).getByRole('button', { name: 'Applying…' })).toBeDisabled();
  expect(within(cardEl()).getByRole('button', { name: 'Discard' })).toBeDisabled();
  // The semester view's buttons wait on the same call.
  expect(within(screen.getByRole('group', { name: 'Pending change' })).getByRole('button', { name: 'Applying…' })).toBeDisabled();

  accept.resolve({
    plan: plan({ revision: 5, undo: { pointer: 1, stack: [{ label: 'Undo: moved ECON 3010 to Fall 2027, added ECON 3300', revision: 5 }] } }),
    report: report(),
  });
  expect(await screen.findByText('Applied')).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Pending change' })).not.toBeInTheDocument();
  expect(document.querySelector('.sv-card.is-ghost-in')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Undo: moved ECON 3010 to Fall 2027, added ECON 3300' })).toBeEnabled();

  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(await screen.findByText('Undone')).toBeInTheDocument();
  expect(api.undoEdit).toHaveBeenCalledWith('token', { expected_revision: 5 }, expect.anything());
});

test('an accept with no answer at all shows "Couldn\'t save · Retry"; Retry applies it', async () => {
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

  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  expect(await screen.findByText(/Couldn't save/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Applied')).toBeInTheDocument();
  expect(api.acceptProposal).toHaveBeenCalledTimes(2);
});

test('Discarded: one muted line', async () => {
  api.discardProposal.mockResolvedValue({ proposal: proposal({ status: 'discarded' }) });
  renderCard();
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
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

test('Needs review: changed rows highlighted, "Your plan changed, check again", Accept', async () => {
  const refreshed = proposal({
    diff: diff({ credits: { before: [17, 17], after: [14, 14] } }),
  });
  api.acceptProposal
    .mockRejectedValueOnce(apiError(409, { status: 'needs_review', proposal: refreshed }))
    .mockResolvedValueOnce({ plan: plan({ revision: 5 }), report: report() });
  renderCard();
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

  expect(await screen.findByText('Your plan changed, check again')).toBeInTheDocument();
  const credits = screen.getByText('Credits this term').closest('li');
  expect(credits).toHaveClass('is-changed');
  expect(credits).toHaveTextContent('Changed');
  expect(credits).toHaveTextContent(/17 →.*14/);
  expect(screen.getByText('Difficulty estimate').closest('li')).not.toHaveClass('is-changed');
  expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  expect(await screen.findByText('Applied')).toBeInTheDocument();
  await settle();
});

test('Refused: the reason in the error style, no buttons', async () => {
  api.acceptProposal.mockRejectedValue(apiError(409, { status: 'refused', reason: 'ECON 3300 is no longer offered' }));
  renderCard();
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  const reason = await screen.findByText('ECON 3300 is no longer offered');
  expect(reason).toHaveClass('pc-refused');
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
  expect(screen.getByRole('heading', { name: 'Remove ECON 3010, add ECON 3300' })).toBeInTheDocument();
  expect(screen.getByTestId('planner-announcer')).toHaveTextContent('Proposed change ready: remove ECON 3010, add ECON 3300');
});

test('VisualBlock renders proposed_change; outside a provider it shows no buttons', () => {
  render(<VisualBlock visual={card()} />);
  expect(screen.getByRole('heading', { name: 'Move ECON 3010 to Fall 2027, add ECON 3300' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
});
