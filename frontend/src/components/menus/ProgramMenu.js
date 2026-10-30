import React from 'react';
import { Icon } from '../icons';
import Menu, { MenuHeader, MenuItem, useMenu } from './Menu';

/** Group order and headers for `program.level`. */
const LEVELS = [
  ['undergraduate', 'Undergraduate'],
  ['graduate', 'Graduate'],
];

/** [[header | null, programs]]: by level when any program has one, else one plain list. */
export function groupPrograms(programs = []) {
  const known = new Set(LEVELS.map(([id]) => id));
  if (!programs.some((program) => known.has(program.level))) return [[null, programs]];
  const groups = LEVELS
    .map(([id, header]) => [header, programs.filter((program) => program.level === id)]);
  const other = programs.filter((program) => !known.has(program.level));
  if (other.length) groups.push([null, other]);
  return groups.filter(([, rows]) => rows.length);
}

/**
 * The program picker (menus.html "Program"): a round trigger with the
 * current program and a chevron, opening the programs grouped under
 * "Undergraduate" and "Graduate" with radio icons; the current one is the
 * tint row.
 *
 * Props: programs ([{id, name, level?: 'undergraduate' | 'graduate'}]),
 * value (the current id), onChange(id), label (the menu's name, default
 * "Program"), placeholder (trigger text with nothing chosen), className.
 */
export default function ProgramMenu({
  programs = [], value, onChange, label = 'Program', placeholder = 'Program', className = '',
}) {
  const menu = useMenu();
  const current = programs.find((program) => program.id === value);
  return (
    <>
      <button
        type="button"
        className={`cc-menu-trigger ${className}`.trim()}
        aria-label={current ? `${label}: ${current.name}` : label}
        {...menu.triggerProps}
      >
        <span>{current?.name || placeholder}</span>
        <Icon name={menu.open ? 'expand_less' : 'expand_more'} size={20} />
      </button>
      <Menu anchorEl={menu.anchorEl} onClose={menu.closeMenu} label={label} placement="bottom-start">
        {groupPrograms(programs).flatMap(([header, rows]) => [
          header ? <MenuHeader key={`h-${header}`}>{header}</MenuHeader> : null,
          ...rows.map((program) => {
            const on = program.id === value;
            return (
              <MenuItem
                key={program.id}
                role="menuitemradio"
                selected={on}
                icon={on ? 'radio_button_checked' : 'radio_button_unchecked'}
                onSelect={() => {
                  menu.closeMenu();
                  if (!on) onChange?.(program.id);
                }}
              >
                {program.name}
              </MenuItem>
            );
          }),
        ]).filter(Boolean)}
      </Menu>
    </>
  );
}
