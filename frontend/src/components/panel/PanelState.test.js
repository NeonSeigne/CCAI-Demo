import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PanelState from './PanelState';

test('loading draws the layout it is given, busy for screen readers', () => {
  render(
    <PanelState status="loading" label="Loading today’s events">
      <span className="pnl-block" data-testid="row" />
      <span className="pnl-block" data-testid="row" />
    </PanelState>,
  );
  const status = screen.getByRole('status');
  expect(status).toHaveAttribute('aria-busy', 'true');
  expect(status).toHaveTextContent('Loading today’s events');
  expect(screen.getAllByTestId('row')).toHaveLength(2);
});

test('loading without a layout draws plain rows', () => {
  const { container } = render(<PanelState status="loading" rows={4} />);
  // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
  expect(container.querySelectorAll('.pnl-row')).toHaveLength(4);
});

test('empty reads "Nothing listed today" with an icon', () => {
  render(<PanelState status="empty" />);
  expect(screen.getByRole('status')).toHaveTextContent('Nothing listed today');
  render(<PanelState status="empty" message="No saved items" icon="bookmark" />);
  expect(screen.getByText('No saved items')).toBeInTheDocument();
});

test('error is ink text with an icon and a Retry that calls back', () => {
  const onRetry = jest.fn();
  render(<PanelState status="error" message="Events are unavailable right now." onRetry={onRetry} />);
  const alert = screen.getByRole('alert');
  expect(alert).toHaveClass('pnl-error');
  expect(alert).toHaveTextContent('Events are unavailable right now.');
  fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
  expect(onRetry).toHaveBeenCalled();
});

test('error without a retry has no button; an unknown status renders nothing', () => {
  render(<PanelState status="error" />);
  expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  const { container } = render(<PanelState status="ready" />);
  expect(container).toBeEmptyDOMElement();
});
