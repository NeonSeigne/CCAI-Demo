import React from 'react';
import {
  act, fireEvent, render, screen, within,
} from '@testing-library/react';
import UserGuide from './UserGuide';

jest.mock('../contexts/AppConfigContext', () => ({ useAppConfig: () => ({ config: { app: { title: 'Campus Companion' } } }) }));

const open = () => act(() => {
  window.dispatchEvent(new CustomEvent('open-user-guide', { detail: { leftInset: 0 } }));
});

test('Help: the topics at the left, the first one open', () => {
  render(<UserGuide />);
  open();
  expect(screen.getByRole('dialog')).toHaveTextContent('Help');
  const toc = screen.getAllByRole('navigation', { name: 'Topics' })[0];
  expect(within(toc).getAllByRole('button').map((b) => b.textContent.replace(/^[a-z_]+/, '')))
    .toEqual(['Getting Started', 'Uploading Documents', 'Sessions & History', 'Tips & Shortcuts']);
  expect(within(toc).getByRole('button', { name: /Getting Started/ })).toHaveAttribute('aria-current', 'true');
});

test('the topics about removed features are gone', () => {
  render(<UserGuide />);
  open();
  expect(screen.queryByText(/Progress Canvas/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Conversations & Replies/)).not.toBeInTheDocument();
});

test('search filters the topics; the phone chips pick one too', () => {
  render(<UserGuide />);
  open();
  fireEvent.change(screen.getByPlaceholderText('Search the guide…'), { target: { value: 'zzzz' } });
  expect(screen.getByText('No matches')).toBeInTheDocument();
  const chips = screen.getByRole('group', { name: 'Topics' });
  fireEvent.click(within(chips).getByRole('button', { name: 'Tips & Shortcuts' }));
  expect(within(chips).getByRole('button', { name: 'Tips & Shortcuts' })).toHaveAttribute('aria-pressed', 'true');
});
