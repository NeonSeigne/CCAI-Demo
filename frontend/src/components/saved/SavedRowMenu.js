import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../icons';
import useViewport from '../../hooks/useViewport';
import {
  Menu, MenuItem, MenuSeparator, useMenu,
} from '../menus';

/**
 * A saved row's "More actions" menu (design 19A, phase9 saved.html): "Move
 * to…" opens the list of other homes (Unsorted, collections) plus "New
 * collection…", and "Remove" unsaves the item. Built on the shared Menu, so
 * arrow keys move between entries, Escape or a click outside closes it and
 * returns focus to the trigger, and on phones it rises as a sheet.
 *
 * destinations: [{id, name}] (the item's own home left out)
 * extra: {icon, text, to | onSelect}, the row's own action, listed first on
 *   phones, where the row shows only this menu's button
 */
export default function SavedRowMenu({
  name, destinations, onMove, onCreateAndMove, onRemove, extra = null,
}) {
  const menu = useMenu();
  const navigate = useNavigate();
  const phone = useViewport() === 'phone';
  const [view, setView] = useState('main'); // 'main' | 'move' | 'new'
  const [draft, setDraft] = useState('');
  const input = useRef(null);

  useEffect(() => {
    if (view === 'new') input.current?.focus();
  }, [view]);

  const close = () => {
    menu.closeMenu();
    setDraft('');
  };

  const open = (event) => {
    // The menu hands focus back to whatever had it when it opened; Safari
    // doesn't focus a clicked button, so make that the trigger.
    event.currentTarget.focus();
    setView('main');
    menu.openMenu(event);
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

  const labels = {
    main: `Actions for ${name}`,
    move: `Move ${name} to`,
    new: `New collection for ${name}`,
  };

  let items;
  if (view === 'main') {
    items = [
      ...(phone && extra ? [
        <MenuItem key="extra" icon={extra.icon} onSelect={act(() => (extra.to ? navigate(extra.to) : extra.onSelect?.()))}>
          {extra.text}
        </MenuItem>,
      ] : []),
      <MenuItem key="move" icon="drive_file_move" aria-haspopup="menu" onSelect={() => setView('move')}>
        Move to…
      </MenuItem>,
      <MenuItem key="remove" icon="delete" danger onSelect={act(onRemove)}>Remove</MenuItem>,
    ];
  } else if (view === 'move') {
    items = [
      ...destinations.map((destination) => (
        <MenuItem
          key={destination.id}
          icon={destination.id === 'unsorted' ? 'inbox' : 'folder'}
          onSelect={act(() => onMove(destination.id))}
        >
          {destination.name}
        </MenuItem>
      )),
      <MenuSeparator key="sep" />,
      <MenuItem key="new" icon="add" onSelect={() => setView('new')}>New collection…</MenuItem>,
    ];
  } else {
    items = [
      // The form keeps its own keys: typing, Tab and Enter stay in it (Escape still closes).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
      <li
        key="form"
        role="none"
        className="saved-menu-form"
        onKeyDown={(event) => { if (event.key !== 'Escape') event.stopPropagation(); }}
      >
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
          <button type="submit" className="cc-btn cc-btn-primary" disabled={!draft.trim()}>Create and move</button>
        </form>
      </li>,
    ];
  }

  return (
    <>
      <button
        type="button"
        className={`saved-icon-btn ${menu.open ? 'is-on' : ''}`.trim()}
        aria-label={`More actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        onClick={open}
      >
        <Icon name="more_horiz" size={22} />
      </button>
      <Menu
        anchorEl={menu.anchorEl}
        onClose={close}
        label={labels[view]}
        placement="bottom-end"
        className={`saved-row-menu ${view === 'new' ? 'is-form' : ''}`.trim()}
      >
        {items}
      </Menu>
    </>
  );
}
