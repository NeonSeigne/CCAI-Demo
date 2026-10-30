import React from 'react';
import { Icon } from '../icons';
import Menu, { MenuHeader, MenuItem, MenuSeparator } from './Menu';

/**
 * The filter menu (menus.html "Filter"): one choice under "When" (a check on
 * the current one) and any number of kinds under "Kind", each with its
 * domain dot and count at the right.
 *
 * Props: anchorEl, onClose, label (default "Filter"),
 *   when:  {options: [{id, label}], value, onChange(id)}  (left out: no When group)
 *   kinds: {options: [{id, label, domain?: 'academics' | 'life' | 'campus', count?}],
 *           selected: [ids], onToggle(id)}                 (left out: no Kind group)
 * The menu stays open while kinds are toggled; choosing a When closes it.
 */
export default function FilterMenu({
  anchorEl, onClose, label = 'Filter', when, kinds,
}) {
  const whenRows = when?.options || [];
  const kindRows = kinds?.options || [];
  const selectedKinds = new Set(kinds?.selected || []);
  return (
    <Menu anchorEl={anchorEl} onClose={onClose} label={label} placement="bottom-start">
      {whenRows.length > 0 && <MenuHeader>When</MenuHeader>}
      {whenRows.map((option) => {
        const on = option.id === when.value;
        return (
          <MenuItem
            key={`when-${option.id}`}
            role="menuitemradio"
            selected={on}
            icon={<Icon name="check" size={21} className={on ? '' : 'cc-menu-hidden-icon'} />}
            onSelect={() => {
              onClose?.();
              if (!on) when.onChange?.(option.id);
            }}
          >
            {option.label}
          </MenuItem>
        );
      })}
      {whenRows.length > 0 && kindRows.length > 0 && <MenuSeparator />}
      {kindRows.length > 0 && <MenuHeader>Kind</MenuHeader>}
      {kindRows.map((option) => (
        <MenuItem
          key={`kind-${option.id}`}
          role="menuitemcheckbox"
          selected={selectedKinds.has(option.id)}
          value={option.count}
          icon={<span className={`cc-menu-dot is-${option.domain || 'campus'}`} aria-hidden="true" />}
          onSelect={() => kinds.onToggle?.(option.id)}
        >
          {option.label}
        </MenuItem>
      ))}
    </Menu>
  );
}
