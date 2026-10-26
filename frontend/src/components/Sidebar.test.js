import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import Sidebar from './Sidebar';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const mockSetAdvisorEnabled = jest.fn();
const mockHydrateAdvisorPreferences = jest.fn();
let mockEnabledAdvisors = {
  academic: true,
  career: true,
};
const mockAdvisorIcon = () => (
  <svg data-testid="advisor-fallback-icon" aria-hidden="true" />
);

jest.mock('../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({
    config: {
      app: { title: 'Advisor' },
      version: '2.0.0',
    },
    advisors: {
      academic: {
        name: 'Academic Coach',
        avatarUrl: '/broken-advisor.png',
        icon: mockAdvisorIcon,
      },
      career: {
        name: 'Career Guide',
        avatarUrl: null,
        icon: mockAdvisorIcon,
      },
    },
    isAdvisorEnabled: (id) => mockEnabledAdvisors[id] !== false,
    setAdvisorEnabled: mockSetAdvisorEnabled,
    hydrateAdvisorPreferences: mockHydrateAdvisorPreferences,
  }),
}));

const sessions = [
  {
    id: 'session-1',
    title: 'Algebra plan',
    updated_at: new Date().toISOString(),
    message_count: 4,
  },
  {
    id: 'session-2',
    title: 'Physics requirements for a very long interdisciplinary degree plan',
    updated_at: new Date().toISOString(),
    message_count: 2,
  },
];

let mobileMatches = false;

const setMatchMedia = () => {
  window.matchMedia = jest.fn().mockImplementation((query) => ({
    matches: mobileMatches,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
};

const defaultProps = {
  user: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.edu',
  },
  currentSessionId: null,
  onSelectSession: jest.fn(),
  onNewChat: jest.fn().mockResolvedValue(undefined),
  onSignOut: jest.fn(),
  onOpenSettings: jest.fn(),
  authToken: 'test-token',
  onSidebarToggle: jest.fn(),
  isMobileOpen: false,
  onMobileToggle: jest.fn(),
  refreshTrigger: 0,
  onCurrentSessionDeleted: jest.fn(),
  thinkingAdvisors: [],
};

const renderSidebar = (props = {}) => {
  const mergedProps = { ...defaultProps, ...props };
  return {
    props: mergedProps,
    ...render(<Sidebar {...mergedProps} />),
  };
};

beforeEach(() => {
  mobileMatches = false;
  mockEnabledAdvisors = {
    academic: true,
    career: true,
  };
  setMatchMedia();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => sessions,
  });

  Object.values(defaultProps).forEach((value) => {
    if (typeof value === 'function' && value.mockClear) value.mockClear();
  });
  mockSetAdvisorEnabled.mockClear();
  mockHydrateAdvisorPreferences.mockClear();
  mockNavigate.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('loads chat sessions without filtering in the sidebar', async () => {
  renderSidebar();

  expect(await screen.findByText('Algebra plan')).toBeInTheDocument();
  expect(
    screen.getByText(
      'Physics requirements for a very long interdisciplinary degree plan',
    ),
  ).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: /search chats/i })).not.toBeInTheDocument();
});

test('navigates to the search page from the sidebar', async () => {
  renderSidebar();
  await screen.findByText('Algebra plan');

  fireEvent.click(screen.getByRole('button', { name: /search chats/i }));
  expect(mockNavigate).toHaveBeenCalledWith('/search');
});

test('places Home after New chat and navigates there', async () => {
  renderSidebar();
  await screen.findByText('Algebra plan');

  const newChat = screen.getByRole('button', { name: /^new chat$/i });
  const home = screen.getByRole('button', { name: /^home$/i });
  expect(newChat.compareDocumentPosition(home)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );

  fireEvent.click(home);
  expect(mockNavigate).toHaveBeenCalledWith('/home');
});

test('simplifies recent chats and keeps long titles on one line', async () => {
  renderSidebar();
  const longTitle = await screen.findByText(
    'Physics requirements for a very long interdisciplinary degree plan',
  );

  expect(longTitle).toHaveClass('MuiTypography-noWrap');
  expect(screen.queryByText(/messages/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/today|yesterday|days ago/i)).not.toBeInTheDocument();
  expect(screen.getByText('Recent chats')).toBeInTheDocument();
});

test('keeps commands and account outside the scrollable advisor and recents region', async () => {
  const { container } = renderSidebar();
  await screen.findByText('Algebra plan');

  const commands = container.querySelector('[data-sidebar-region="commands"]');
  const scroll = container.querySelector('[data-sidebar-region="scroll"]');
  const account = container.querySelector('[data-sidebar-region="account"]');

  expect(commands).toBeInTheDocument();
  expect(scroll).toContainElement(screen.getByLabelText('Advisor panel'));
  expect(scroll).toContainElement(screen.getByText('Recent chats'));
  expect(account).toContainElement(
    screen.getByRole('button', { name: /open settings/i }),
  );
  expect(commands.compareDocumentPosition(scroll)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  expect(scroll.compareDocumentPosition(account)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
});

test('selects a session and reports desktop collapse changes', async () => {
  const onSelectSession = jest.fn();
  const onSidebarToggle = jest.fn();
  renderSidebar({ onSelectSession, onSidebarToggle });

  fireEvent.click(await screen.findByText('Algebra plan'));
  expect(onSelectSession).toHaveBeenCalledWith('session-1');

  fireEvent.click(
    screen.getByRole('button', { name: /collapse sidebar/i }),
  );
  await waitFor(() => expect(onSidebarToggle).toHaveBeenLastCalledWith(true));
  expect(
    screen.getByRole('button', { name: /expand sidebar/i }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /remove academic coach from panel/i }),
  ).toBeInTheDocument();
});

test('closes the mobile drawer after selecting a session', async () => {
  mobileMatches = true;
  setMatchMedia();
  const onMobileToggle = jest.fn();

  renderSidebar({ isMobileOpen: true, onMobileToggle });
  fireEvent.click(await screen.findByText('Algebra plan'));

  expect(onMobileToggle).toHaveBeenCalledWith(false);
});

test('closes the mobile drawer before navigating Home, Search, or opening settings', async () => {
  mobileMatches = true;
  setMatchMedia();
  const onMobileToggle = jest.fn();
  const onOpenSettings = jest.fn();

  const { rerender } = renderSidebar({
    isMobileOpen: true,
    onMobileToggle,
    onOpenSettings,
  });
  fireEvent.click(await screen.findByRole('button', { name: /^home$/i }));
  expect(onMobileToggle).toHaveBeenCalledWith(false);
  expect(mockNavigate).toHaveBeenCalledWith('/home');

  onMobileToggle.mockClear();
  mockNavigate.mockClear();
  rerender(
    <Sidebar
      {...defaultProps}
      isMobileOpen
      onMobileToggle={onMobileToggle}
      onOpenSettings={onOpenSettings}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /search chats/i }));
  expect(onMobileToggle).toHaveBeenCalledWith(false);
  expect(mockNavigate).toHaveBeenCalledWith('/search');

  onMobileToggle.mockClear();
  rerender(
    <Sidebar
      {...defaultProps}
      isMobileOpen
      onMobileToggle={onMobileToggle}
      onOpenSettings={onOpenSettings}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /open settings/i }));
  expect(onMobileToggle).toHaveBeenCalledWith(false);
  expect(onOpenSettings).toHaveBeenCalledTimes(1);
});

test('confirms deletion of an individual recent chat', async () => {
  renderSidebar();
  await screen.findByText('Algebra plan');
  fireEvent.click(
    screen.getByRole('button', { name: /delete algebra plan/i }),
  );

  expect(
    screen.getByRole('heading', { name: /delete this chat/i }),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: /^delete chat$/i }),
  );

  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/chat-sessions/session-1'),
      expect.objectContaining({ method: 'DELETE' }),
    ),
  );
});

test('disables the new-chat action while creation is pending', async () => {
  let resolveNewChat;
  const onNewChat = jest.fn(
    () =>
      new Promise((resolve) => {
        resolveNewChat = resolve;
      }),
  );
  renderSidebar({ onNewChat });

  await screen.findByText('Algebra plan');
  fireEvent.click(screen.getByRole('button', { name: /^new chat$/i }));

  expect(
    screen.getByRole('button', { name: /creating/i }),
  ).toHaveAttribute('aria-disabled', 'true');

  await act(async () => {
    resolveNewChat();
  });

  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /^new chat$/i }),
    ).toBeEnabled(),
  );
});

test('toggles advisors directly and hydrates preferences for the session', async () => {
  renderSidebar();
  await screen.findByText('Algebra plan');

  expect(mockHydrateAdvisorPreferences).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole('button', { name: /remove career guide from panel/i }),
  );
  expect(mockSetAdvisorEnabled).toHaveBeenCalledWith('career', false);
});

test('warns before disabling the final enabled advisor', async () => {
  mockEnabledAdvisors = {
    academic: true,
    career: false,
  };
  renderSidebar();
  await screen.findByText('Algebra plan');

  fireEvent.click(
    screen.getByRole('button', { name: /remove academic coach from panel/i }),
  );
  expect(mockSetAdvisorEnabled).not.toHaveBeenCalled();
  expect(
    screen.getByRole('heading', { name: /disable your final advisor/i }),
  ).toBeInTheDocument();

  fireEvent.click(
    screen.getByRole('button', { name: /disable anyway/i }),
  );
  expect(mockSetAdvisorEnabled).toHaveBeenCalledWith('academic', false);
});

test('falls back to the advisor icon when an avatar image fails', async () => {
  const { container } = renderSidebar();
  await screen.findByText('Algebra plan');

  const image = container.querySelector('img[src="/broken-advisor.png"]');
  expect(image).toBeInTheDocument();
  fireEvent.error(image);

  expect(
    screen.getAllByTestId('advisor-fallback-icon').length,
  ).toBeGreaterThanOrEqual(2);
});

test('opens settings and account actions from the fixed footer', async () => {
  const onOpenSettings = jest.fn();
  const onSignOut = jest.fn();
  renderSidebar({ onOpenSettings, onSignOut });
  await screen.findByText('Algebra plan');

  fireEvent.click(screen.getByRole('button', { name: /open settings/i }));
  expect(onOpenSettings).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: /open account menu/i }));
  fireEvent.click(screen.getByRole('menuitem', { name: /sign out/i }));
  expect(onSignOut).toHaveBeenCalledTimes(1);
});
