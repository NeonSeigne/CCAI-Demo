import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatSearchPage from '../pages/ChatSearchPage';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ authToken: 'test-token' }),
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
    title: 'Physics requirements',
    updated_at: new Date().toISOString(),
    message_count: 2,
  },
];

beforeEach(() => {
  mockNavigate.mockClear();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => sessions,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('lists chats and filters them on the search page', async () => {
  render(<ChatSearchPage />);

  expect(await screen.findByText('Algebra plan')).toBeInTheDocument();
  expect(screen.getByText('Physics requirements')).toBeInTheDocument();

  fireEvent.change(screen.getByRole('textbox', { name: /search your chats/i }), {
    target: { value: 'physics' },
  });

  expect(screen.queryByText('Algebra plan')).not.toBeInTheDocument();
  expect(screen.getByText('Physics requirements')).toBeInTheDocument();
});

test('opens a selected chat from the search page', async () => {
  render(<ChatSearchPage />);

  fireEvent.click(await screen.findByText('Algebra plan'));
  expect(mockNavigate).toHaveBeenCalledWith('/chat', {
    state: { sessionId: 'session-1' },
  });
});

test('goes back to chat from the search page', async () => {
  render(<ChatSearchPage />);
  await screen.findByText('Algebra plan');

  fireEvent.click(screen.getByRole('button', { name: /back to chat/i }));
  expect(mockNavigate).toHaveBeenCalledWith('/chat');
});

test('shows an empty state when no chats match', async () => {
  render(<ChatSearchPage />);
  await screen.findByText('Algebra plan');

  fireEvent.change(screen.getByRole('textbox', { name: /search your chats/i }), {
    target: { value: 'zzzz' },
  });

  await waitFor(() => {
    expect(screen.getByText('No chats found')).toBeInTheDocument();
  });
});
