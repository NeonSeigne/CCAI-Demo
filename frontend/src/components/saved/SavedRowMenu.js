import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

const focusItem = (container, step) => {
  if (!container) return;
  const items = Array.from(container.querySelectorAll('[role="menuitem"]'));
  if (items.length === 0) return;
  const index = items.indexOf(document.activeElement);
  const next = step === 'first' ? 0
    : step === 'last' ? items.length - 1
      : (index + step + items.length) % items.length;
  items[next].focus();
};

/**
 * A saved row's "More actions" menu (design 19A): "Move to…" opens the list of
 * other homes (Unsorted, collections) plus "New collection…", and "Remove"
 * unsaves the item. Arrow keys move between entries; Escape or a click outside
 * closes it and returns focus to the trigger (28A).
 *
 * destinations: [{id, name}] (the item's own home left out)
 */
export default function SavedRowMenu({ name, destinations, onMove, onCreateAndMove, onRemove }) {
  const [view, setView] = useState(null); // null (closed) | 'main' | 'move' | 'new'
  const [draft, setDraft] = useState('');
  const trigger = useRef(null);
  const panel = useRef(null);
  const input = useRef(null);
  const open = view !== null;

  const close = (refocus = true) => {
    setView(null);
    setDraft('');
    if (refocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    if (view === 'new') input.current?.focus();
    else focusItem(panel.current, 'first');
    const onPointer = (event) => {
      if (panel.current?.contains(event.target) || trigger.current?.contains(event.target)) return;
      setView(null);
      setDraft('');
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open, view]);

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (view === 'new') return;
    const steps = { ArrowDown: 1, ArrowUp: -1, Home: 'first', End: 'last' };
    if (event.key in steps) {
      event.preventDefault();
      focusItem(panel.current, steps[event.key]);
    } else if (event.key === 'Tab') {
      close(false);
    }
  };

  const act = (fn) => () => {
    close();
    fn();
  };

  const submitNew = (event) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    close();
    onCreateAndMove(value);
  };

  return (
    <div className="saved-menu">
      <button
        ref={trigger}
        type="button"
        className="saved-icon-btn"
        aria-label={`More actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setView('main'))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setView('main');
          }
        }}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>

      {open && (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div className="saved-menu-panel" ref={panel} onKeyDown={onKeyDown}>
          {view === 'main' && (
            <ul role="menu" aria-label={`Actions for ${name}`}>
              <li role="none">
                <button type="button" role="menuitem" aria-haspopup="menu" onClick={() => setView('move')}>
                  Move to…
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" onClick={act(onRemove)}>Remove</button>
              </li>
            </ul>
          )}

          {view === 'move' && (
            <ul role="menu" aria-label={`Move ${name} to`}>
              {destinations.map((destination) => (
                <li role="none" key={destination.id}>
                  <button type="button" role="menuitem" onClick={act(() => onMove(destination.id))}>
                    {destination.name}
                  </button>
                </li>
              ))}
              <li role="none">
                <button type="button" role="menuitem" onClick={() => setView('new')}>New collection…</button>
              </li>
            </ul>
          )}

          {view === 'new' && (
            <form className="saved-inline-form" onSubmit={submitNew}>
              <label htmlFor={`saved-menu-new-${name}`} className="sr-only">
                Name of the new collection for {name}
              </label>
              <input
                id={`saved-menu-new-${name}`}
                ref={input}
                value={draft}
                maxLength={60}
                placeholder="Collection name"
                onChange={(event) => setDraft(event.target.value)}
              />
              <button type="submit" className="saved-btn" disabled={!draft.trim()}>Create and move</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
