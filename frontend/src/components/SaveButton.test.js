import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SaveButton from './SaveButton';
import { ToastProvider } from './Toast';
import { SavedProvider, useSaved } from '../contexts/SavedContext';

jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ authToken: 'token' }) }));

const ITEM = { kind: 'course', key: 'COMP SCI 300', display_name: 'COMP SCI 300' };

const respond = (status, body) => Promise.resolve({
  ok: status < 400, status, text: () => Promise.resolve(body === undefined ? '' : JSON.stringify(body)),
});

function Count() {
  return <span data-testid="count">{useSaved().count}</span>;
}

const renderButton = () => render(
  <MemoryRouter>
    <SavedProvider>
      <ToastProvider>
        <SaveButton item={ITEM} />
        <Count />
      </ToastProvider>
    </SavedProvider>
  </MemoryRouter>,
);

afterEach(() => { jest.restoreAllMocks(); });

test('one tap saves to Unsorted with Move and Undo, tap again removes', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockImplementation((url, init = {}) => {
    if (init.method === 'POST') return respond(200, { id: 'abc', ...JSON.parse(init.body) });
    if (init.method === 'DELETE') return respond(204);
    return respond(200, { items: [] });
  });
  renderButton();
  const button = await screen.findByRole('button', { name: 'Save COMP SCI 300' });
  expect(button).toHaveAttribute('aria-pressed', 'false');

  fireEvent.click(button);
  expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(await screen.findByText('Saved to Unsorted')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Move' })).toHaveAttribute('href', '/saved');
  expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  expect(screen.getByTestId('count')).toHaveTextContent('1');
  const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
  expect(JSON.parse(post[1].body)).toEqual(ITEM);

  fireEvent.click(button);
  expect(await screen.findByText('Removed')).toBeInTheDocument();
  expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(fetchMock.mock.calls.some(([url, init]) => init?.method === 'DELETE' && url.endsWith('/api/saved/abc'))).toBe(true);
});

test('Undo after removing saves the item again', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockImplementation((url, init = {}) => {
    if (init.method === 'POST') return respond(200, { id: 'abc', ...JSON.parse(init.body) });
    if (init.method === 'DELETE') return respond(204);
    return respond(200, { items: [{ id: 'abc', ...ITEM, collection_id: 'c1' }] });
  });
  renderButton();
  const button = await screen.findByRole('button', { name: 'Save COMP SCI 300' });
  await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));
  fireEvent.click(button);
  expect(await screen.findByText('Removed')).toBeInTheDocument();
  await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true));
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(button).toHaveAttribute('aria-pressed', 'true');
  await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true));
  const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
  expect(JSON.parse(post[1].body)).toMatchObject({ collection_id: 'c1' });
});

test('a failed save reverts and offers Retry', async () => {
  jest.spyOn(global, 'fetch').mockImplementation((url, init = {}) => (
    init.method === 'POST' ? respond(503, { detail: 'down' }) : respond(200, [])
  ));
  renderButton();
  const button = await screen.findByRole('button', { name: 'Save COMP SCI 300' });
  fireEvent.click(button);
  expect(await screen.findByText("Couldn't save")).toBeInTheDocument();
  expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
});

test('the toast goes away after five seconds', async () => {
  jest.useFakeTimers();
  jest.spyOn(global, 'fetch').mockImplementation((url, init = {}) => (
    init.method === 'POST' ? respond(200, { id: 'x' }) : respond(200, [])
  ));
  renderButton();
  fireEvent.click(await screen.findByRole('button', { name: 'Save COMP SCI 300' }));
  await screen.findByText('Saved to Unsorted');
  act(() => { jest.advanceTimersByTime(5000); });
  await waitFor(() => expect(screen.queryByText('Saved to Unsorted')).not.toBeInTheDocument());
  jest.useRealTimers();
});

test('renders nothing outside a SavedProvider', () => {
  const { container } = render(<SaveButton item={ITEM} />);
  expect(container).toBeEmptyDOMElement();
});
