import React, { useState } from 'react';
import {
  act, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import {
  MemoryRouter, Route, Routes, useLocation,
} from 'react-router-dom';
import AppShell from './AppShell';
import { usePageColumn } from './PageColumnContext';
import AppDialog from '../AppDialog';
import { SavedContext } from '../../contexts/SavedContext';
import { DOCK_COLLAPSED_KEY } from '../../contexts/ChatDockContext';

const mockChat = {
  messages: [],
  thinkingAdvisors: [],
  groupViews: {},
  attachments: [],
  uploadedDocuments: [],
  sessionEpoch: 0,
  isLoading: false,
  attach: jest.fn(),
  removeAttachment: jest.fn(),
  send: jest.fn(),
  newChat: jest.fn(),
  addDocument: jest.fn(),
};

jest.mock('../../contexts/ChatContext', () => ({
  useChat: () => mockChat,
  ChatContext: jest.requireActual('react').createContext(null),
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ authToken: 'token', user: { firstName: 'Ada' } }),
}));
jest.mock('../../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({ config: { app: { institution: 'UVA' } } }),
}));

/** Pretend the window is `width` px wide for every media query. */
function setWidth(width) {
  window.matchMedia = (media) => {
    const min = media.match(/min-width:\s*(\d+)px/);
    const max = media.match(/max-width:\s*(\d+)px/);
    const matches = (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
    return {
      matches, media, addEventListener: () => {}, removeEventListener: () => {},
    };
  };
}

function Page({ children }) {
  return (
    <div className="campus-home" data-testid="page">
      <main>{children}</main>
    </div>
  );
}

function PageWithDialog() {
  const column = usePageColumn();
  const [open, setOpen] = useState(false);
  return (
    <Page>
      <button type="button" onClick={() => setOpen(true)}>Open course</button>
      <AppDialog open={open} container={column} onClose={() => setOpen(false)} aria-labelledby="course-title">
        <h2 id="course-title">Course</h2>
        <button type="button">Add to plan</button>
      </AppDialog>
    </Page>
  );
}

/** Stands in for the Settings page: shows where the account menu led. */
function SettingsProbe() {
  const { pathname, hash } = useLocation();
  return <Page>{`At ${pathname}${hash}`}</Page>;
}

const renderShell = (path = '/courses', element = <Page>Courses</Page>) => render(
  <MemoryRouter initialEntries={[path]}>
    <SavedContext.Provider value={{ count: 0 }}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path={path} element={element} />
          <Route path="/settings" element={<SettingsProbe />} />
        </Route>
      </Routes>
    </SavedContext.Provider>
  </MemoryRouter>,
);

const dock = () => screen.queryAllByRole('complementary', { name: 'Ask' });

beforeEach(() => {
  window.localStorage.clear();
  jest.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));
  setWidth(1440);
});

afterEach(() => { jest.restoreAllMocks(); });

describe('chat dock by width (D17)', () => {
  test('>= 1280px: docked, collapses to a strip and remembers it', async () => {
    const { unmount } = renderShell();
    expect(screen.getByRole('heading', { name: 'Ask' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ask about courses, events or places')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Ask' }));
    expect(screen.queryByRole('heading', { name: 'Ask' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Ask' })).toBeInTheDocument();
    expect(window.localStorage.getItem(DOCK_COLLAPSED_KEY)).toBe('true');
    unmount();

    renderShell();
    expect(screen.getByRole('button', { name: 'Open Ask' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Ask' }));
    expect(screen.getByRole('heading', { name: 'Ask' })).toBeInTheDocument();
    expect(window.localStorage.getItem(DOCK_COLLAPSED_KEY)).toBe('false');
    await screen.findByText('Your chats will show up here.');
  });

  test('a blocked localStorage still lets the dock collapse', async () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Ask' }));
    expect(screen.getByRole('button', { name: 'Open Ask' })).toBeInTheDocument();
    await screen.findByText('Your chats will show up here.');
  });

  test('701–1279px: collapsed by default, opens as a drawer, Escape closes it', async () => {
    setWidth(1024);
    renderShell();
    expect(screen.queryByRole('heading', { name: 'Ask' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Ask' }));
    const drawer = screen.getByRole('heading', { name: 'Ask' }).closest('aside');
    expect(drawer).toHaveClass('is-drawer');
    fireEvent.keyDown(within(drawer).getByRole('textbox'), { key: 'Escape' });
    expect(screen.queryByRole('heading', { name: 'Ask' })).not.toBeInTheDocument();
    await screen.findByText('Your chats will show up here.');
  });

  test('700px is a phone: no dock', async () => {
    setWidth(700);
    renderShell();
    expect(dock()).toHaveLength(0);
    await screen.findByText('Your chats will show up here.');
  });

  test.each([701, 1279])('%ipx opens the dock as a drawer', async (width) => {
    setWidth(width);
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Open Ask' }));
    expect(screen.getByRole('heading', { name: 'Ask' }).closest('aside')).toHaveClass('is-drawer');
    await screen.findByText('Your chats will show up here.');
  });

  test('1280px docks the dock', async () => {
    setWidth(1280);
    renderShell();
    expect(screen.getByRole('heading', { name: 'Ask' }).closest('aside')).not.toHaveClass('is-drawer');
    await screen.findByText('Your chats will show up here.');
  });

  test('<= 700px: no dock until the Ask tab raises the sheet', async () => {
    setWidth(375);
    renderShell();
    expect(dock()).toHaveLength(0);
    const tabs = within(screen.getByRole('navigation', { name: 'Main tabs' }));
    const ask = tabs.getByRole('button', { name: 'Ask' });
    expect(ask).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(ask);
    expect(screen.getByRole('heading', { name: 'Ask' }).closest('aside')).toHaveClass('is-sheet', 'is-half');
    expect(ask).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    expect(screen.getByRole('heading', { name: 'Ask' }).closest('aside')).toHaveClass('is-full');
    await screen.findByText('Your chats will show up here.');
  });

  test('<= 700px: closing the sheet returns focus to the Ask tab', async () => {
    setWidth(375);
    renderShell();
    const ask = within(screen.getByRole('navigation', { name: 'Main tabs' })).getByRole('button', { name: 'Ask' });
    ask.focus();
    fireEvent.click(ask);
    fireEvent.click(screen.getByRole('button', { name: 'Close Ask' }));
    await waitFor(() => expect(ask).toHaveFocus());
    await screen.findByText('Your chats will show up here.');
  });

  test.each(['/home', '/chat'])('hidden on %s, where the page is the ask', async (path) => {
    renderShell(path);
    expect(dock()).toHaveLength(0);
    await screen.findByText('Your chats will show up here.');
  });
});

describe('unread dot', () => {
  const reply = { id: 'a1', type: 'advisor', content: 'Answer' };
  const tree = () => (
    <MemoryRouter initialEntries={['/home']}>
      <SavedContext.Provider value={{ count: 0 }}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/home" element={<Page>Home</Page>} />
            <Route path="/courses" element={<Page>Courses</Page>} />
          </Route>
        </Routes>
      </SavedContext.Provider>
    </MemoryRouter>
  );

  afterEach(() => {
    mockChat.messages = [];
    mockChat.sessionEpoch = 0;
  });

  test('a reply read on /home lights no dot on /courses; a later one does', async () => {
    window.localStorage.setItem(DOCK_COLLAPSED_KEY, 'true');
    const { rerender } = render(tree());
    mockChat.messages = [reply];
    rerender(tree());
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Courses' }));
    expect(screen.getByRole('button', { name: 'Open Ask' })).toBeInTheDocument();
    expect(screen.queryByText('New reply')).not.toBeInTheDocument();

    mockChat.messages = [reply, { ...reply, id: 'a2' }];
    rerender(tree());
    expect(screen.getByText('New reply')).toBeInTheDocument();
    await screen.findByText('Your chats will show up here.');
  });

  test('a new conversation clears the dot', async () => {
    window.localStorage.setItem(DOCK_COLLAPSED_KEY, 'true');
    const { rerender } = renderShell();
    mockChat.messages = [reply];
    rerender(
      <MemoryRouter initialEntries={['/courses']}>
        <SavedContext.Provider value={{ count: 0 }}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/courses" element={<Page>Courses</Page>} />
            </Route>
          </Routes>
        </SavedContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByText('New reply')).toBeInTheDocument();
    mockChat.messages = [reply, { ...reply, id: 'a2' }];
    mockChat.sessionEpoch = 1;
    rerender(
      <MemoryRouter initialEntries={['/courses']}>
        <SavedContext.Provider value={{ count: 0 }}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/courses" element={<Page>Courses</Page>} />
            </Route>
          </Routes>
        </SavedContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.queryByText('New reply')).not.toBeInTheDocument();
    await screen.findByText('Your chats will show up here.');
  });
});

describe('pop-ups in the page column (R15)', () => {
  test('only page content is hidden; the rail and dock stay live', async () => {
    renderShell('/courses', <PageWithDialog />);
    const trigger = screen.getByRole('button', { name: 'Open course' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'Course' });
    expect(dialog).toHaveAttribute('aria-modal', 'false');
    expect(document.querySelector('.cc-shell-page')).toContainElement(dialog);
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.querySelector('.cc-shell-page').style.overflow).toBe('');
    expect(screen.getByTestId('page')).toHaveAttribute('aria-hidden', 'true');

    const rail = screen.getByRole('navigation', { name: 'Main' });
    const askDock = screen.getByRole('heading', { name: 'Ask' }).closest('aside');
    expect(rail.closest('[aria-hidden="true"]')).toBeNull();
    expect(askDock.closest('[aria-hidden="true"]')).toBeNull();

    // The dock's composer can take focus while the pop-up is open.
    const composer = within(askDock).getByRole('textbox');
    act(() => composer.focus());
    expect(composer).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.getByTestId('page')).not.toHaveAttribute('aria-hidden');
    expect(document.documentElement.style.overflow).toBe('');
  });
});

describe('the dock header and composer (events.html)', () => {
  test('Open in full and Close, no New chat; no mic', async () => {
    renderShell();
    const askDock = screen.getByRole('heading', { name: 'Ask' }).closest('aside');
    expect(within(askDock).getByRole('button', { name: 'Open in full' })).toBeInTheDocument();
    expect(within(askDock).getByRole('button', { name: 'Collapse Ask' })).toBeInTheDocument();
    expect(within(askDock).queryByRole('button', { name: 'New chat' })).not.toBeInTheDocument();
    expect(within(askDock).queryByRole('button', { name: 'Voice input' })).not.toBeInTheDocument();
    await screen.findByText('Your chats will show up here.');
  });

  test('Events gives the dock its own placeholder', async () => {
    renderShell('/events', <Page>Events</Page>);
    expect(screen.getByPlaceholderText('Ask about these events')).toBeInTheDocument();
    await screen.findByText('Your chats will show up here.');
  });
});

describe('the account menu', () => {
  test('the rail user row opens Profile, Settings, Model, Help, Sign out', async () => {
    renderShell();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: 'Account' }));
    const menu = screen.getByRole('menu', { name: 'Account' });
    expect([...menu.querySelectorAll('.cc-menu-label')].map((label) => label.textContent))
      .toEqual(['Profile', 'Settings', 'Model', 'Help', 'Sign out']);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Profile' }));
    expect(await screen.findByText('At /settings#profile')).toBeInTheDocument();
  });

  test('Settings and Model open the Settings page', async () => {
    renderShell();
    const rail = screen.getByRole('navigation', { name: 'Main' });
    fireEvent.click(within(rail).getByRole('button', { name: 'Account' }));
    fireEvent.click(within(screen.getByRole('menu', { name: 'Account' })).getByRole('menuitem', { name: 'Settings' }));
    expect(await screen.findByText('At /settings')).toBeInTheDocument();
    fireEvent.click(within(rail).getByRole('button', { name: 'Account' }));
    fireEvent.click(within(screen.getByRole('menu', { name: 'Account' })).getByRole('menuitem', { name: /^Model/ }));
    expect(await screen.findByText('At /settings#model')).toBeInTheDocument();
  });

  test('on a phone the header avatar opens it as a bottom sheet', async () => {
    setWidth(390);
    renderShell();
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Account' }));
    const menu = screen.getByRole('menu', { name: 'Account' });
    expect(menu.closest('.cc-menu')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
    await screen.findByText('Your chats will show up here.');
  });
});
