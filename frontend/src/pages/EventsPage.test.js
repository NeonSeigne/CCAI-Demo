import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import EventsPage from './EventsPage';
import {
  getCampusOrigin, getEvent, listEvents, listPlaces, setCampusOrigin,
} from '../api/campus';
import { addDays, dayKey, rangeLabel, windowDays } from '../utils/eventWindows';

jest.mock('../api/campus', () => ({
  listEvents: jest.fn(),
  getCampusOrigin: jest.fn(),
  setCampusOrigin: jest.fn(),
  listPlaces: jest.fn(),
  getEvent: jest.fn(),
  getPlace: jest.fn(),
}));
jest.mock('../hooks/useAsk', () => () => jest.fn());
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ authToken: 'test-token', user: { firstName: 'Dev' } }),
}));
jest.mock('../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({ config: { app: { institution: 'UW–Madison' }, school: { timezone: 'UTC' } } }),
}));
jest.mock('../components/SaveButton', () => function SaveStub({ item }) {
  return item ? <button type="button" aria-label={`Save ${item.display_name}`} /> : null;
});

const TZ = 'UTC';
const today = () => dayKey(new Date(), TZ);
const at = (key, hhmm) => `${key}T${hhmm}:00Z`;
const inMinutes = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();

const event = (overrides) => ({
  id: `${overrides.title}-id`,
  start: inMinutes(120),
  end: inMinutes(180),
  all_day: false,
  location: 'Memorial Union',
  url: null,
  calendar: 'today.wisc.edu',
  ongoing: false,
  ...overrides,
});

const body = (events, extra = {}) => ({
  events,
  window: 'today',
  timezone: TZ,
  listed_through: null,
  source: ['today.wisc.edu'],
  ...extra,
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

const params = () => new URLSearchParams(screen.getByTestId('location').textContent);

function renderPage(entry = '/events') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <LocationProbe />
      <Routes>
        <Route path="/events" element={<EventsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const lastEventsCall = () => listEvents.mock.calls[listEvents.mock.calls.length - 1][1];

beforeEach(() => {
  jest.clearAllMocks();
  getCampusOrigin.mockResolvedValue({ place: { id: 'origin-1', name: 'College Library' }, is_default: true });
  listEvents.mockResolvedValue(body([event({ title: 'Jazz Night' })]));
});

// Let a fetch started by the last click settle inside act before the test ends.
afterEach(async () => {
  await act(async () => { await Promise.resolve(); });
});

describe('EventsPage', () => {
  it('preselects window and search from a chat card link (14A) and asks with the start place', async () => {
    renderPage('/events?window=tonight&q=jazz');
    expect(await screen.findByRole('heading', { level: 2, name: 'Tonight' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tonight' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Search events')).toHaveValue('jazz');
    await waitFor(() => expect(listEvents).toHaveBeenCalled());
    expect(lastEventsCall()).toEqual({ window: 'tonight', q: 'jazz', from: 'origin-1' });
  });

  it('keeps the window and search when switching views', async () => {
    renderPage('/events?window=this_weekend&q=jazz');
    await screen.findByText('Jazz Night');
    fireEvent.click(screen.getByRole('tab', { name: /List/ }));
    expect(screen.getByRole('tab', { name: /List/ })).toHaveAttribute('aria-selected', 'true');
    expect(params().get('window')).toBe('this_weekend');
    expect(params().get('q')).toBe('jazz');
    fireEvent.click(screen.getByRole('tab', { name: /Calendar/ }));
    expect(params().get('view')).toBe('calendar');
    expect(params().get('window')).toBe('this_weekend');
    expect(screen.getByRole('heading', { level: 2, name: 'This weekend' })).toBeInTheDocument();
    await waitFor(() => expect(lastEventsCall()).toEqual({ window: 'this_weekend', q: 'jazz', from: 'origin-1' }));
    expect(screen.getByLabelText('Search events')).toHaveValue('jazz');
  });

  it('names the window in the heading and follows the chips', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 2, name: 'Today' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'This weekend' }));
    expect(screen.getByRole('heading', { level: 2, name: 'This weekend' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next 7 days' }));
    const range = rangeLabel(windowDays('next_7_days', today()));
    expect(screen.getByRole('heading', { level: 2, name: range })).toBeInTheDocument();
    await waitFor(() => expect(lastEventsCall().window).toBe('next_7_days'));
  });

  it('dates Next up when it is not today', async () => {
    const tomorrow = addDays(today(), 1);
    listEvents.mockResolvedValue(body([
      event({ title: 'Career Fair', start: at(tomorrow, '09:00'), end: at(tomorrow, '10:00') }),
    ], { window: 'tomorrow' }));
    renderPage('/events?window=tomorrow');
    const feature = await screen.findByRole('article');
    expect(within(feature).getByText('Career Fair')).toBeInTheDocument();
    expect(within(feature).getByText(/^Tomorrow 9:00\sAM/)).toBeInTheDocument();
  });

  it('shows the orange tag only within 15 minutes or while happening', async () => {
    listEvents.mockResolvedValue(body([
      event({ title: 'Soon Talk', start: inMinutes(10), end: inMinutes(70) }),
      event({ title: 'Later Talk', start: inMinutes(60), end: inMinutes(120) }),
    ]));
    const { unmount } = renderPage();
    const feature = await screen.findByRole('article');
    expect(within(feature).getByText('Soon Talk')).toBeInTheDocument();
    expect(within(feature).getByText(/^Starts in (9|10) min$/)).toBeInTheDocument();
    unmount();

    listEvents.mockResolvedValue(body([event({ title: 'Later Talk', start: inMinutes(60), end: inMinutes(120) })]));
    renderPage();
    const later = await screen.findByRole('article');
    expect(within(later).queryByText(/Starts in/)).not.toBeInTheDocument();
    expect(within(later).queryByText('Happening now')).not.toBeInTheDocument();
  });

  it('tags an event that is on now as Happening now', async () => {
    listEvents.mockResolvedValue(body([event({ title: 'Open Lab', start: inMinutes(-30), end: inMinutes(30) })]));
    renderPage();
    const feature = await screen.findByRole('article');
    expect(within(feature).getByText('Happening now')).toBeInTheDocument();
  });

  it('shows walk time and Directions only for matched, physical venues', async () => {
    listEvents.mockResolvedValue(body([
      event({ title: 'Union Talk', place_id: 'union', walk_minutes: 8, start: inMinutes(60), end: inMinutes(90) }),
      event({ title: 'Webinar', location: '(Online)', place_id: 'ghost', walk_minutes: 5, start: inMinutes(100) }),
      event({ title: 'Mystery Room', location: 'Room 9', start: inMinutes(110) }),
    ]));
    renderPage('/events?view=list');
    await screen.findByText('Union Talk');
    expect(screen.getByText('8 min')).toBeInTheDocument();
    expect(screen.queryByText('5 min')).not.toBeInTheDocument();
    const directions = screen.getAllByRole('link', { name: /^Directions to/ });
    expect(directions).toHaveLength(1);
    expect(directions[0]).toHaveAttribute('href', '/map?to=union');
    expect(screen.queryByRole('link', { name: 'Directions to (Online)' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Webinar to calendar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Webinar' })).toBeInTheDocument();
  });

  it('says Listed through when the feed ends inside the window', async () => {
    const through = addDays(today(), 2);
    listEvents.mockResolvedValue(body([event({ title: 'Jazz Night' })], { listed_through: through }));
    renderPage('/events?window=next_7_days&view=list');
    expect(await screen.findByText(/^Listed through/)).toBeInTheDocument();
  });

  it('leaves out Listed through when the feed reaches past the window', async () => {
    listEvents.mockResolvedValue(body([event({ title: 'Jazz Night' })], { listed_through: addDays(today(), 9) }));
    renderPage('/events?window=next_7_days&view=list');
    await screen.findByText('Jazz Night');
    expect(screen.queryByText(/^Listed through/)).not.toBeInTheDocument();
  });

  it('shows the empty state with Try Next 7 days', async () => {
    listEvents.mockResolvedValue(body([], { listed_through: today() }));
    renderPage('/events?window=tomorrow');
    expect(await screen.findByText('Nothing listed for tomorrow')).toBeInTheDocument();
    expect(screen.getByText(/^Listed through/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try Next 7 days' }));
    expect(params().get('window')).toBe('next_7_days');
    await waitFor(() => expect(lastEventsCall().window).toBe('next_7_days'));
  });

  it('shows a feed error with Retry and keeps the controls usable', async () => {
    listEvents.mockResolvedValueOnce(body([], { error: "Couldn't load events from today.wisc.edu: timeout" }));
    renderPage();
    expect(await screen.findByText(/Couldn't load events from today\.wisc\.edu/)).toBeInTheDocument();
    expect(screen.getByLabelText('Search events')).toBeEnabled();
    listEvents.mockResolvedValueOnce(body([event({ title: 'Back Again' })]));
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(await screen.findByText('Back Again')).toBeInTheDocument();
    expect(listEvents).toHaveBeenCalledTimes(2);
  });

  it('treats a network failure as a feed error', async () => {
    listEvents.mockRejectedValueOnce(new Error('offline'));
    renderPage();
    expect(await screen.findByText(/Couldn't load events from the campus calendars/)).toBeInTheDocument();
  });

  it('keeps events and shows a banner when some calendars fail', async () => {
    listEvents.mockResolvedValue(body([event({ title: 'Jazz Night' })], { error: "Some calendars couldn't be read: Arts" }));
    renderPage();
    expect(await screen.findByText('Jazz Night')).toBeInTheDocument();
    expect(screen.getByText("Some calendars couldn't be read: Arts")).toBeInTheDocument();
  });

  it('shows placeholders only after 300 ms', async () => {
    jest.useFakeTimers();
    try {
      listEvents.mockReturnValue(new Promise(() => {}));
      renderPage();
      await act(async () => { await Promise.resolve(); });
      expect(screen.queryByTestId('events-placeholder')).not.toBeInTheDocument();
      act(() => { jest.advanceTimersByTime(350); });
      expect(screen.getByTestId('events-placeholder')).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('draws seven equal day columns with today marked', async () => {
    renderPage('/events?view=calendar');
    await screen.findAllByText(/Jazz Night/);
    const grid = screen.getByTestId('events-calendar-grid');
    const days = within(grid).getAllByTestId('events-calendar-day');
    expect(days).toHaveLength(7);
    expect(days[0]).toHaveClass('is-today');
    const head = within(grid).getByTestId('events-calendar-head');
    expect(head.style.gridTemplateColumns).toBe('56px repeat(7, minmax(0, 1fr))');
  });

  it('caps a time slot at three lanes and lists the rest under +N more', async () => {
    const key = today();
    const overlapping = ['A', 'B', 'C', 'D', 'E'].map((letter) => event({
      title: `Talk ${letter}`, start: at(key, '14:00'), end: at(key, '15:00'),
    }));
    listEvents.mockResolvedValue(body(overlapping));
    renderPage('/events?view=calendar');
    await screen.findAllByText(/Talk A/);
    expect(screen.getAllByTestId('events-calendar-block')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: /Show all events at 2 PM/ }));
    const list = screen.getByRole('region', { name: /2 PM/ });
    ['A', 'B', 'C', 'D', 'E'].forEach((letter) => {
      expect(within(list).getByText(`Talk ${letter}`)).toBeInTheDocument();
    });
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });

  it('shows two all-day chips and expands the rest', async () => {
    const key = today();
    const allDay = ['One', 'Two', 'Three', 'Four'].map((name) => event({
      title: `Exhibit ${name}`, all_day: true, start: at(key, '00:00'), end: at(addDays(key, 1), '00:00'),
    }));
    listEvents.mockResolvedValue(body(allDay));
    renderPage('/events?view=calendar');
    const more = await screen.findByRole('button', { name: /Show 2 more all-day events/ });
    fireEvent.click(more);
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument();
  });

  it('moves the window with the calendar arrows', async () => {
    renderPage('/events?view=calendar&window=tomorrow');
    await screen.findByRole('heading', { level: 2, name: 'Tomorrow' });
    fireEvent.click(screen.getByRole('button', { name: 'Next: This weekend' }));
    expect(params().get('window')).toBe('this_weekend');
    expect(screen.getByRole('heading', { level: 2, name: 'This weekend' })).toBeInTheDocument();
  });

  it('changes the start place with a PUT and refetches walk times', async () => {
    listPlaces.mockResolvedValue({ places: [{ id: 'union', name: 'Memorial Union' }] });
    setCampusOrigin.mockResolvedValue({ place: { id: 'union', name: 'Memorial Union' }, is_default: false });
    renderPage();
    await screen.findByText('College Library');
    fireEvent.click(screen.getByRole('button', { name: /Change starting place/ }));
    const dialog = screen.getByRole('dialog', { name: 'Choose a starting place' });
    fireEvent.change(within(dialog).getByLabelText('Search campus places'), { target: { value: 'union' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: /Memorial Union/ }));
    await waitFor(() => expect(setCampusOrigin).toHaveBeenCalledWith('test-token', 'union'));
    await waitFor(() => expect(lastEventsCall().from).toBe('union'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the start place search with Escape', async () => {
    renderPage();
    await screen.findByText('College Library');
    const change = screen.getByRole('button', { name: /Change starting place/ });
    fireEvent.click(change);
    fireEvent.keyDown(screen.getByLabelText('Search campus places'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(change).toHaveFocus();
  });

  it('a title opens the event pop-up over the page (?event=), and Close removes it', async () => {
    const jazz = event({ title: 'Jazz Night', categories: ['Music'] });
    listEvents.mockResolvedValue(body([jazz]));
    getEvent.mockResolvedValue({ event: { ...jazz, description: 'Big band night.' }, timezone: TZ });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Jazz Night' }));
    expect(params().get('event')).toBe('Jazz Night-id');
    const dialog = await screen.findByRole('dialog', { name: 'Jazz Night' });
    expect(await within(dialog).findByText('Big band night.')).toBeInTheDocument();
    expect(getEvent).toHaveBeenCalledWith('test-token', 'Jazz Night-id', expect.objectContaining({ from: 'origin-1' }));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(params().get('event')).toBeNull());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('a calendar block opens the event pop-up too', async () => {
    const jazz = event({ title: 'Jazz Night', start: at(today(), '15:00'), end: at(today(), '16:00') });
    listEvents.mockResolvedValue(body([jazz]));
    getEvent.mockResolvedValue({ event: jazz, timezone: TZ });
    renderPage('/events?view=calendar');
    const [block] = await screen.findAllByTestId('events-calendar-block');
    fireEvent.click(block);
    expect(params().get('event')).toBe('Jazz Night-id');
  });
});
