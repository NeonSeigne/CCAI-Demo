/* eslint-disable testing-library/no-container, testing-library/no-node-access */
import React, { useState } from 'react';
import {
  fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import {
  BandSheet, SheetActions, SheetBand, SheetDialog, SheetTiles,
} from '.';
import { PageColumnContext } from '../../components/shell/PageColumnContext';

const tile = (key, value) => ({ key, label: key.toUpperCase(), value });

describe('tiles', () => {
  it.each([1, 2, 3])('draws %i tiles that share the width', (count) => {
    const tiles = ['gpa', 'rating', 'seats'].slice(0, count).map((key, i) => tile(key, `${i + 1}`));
    const { container } = render(<SheetTiles tiles={tiles} />);
    const row = container.querySelector('.pop-numbers');
    expect(row.style.getPropertyValue('--pop-tiles')).toBe(String(count));
    expect(container.querySelectorAll('.pop-number')).toHaveLength(count);
  });

  it('leaves out a missing tile instead of drawing an empty one', () => {
    const { container } = render(<SheetTiles tiles={[tile('gpa', '3.2'), null, tile('seats', '84')]} />);
    expect(container.querySelectorAll('.pop-number')).toHaveLength(2);
    expect(container.querySelector('.pop-numbers').style.getPropertyValue('--pop-tiles')).toBe('2');
  });

  it('draws no row without tiles', () => {
    const { container } = render(<SheetTiles tiles={[]} />);
    expect(container.querySelector('.pop-numbers')).toBeNull();
  });

  it('draws the value, its unit, a sub line and a tone', () => {
    render(<SheetTiles tiles={[{ key: 'walk', label: 'Walk', value: '9', unit: 'min', sub: '450 m', tone: 'easier' }]} />);
    expect(screen.getByText('Walk')).toBeInTheDocument();
    expect(screen.getByText('9').closest('.pop-number-value')).toHaveClass('is-easier');
    expect(screen.getByText('min')).toBeInTheDocument();
    expect(screen.getByText('450 m')).toHaveClass('pop-number-sub');
  });

  it('draws skeleton tiles, hidden from screen readers, while loading', () => {
    const { container } = render(<SheetTiles tiles={4} />);
    expect(container.querySelector('.pop-numbers')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('.pop-number')).toHaveLength(4);
  });
});

describe('band', () => {
  it('shows the eyebrow, the title and a close button', () => {
    const onClose = jest.fn();
    render(<SheetBand eyebrow="COMP SCI 400 · 3 credits" title="Programming III" titleId="t" onClose={onClose} />);
    expect(screen.getByText('COMP SCI 400 · 3 credits')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Programming III' })).toHaveAttribute('id', 't');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('names a loading title for screen readers', () => {
    render(<SheetBand titleId="t" titleLabel="Event" />);
    expect(screen.getByRole('heading', { name: 'Event' })).toBeInTheDocument();
  });

  it('has no close button without onClose', () => {
    render(<SheetBand title="Alderman Library" compact />);
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });
});

describe('sheet states', () => {
  const band = <SheetBand title="Jazz Night" titleId="t" />;
  const actions = <SheetActions><button type="button">Add to calendar</button></SheetActions>;

  it('ready: band, body and actions', () => {
    render(<BandSheet kind="event" titleId="t" band={band} actions={actions}><p>Body</p></BandSheet>);
    const sheet = screen.getByRole('article', { name: 'Jazz Night' });
    expect(sheet).toHaveClass('pop', 'ep');
    expect(sheet).not.toHaveAttribute('aria-busy');
    expect(within(sheet).getByText('Body')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Add to calendar' })).toBeInTheDocument();
  });

  it('loading: busy, announced, drawing the skeleton it is given', () => {
    const { container } = render(
      <BandSheet kind="course" titleId="t" status="loading" loadingLabel="Loading COMP SCI 400" band={band}>
        <span className="pop-skel" data-testid="skel" />
      </BandSheet>,
    );
    expect(container.querySelector('.pop')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Loading COMP SCI 400');
    expect(screen.getByTestId('skel')).toBeInTheDocument();
  });

  it('error: the message with Retry, and no actions', () => {
    const onRetry = jest.fn();
    render(<BandSheet titleId="t" status="error" error={{ onRetry }} band={band} actions={actions} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Couldn.t load/);
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Add to calendar' })).not.toBeInTheDocument();
  });

  it('error without Retry for something that is gone', () => {
    render(<BandSheet titleId="t" status="error" error={{ message: 'Event not found' }} band={band} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Event not found');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('card layout: the band and body scroll, the actions stay outside', () => {
    const { container } = render(
      <BandSheet kind="place" card titleId="t" band={band} actions={actions}><p>Hours</p></BandSheet>,
    );
    const scroll = container.querySelector('.pop-sheet > .pop-scroll');
    expect(scroll).toContainElement(screen.getByText('Hours'));
    expect(scroll).not.toContainElement(screen.getByRole('button', { name: 'Add to calendar' }));
  });
});

describe('dialog', () => {
  function Opener() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Open</button>
        {open && (
          <SheetDialog onClose={() => setOpen(false)} labelledBy="d-title">
            <BandSheet titleId="d-title" band={<SheetBand title="Jazz Night" titleId="d-title" onClose={() => setOpen(false)} />} />
          </SheetDialog>
        )}
      </>
    );
  }

  it('Escape closes it and focus returns to the trigger', async () => {
    render(<Opener />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Jazz Night' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('in the page column it is not modal: the rail stays live', async () => {
    const rail = document.createElement('nav');
    rail.textContent = 'Rail';
    const column = document.createElement('div');
    document.body.append(rail, column);
    try {
      render(
        <PageColumnContext.Provider value={{ pageColumn: column, railSlot: null }}>
          <SheetDialog onClose={jest.fn()} labelledBy="c-title">
            <BandSheet titleId="c-title" band={<SheetBand title="Alderman Library" titleId="c-title" />} />
          </SheetDialog>
        </PageColumnContext.Provider>,
      );
      const dialog = await screen.findByRole('dialog', { name: 'Alderman Library' });
      expect(dialog).toHaveAttribute('aria-modal', 'false');
      expect(column).toContainElement(dialog);
      expect(rail.closest('[aria-hidden="true"]')).toBeNull();
    } finally {
      rail.remove();
      column.remove();
    }
  });

  it('waits for the page column inside the shell', () => {
    render(
      <PageColumnContext.Provider value={{ pageColumn: null, railSlot: null }}>
        <SheetDialog onClose={jest.fn()} labelledBy="w-title"><p>Body</p></SheetDialog>
      </PageColumnContext.Provider>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
