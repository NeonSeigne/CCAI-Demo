import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ChatPage from './ChatPage';

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
jest.mock('../components/Sidebar', () => () => <aside />);
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
