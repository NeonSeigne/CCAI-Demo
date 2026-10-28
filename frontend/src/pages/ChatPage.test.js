import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ChatPage from './ChatPage';
import { PlannerProvider } from '../contexts/PlannerContext';
import * as plannerApi from '../api/planner';
import { view } from '../components/planner/plannerFixtures';

jest.mock('../api/planner', () => ({
  ...jest.requireActual('../api/planner'),
  getPlan: jest.fn(),
  listPrograms: jest.fn(),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({ state: null }),
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { firstName: 'Ada' },
    authToken: 'token',
    handleSignOut: jest.fn(),
    handleUserUpdate: jest.fn(),
  }),
}));

jest.mock('../contexts/AppConfigContext', () => ({
  useAppConfig: () => ({
    config: {
      app: { title: 'Advisory' },
      chat_page: { placeholder: 'Ask anything', examples: [] },
    },
    advisors: {},
  }),
}));
jest.mock('../components/CampusRail', () => () => <nav />);
jest.mock('../components/AnswerPanel', () => ({ __esModule: true, default: () => <aside />, buildSuggestions: () => [], latestVisuals: () => [] }));
jest.mock('../components/OnboardingTour', () => ({ children }) => <>{children}</>);
jest.mock('../components/ExportButton', () => () => null);
jest.mock('../components/SettingsModal', () => () => null);
jest.mock('../components/AdvisorCarousel', () => () => null);
jest.mock('../components/MessageBubble', () => () => null);
jest.mock('../components/ThinkingIndicator', () => () => null);
jest.mock('../components/SuggestionsPanel', () => () => <div>Starter prompts</div>);
jest.mock('../components/EnhancedChatInput', () => (props) => (
  <button type="button" onClick={() => props.onSendMessage('Plan my semester')}>
    Send test message
  </button>
));

beforeEach(() => {
  jest.useFakeTimers();
  Element.prototype.scrollIntoView = jest.fn();
  global.fetch = jest.fn(() => new Promise(() => {}));
});

afterEach(() => {
  jest.useRealTimers();
});

test('moves the landing composer into the active chat on first submit', () => {
  const { container } = render(<ChatPage />);
  expect(container.querySelector('.phase-landing')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Send test message' }));
  expect(container.querySelector('.phase-transitioning')).toBeInTheDocument();
  expect(container.querySelector('.welcome-state.is-leaving')).toBeInTheDocument();
  expect(container.querySelector('.messages-container')).toBeInTheDocument();

  act(() => {
    jest.advanceTimersByTime(280);
  });
  expect(container.querySelector('.phase-active')).toBeInTheDocument();
  expect(container.querySelector('.welcome-state')).not.toBeInTheDocument();
});

describe('Plan toggle', () => {
  const width = window.innerWidth;

  beforeEach(() => {
    plannerApi.getPlan.mockResolvedValue(view());
    plannerApi.listPrograms.mockResolvedValue([]);
  });

  afterEach(() => {
    window.innerWidth = width;
  });

  const renderWithPlanner = () => render(
    <PlannerProvider>
      <ChatPage />
    </PlannerProvider>,
  );

  test('opens the plan in the right-panel slot on desktop and closes it again', async () => {
    window.innerWidth = 1440;
    renderWithPlanner();
    expect(screen.queryByRole('region', { name: 'Your plan' })).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Plan' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Your plan' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Plan' })).toHaveClass('plan-slot');
    expect(await screen.findByRole('heading', { name: 'Spring 2027' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close plan' }));
    expect(screen.queryByRole('region', { name: 'Your plan' })).not.toBeInTheDocument();
  });

  test('opens a drawer over the chat on tablets', async () => {
    window.innerWidth = 1000;
    renderWithPlanner();
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
    expect(screen.getByRole('complementary', { name: 'Plan' })).toHaveClass('plan-drawer');
    expect(await screen.findByRole('heading', { name: 'Spring 2027' })).toBeInTheDocument();
  });

  test('on phones opens a bottom sheet that Esc closes, with a peek bar after', async () => {
    window.innerWidth = 390;
    renderWithPlanner();
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
    const sheet = screen.getByRole('dialog', { name: 'Your plan' });
    expect(await screen.findByRole('heading', { name: 'Spring 2027' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand plan' }));
    expect(sheet).toHaveClass('is-full');
    fireEvent.keyDown(sheet, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Your plan' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open plan: Spring 27 · 17 cr' })).toBeInTheDocument();
  });
});
