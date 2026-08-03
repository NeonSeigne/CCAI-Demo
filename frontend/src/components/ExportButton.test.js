import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ExportButton from './ExportButton';

beforeEach(() => {
  global.fetch = jest.fn();
  window.URL.createObjectURL = jest.fn(() => 'blob:export');
  window.URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('disables Share when there are no conversation messages', () => {
  render(<ExportButton />);

  expect(
    screen.getByRole('button', { name: /share or export chat/i }),
  ).toBeDisabled();
});

test('opens a Material menu with the retained export choices', async () => {
  render(<ExportButton hasMessages />);

  fireEvent.click(
    screen.getByRole('button', { name: /share or export chat/i }),
  );

  expect(await screen.findByText('What to export')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /full chat/i })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /chat summary/i }),
  ).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /text file/i })).toBeInTheDocument();
  expect(
    screen.getByRole('menuitem', { name: /word document/i }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('menuitem', { name: /pdf document/i }),
  ).toBeInTheDocument();
});

test('downloads the selected export format for the current session', async () => {
  global.fetch.mockResolvedValue({
    ok: true,
    headers: {
      get: jest.fn(() => 'attachment; filename="advisor-chat.txt"'),
    },
    blob: jest.fn(async () => new Blob(['chat'])),
  });

  render(
    <ExportButton
      hasMessages
      currentSessionId="session-1"
      authToken="token-1"
    />,
  );

  fireEvent.click(
    screen.getByRole('button', { name: /share or export chat/i }),
  );
  fireEvent.click(
    await screen.findByRole('menuitem', { name: /text file/i }),
  );

  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '/export-chat?format=txt&chat_session_id=session-1',
      ),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-1',
        }),
      }),
    ),
  );
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:export');
});
