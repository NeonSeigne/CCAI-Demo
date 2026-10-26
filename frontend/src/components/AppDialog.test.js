import React from 'react';
import { DialogTitle, ThemeProvider } from '@mui/material';
import { fireEvent, render, screen } from '@testing-library/react';
import muiTheme from '../theme/muiTheme';
import AppDialog from './AppDialog';
import ConfirmDialog from './ConfirmDialog';

const renderWithTheme = (ui) =>
  render(<ThemeProvider theme={muiTheme}>{ui}</ThemeProvider>);

describe('AppDialog', () => {
  test('constrains the dialog and backdrop to the supplied left inset', () => {
    const { rerender } = renderWithTheme(
      <AppDialog open leftInset={300} aria-labelledby="test-dialog-title">
        <DialogTitle id="test-dialog-title">Inset dialog</DialogTitle>
      </AppDialog>,
    );

    expect(screen.getByRole('dialog', { name: 'Inset dialog' })).toBeVisible();
    expect(document.querySelector('.MuiDialog-root')).toHaveStyle({ left: '300px' });
    expect(document.querySelector('.MuiBackdrop-root')).toHaveStyle({ left: '300px' });

    rerender(
      <ThemeProvider theme={muiTheme}>
        <AppDialog open leftInset={0} aria-labelledby="test-dialog-title">
          <DialogTitle id="test-dialog-title">Inset dialog</DialogTitle>
        </AppDialog>
      </ThemeProvider>,
    );

    expect(document.querySelector('.MuiDialog-root')).toHaveStyle({ left: '0px' });
    expect(document.querySelector('.MuiBackdrop-root')).toHaveStyle({ left: '0px' });
  });

  test('reports Escape and backdrop dismissal through onClose', () => {
    const onClose = jest.fn();
    renderWithTheme(
      <AppDialog open onClose={onClose} aria-label="Dismissible dialog">
        Dialog content
      </AppDialog>,
    );

    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'Escape',
    });
    expect(onClose).toHaveBeenCalledWith(expect.anything(), 'escapeKeyDown');

    fireEvent.click(document.querySelector('.MuiBackdrop-root'));
    expect(onClose).toHaveBeenCalledWith(expect.anything(), 'backdropClick');
  });
});

describe('ConfirmDialog', () => {
  test('exposes accessible actions and invokes the selected callback', () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    renderWithTheme(
      <ConfirmDialog
        isOpen
        title="Clear canvas?"
        message="This cannot be undone."
        confirmLabel="Clear"
        tone="danger"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Clear canvas?' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
