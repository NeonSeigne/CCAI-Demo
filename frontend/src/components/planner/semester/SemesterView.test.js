import React from 'react';
import {
  act, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SemesterView from './SemesterView';
import ProposalCard from '../../visuals/ProposalCard';
import { PlannerProvider } from '../../../contexts/PlannerContext';
import { ToastProvider } from '../../Toast';
import { DndProvider } from '../../dnd';
import * as api from '../../../api/planner';
import * as campus from '../../../api/campus';
import { clearCourseCache as clearCourseDetailsCache } from '../../../modules/course';
import {
  apiError, diff, plan, proposal, report, view,
} from '../plannerFixtures';

jest.mock('../../../api/planner', () => {
  const actual = jest.requireActual('../../../api/planner');
  return {
    ...actual,
    getPlan: jest.fn(),
    listPrograms: jest.fn(),
    postEdits: jest.fn(),
    createProposal: jest.fn(),
    acceptProposal: jest.fn(),
    discardProposal: jest.fn(),
    undoEdit: jest.fn(),
    redoEdit: jest.fn(),
    preview: jest.fn(),
  };
});
jest.mock('../../../api/campus', () => {
  const actual = jest.requireActual('../../../api/campus');
  return {
    ...actual,
    getCatalogCourse: jest.fn(),
    searchCatalog: jest.fn(),
    getCatalogStarters: jest.fn(),
    getCourseRatings: jest.fn(),
  };
});
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token' }) }));
const mockChat = { setActiveTerm: jest.fn() };
jest.mock('../../../contexts/ChatContext', () => ({ useChat: () => mockChat }));

const lecture = (section, extra = {}) => ({
  section, type: 'LEC', instructors: 'Lee Marsh', enrolled: 78, capacity: 90, seats_open: 12, is_open: true, ...extra,
});

// `difficulty` is the backend's label (R5); the view reads it, never the GPA.
const summaries = () => ({
  'CHEM 2410': {
    identifier: 'CHEM 2410',
    title: 'Organic Chem I',
    grades: { gpa: 2.81 }, difficulty: 'harder',
    sections: { term: 'Fall 2026', historical: true, rows: [lecture('001', { meetings: ['Mo 9:00am - 9:50am'] })] },
  },
  'ECON 3720': {
    identifier: 'ECON 3720',
    title: 'Econometrics',
    grades: { gpa: 3.3 }, difficulty: 'typical',
    sections: { rows: [lecture('001', { instructors: 'Dana Okafor', meetings: ['We 11:00am - 12:15pm'] })] },
  },
  'ECON 3010': { identifier: 'ECON 3010', title: 'Intermediate Micro', grades: { gpa: 3.61 }, difficulty: 'easier', sections: { rows: [] } },
  'ECON 3300': {
    identifier: 'ECON 3300',
    title: 'Labor Economics',
    grades: { gpa: 3.2 }, difficulty: 'typical',
    sections: {
      rows: [
        lecture('001', { meetings: ['MoWe 11:00am - 12:15pm'] }),
        lecture('002', { meetings: ['TuTh 9:30am - 10:45am'] }),
      ],
    },
  },
});
// Rebuilt before every test, so a test that edits it can't leak into the next.
let SUMMARIES = summaries();

const box = (left, top, width, height) => ({
  x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => {},
});

/** jsdom has no layout: the course list above the week, a search row inside the list. */
function layout() {
  if (this.matches?.('li.sv-result') || this.querySelector?.(':scope > .dnd-chip')) return box(320, 120, 500, 30);
  if (this.matches?.('article.sv-card')) return box(320, 200, 600, 90);
  if (this.matches?.('section.sv-courses')) return box(300, 50, 640, 400);
  if (this.matches?.('section.sv-week')) return box(300, 500, 640, 300);
  return box(0, 0, 0, 0);
}

const tick = () => act(() => new Promise((resolve) => { setTimeout(resolve, 0); }));

const renderView = ({ term = 'Spring 2027', extra = null } = {}) => render(
  <MemoryRouter initialEntries={['/courses?view=semester']}>
    <ToastProvider>
      <PlannerProvider retryDelays={[0, 0, 0]}>
        <DndProvider>
          <SemesterView term={term} />
          {extra}
        </DndProvider>
      </PlannerProvider>
    </ToastProvider>
  </MemoryRouter>,
);

const card = (id) => document.querySelector(`article.sv-card[data-course="${id}"]`);

beforeEach(() => {
  jest.clearAllMocks();
  clearCourseDetailsCache();
  SUMMARIES = summaries();
  window.matchMedia = (media) => ({
    matches: false, media, addEventListener: () => {}, removeEventListener: () => {},
  });
  api.listPrograms.mockResolvedValue([]);
  api.getPlan.mockResolvedValue(view());
  api.preview.mockResolvedValue({ diff: diff({ credits: { before: [10, 10], after: [13, 13] } }), revision: 4 });
  campus.getCatalogCourse.mockImplementation((token, id) => (
    SUMMARIES[id] ? Promise.resolve(SUMMARIES[id]) : Promise.reject(new Error('404'))
  ));
  campus.getCourseRatings.mockResolvedValue({ ratings: [{ name: 'Lee Marsh', rating: 3.6 }] });
  campus.searchCatalog.mockResolvedValue({ courses: [{ identifier: 'ECON 3300', title: 'Labor Economics', gpa: 3.2 }] });
  campus.getCatalogStarters.mockResolvedValue({ courses: [] });
});

afterEach(() => { jest.restoreAllMocks(); });

test('gauges are meters with values, with the requirement gains beside them', async () => {
  renderView();
  const credits = await screen.findByRole('meter', { name: 'Credits' });
  expect(credits).toHaveAttribute('aria-valuenow', '17');
  expect(credits).toHaveAttribute('aria-valuetext', '17 credits');
  const load = screen.getByRole('meter', { name: 'Load' });
  expect(load).toHaveAttribute('aria-valuenow', '3');
  await waitFor(() => expect(load.getAttribute('aria-valuetext')).toMatch(/^Heavy; 1 harder, 1 typical, 1 easier$/));

  const tile = screen.getByRole('region', { name: 'Degree requirements' });
  const electives = within(tile).getByText('Economics electives').closest('li');
  expect(electives).toHaveTextContent(/0.*→.*1 of 4\+1/);
  expect(electives.querySelectorAll('.sv-rq-cells i.is-gain')).toHaveLength(1);
  expect(within(tile).getByText('Introductory economics').closest('li')).toHaveTextContent('2 of 2+0');
  expect(within(tile).queryByText('Prerequisites')).not.toBeInTheDocument();
});

test('an empty term: Credits 0, no Load, no week, only Search and Add course', async () => {
  api.getPlan.mockResolvedValue(view({
    plan: plan({ courses: [] }),
    report: report({
      courses: [], credits: { min: 0, max: 0, status: 'short', limits: { min: 12, max: 18 } },
      difficulty: { label: null, harder: 0, graded: 0, total: 0 },
      schedule: { published: true, reason: null, blocks: [] },
    }),
  }));
  renderView();
  expect(await screen.findByRole('meter', { name: 'Credits' })).toHaveAttribute('aria-valuenow', '0');
  expect(screen.queryByRole('meter', { name: 'Load' })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Week' })).not.toBeInTheDocument();
  expect(document.querySelector('.sv-card')).not.toBeInTheDocument();
  expect(screen.getByRole('searchbox', { name: 'Search courses' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add course' })).toBeInTheDocument();
});

test('UVA cards: code, GPA, credits, day strip and time, instructor ★, section seats, chips; and a week', async () => {
  renderView();
  await waitFor(() => expect(card('CHEM 2410')).toHaveTextContent('2.81'));
  const chem = card('CHEM 2410');
  expect(chem).toHaveTextContent('Organic Chem I');
  expect(chem).toHaveTextContent('4 cr');
  expect(chem.querySelector('.sv-days')).toHaveTextContent('Mon, Tue');
  expect(chem).toHaveTextContent('9:00–9:50');
  await waitFor(() => expect(chem).toHaveTextContent('L. Marsh'));
  await waitFor(() => expect(chem.querySelector('.sv-rating')).toHaveTextContent('3.6'));
  expect(chem).toHaveTextContent('Prereqs met');
  expect(chem).toHaveTextContent('Sec 001');
  expect(chem).toHaveTextContent('12 of 90 left');
  expect(card('ECON 3720').querySelector('.sv-tag.is-rq')).toHaveTextContent('Economics electives');
  // The course colour is on the code, the strip and the blocks; the card has none of its own.
  expect(chem.style.getPropertyValue('--sv-course-ink')).toMatch(/^var\(--course-\d-ink\)$/);

  const week = screen.getByRole('region', { name: 'Week' });
  expect(within(week).getByText('Mon 9:00–9:50 CHEM 2410')).toBeInTheDocument();
  expect(week.querySelectorAll('.sv-block')).toHaveLength(3);
});

test('UW cards list their section parts with seats, with no day strip and no week', async () => {
  api.getPlan.mockResolvedValue(view({
    plan: plan({ courses: [{ id: 'CHEM 2410', term: 'Spring 2027', sections: ['001', '312'] }] }),
    report: report({
      courses: [report().courses[0]],
      schedule: { published: false, reason: 'class times not published', blocks: [] },
    }),
  }));
  campus.getCatalogCourse.mockResolvedValue({
    identifier: 'CHEM 2410',
    grades: { gpa: 2.86 },
    sections: {
      historical: false,
      rows: [
        lecture('001', { capacity: 180, seats_open: 14 }),
        { section: '312', type: 'DIS', instructors: '', capacity: 25, seats_open: 4 },
        { section: '313', type: 'DIS', instructors: '', capacity: 25, seats_open: 9 },
      ],
    },
  });
  renderView();
  await waitFor(() => expect(card('CHEM 2410')).toHaveTextContent('LEC 001'));
  const chem = card('CHEM 2410');
  expect(chem).toHaveTextContent('14 of 180 left');
  expect(chem).toHaveTextContent('DIS 312');
  expect(chem).toHaveTextContent('4 of 25 left');
  expect(chem).not.toHaveTextContent('DIS 313');
  expect(chem.querySelector('.sv-days')).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Week' })).not.toBeInTheDocument();
});

test('the ⋯ menu moves, swaps a section and removes, with the right ops', async () => {
  api.postEdits.mockImplementation((token, body) => Promise.resolve({ ...view({ plan: plan({ revision: 5 }) }), notes: [] }));
  renderView();
  await screen.findByRole('button', { name: 'More for ECON 3720' });

  fireEvent.click(screen.getByRole('button', { name: 'More for ECON 3720' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Move to…' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Fall 2027' }));
  await waitFor(() => expect(api.postEdits).toHaveBeenCalledTimes(1));
  expect(api.postEdits.mock.calls[0][1].ops).toEqual([{ op: 'move', course: 'ECON 3720', to_term: 'Fall 2027' }]);

  fireEvent.click(await screen.findByRole('button', { name: 'More for CHEM 2410' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Swap section' }));
  const dialog = await screen.findByRole('dialog', { name: 'Swap section · CHEM 2410' });
  expect(within(dialog).getByText('Mon 9:00–9:50')).toBeInTheDocument();
  expect(within(dialog).getByText('Fits')).toBeInTheDocument();
  expect(within(dialog).getByRole('radio')).toBeChecked();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
  await waitFor(() => expect(api.postEdits).toHaveBeenCalledTimes(2));
  expect(api.postEdits.mock.calls[1][1].ops).toEqual([{ op: 'pick_section', course: 'CHEM 2410', sections: ['001'] }]);

  fireEvent.click(screen.getByRole('button', { name: 'More for CHEM 2410' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));
  await waitFor(() => expect(api.postEdits).toHaveBeenCalledTimes(3));
  expect(api.postEdits.mock.calls[2][1].ops).toEqual([{ op: 'remove', course: 'CHEM 2410' }]);
});

test('Swap and Remove shortcuts are buttons with labels, and Undo / Redo are disabled with nothing to step', async () => {
  renderView();
  expect(await screen.findByRole('button', { name: 'Swap section of CHEM 2410' })).toHaveAttribute('title', 'Swap section');
  expect(screen.getByRole('button', { name: 'Remove CHEM 2410' })).toHaveAttribute('title', 'Remove');
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
});

test('search results: Add puts the course in this term and says "Added to Spring 2027" with Undo', async () => {
  api.postEdits.mockResolvedValue({
    ...view({ plan: plan({ revision: 5, courses: [...plan().courses, { id: 'ECON 3300', term: 'Spring 2027', sections: null }] }) }),
    notes: [],
  });
  renderView();
  fireEvent.change(await screen.findByRole('searchbox', { name: 'Search courses' }), { target: { value: 'labor' } });
  const results = await screen.findByRole('region', { name: 'Search results' });
  await waitFor(() => expect(campus.searchCatalog).toHaveBeenCalledWith('token', { q: 'labor', limit: 8 }));
  fireEvent.click(await within(results).findByRole('button', { name: 'Add ECON 3300' }));
  await waitFor(() => expect(api.postEdits).toHaveBeenCalled());
  expect(api.postEdits.mock.calls[0][1].ops).toEqual([{ op: 'add', course: 'ECON 3300', term: 'Spring 2027' }]);
  const toast = (await screen.findByText('Added to Spring 2027')).closest('.cc-toast');
  expect(within(toast).getByRole('button', { name: 'Undo' })).toBeInTheDocument();
});

/** Space lifts the item's grip, arrows step to the named target, Space drops. */
async function dragTo(grip, targetLabel) {
  grip.focus();
  fireEvent.keyDown(grip, { code: 'Space', key: ' ' });
  await tick();
  for (let i = 0; i < 3 && targetLabel; i += 1) {
    if (screen.queryByText(new RegExp(`is over ${targetLabel}\\.$`))) break;
    fireEvent.keyDown(document, { code: 'ArrowDown', key: 'ArrowDown' });
    // eslint-disable-next-line no-await-in-loop
    await tick();
  }
  fireEvent.keyDown(document, { code: 'Space', key: ' ' });
  await tick();
}

const searchFor = async () => {
  fireEvent.change(await screen.findByRole('searchbox', { name: 'Search courses' }), { target: { value: 'labor' } });
  return screen.findByRole('button', { name: 'Drag ECON 3300' });
};

describe('drops', () => {
  beforeEach(() => {
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(layout);
    api.postEdits.mockResolvedValue({ ...view({ plan: plan({ revision: 5 }) }), notes: [] });
  });

  test('a week drop adds the course with the one section that fits', async () => {
    renderView();
    await screen.findByRole('region', { name: 'Week' });
    await dragTo(await searchFor(), 'Week');
    await waitFor(() => expect(api.postEdits).toHaveBeenCalled());
    // 001 meets Wed 11:00 with ECON 3720; 002 fits.
    expect(api.postEdits.mock.calls[0][1].ops).toEqual([
      { op: 'add', course: 'ECON 3300', term: 'Spring 2027', sections: ['002'] },
    ]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('a week drop where several sections fit adds the course and opens Swap section', async () => {
    SUMMARIES['ECON 3300'].sections.rows[0].meetings = ['Fr 11:00am - 12:15pm'];
    renderView();
    await screen.findByRole('region', { name: 'Week' });
    await dragTo(await searchFor(), 'Week');
    await waitFor(() => expect(api.postEdits).toHaveBeenCalled());
    expect(api.postEdits.mock.calls[0][1].ops).toEqual([{ op: 'add', course: 'ECON 3300', term: 'Spring 2027' }]);
    const dialog = await screen.findByRole('dialog', { name: 'Swap section · ECON 3300' });
    expect(within(dialog).getAllByText('Fits')).toHaveLength(2);
  });

  test('a week drop whose sections fail to load opens Swap section with Retry, never a silent pick', async () => {
    campus.getCatalogCourse.mockImplementation(() => Promise.reject(new Error('down')));
    renderView();
    await screen.findByRole('region', { name: 'Week' });
    await dragTo(await searchFor(), 'Week');
    const dialog = await screen.findByRole('dialog', { name: 'Swap section · ECON 3300' });
    expect(api.postEdits.mock.calls[0][1].ops).toEqual([{ op: 'add', course: 'ECON 3300', term: 'Spring 2027' }]);
    expect(await within(dialog).findByText(/Couldn't load/)).toBeInTheDocument();

    // The failure isn't cached: Retry asks again.
    campus.getCatalogCourse.mockImplementation((token, id) => Promise.resolve(SUMMARIES[id]));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));
    expect(await within(dialog).findByText('Fits')).toBeInTheDocument();
  });

  test('a second week drop of a course still being looked up springs back', async () => {
    let release;
    campus.getCatalogCourse.mockImplementation((token, id) => (id === 'ECON 3300'
      ? new Promise((resolve) => { release = () => resolve(SUMMARIES[id]); })
      : Promise.resolve(SUMMARIES[id])));
    renderView();
    await screen.findByRole('region', { name: 'Week' });
    const grip = await searchFor();
    await dragTo(grip, 'Week');
    await dragTo(screen.getByRole('button', { name: 'Drag ECON 3300' }), 'Week');
    await act(async () => { release(); });
    await waitFor(() => expect(api.postEdits).toHaveBeenCalledTimes(1));
    await tick();
    expect(api.postEdits).toHaveBeenCalledTimes(1);
  });

  test('hovering a target previews credits with the op a drop would send, after a short pause', async () => {
    api.getPlan.mockResolvedValue(view({
      plan: plan({ courses: [...plan().courses, { id: 'ECON 3300', term: 'Fall 2027', sections: null }] }),
    }));
    renderView();
    await screen.findByRole('region', { name: 'Week' });
    const grip = await searchFor();
    grip.focus();
    fireEvent.keyDown(grip, { code: 'Space', key: ' ' });
    await tick();
    for (let i = 0; i < 3 && !screen.queryByText(/is over Week\.$/); i += 1) {
      fireEvent.keyDown(document, { code: 'ArrowDown', key: 'ArrowDown' });
      // eslint-disable-next-line no-await-in-loop
      await tick();
    }
    expect(screen.getByText(/is over Week\.$/)).toBeInTheDocument();
    expect(api.preview).not.toHaveBeenCalled();
    await waitFor(() => expect(api.preview).toHaveBeenCalled());
    expect(api.preview.mock.calls[0][1]).toEqual(expect.objectContaining({
      ops: [{ op: 'move', course: 'ECON 3300', to_term: 'Spring 2027' }],
      term: 'Spring 2027',
    }));
    await waitFor(() => expect(screen.getByRole('meter', { name: 'Credits' }).getAttribute('aria-valuetext'))
      .toBe('17 credits, 13 after the change'));
    fireEvent.keyDown(document, { code: 'Escape', key: 'Escape' });
    await tick();
  });

  test('dropping a course already in the term springs back and pulses its card', async () => {
    renderView();
    const grip = await screen.findByRole('button', { name: 'Drag CHEM 2410' });
    await dragTo(grip, 'Courses in Spring 2027');
    await waitFor(() => expect(card('CHEM 2410')).toHaveClass('is-pulsing'));
    expect(api.postEdits).not.toHaveBeenCalled();
  });
});

test('a pending proposal for this term: ghost cards in and out, ghost gauges and blocks', async () => {
  api.getPlan.mockResolvedValue(view({
    proposal: proposal({
      diff: diff({
        schedule: {
          blocks_in: [{ course: 'ECON 3300', section: '002', kind: 'lecture', day: 'Tu', start: '09:30', end: '10:45' }],
          blocks_out: [{ course: 'CHEM 2410', section: '001', kind: 'lecture', day: 'Mo', start: '09:00', end: '09:50' }],
        },
      }),
    }),
  }));
  renderView();
  const ghost = await screen.findByRole('article', { name: 'ECON 3300 Labor Economics, proposed addition' });
  expect(ghost).toHaveClass('is-ghost-in');
  expect(within(ghost).queryByRole('button')).not.toBeInTheDocument();
  expect(card('ECON 3010')).toHaveClass('is-ghost-out');
  expect(screen.getByRole('meter', { name: 'Load' }).getAttribute('aria-valuetext')).toMatch(/Balanced after the change$/);

  const week = screen.getByRole('region', { name: 'Week' });
  expect(within(week).getByText('Tue 9:30–10:45 ECON 3300 (proposed)')).toBeInTheDocument();
  expect(within(week).getByText('Mon 9:00–9:50 CHEM 2410 (proposed removal)')).toBeInTheDocument();
  expect(week.querySelector('.sv-block.is-ghost-in')).toHaveTextContent('ECON 3300');
  expect(week.querySelector('.sv-block.is-ghost-out')).toHaveTextContent('CHEM 2410');
});

test('a stale proposal shows its heading and Discard only, with no ghosts', async () => {
  api.getPlan.mockResolvedValue(view({ proposal: proposal({ base_revision: 3 }) }));
  renderView();
  const pending = await screen.findByRole('group', { name: 'Pending change' });
  expect(pending).toHaveTextContent('Move ECON 3010 to Fall 2027, add ECON 3300');
  expect(within(pending).getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  expect(within(pending).queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  expect(document.querySelector('.sv-card.is-ghost-in, .sv-card.is-ghost-out')).not.toBeInTheDocument();
});

test('a refused accept shows the reason and drops Accept', async () => {
  api.getPlan.mockResolvedValue(view({ proposal: proposal() }));
  api.acceptProposal.mockRejectedValue(apiError(409, { status: 'refused', reason: 'ECON 3300 is no longer offered' }));
  renderView();
  const pending = await screen.findByRole('group', { name: 'Pending change' });
  fireEvent.click(within(pending).getByRole('button', { name: 'Accept' }));
  expect(await within(pending).findByRole('alert')).toHaveTextContent('ECON 3300 is no longer offered');
  expect(within(pending).queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  expect(within(pending).getByRole('button', { name: 'Discard' })).toBeInTheDocument();
});

test('an accept that needs review says so', async () => {
  api.getPlan.mockResolvedValue(view({ proposal: proposal() }));
  api.acceptProposal.mockRejectedValue(apiError(409, { status: 'needs_review', proposal: proposal() }));
  renderView();
  const pending = await screen.findByRole('group', { name: 'Pending change' });
  fireEvent.click(within(pending).getByRole('button', { name: 'Accept' }));
  expect(await screen.findByText('Your plan changed, check again')).toBeInTheDocument();
});

test('after Remove, focus moves to the next card, else the Courses heading', async () => {
  api.postEdits.mockReturnValue(new Promise(() => {}));
  renderView();
  fireEvent.click(await screen.findByRole('button', { name: 'Remove CHEM 2410' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Drag ECON 3720' })).toHaveFocus());
  fireEvent.click(screen.getByRole('button', { name: 'Remove ECON 3010' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Courses' })).toHaveFocus());
});

test('Cmd+Z anywhere on the page undoes, but not in a text field', async () => {
  api.getPlan.mockResolvedValue(view({ undo_label: 'Undo: removed ECON 3010' }));
  api.undoEdit.mockResolvedValue({ plan: plan({ revision: 5 }), report: report(), undo_label: null });
  renderView();
  const search = await screen.findByRole('searchbox', { name: 'Search courses' });
  fireEvent.keyDown(search, { key: 'z', metaKey: true });
  await tick();
  expect(api.undoEdit).not.toHaveBeenCalled();
  fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
  await waitFor(() => expect(api.undoEdit).toHaveBeenCalledTimes(1));
});

test('a course still saving shows its ⋯ menu disabled', async () => {
  api.postEdits.mockReturnValue(new Promise(() => {}));
  renderView();
  fireEvent.change(await screen.findByRole('searchbox', { name: 'Search courses' }), { target: { value: 'labor' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Add ECON 3300' }));
  const more = await screen.findByRole('button', { name: 'More for ECON 3300' });
  expect(more).toHaveAttribute('aria-disabled', 'true');
  expect(more).toHaveAccessibleDescription('Saving; available once saved');
  fireEvent.click(more);
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Remove ECON 3300' })).not.toBeInTheDocument();
});

test('switching term does not flash the new term\'s cards', async () => {
  api.getPlan.mockImplementation((token, { term } = {}) => Promise.resolve(term
    ? view({ report: report({ term: 'Fall 2027' }) })
    : view()));
  const { rerender } = renderView();
  await screen.findByRole('meter', { name: 'Credits' });
  rerender(
    <MemoryRouter initialEntries={['/courses?view=semester']}>
      <ToastProvider>
        <PlannerProvider retryDelays={[0, 0, 0]}>
          <DndProvider>
            <SemesterView term="Fall 2027" />
          </DndProvider>
        </PlannerProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { level: 1, name: 'Fall 2027' });
  expect(document.querySelector('.sv-flash')).not.toBeInTheDocument();
});

test('a stale proposal card offers Discard only', async () => {
  api.getPlan.mockResolvedValue(view({ proposal: proposal({ base_revision: 3 }) }));
  render(
    <MemoryRouter>
      <PlannerProvider>
        <ProposalCard visual={{ type: 'proposed_change', proposal: proposal({ base_revision: 3 }) }} />
      </PlannerProvider>
    </MemoryRouter>,
  );
  expect(await screen.findByRole('button', { name: 'Discard' })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument());
});

test('chat answers for the open term while the view is up', async () => {
  const { unmount } = renderView();
  await screen.findByRole('meter', { name: 'Credits' });
  expect(mockChat.setActiveTerm).toHaveBeenLastCalledWith('Spring 2027');
  unmount();
  expect(mockChat.setActiveTerm).toHaveBeenLastCalledWith(null);
});

test('a term that will not load says "Couldn\'t load · Retry"', async () => {
  api.getPlan.mockImplementation((token, { term } = {}) => {
    if (!term) return Promise.resolve(view());
    return api.getPlan.mock.calls.filter((call) => call[1]?.term).length > 1
      ? Promise.resolve(view({ report: report({ term: 'Fall 2027', courses: [] }) }))
      : Promise.reject(apiError(503, 'down'));
  });
  renderView({ term: 'Fall 2027' });
  expect(screen.getByLabelText('Loading semester')).toBeInTheDocument();
  expect(await screen.findByText(/Couldn't load/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('meter', { name: 'Credits' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: 'Fall 2027' })).toBeInTheDocument();
});

// ---- Behaviours moved from the old plan panel (C1) -------------------------

test('a pending proposal can be accepted here; "Plan updated" offers Undo', async () => {
  api.getPlan.mockResolvedValue(view({ proposal: proposal() }));
  api.acceptProposal.mockResolvedValue({
    plan: plan({ revision: 5, undo: { pointer: 1, stack: [{ label: 'Undo: added ECON 3300', revision: 5 }] } }),
    report: report(),
  });
  renderView();
  const pending = await screen.findByRole('group', { name: 'Pending change' });
  expect(pending).toHaveTextContent('Move ECON 3010 to Fall 2027, add ECON 3300');
  fireEvent.click(within(pending).getByRole('button', { name: 'Accept' }));
  await waitFor(() => expect(api.acceptProposal).toHaveBeenCalledWith('token', 'p1', expect.anything()));
  expect(await screen.findByText('Plan updated')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Undo: added ECON 3300' })).toBeEnabled();
  expect(screen.queryByRole('group', { name: 'Pending change' })).not.toBeInTheDocument();
});

test('discarding here clears the preview', async () => {
  api.getPlan.mockResolvedValue(view({ proposal: proposal() }));
  api.discardProposal.mockResolvedValue({ proposal: { ...proposal(), status: 'discarded' } });
  renderView();
  const pending = await screen.findByRole('group', { name: 'Pending change' });
  fireEvent.click(within(pending).getByRole('button', { name: 'Discard' }));
  await waitFor(() => expect(screen.queryByRole('group', { name: 'Pending change' })).not.toBeInTheDocument());
  expect(document.querySelector('.sv-card.is-ghost-in')).not.toBeInTheDocument();
});

test('the undo button names the undo, and Undo and Cmd+Z walk the edit back', async () => {
  api.getPlan.mockResolvedValue(view({ undo_label: 'Undo: removed ECON 3010' }));
  api.undoEdit.mockResolvedValue({ plan: plan({ revision: 5 }), report: report(), undo_label: null });
  renderView();
  const undo = await screen.findByRole('button', { name: 'Undo: removed ECON 3010' });
  fireEvent.keyDown(undo, { key: 'z', metaKey: true });
  await waitFor(() => expect(api.undoEdit).toHaveBeenCalledWith('token', { expected_revision: 4 }, expect.anything()));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled());
});

test('a save with no answer shows "Couldn\'t save · Retry"; Retry resends the same edit', async () => {
  api.postEdits.mockRejectedValue(apiError(503, 'down'));
  renderView();
  fireEvent.click(await screen.findByRole('button', { name: 'Remove ECON 3720' }));
  expect(await screen.findByText(/Couldn't save/)).toBeInTheDocument();
  expect(api.postEdits).toHaveBeenCalledTimes(4);

  api.postEdits.mockResolvedValue({
    ...view({ plan: plan({ revision: 5, courses: plan().courses.filter((c) => c.id !== 'ECON 3720') }) }),
    notes: [],
  });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.queryByText(/Couldn't save/)).not.toBeInTheDocument());
  expect(api.postEdits).toHaveBeenCalledTimes(5);
  expect(new Set(api.postEdits.mock.calls.map((call) => call[1].idempotency_key)).size).toBe(1);
});
