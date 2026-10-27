import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import SavedPage from './SavedPage';
import { ToastProvider } from '../components/Toast';
import * as api from '../api/campus';
import { downloadEventIcs } from '../utils/ics';

jest.mock('../api/campus', () => {
  class ApiError extends Error {
    constructor(message, { status = 0, network = false } = {}) {
      super(message);
      this.status = status;
      this.network = network;
    }

    get notFound() { return this.status === 404; }

    get unavailable() { return this.network || this.status >= 500; }
  }
  return {
    ApiError,
    listSaved: jest.fn(),
    listCollections: jest.fn(),
    createSaved: jest.fn(),
    deleteSaved: jest.fn(),
    updateSaved: jest.fn(),
    createCollection: jest.fn(),
    updateCollection: jest.fn(),
    deleteCollection: jest.fn(),
    getCatalogCourse: jest.fn(),
    getEvent: jest.fn(),
    getPlace: jest.fn(),
    getCampusOrigin: jest.fn(),
  };
});
jest.mock('../utils/ics', () => ({ downloadEventIcs: jest.fn() }));
jest.mock('../components/CampusRail', () => function CampusRail() { return null; });
jest.mock('../components/SettingsModal', () => function SettingsModal() { return null; });
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token', user: { firstName: 'Ada' } }) }));
jest.mock('../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({ config: { app: { institution: 'UW–Madison' }, school: { timezone: 'America/Chicago' } }, advisors: [] }),
}));
const mockReload = jest.fn();
jest.mock('../contexts/SavedContext', () => ({ useSaved: () => ({ reload: mockReload, count: 0 }) }));

const DAY = 24 * 60 * 60 * 1000;
const iso = (offset) => new Date(Date.now() + offset).toISOString();
const notFound = () => new api.ApiError('gone', { status: 404 });
const unavailable = () => new api.ApiError('down', { status: 503 });

const course = (key, collection = null, extra = {}) => ({
  id: `id-${key}`, kind: 'course', key, display_name: key, collection_id: collection, saved_at: iso(-DAY), ...extra,
});
const event = (key, extra = {}) => ({
  id: `id-${key}`, kind: 'event', key, display_name: `Event ${key}`, collection_id: null, saved_at: iso(-DAY), ...extra,
});
const place = (key, extra = {}) => ({
  id: `id-${key}`, kind: 'place', key, display_name: `Place ${key}`, collection_id: null, saved_at: iso(-DAY), ...extra,
});

const COLLECTIONS = [
  { id: 'c1', name: 'Spring 2027 schedule', count: 0, created_at: iso(-2 * DAY) },
  { id: 'c2', name: 'Study spots', count: 0, created_at: iso(-DAY) },
];

function Where() {
  const location = useLocation();
  return <span data-testid="where">{location.pathname}{location.search}</span>;
}

const setup = ({ items = [], collections = COLLECTIONS, path = '/saved', timeout } = {}) => {
  api.listSaved.mockResolvedValue(items);
  api.listCollections.mockResolvedValue(collections);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route path="/saved" element={<SavedPage lookupTimeout={timeout} />} />
          <Route path="*" element={null} />
        </Routes>
        <Where />
      </ToastProvider>
    </MemoryRouter>,
  );
};

const collectionsNav = () => within(screen.getByRole('navigation', { name: 'Collections' }));
const row = (key) => screen.getByTestId(`saved-row-${key}`);

beforeEach(() => {
  jest.clearAllMocks();
  api.getCatalogCourse.mockImplementation((token, id) => Promise.resolve({
    identifier: id,
    title: `Title of ${id}`,
    grades: { gpa: 3.17, term: 'Spring 2026', pct_df: 5, labels: { df: 'D/F' } },
    sections: { term: 'Spring 2027', seats_open: 550 },
  }));
  api.getEvent.mockImplementation((token, id) => Promise.resolve({
    event: {
      id, title: `Live ${id}`, start: iso(DAY), end: iso(DAY + 3600000), all_day: false, location: 'Union South', place_id: 'union-south', walk_minutes: 7,
    },
    timezone: 'America/Chicago',
  }));
  api.getPlace.mockImplementation((token, id) => Promise.resolve({
    place: { id, name: `Live ${id}`, category: 'library', open_now: true, hours: 'Mon-Fri 8-22' },
  }));
  api.getCampusOrigin.mockResolvedValue({ place: { id: 'college-library', name: 'College Library' } });
});

test('Unsorted comes first, shows its count and is selected by default', async () => {
  setup({ items: [course('COMP SCI 300'), course('COMP SCI 400', 'c1')] });
  await screen.findByRole('heading', { level: 2, name: 'Unsorted' });
  const buttons = collectionsNav().getAllByRole('button');
  expect(buttons[0]).toHaveTextContent(/^Unsorted1$/);
  expect(buttons[0]).toHaveAttribute('aria-current', 'true');
  expect(buttons[1]).toHaveTextContent('Spring 2027 schedule');
  expect(buttons[buttons.length - 1]).toHaveTextContent('New collection');
  expect(await screen.findByText('Title of COMP SCI 300')).toBeInTheDocument();
  expect(screen.queryByText('Title of COMP SCI 400')).not.toBeInTheDocument();
});

test('with an empty Unsorted the collection holding the newest save is selected', async () => {
  setup({ items: [course('A 1', 'c1', { saved_at: iso(-3 * DAY) }), place('p1', { collection_id: 'c2' })] });
  expect(await screen.findByRole('heading', { level: 2, name: 'Study spots' })).toBeInTheDocument();
});

test('an item whose collection no longer exists is listed under Unsorted (DO1)', async () => {
  setup({ items: [course('COMP SCI 300', 'deleted-collection')] });
  await screen.findByRole('heading', { level: 2, name: 'Unsorted' });
  expect(await screen.findByText('Title of COMP SCI 300')).toBeInTheDocument();
});

test('rows show live data per kind', async () => {
  setup({ items: [course('COMP SCI 300'), event('2026-10-28:225823@calendar.wisc.edu'), place('memorial-library')] });
  const courseRow = within(await screen.findByTestId('saved-row-COMP SCI 300'));
  expect(await courseRow.findByText('Title of COMP SCI 300')).toBeInTheDocument();
  expect(courseRow.getByText('3.17 GPA, Spring 2026 · 5% D or F')).toBeInTheDocument();
  expect(courseRow.getByText('550 Spring 2027 seats')).toBeInTheDocument();
  expect(courseRow.getByRole('link', { name: 'Course page for COMP SCI 300' }))
    .toHaveAttribute('href', '/courses?selected=COMP%20SCI%20300');

  const eventRow = within(row('2026-10-28:225823@calendar.wisc.edu'));
  expect(await eventRow.findByText('Live 2026-10-28:225823@calendar.wisc.edu')).toBeInTheDocument();
  expect(eventRow.getByText('Union South')).toBeInTheDocument();
  expect(eventRow.getByText('7 min walk')).toBeInTheDocument();
  fireEvent.click(eventRow.getByRole('button', { name: 'Add Live 2026-10-28:225823@calendar.wisc.edu to calendar' }));
  expect(downloadEventIcs).toHaveBeenCalledWith(expect.objectContaining({ id: '2026-10-28:225823@calendar.wisc.edu' }));
  expect(api.getEvent).toHaveBeenCalledWith(
    'token', '2026-10-28:225823@calendar.wisc.edu', expect.objectContaining({ from: 'college-library' }),
  );

  const placeRow = within(row('memorial-library'));
  expect(await placeRow.findByText('Live memorial-library')).toBeInTheDocument();
  expect(placeRow.getByText('Open now')).toBeInTheDocument();
  expect(placeRow.getByText('Walk time unavailable')).toBeInTheDocument();
  expect(placeRow.getByRole('link', { name: 'Directions to Live memorial-library' }))
    .toHaveAttribute('href', '/map?to=memorial-library');
});

test('a confirmed 404 shows the saved name, "No longer listed" and Remove', async () => {
  api.getPlace.mockRejectedValue(notFound());
  api.deleteSaved.mockResolvedValue({});
  setup({ items: [place('old-hall')] });
  const target = within(await screen.findByTestId('saved-row-old-hall'));
  expect(await target.findByText('No longer listed')).toBeInTheDocument();
  expect(target.getByText('Place old-hall')).toBeInTheDocument();
  fireEvent.click(target.getByRole('button', { name: 'Remove Place old-hall' }));
  await waitFor(() => expect(api.deleteSaved).toHaveBeenCalledWith('token', 'id-old-hall'));
});

test('a 503 shows "Couldn\'t check right now" with Retry, never Remove', async () => {
  api.getCatalogCourse.mockRejectedValueOnce(unavailable());
  setup({ items: [course('COMP SCI 300')] });
  const target = within(await screen.findByTestId('saved-row-COMP SCI 300'));
  expect(await target.findByText("Couldn't check right now")).toBeInTheDocument();
  expect(target.queryByText('No longer listed')).not.toBeInTheDocument();
  expect(target.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
  fireEvent.click(target.getByRole('button', { name: 'Retry checking COMP SCI 300' }));
  expect(await target.findByText('Title of COMP SCI 300')).toBeInTheDocument();
});

test('a lookup that takes too long shows "Couldn\'t check right now"', async () => {
  api.getEvent.mockImplementation(() => new Promise(() => {}));
  setup({ items: [event('2026-10-28:slow')], timeout: 30 });
  const target = within(await screen.findByTestId('saved-row-2026-10-28:slow'));
  expect(await target.findByText("Couldn't check right now")).toBeInTheDocument();
  expect(target.getByText('Event 2026-10-28:slow')).toBeInTheDocument();
  expect(target.getByRole('button', { name: 'Retry checking Event 2026-10-28:slow' })).toBeInTheDocument();
});

test('lookups run concurrently, one per item', async () => {
  const pending = [];
  api.getCatalogCourse.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
  setup({ items: [course('A 1'), course('B 2'), course('C 3')] });
  await waitFor(() => expect(api.getCatalogCourse).toHaveBeenCalledTimes(3));
  expect(screen.getAllByText(/Checking/)).toHaveLength(3);
  act(() => pending.forEach((resolve) => resolve({ title: 'Done' })));
  expect(await screen.findAllByText('Done')).toHaveLength(3);
});

test('Move sends the new collection and updates the counts', async () => {
  api.updateSaved.mockResolvedValue({});
  setup({ items: [course('COMP SCI 300'), course('COMP SCI 400')] });
  const target = within(await screen.findByTestId('saved-row-COMP SCI 300'));
  fireEvent.click(target.getByRole('button', { name: 'More actions for COMP SCI 300' }));
  const menu = screen.getByRole('menu', { name: 'Actions for COMP SCI 300' });
  expect(within(menu).getByRole('menuitem', { name: 'Move to…' })).toHaveFocus();
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Move to…' }));
  const moveMenu = screen.getByRole('menu', { name: 'Move COMP SCI 300 to' });
  expect(within(moveMenu).queryByRole('menuitem', { name: 'Unsorted' })).not.toBeInTheDocument();
  expect(within(moveMenu).getByRole('menuitem', { name: 'New collection…' })).toBeInTheDocument();
  fireEvent.click(within(moveMenu).getByRole('menuitem', { name: 'Spring 2027 schedule' }));
  await waitFor(() => expect(api.updateSaved).toHaveBeenCalledWith('token', 'id-COMP SCI 300', { collection_id: 'c1' }));
  await waitFor(() => expect(screen.queryByTestId('saved-row-COMP SCI 300')).not.toBeInTheDocument());
  expect(collectionsNav().getByRole('button', { name: /Spring 2027 schedule/ })).toHaveTextContent('1');
  expect(await screen.findByText('Moved to Spring 2027 schedule')).toBeInTheDocument();
  expect(mockReload).toHaveBeenCalled();
});

test('the row menu works from the keyboard and Escape returns focus', async () => {
  setup({ items: [course('COMP SCI 300')] });
  const trigger = await screen.findByRole('button', { name: 'More actions for COMP SCI 300' });
  fireEvent.click(trigger);
  const menu = screen.getByRole('menu');
  fireEvent.keyDown(menu, { key: 'ArrowDown' });
  expect(within(menu).getByRole('menuitem', { name: 'Remove' })).toHaveFocus();
  fireEvent.keyDown(menu, { key: 'ArrowDown' });
  expect(within(menu).getByRole('menuitem', { name: 'Move to…' })).toHaveFocus();
  fireEvent.keyDown(menu, { key: 'Escape' });
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

test('Remove unsaves with "Removed · Undo", and Undo re-saves into the old collection', async () => {
  const item = course('COMP SCI 300', 'c1');
  api.deleteSaved.mockResolvedValue(item);
  api.createSaved.mockResolvedValue(item);
  setup({ items: [item], path: '/saved?collection=c1' });
  const target = within(await screen.findByTestId('saved-row-COMP SCI 300'));
  fireEvent.click(target.getByRole('button', { name: 'More actions for COMP SCI 300' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));
  expect(await screen.findByText('Removed')).toBeInTheDocument();
  expect(api.deleteSaved).toHaveBeenCalledWith('token', 'id-COMP SCI 300');
  expect(screen.queryByTestId('saved-row-COMP SCI 300')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(api.createSaved).toHaveBeenCalledWith('token', {
    kind: 'course', key: 'COMP SCI 300', display_name: 'COMP SCI 300', collection_id: 'c1',
  }));
  await waitFor(() => expect(api.listSaved).toHaveBeenCalledTimes(2));
});

test('deleting a collection asks first and moves its items to Unsorted', async () => {
  api.deleteCollection.mockResolvedValue({ moved_to_unsorted: 1 });
  setup({ items: [course('COMP SCI 300', 'c1')], path: '/saved?collection=c1' });
  fireEvent.click(await screen.findByRole('button', { name: 'Delete collection Spring 2027 schedule' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Its 1 item move to Unsorted. Nothing is unsaved.')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(api.deleteCollection).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Delete collection Spring 2027 schedule' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete collection' }));
  await waitFor(() => expect(api.deleteCollection).toHaveBeenCalledWith('token', 'c1'));
  expect(await screen.findByRole('heading', { level: 2, name: 'Unsorted' })).toBeInTheDocument();
  expect(screen.getByTestId('saved-row-COMP SCI 300')).toBeInTheDocument();
  expect(collectionsNav().queryByRole('button', { name: /Spring 2027 schedule/ })).not.toBeInTheDocument();
});

test('Rename and New collection work inline', async () => {
  api.updateCollection.mockResolvedValue({ id: 'c1', name: 'Fall plan' });
  api.createCollection.mockResolvedValue({ id: 'c3', name: 'This week', count: 0 });
  setup({ items: [course('COMP SCI 300', 'c1')], path: '/saved?collection=c1' });
  fireEvent.click(await screen.findByRole('button', { name: 'Rename Spring 2027 schedule' }));
  const field = screen.getByLabelText('Rename Spring 2027 schedule');
  fireEvent.change(field, { target: { value: 'Fall plan' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('heading', { level: 2, name: 'Fall plan' })).toBeInTheDocument();
  expect(api.updateCollection).toHaveBeenCalledWith('token', 'c1', { name: 'Fall plan' });

  fireEvent.click(collectionsNav().getByRole('button', { name: 'New collection' }));
  const name = screen.getByLabelText('New collection name');
  fireEvent.change(name, { target: { value: 'This week' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));
  expect(await screen.findByRole('heading', { level: 2, name: 'This week' })).toBeInTheDocument();
  expect(screen.getByText('Empty. Move items here from Unsorted.')).toBeInTheDocument();
  expect(screen.getByTestId('where')).toHaveTextContent('/saved?collection=c3');
});

test('ended events with a known end go to a collapsed Past group; Clear past only removes those', async () => {
  api.deleteSaved.mockResolvedValue({});
  api.getEvent.mockImplementation((token, id) => Promise.resolve({ event: { id, title: `Live ${id}`, start: iso(DAY) } }));
  setup({
    items: [
      event('ended', { event_start: iso(-2 * DAY), event_end: iso(-2 * DAY + 3600000) }),
      event('no-end', { event_start: iso(-2 * DAY) }),
      event('upcoming', { event_start: iso(DAY), event_end: iso(DAY + 3600000) }),
    ],
  });
  const toggle = await screen.findByRole('button', { name: 'Past (1)' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByTestId('saved-row-ended')).not.toBeInTheDocument();
  expect(screen.getByTestId('saved-row-no-end')).toBeInTheDocument();
  expect(screen.getByTestId('saved-row-upcoming')).toBeInTheDocument();
  // Ended events are not looked up; they keep their saved name.
  expect(api.getEvent).not.toHaveBeenCalledWith('token', 'ended', expect.anything());
  fireEvent.click(toggle);
  expect(within(row('ended')).getByText('Event ended')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Clear past' }));
  await waitFor(() => expect(screen.queryByTestId('saved-row-ended')).not.toBeInTheDocument());
  expect(api.deleteSaved).toHaveBeenCalledTimes(1);
  expect(api.deleteSaved).toHaveBeenCalledWith('token', 'id-ended');
  expect(screen.getByTestId('saved-row-no-end')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Past/ })).not.toBeInTheDocument();
});

test('Compare is enabled only with 2 to 4 courses', async () => {
  const { unmount } = setup({ items: [course('A 1')] });
  expect(await screen.findByRole('button', { name: /Compare/ })).toBeDisabled();
  unmount();

  setup({ items: [course('A 1'), course('B 2')] });
  expect(await screen.findByRole('link', { name: /Compare 2 courses/ }))
    .toHaveAttribute('href', '/courses/compare?ids=A%201,B%202');
});

test('Compare is disabled with 5 courses', async () => {
  setup({ items: ['A 1', 'B 2', 'C 3', 'D 4', 'E 5'].map((key) => course(key)) });
  expect(await screen.findByRole('button', { name: /Compare/ })).toBeDisabled();
});

test('empty Saved shows the bookmark hint', async () => {
  setup({ items: [], collections: [] });
  expect(await screen.findByText('Nothing saved yet. Use the bookmark on any course, event or place, here or in chat.'))
    .toBeInTheDocument();
});

test('an empty collection says to move items there', async () => {
  setup({ items: [course('A 1')], path: '/saved?collection=c2' });
  expect(await screen.findByText('Empty. Move items here from Unsorted.')).toBeInTheDocument();
});

test('a failed load shows "Couldn\'t load saved items" with Retry', async () => {
  api.listSaved.mockRejectedValueOnce(unavailable());
  api.listCollections.mockResolvedValue(COLLECTIONS);
  render(
    <MemoryRouter initialEntries={['/saved']}>
      <ToastProvider><SavedPage /></ToastProvider>
    </MemoryRouter>,
  );
  expect(await screen.findByText("Couldn't load saved items")).toBeInTheDocument();
  api.listSaved.mockResolvedValue([course('A 1')]);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByTestId('saved-row-A 1')).toBeInTheDocument();
});

test('the phone picker lists the same collections and switches the selection', async () => {
  setup({ items: [course('A 1')] });
  const picker = await screen.findByLabelText('Collection');
  expect(within(picker).getAllByRole('option').map((option) => option.textContent))
    .toEqual(['Unsorted (1)', 'Spring 2027 schedule (0)', 'Study spots (0)']);
  fireEvent.change(picker, { target: { value: 'c2' } });
  expect(await screen.findByRole('heading', { level: 2, name: 'Study spots' })).toBeInTheDocument();
});

test('walk times come from the starting place; off-campus events show none', async () => {
  api.getEvent.mockImplementation((token, id) => Promise.resolve({
    event: { id, title: `Live ${id}`, start: iso(DAY), location: 'UWM Music Building, Milwaukee' },
  }));
  api.getPlace.mockImplementation((token, id) => Promise.resolve({
    place: id === 'college-library'
      ? { id, name: 'College Library', category: 'library', walk_minutes: 0 }
      : { id, name: `Live ${id}`, category: 'library' },
  }));
  setup({ items: [event('far'), place('college-library'), place('memorial-library')] });

  const eventRow = within(await screen.findByTestId('saved-row-far'));
  expect(await eventRow.findByText('UWM Music Building, Milwaukee')).toBeInTheDocument();
  expect(eventRow.queryByText(/walk/i)).not.toBeInTheDocument();
  expect(await within(row('college-library')).findByText('Your starting place')).toBeInTheDocument();
  expect(await within(row('memorial-library')).findByText('Walk time unavailable')).toBeInTheDocument();
  expect(api.getPlace).toHaveBeenCalledWith('token', 'memorial-library', expect.objectContaining({ from: 'college-library' }));
});

test('the list still loads when the starting place cannot be read', async () => {
  api.getCampusOrigin.mockRejectedValue(unavailable());
  setup({ items: [place('memorial-library')] });
  expect(await within(await screen.findByTestId('saved-row-memorial-library')).findByText('Live memorial-library')).toBeInTheDocument();
  expect(api.getPlace).toHaveBeenCalledWith('token', 'memorial-library', expect.objectContaining({ from: undefined }));
});
