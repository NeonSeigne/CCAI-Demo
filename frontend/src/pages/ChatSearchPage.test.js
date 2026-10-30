import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

  fireEvent.change(screen.getByRole('searchbox', { name: /search your chats/i }), {
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

  fireEvent.change(screen.getByRole('searchbox', { name: /search your chats/i }), {
    target: { value: 'zzzz' },
  });

  await waitFor(() => {
    expect(screen.getByText('No chats found')).toBeInTheDocument();
  });
});

test('pinned chats come first as their own group', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => [
      { ...sessions[0], pinned: false },
      { ...sessions[1], pinned: true },
    ],
  });
  render(<ChatSearchPage />);
  const pinned = await screen.findByRole('region', { name: 'Pinned' });
  expect(within(pinned).getByText('Physics requirements')).toBeInTheDocument();
  expect(within(pinned).queryByText('Algebra plan')).not.toBeInTheDocument();
  const rest = screen.getByRole('region', { name: 'Recent' });
  expect(within(rest).getByText('Algebra plan')).toBeInTheDocument();
  expect(within(rest).getByText('4 messages')).toBeInTheDocument();
});

test('a failed load says so and retries', async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
    .mockResolvedValue({ ok: true, json: async () => sessions });
  render(<ChatSearchPage />);
  expect(await screen.findByText("Couldn't load chats")).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Algebra plan')).toBeInTheDocument();
});
