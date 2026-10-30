import React, { useCallback, useState } from 'react';
import MuiMenu from '@mui/material/Menu';
import MuiMenuItem from '@mui/material/MenuItem';
import { Icon } from '../icons';

/**
 * The menu frame (menus.html): 260px, 24px radius, line border, float
 * shadow, 44px rows with 21px muted icons. On phones (≤700px) every menu
 * rises from the bottom edge as a sheet with a grab handle and 52px rows
 * (components.css); `sheet` keeps it a sheet at every width.
 *
 * Props: anchorEl, open (default: Boolean(anchorEl)), onClose, label (the
 * menu's accessible name), placement ('bottom-end' | 'bottom-start' |
 * 'top-start' | 'top-end'), sheet, width, className, children.
 */
const ORIGINS = {
  'bottom-end': [{ vertical: 'bottom', horizontal: 'right' }, { vertical: 'top', horizontal: 'right' }],
  'bottom-start': [{ vertical: 'bottom', horizontal: 'left' }, { vertical: 'top', horizontal: 'left' }],
  'top-start': [{ vertical: 'top', horizontal: 'left' }, { vertical: 'bottom', horizontal: 'left' }],
  'top-end': [{ vertical: 'top', horizontal: 'right' }, { vertical: 'bottom', horizontal: 'right' }],
};

export default function Menu({
  anchorEl = null,
  open,
  onClose,
  label,
  placement = 'bottom-end',
  sheet = false,
  width,
  className = '',
  children,
}) {
  const [anchorOrigin, transformOrigin] = ORIGINS[placement] || ORIGINS['bottom-end'];
  const isOpen = open ?? Boolean(anchorEl);
  return (
    <MuiMenu
      anchorEl={anchorEl}
      anchorReference={anchorEl ? 'anchorEl' : 'none'}
      open={isOpen}
      onClose={onClose}
      anchorOrigin={anchorOrigin}
      transformOrigin={transformOrigin}
      slotProps={{
        paper: {
          className: `cc-menu ${sheet ? 'cc-menu--sheet' : ''} ${className}`.trim(),
          style: width ? { width } : undefined,
        },
        list: { 'aria-label': label },
      }}
    >
      {children}
    </MuiMenu>
  );
}

/**
 * One row: an icon (Material Symbols name, or a node such as a domain dot),
 * the label and an optional right-hand value ("PDF, DOCX", "Gemini", "14").
 *
 * `selected` draws the tint row; `role` 'menuitemradio' / 'menuitemcheckbox'
 * carry it as aria-checked. `danger` is the harder colour (Delete).
 */
export function MenuItem({
  icon, value, selected = false, danger = false, role = 'menuitem', onSelect, disabled, children, ...rest
}) {
  const checkable = role === 'menuitemradio' || role === 'menuitemcheckbox';
  return (
    <MuiMenuItem
      role={role}
      aria-checked={checkable ? selected : undefined}
      selected={selected}
      disabled={disabled}
      className={`cc-menu-item ${selected ? 'is-on' : ''} ${danger ? 'is-danger' : ''}`.trim()}
      onClick={onSelect}
      {...rest}
    >
      {typeof icon === 'string' ? <Icon name={icon} size={21} filled={selected} /> : icon}
      <span className="cc-menu-label">{children}</span>
      {value != null && value !== '' && <span className="cc-menu-value">{value}</span>}
    </MuiMenuItem>
  );
}

/** A hairline between groups. */
export function MenuSeparator() {
  return <li role="separator" className="cc-menu-sep" />;
}

/** A group's plain label ("Undergraduate", "When"): sentence case, no caps. */
export function MenuHeader({ children }) {
  return <li role="presentation" className="cc-menu-header">{children}</li>;
}

/**
 * {anchorEl, open, openMenu(event), closeMenu, triggerProps}: one menu's
 * state. `triggerProps` go on the button that opens it.
 */
export function useMenu() {
  const [anchorEl, setAnchorEl] = useState(null);
  const openMenu = useCallback((event) => setAnchorEl(event.currentTarget), []);
  const closeMenu = useCallback(() => setAnchorEl(null), []);
  const open = Boolean(anchorEl);
  return {
    anchorEl,
    open,
    openMenu,
    closeMenu,
    triggerProps: { 'aria-haspopup': 'menu', 'aria-expanded': open, onClick: openMenu },
  };
}
