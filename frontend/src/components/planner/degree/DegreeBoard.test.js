import React from 'react';
import {
  act, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import DegreeBoard, { boardTerms, dropAction } from './DegreeBoard';
import { PlannerContext } from '../../../contexts/PlannerContext';
import { DndProvider } from '../../dnd';
import { BrowseRow } from '../../../pages/CoursesPage';
import { searchCatalog } from '../../../api/campus';
import { uploadTranscript } from '../../../api/planner';
import { waffleModel, waffleSquares, waffleSummary } from './degreeFormat';

jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token' }) }));
jest.mock('../../../api/campus', () => ({
  ...jest.requireActual('../../../api/campus'),
  searchCatalog: jest.fn(),
}));
jest.mock('../../../api/planner', () => ({
  ...jest.requireActual('../../../api/planner'),
  uploadTranscript: jest.fn(),
}));

const COMPLETED = [
  { id: 'ECON 2010', title: 'Principles of Micro', credits: [3, 3], grade: 'A', term: 'Fall 2025' },
  { id: 'ECON 2020', title: 'Principles of Macro', credits: [3, 3], grade: null, term: 'Fall 2025' },
];

const WAFFLE = {
  total_credits: 120,
  complete: false,
  finish: null,
  groups: [
    {
      program_id: 'econ-ba', rule_id: 'intro', title: 'Introductory', status: 'met',
      size: 6, earned: 6, planned: 0, open: 0, unknown_grade: 1, unknown_grade_credits: 3,
      courses: ['ECON 2010', 'ECON 2020'], counted_elsewhere: [],
    },
    {
      program_id: 'econ-ba', rule_id: 'core', title: 'Core theory', status: 'short',
      size: 9, earned: 0, planned: 7, open: 2, unknown_grade: 0,
      courses: ['ECON 3020', 'ECON 3720'], counted_elsewhere: [],
    },
    {
      program_id: null, rule_id: null, title: 'Other credit', status: null,
      size: 105, earned: 0, planned: 0, open: 105, unknown_grade: 0, courses: [], counted_elsewhere: [],
    },
  ],
};

const course = (id, title, credits, gpa, requirements = []) => ({
  id, title, credits: [credits, credits], avg_gpa: gpa, harder: null, offered: 'yes', requirements, gen_ed: null,
});

const DEGREE = {
  revision: 3,
  term: 'Spring 2027',
  terms: [
    {
      term: 'Spring 2027',
      covered: true,
      credits: { min: 3, max: 3, status: 'short', limits: { min: 12, max: 18 }, reason: null },
      difficulty: { label: 'Heavy', harder: 1, graded: 1, total: 1 },
      courses: [course('ECON 3020', 'Intermediate Macro', 3, 2.81, ['Core theory'])],
    },
    {
      term: 'Fall 2027',
      covered: false,
      credits: { min: null, max: null, status: 'unknown', limits: null, reason: null },
      difficulty: { label: null, harder: 0, graded: 0, total: 1 },
      courses: [course('ECON 3720', 'Econometrics', 4, 3.05, ['Core theory'])],
    },
  ],
  completed: COMPLETED,
  rules: [],
  waffle: WAFFLE,
};

const PROGRAMS = [{
  id: 'econ-ba',
  name: 'Economics B.A.',
  type: 'major',
  rules: [{ id: 'intro', title: 'Introductory', courses: ['ECON 2010', 'ECON 2020'] }],
}];

function makePlanner(overrides = {}) {
  const { degree = DEGREE, profile: profileOverride, ...rest } = overrides;
  const profile = {
    program_ids: ['econ-ba'], catalog_year: 2026, completed: COMPLETED, ...profileOverride,
  };
  return {
    status: 'ready',
    view: {
      plan: {
        revision: 3,
        term: 'Spring 2027',
        profile,
        courses: [
          { id: 'ECON 3020', term: 'Spring 2027', sections: null },
          { id: 'ECON 3720', term: 'Fall 2027', sections: null },
        ],
      },
      report: { term: 'Spring 2027', rules: [], courses: [] },
    },
    degree,
    // Settles in the same act as the render, like a cached degree.
    refreshDegree: jest.fn(() => (degree ? { then: (ok) => ok(degree) } : new Promise(() => {}))),
    programs: PROGRAMS,
    ensureLoaded: jest.fn(),
    edit: jest.fn(() => Promise.resolve({})),
    undo: jest.fn(() => Promise.resolve({})),
    redo: jest.fn(() => Promise.resolve({})),
    retry: jest.fn(),
    dismissSaveError: jest.fn(),
    canUndo: false,
    canRedo: false,
    undoLabel: null,
    redoLabel: null,
    queueState: 'idle',
    saveError: null,
    ...rest,
  };
}

function LocationProbe() {
  const location = useLocation();
  const type = useNavigationType();
  return (
    <>
      <output data-testid="location">{`${location.pathname}${location.search}`}</output>
      <output data-testid="nav-type">{type}</output>
    </>
  );
}

const STAT = { identifier: 'STAT 3120', title: 'Intro Statistics', credits: [3, 3] };

function renderBoard(planner = makePlanner(), { rows = [] } = {}) {
  const utils = render(
    <MemoryRouter initialEntries={['/courses?view=degree']}>
      <PlannerContext.Provider value={planner}>
        <DndProvider>
          <ul>
            {rows.map((row) => (
              <BrowseRow
                key={row.identifier}
                course={row}
                isTicked={false}
                isSelected={false}
                full={false}
                onTick={() => {}}
                onOpen={() => {}}
              />
            ))}
          </ul>
          <DegreeBoard />
        </DndProvider>
        <LocationProbe />
      </PlannerContext.Provider>
    </MemoryRouter>,
  );
  return { ...utils, planner };
}

const tick = () => act(() => new Promise((resolve) => { setTimeout(resolve, 0); }));

const box = (left, top, width, height) => ({
  x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => {},
});
const NONE = box(0, 0, 0, 0);
const COLUMN_LEFT = { 'Spring 2027': 0, 'Fall 2027': 300, 'Spring 2028': 600 };

/** jsdom has no layout: term columns side by side, a card in each, the Browse row below them. */
function layout() {
  const term = this.getAttribute?.('data-term');
  if (term && term in COLUMN_LEFT) return box(COLUMN_LEFT[term] + 20, 50, 280, 600);
  if (this.matches?.('[data-course="ECON 3020"]')) return box(30, 150, 260, 60);
  if (this.matches?.('[data-course="ECON 3720"]')) return box(330, 150, 260, 60);
  if (this.matches?.('li.cc-row')) return box(30, 800, 260, 40);
  if (this.classList?.contains('dnd-chip')) {
    const source = document.querySelector('.dnd-source.is-dragging') || document.activeElement?.closest?.('.dnd-source');
    return source ? layout.call(source) : NONE;
  }
  return NONE;
}

async function keyboardDrag(handle, arrows = 1) {
  handle.focus();
  fireEvent.keyDown(handle, { code: 'Space', key: ' ' });
  await tick();
  for (let i = 0; i < arrows; i += 1) {
    fireEvent.keyDown(document, { code: 'ArrowRight', key: 'ArrowRight' });
    // eslint-disable-next-line no-await-in-loop
    await tick();
  }
  fireEvent.keyDown(document, { code: 'Space', key: ' ' });
  await tick();
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(layout);
});

afterEach(() => { jest.restoreAllMocks(); });

const column = (term) => screen.getByRole('region', { name: term });

describe('waffle and top bar', () => {
  test('squares follow the groups, with the summary and no Finish date when finish is null', () => {
    renderBoard();
    const waffle = screen.getByTestId('degree-waffle');
    const squares = waffle.querySelectorAll('.dg-square');
    expect(squares).toHaveLength(120);
    expect(waffle.querySelectorAll('[data-group="0"]')).toHaveLength(6);
    expect(waffle.querySelectorAll('[data-group="0"][data-state="unknown"]')).toHaveLength(3);
    expect(waffle.querySelectorAll('[data-group="0"][data-state="earned"]')).toHaveLength(3);
    expect(waffle.querySelectorAll('[data-group="1"][data-state="planned"]')).toHaveLength(7);
    expect(waffle.querySelectorAll('[data-group="1"][data-state="open"]')).toHaveLength(2);
    expect(waffle.querySelectorAll('[data-group="2"][data-state="open"]')).toHaveLength(105);
    expect(waffle).toHaveAttribute(
      'aria-label',
      'Economics B.A.: 6 earned, 7 planned, 107 open; Core theory 7 of 9',
    );
    expect(screen.queryByText('Finish')).not.toBeInTheDocument();
    expect(screen.getByText('Open requirements')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Economics B.A.' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Economics B.A. credits' });
    expect(within(table).getByRole('row', { name: /Core theory 0 7 2 0 9/ })).toBeInTheDocument();
  });

  test('the Finish date shows only when the server sends one', () => {
    renderBoard(makePlanner({ degree: { ...DEGREE, waffle: { ...WAFFLE, finish: 'Fall 2028' } } }));
    expect(screen.getByText('Finish')).toBeInTheDocument();
    expect(screen.getByText('Fall')).toBeInTheDocument();
    expect(screen.getByText('2028')).toBeInTheDocument();
    expect(screen.queryByText('Open requirements')).not.toBeInTheDocument();
  });

  test('waffleSquares counts one square per credit, group after group', () => {
    const squares = waffleSquares(WAFFLE, COMPLETED);
    expect(squares.map((s) => s.group)).toEqual([
      ...Array(6).fill(0), ...Array(9).fill(1), ...Array(105).fill(2),
    ]);
  });

  test('fractional credits round at running edges, so squares, key and summary agree', () => {
    const waffle = {
      total_credits: 10,
      groups: [
        { rule_id: 'a', title: 'A', status: 'short', earned: 1.5, planned: 1.5, open: 0.5, unknown_grade: 1, unknown_grade_credits: 1.5 },
        { rule_id: 'b', title: 'B', status: 'short', earned: 1.5, planned: 0, open: 1.5 },
        { rule_id: null, title: 'Other credit', earned: 0, planned: 1.5, open: 2 },
      ],
    };
    const { groups, totals } = waffleModel(waffle);
    expect(waffleSquares(waffle)).toHaveLength(10);
    expect(totals.size).toBe(10);
    expect(groups.reduce((n, g) => n + g.size, 0)).toBe(10);
    groups.forEach((g) => {
      expect(waffleSquares(waffle).filter((sq) => sq.group === g.index)).toHaveLength(g.size);
      expect(g.hatched).toBeLessThanOrEqual(g.earned);
    });
    expect(waffleSummary(null, waffle))
      .toBe(`${totals.earned} earned, ${totals.planned} planned, ${totals.open} open; A ${groups[0].earned + groups[0].planned} of ${groups[0].size}; B ${groups[1].earned + groups[1].planned} of ${groups[1].size}`);
  });

  test('only the server\'s ungraded credits are hatched', () => {
    const waffle = { groups: [{ rule_id: 'a', title: 'A', earned: 6, planned: 0, open: 0, unknown_grade: 2 }] };
    expect(waffleSquares(waffle).filter((sq) => sq.state === 'unknown')).toHaveLength(0);
  });

  test('a school with no programs (CU) shows no waffle or requirement chips, and the board stays', () => {
    renderBoard(makePlanner({ programs: [], profile: { program_ids: [] } }));
    expect(screen.queryByTestId('degree-waffle')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Program')).not.toBeInTheDocument();
    expect(screen.queryByText('Core theory')).not.toBeInTheDocument();
    expect(column('Spring 2027')).toBeInTheDocument();
    expect(within(column('Spring 2027')).getByText('ECON 3020')).toBeInTheDocument();
  });

  test('with no program, setup opens at Program and Next saves the choice', async () => {
    const { planner } = renderBoard(makePlanner({ profile: { program_ids: [] } }));
    expect(screen.queryByTestId('degree-waffle')).not.toBeInTheDocument();
    const dialog = await screen.findByRole('dialog', { name: 'Program' });
    fireEvent.click(within(dialog).getByRole('radio', { name: /Economics B.A./ }));
    fireEvent.click(within(dialog).getByRole('radio', { name: String(new Date().getFullYear() + 2) }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(planner.edit).toHaveBeenCalledWith(
      [{ op: 'set_profile', program_ids: ['econ-ba'], class_year: String(new Date().getFullYear() + 2) }],
      expect.objectContaining({ onHold: expect.any(Function) }),
    ));
    expect(await screen.findByRole('dialog', { name: 'Completed' })).toBeInTheDocument();
  });
});

describe('states', () => {
  test('a skeleton shows while the degree loads', () => {
    renderBoard(makePlanner({ degree: null }));
    expect(screen.getByTestId('degree-skeleton')).toBeInTheDocument();
  });

  test('a failed degree read says "Couldn\'t load" and retries', async () => {
    const planner = makePlanner({ degree: null });
    planner.refreshDegree = jest.fn(() => ({ then: (ok, fail) => fail(new Error('502')) }));
    renderBoard(planner);
    expect(await screen.findByText("Couldn't load")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(planner.refreshDegree).toHaveBeenLastCalledWith({ force: true });
  });

  test('a degree read that settles behind the plan reads again', async () => {
    const planner = makePlanner();
    planner.view.plan.revision = 5;
    planner.refreshDegree = jest.fn()
      .mockReturnValueOnce({ then: (ok) => ok({ ...DEGREE, revision: 3 }) })
      .mockReturnValueOnce({ then: (ok) => ok({ ...DEGREE, revision: 5 }) });
    renderBoard(planner);
    await waitFor(() => expect(planner.refreshDegree).toHaveBeenCalledTimes(2));
    await tick();
    expect(planner.refreshDegree).toHaveBeenCalledTimes(2);
  });

  test('a held save shows "Couldn\'t save" with Retry', () => {
    const { planner } = renderBoard(makePlanner({ queueState: 'error' }));
    expect(screen.getByText("Couldn't save")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(planner.retry).toHaveBeenCalled();
  });

  test('an uncovered term shows no credit number', () => {
    renderBoard();
    expect(within(column('Fall 2027')).getByRole('meter', { name: 'Credits' }))
      .toHaveAttribute('aria-valuetext', 'Credits unknown');
    expect(within(column('Spring 2027')).getByText('Heavy')).toBeInTheDocument();
  });
});

describe('terms', () => {
  test('every regular term between the first and last is on the board, then one empty term', () => {
    const plan = [
      { id: 'A', term: 'Spring 2027' },
      { id: 'B', term: 'Spring 2029' },
      { id: 'C', term: 'Summer 2027' },
    ];
    expect(boardTerms({ term: 'Spring 2027', terms: [] }, plan)).toEqual([
      'Spring 2027', 'Summer 2027', 'Fall 2027', 'Spring 2028', 'Fall 2028', 'Spring 2029', 'Fall 2029',
    ]);
  });

  test('a gap between planned terms gets its own empty column', () => {
    const planner = makePlanner();
    planner.view.plan.courses = [
      { id: 'ECON 3020', term: 'Spring 2027', sections: null },
      { id: 'ECON 3720', term: 'Spring 2028', sections: null },
    ];
    renderBoard(planner);
    expect(column('Fall 2027')).toBeInTheDocument();
    expect(within(column('Fall 2027')).queryByRole('button', { name: /^More for/ })).not.toBeInTheDocument();
    expect(column('Fall 2028')).toBeInTheDocument();
  });
});

describe('Past column', () => {
  test('is hidden with no history', () => {
    renderBoard(makePlanner({ degree: { ...DEGREE, completed: [] }, profile: { completed: [] } }));
    expect(screen.queryByRole('heading', { name: 'Past' })).not.toBeInTheDocument();
  });

  test('lists past terms and reveals them in full', () => {
    renderBoard();
    expect(screen.getByRole('heading', { name: 'Past' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '‹ See past' }));
    expect(screen.getByRole('region', { name: 'Fall 2025' })).toHaveTextContent('ECON 2010');
  });
});

describe('moving and adding', () => {
  test('Move to… in the ⋯ menu moves the course', async () => {
    const { planner } = renderBoard();
    const more = screen.getByRole('button', { name: 'More for ECON 3020' });
    more.focus();
    fireEvent.click(more);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Move to…' }));
    const fall = await screen.findByRole('menuitem', { name: 'Fall 2027' });
    await waitFor(() => expect(fall).toHaveFocus());
    expect(screen.getByRole('menu', { name: 'Move ECON 3020 to' })).toBeInTheDocument();
    fireEvent.click(fall);
    expect(planner.edit).toHaveBeenCalledWith(
      [{ op: 'move', course: 'ECON 3020', to_term: 'Fall 2027' }],
      expect.objectContaining({ onSaved: expect.any(Function) }),
    );
    await waitFor(() => expect(more).toHaveFocus());
  });

  test('Remove in the ⋯ menu removes the course', async () => {
    const { planner } = renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'More for ECON 3720' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }));
    expect(planner.edit).toHaveBeenCalledWith([{ op: 'remove', course: 'ECON 3720' }], expect.anything());
  });

  test('a keyboard drag moves a card to the next term', async () => {
    const { planner } = renderBoard();
    const card = column('Spring 2027').querySelector('[data-course="ECON 3020"]');
    await keyboardDrag(card, 1);
    expect(planner.edit).toHaveBeenCalledWith(
      [{ op: 'move', course: 'ECON 3020', to_term: 'Fall 2027' }],
      expect.anything(),
    );
  });

  test('a Browse row dropped on a term adds it there, previewing the credits on hover', async () => {
    const { planner } = renderBoard(makePlanner(), { rows: [STAT] });
    const grip = screen.getByRole('button', { name: 'Drag STAT 3120' });
    grip.focus();
    fireEvent.keyDown(grip, { code: 'Space', key: ' ' });
    await tick();
    fireEvent.keyDown(document, { code: 'ArrowRight', key: 'ArrowRight' });
    await tick();
    expect(within(column('Spring 2027')).getByText('→ 6', { exact: false })).toBeInTheDocument();
    fireEvent.keyDown(document, { code: 'Space', key: ' ' });
    await tick();
    expect(planner.edit).toHaveBeenCalledWith(
      [{ op: 'add', course: 'STAT 3120', term: 'Spring 2027' }],
      expect.anything(),
    );
  });

  test('a card dropped back on its own term springs back and pulses', async () => {
    const { planner } = renderBoard();
    const card = column('Fall 2027').querySelector('[data-course="ECON 3720"]');
    card.focus();
    fireEvent.keyDown(card, { code: 'Space', key: ' ' });
    await tick();
    fireEvent.keyDown(document, { code: 'ArrowRight', key: 'ArrowRight' });
    await tick();
    fireEvent.keyDown(document, { code: 'ArrowLeft', key: 'ArrowLeft' });
    await tick();
    fireEvent.keyDown(document, { code: 'Space', key: ' ' });
    await tick();
    expect(planner.edit).not.toHaveBeenCalled();
    expect(column('Fall 2027').querySelector('[data-course="ECON 3720"]')).toHaveClass('is-pulsing');
  });

  test('a Browse course already planned or taken springs back; new ones add; cards move', () => {
    const plan = [{ id: 'ECON 3720', term: 'Fall 2027' }];
    const taken = new Set(['ECON 2010']);
    const browse = (id) => ({ type: 'course', id, extra: { from: 'browse' } });
    expect(dropAction(browse('ECON 3720'), 'Spring 2027', plan, taken)).toBe('spring');
    expect(dropAction(browse('ECON 2010'), 'Spring 2027', plan, taken)).toBe('spring');
    expect(dropAction(browse('STAT 3120'), 'Spring 2027', plan, taken)).toBe('add');
    expect(dropAction({ type: 'course', id: 'ECON 3720', extra: { from: 'board' } }, 'Spring 2027', plan, taken))
      .toBe('move');
    expect(dropAction({ type: 'event', id: 'e1' }, 'Spring 2027', plan, taken)).toBeNull();
  });

  test('Open semester goes to the semester view for that term', () => {
    renderBoard();
    fireEvent.click(within(column('Fall 2027')).getByRole('button', { name: 'Open semester →' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/courses?view=semester&term=Fall+2027');
  });

  test('a card\'s code opens the course pop-up', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'ECON 3020' }));
    expect(screen.getByTestId('location')).toHaveTextContent('course=ECON+3020');
    expect(screen.getByTestId('nav-type')).toHaveTextContent('PUSH');
  });
});

describe('undo and redo', () => {
  test('are disabled with nothing to undo or redo', () => {
    renderBoard();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  });

  test('carry their labels and run when enabled', () => {
    const { planner } = renderBoard(makePlanner({
      canUndo: true, undoLabel: 'Undo: added ECON 3020', canRedo: false,
    }));
    const undo = screen.getByRole('button', { name: 'Undo: added ECON 3020' });
    expect(undo).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
    fireEvent.click(undo);
    expect(planner.undo).toHaveBeenCalled();
  });
});

describe('Setup: Completed step', () => {
  test('saves the list through set_profile with a grade', async () => {
    const { planner } = renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Grade for ECON 2020'), { target: { value: 'B+' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(planner.edit).toHaveBeenCalledWith([{
      op: 'set_profile',
      completed: [
        { id: 'ECON 2010', grade: 'A', term: 'Fall 2025' },
        { id: 'ECON 2020', grade: 'B+', term: 'Fall 2025' },
      ],
    }], expect.objectContaining({ onHold: expect.any(Function) })));
  });

  test('search adds a course from the catalog', async () => {
    searchCatalog.mockResolvedValue({ courses: [{ identifier: 'STAT 3120', title: 'Intro Statistics' }] });
    const { planner } = renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Search courses'), { target: { value: 'stat' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Add STAT 3120' }, { timeout: 2000 }));
    fireEvent.change(within(dialog).getByLabelText('Grade for STAT 3120'), { target: { value: 'A-' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(planner.edit).toHaveBeenCalledWith([{
      op: 'set_profile',
      completed: expect.arrayContaining([{ id: 'STAT 3120', grade: 'A-', term: null }]),
    }], expect.anything()));
  });

  const openEditor = async () => {
    await waitFor(() => expect(document.querySelector('.MuiDialog-root')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
    return screen.findByRole('dialog', { name: 'Completed' });
  };

  test('Enter adds the first search result, or the exact match, and never free text', async () => {
    searchCatalog.mockResolvedValue({
      courses: [{ identifier: 'STAT 3120', title: 'Intro Statistics' }, { identifier: 'STAT 2120', title: 'Stats' }],
    });
    const { planner } = renderBoard();
    const dialog = await openEditor();
    const search = within(dialog).getByLabelText('Search courses');
    fireEvent.change(search, { target: { value: 'stat 2120' } });
    await within(dialog).findByRole('button', { name: 'Add STAT 2120' }, { timeout: 2000 });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(within(dialog).getByRole('checkbox', { name: /STAT 2120/ })).toBeChecked();
    expect(within(dialog).queryByRole('checkbox', { name: /STAT 3120/ })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'stat' } });
    await within(dialog).findByRole('button', { name: 'Add STAT 3120' }, { timeout: 2000 });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(within(dialog).getByRole('checkbox', { name: /STAT 3120/ })).toBeChecked();

    searchCatalog.mockResolvedValue({ courses: [] });
    fireEvent.change(search, { target: { value: 'zzzz 9999' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(within(dialog).queryByRole('checkbox', { name: /ZZZZ/ })).not.toBeInTheDocument();
    expect(planner.edit).not.toHaveBeenCalled();
  });

  test('while the queue holds another save, Next says so at once and Retry resumes', async () => {
    const { planner } = renderBoard(makePlanner({ queueHeld: true }));
    const dialog = await openEditor();
    fireEvent.change(within(dialog).getByLabelText('Grade for ECON 2020'), { target: { value: 'B' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(within(dialog).getByText("Couldn't save")).toBeInTheDocument();
    expect(planner.edit).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));
    expect(planner.retry).toHaveBeenCalled();
  });

  test('saving leaves another edit\'s error alone', async () => {
    const other = [{ op: 'remove', course: 'ECON 3720' }];
    const { planner } = renderBoard(makePlanner({ saveError: { held: false, kind: 'edit', ops: other } }));
    const dialog = await openEditor();
    fireEvent.change(within(dialog).getByLabelText('Grade for ECON 2020'), { target: { value: 'B' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(planner.edit).toHaveBeenCalled());
    expect(planner.dismissSaveError).not.toHaveBeenCalled();
  });

  test('closes quietly when unchanged, asks before discarding changes, and re-ticking restores the grade', async () => {
    renderBoard();
    let dialog = await openEditor();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Completed' })).not.toBeInTheDocument());
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();

    dialog = await openEditor();
    const micro = within(dialog).getByRole('checkbox', { name: /ECON 2010/ });
    fireEvent.click(micro);
    fireEvent.click(micro);
    expect(within(dialog).getByLabelText('Grade for ECON 2010')).toHaveValue('A');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();

    dialog = await openEditor();
    fireEvent.change(within(dialog).getByLabelText('Grade for ECON 2020'), { target: { value: 'B' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    dialog = await screen.findByRole('dialog', { name: 'Completed' });
    expect(within(dialog).getByLabelText('Grade for ECON 2020')).toHaveValue('B');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Completed' })).not.toBeInTheDocument());
  });

  test('a transcript ticks passed courses, lists the rest unticked and flagged, and Next saves its credits', async () => {
    uploadTranscript.mockResolvedValue({
      rows: [
        { id: 'STAT 2120', title: 'Intro Statistics', grade: 'B', credits: 4, ticked: true, checked: true, in_catalog: true },
        { id: 'CS 1110', title: 'Intro Programming', grade: 'IP', credits: 3, ticked: false, checked: true, in_catalog: true },
        { id: 'AP MATH', title: null, grade: null, credits: null, ticked: false, checked: true, in_catalog: false },
      ],
    });
    const { planner } = renderBoard();
    const dialog = await openEditor();
    const file = new File(['ECON'], 'transcript.txt', { type: 'text/plain' });
    fireEvent.change(within(dialog).getByLabelText('Transcript file'), { target: { files: [file] } });
    expect(await within(dialog).findByText('Found 3')).toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: /STAT 2120/ })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: /CS 1110/ })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: /AP MATH/ })).not.toBeChecked();
    expect(within(dialog).getByText('Not in catalog')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(planner.edit).toHaveBeenCalledWith([{
      op: 'set_profile',
      completed: expect.arrayContaining([{ id: 'STAT 2120', grade: 'B', term: null, credits: 4 }]),
    }], expect.anything()));
    const sent = planner.edit.mock.calls[0][0][0].completed.map((c) => c.id);
    expect(sent).not.toContain('CS 1110');
  });

  test('Skip with unsaved changes asks first; Discard moves on without saving', async () => {
    const { planner } = renderBoard();
    let dialog = await openEditor();
    fireEvent.change(within(dialog).getByLabelText('Grade for ECON 2020'), { target: { value: 'B' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Skip' }));
    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    dialog = await screen.findByRole('dialog', { name: 'Completed' });
    expect(within(dialog).getByLabelText('Grade for ECON 2020')).toHaveValue('B');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Skip' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    dialog = await screen.findByRole('dialog', { name: 'First term' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Back' }));
    dialog = await screen.findByRole('dialog', { name: 'Completed' });
    expect(within(dialog).getByLabelText('Grade for ECON 2020')).toHaveValue('');
    expect(planner.edit).not.toHaveBeenCalled();
  });

  test('an unreadable transcript says so and keeps the list', async () => {
    uploadTranscript.mockRejectedValue(Object.assign(new Error('422'), { status: 422 }));
    renderBoard();
    const dialog = await openEditor();
    fireEvent.change(within(dialog).getByLabelText('Transcript file'), {
      target: { files: [new File(['x'], 'scan.pdf', { type: 'application/pdf' })] },
    });
    expect(await within(dialog).findByText("Couldn't read this file")).toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: /ECON 2010/ })).toBeChecked();
  });
});

describe('Setup dialog', () => {
  test('the program name opens Program; graduate programs are grouped apart', async () => {
    const programs = [...PROGRAMS, { id: 'mpp', name: 'Master of Public Policy', type: 'graduate', rules: [] }];
    renderBoard(makePlanner({ programs }));
    fireEvent.click(screen.getByRole('button', { name: 'Economics B.A.' }));
    const dialog = await screen.findByRole('dialog', { name: 'Program' });
    expect(within(dialog).getByText('Undergraduate')).toBeInTheDocument();
    expect(within(dialog).getByText('Graduate')).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: /Economics B.A./ })).toBeChecked();
  });

  test('skipped with no program, the toolbar Program button reopens it', async () => {
    renderBoard(makePlanner({ profile: { program_ids: [] } }));
    let dialog = await screen.findByRole('dialog', { name: 'Program' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Program' })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Program' }));
    dialog = await screen.findByRole('dialog', { name: 'Program' });
    expect(dialog).toBeInTheDocument();
  });

  test('First term saves set_term on Done and closes', async () => {
    const { planner } = renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Economics B.A.' }));
    let dialog = await screen.findByRole('dialog', { name: 'Program' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Skip' }));
    dialog = await screen.findByRole('dialog', { name: 'Completed' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Skip' }));
    dialog = await screen.findByRole('dialog', { name: 'First term' });
    expect(within(dialog).getByRole('radio', { name: 'Spring 2027' })).toBeChecked();
    // The board's trailing empty term isn't one set_term accepts.
    expect(within(dialog).queryByRole('radio', { name: 'Spring 2028' })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Fall 2027' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(planner.edit).toHaveBeenCalledWith(
      [{ op: 'set_term', term: 'Fall 2027' }], expect.anything(),
    ));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'First term' })).not.toBeInTheDocument());
  });

  test('a held save shows Retry with Next off, then moves on when the edit lands', async () => {
    let land;
    const edit = jest.fn((ops, { onHold } = {}) => new Promise((resolve) => {
      onHold?.(new Error("Couldn't save"));
      land = resolve;
    }));
    const { planner } = renderBoard(makePlanner({ edit }));
    const dialog = await openEditorFromPast();
    fireEvent.change(within(dialog).getByLabelText('Grade for ECON 2020'), { target: { value: 'C' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(await within(dialog).findByText("Couldn't save")).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(planner.edit).toHaveBeenCalledTimes(1);
    await act(async () => { land({}); });
    expect(await screen.findByRole('dialog', { name: 'First term' })).toBeInTheDocument();
  });
});

async function openEditorFromPast() {
  await waitFor(() => expect(document.querySelector('.MuiDialog-root')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
  return screen.findByRole('dialog', { name: 'Completed' });
}
