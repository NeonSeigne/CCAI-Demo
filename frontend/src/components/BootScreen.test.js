import React from 'react';
import { render, screen } from '@testing-library/react';
import BootScreen, { PageSkeleton } from './BootScreen';

test('the boot screen is the school frame with "Checking session…" as hidden status text', () => {
  const { container } = render(<BootScreen />);
  const status = screen.getByRole('status');
  expect(status).toHaveTextContent('Checking session…');
  expect(screen.getByText('Checking session…')).toHaveClass('sr-only');
  expect(container.querySelector('.campus-rail .campus-brand-mark')).toBeInTheDocument();
  expect(container.querySelector('.bt-panel')).toBeInTheDocument();
});

test('a page fallback is a skeleton with its label for screen readers only', () => {
  render(<PageSkeleton label="Loading map…" shape="page" />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading map…');
  expect(screen.getByText('Loading map…')).toHaveClass('sr-only');
});
