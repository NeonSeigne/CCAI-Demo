import React, { useEffect, useRef } from 'react';
import {
  act, fireEvent, render, renderHook, screen, waitFor,
} from '@testing-library/react';
import {
  MemoryRouter, Route, Routes, useLocation,
} from 'react-router-dom';
import PopupHost from './PopupHost';
import { requirementLabels } from '../course/CourseSheet';
import { useCloseOnce } from '../../utils/openCourse';
import { ChatContext } from '../../contexts/ChatContext';
import { ChatDockContext, ChatDockProvider, useChatDock } from '../../contexts/ChatDockContext';
import { PlannerContext } from '../../contexts/PlannerContext';
import CourseChip from '../visuals/CourseChip';
import CourseRedirect from '../course/CourseRedirect';
import { routeFetch } from '../../pages/__fixtures__/routeFetch';
import { uwPopupCourse } from '../../pages/__fixtures__/popups';

jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token' }) }));

const realFetch = global.fetch;
beforeEach(() => {
  global.fetch = routeFetch([
    ['/api/catalog/ratings/', { body: { ratings: [] } }],
    ['/api/catalog/', { body: uwPopupCourse() }],
  ]);
});
afterEach(() => { global.fetch = realFetch; });

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

it('a chip on the map page opens the pop-up without changing the path, and Close returns', async () => {
  render(
    <MemoryRouter initialEntries={['/map']}>
      <CourseChip identifier="COMP SCI 400" />
      <PopupHost />
      <LocationProbe />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /comp sci 400/i }));
  expect(screen.getByTestId('location')).toHaveTextContent('/map?course=COMP+SCI+400');
  expect(await screen.findByRole('dialog', { name: 'Programming III' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/map$/));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('redirects /courses/:id to /courses?course=ID', () => {
  render(
    <MemoryRouter initialEntries={['/courses/COMP%20SCI%20400']}>
      <Routes>
        <Route path="/courses" element={<LocationProbe />} />
        <Route path="/courses/:courseIdentifier" element={<CourseRedirect />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByTestId('location')).toHaveTextContent('/courses?course=COMP+SCI+400');
});

it('closes once per open pop-up, however many close events arrive', () => {
  const close = jest.fn();
  const { result, rerender } = renderHook(({ value }) => useCloseOnce(value, close), {
    initialProps: { value: 'COMP SCI 400' },
  });
  act(() => { result.current(); result.current(); result.current(); });
  expect(close).toHaveBeenCalledTimes(1);
  rerender({ value: 'MATH 240' });
  act(() => { result.current(); });
  expect(close).toHaveBeenCalledTimes(2);
});

it("labels requirement chips from the student's programs", () => {
  const programs = [
    { id: 'cs', name: 'Comp Sci B.S.', rules: [{ id: 'core', title: 'Core', courses: ['COMP SCI 400'] }] },
    { id: 'math', name: 'Math B.S.', rules: [{ id: 'el', title: 'Electives', courses: ['COMP SCI 400'] }] },
  ];
  expect(requirementLabels('COMP SCI 400', programs, ['cs'])).toEqual(['Comp Sci B.S. · Core']);
});

describe('Ask from the course pop-up', () => {
  // The chat page's composer takes focus requests through the dock state.
  function VisibleComposer() {
    const dock = useChatDock();
    const ref = useRef(null);
    useEffect(() => {
      if (dock?.claimComposerFocus?.()) ref.current?.focus();
    }, [dock]);
    return <textarea ref={ref} aria-label="Composer" />;
  }

  // `dock: null` renders the shell's dock state where the page is the ask.
  function DockState({ dock, children }) {
    return dock
      ? <ChatDockContext.Provider value={dock}>{children}</ChatDockContext.Provider>
      : <ChatDockProvider available={false}>{children}</ChatDockProvider>;
  }

  function renderAt(entry, { dock = null, chat = { attach: jest.fn() } } = {}) {
    const utils = render(
      <MemoryRouter initialEntries={[entry]}>
        <ChatContext.Provider value={chat}>
          <DockState dock={dock}>
            <Routes>
              <Route
                path="*"
                element={(
                  <>
                    <CourseChip identifier="COMP SCI 400" />
                    <VisibleComposer />
                    <PopupHost />
                    <LocationProbe />
                  </>
                )}
              />
            </Routes>
          </DockState>
        </ChatContext.Provider>
      </MemoryRouter>,
    );
    return { ...utils, chat };
  }

  const openAndAsk = async () => {
    fireEvent.click(screen.getByRole('button', { name: /comp sci 400/i }));
    await screen.findByRole('dialog', { name: 'Programming III' });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  };

  it('with the dock beside the page, keeps the pop-up open and opens the dock', async () => {
    const dock = { available: true, openDock: jest.fn(), requestComposerFocus: jest.fn() };
    const { chat } = renderAt('/map', { dock });
    await openAndAsk();
    expect(chat.attach).toHaveBeenCalledWith({ type: 'course', id: 'COMP SCI 400', title: 'Programming III' });
    expect(dock.openDock).toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Programming III' })).toBeInTheDocument();
  });

  it('on /chat, closes the pop-up, then attaches and focuses the visible composer', async () => {
    const { chat } = renderAt('/chat');
    await openAndAsk();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/chat$/);
    expect(chat.attach).toHaveBeenCalledWith(expect.objectContaining({ id: 'COMP SCI 400' }));
    await waitFor(() => expect(screen.getByLabelText('Composer')).toHaveFocus());
  });

  it('on /home, closes the pop-up, then goes to /chat with the item attached', async () => {
    const { chat } = renderAt('/home');
    await openAndAsk();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/chat$/));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(chat.attach).toHaveBeenCalledWith(expect.objectContaining({ id: 'COMP SCI 400' }));
  });
});

it('loads the plan once per course, not on every planner change', async () => {
  const ensureLoaded = jest.fn();
  const planner = () => ({ ensureLoaded, view: null, programs: [] });
  const tree = (value) => (
    <MemoryRouter initialEntries={['/map?course=COMP+SCI+400']}>
      <PlannerContext.Provider value={value}><PopupHost /></PlannerContext.Provider>
    </MemoryRouter>
  );
  const { rerender } = render(tree(planner()));
  await screen.findByRole('dialog', { name: 'Programming III' });
  // A failed load hands out a new planner object each time; that must not reload.
  rerender(tree(planner()));
  rerender(tree(planner()));
  expect(ensureLoaded).toHaveBeenCalledTimes(1);
});

describe('Add from the course pop-up', () => {
  const planWith = (courses) => ({
    ensureLoaded: jest.fn(),
    edit: jest.fn(() => Promise.resolve()),
    programs: [],
    view: { plan: { term: 'Fall 2026', revision: 3, courses } },
  });
  const renderWith = (planner) => render(
    <MemoryRouter initialEntries={['/courses?course=COMP+SCI+400']}>
      <PlannerContext.Provider value={planner}><PopupHost /></PlannerContext.Provider>
    </MemoryRouter>,
  );

  it('offers Add for a course not in the plan', async () => {
    renderWith(planWith([{ id: 'MATH 222', term: 'Fall 2026' }]));
    await screen.findByRole('dialog', { name: 'Programming III' });
    expect(screen.getByRole('button', { name: /add to fall 2026/i })).toBeInTheDocument();
  });

  it('offers no Add and asks for no preview when the course is already planned', async () => {
    renderWith(planWith([{ id: 'comp sci  400', term: 'Spring 2027' }]));
    await screen.findByRole('dialog', { name: 'Programming III' });
    expect(screen.queryByRole('button', { name: /add to/i })).not.toBeInTheDocument();
    const urls = global.fetch.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes('/api/planner/preview'))).toBe(false);
  });
});
