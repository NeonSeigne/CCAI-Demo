import React from 'react';
import { Icon } from '../../icons';
import { Menu, MenuHeader, MenuItem, useMenu } from '../../menus';
import '../../../styles/StartTermField.css';

/**
 * The setup dialog's Start term (setup-start-term.html): a round trigger
 * with the term and a chevron, opening a menu of terms, newest first, the
 * picked one ticked (a sheet on phones). Picking the ticked term again
 * clears it.
 */
export default function StartTermField({ value, terms, onChange }) {
  const menu = useMenu();
  const newestFirst = [...terms].reverse();
  const pick = (term) => {
    menu.closeMenu();
    onChange(term === value ? null : term);
  };
  return (
    <div className="su-field">
      <span className="dg-label" id="su-start-term-label">Start term</span>
      <button
        type="button"
        id="su-start-term"
        className={`stf-trigger cc-btn ${menu.open ? 'is-open' : ''}`.trim()}
        aria-labelledby="su-start-term-label su-start-term"
        {...menu.triggerProps}
      >
        <span className="stf-value">{value || ''}</span>
        <Icon name={menu.open ? 'expand_less' : 'expand_more'} size={20} />
      </button>
      <Menu
        anchorEl={menu.anchorEl}
        onClose={menu.closeMenu}
        label="Start term"
        placement="bottom-end"
        width={220}
        className="stf-menu"
      >
        <MenuHeader>Start term</MenuHeader>
        {newestFirst.map((term) => (
          <MenuItem
            key={term}
            role="menuitemradio"
            selected={term === value}
            icon={<Icon name="check" size={20} className={term === value ? '' : 'cc-menu-hidden-icon'} />}
            onSelect={() => pick(term)}
          >
            {term}
          </MenuItem>
        ))}
      </Menu>
    </div>
  );
}
