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

  test('stops the dialog and backdrop at the supplied right inset', () => {
    renderWithTheme(
      <AppDialog open rightInset={360} aria-labelledby="right-title">
        <DialogTitle id="right-title">Docked dialog</DialogTitle>
      </AppDialog>,
    );
    expect(document.querySelector('.MuiDialog-root')).toHaveStyle({ right: '360px', left: '0px' });
    expect(document.querySelector('.MuiBackdrop-root')).toHaveStyle({ right: '360px' });
  });

  describe('in a container', () => {
    let column;
    beforeEach(() => {
      column = document.createElement('div');
      document.body.appendChild(column);
      column.getBoundingClientRect = () => ({
        left: 260, right: 1080, width: 820, top: 0, bottom: 900, height: 900,
      });
      Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1425 });
    });
    afterEach(() => {
      column.remove();
      delete document.documentElement.clientWidth;
      document.documentElement.style.overflow = '';
    });

    test('stops at the container edges, measured without the scrollbar', () => {
      renderWithTheme(
        <AppDialog open container={column} aria-labelledby="col-title">
          <DialogTitle id="col-title">Column dialog</DialogTitle>
        </AppDialog>,
      );
      expect(column).toContainElement(screen.getByRole('dialog'));
      expect(document.querySelector('.MuiDialog-root')).toHaveStyle({ left: '260px', right: '345px' });
    });

    test('locks the document scroll, not the column, and restores it on close and unmount', () => {
      document.documentElement.style.overflow = 'scroll';
      const ui = (open) => (
        <ThemeProvider theme={muiTheme}>
          <AppDialog open={open} container={column} aria-label="Column dialog">Body</AppDialog>
        </ThemeProvider>
      );
      const { rerender, unmount } = render(ui(true));
      expect(document.documentElement.style.overflow).toBe('hidden');
      expect(column.style.overflow).toBe('');

      rerender(ui(false));
      expect(document.documentElement.style.overflow).toBe('scroll');

      rerender(ui(true));
      expect(document.documentElement.style.overflow).toBe('hidden');
      unmount();
      expect(document.documentElement.style.overflow).toBe('scroll');
    });
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
