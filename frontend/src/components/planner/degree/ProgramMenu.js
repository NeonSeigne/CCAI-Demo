import React, { useRef, useState } from 'react';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListSubheader from '@mui/material/ListSubheader';
import { Icon } from '../../icons';
import { programGroups } from './SetupDialog';

/**
 * The program as a chevron button that opens the program menu (transit-a
 * title row; menus.html "Program"): programs in Undergraduate and Graduate
 * groups, the plan's one marked. Built here until the shared menu
 * component lands; it uses menus.html's sizes (260px, 44px rows).
 */
export default function ProgramMenu({ program, programs, onChoose }) {
  const button = useRef(null);
  const [open, setOpen] = useState(false);
  const groups = programGroups(programs);
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        ref={button}
        className="dg-btn dg-program-btn"
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : undefined}
        onClick={() => setOpen(true)}
      >
        {program.name}
        <Icon name={open ? 'expand_less' : 'expand_more'} size={20} />
      </button>
      <Menu
        anchorEl={button.current}
        open={open}
        onClose={close}
        slotProps={{
          paper: { className: 'dg-menu' },
          list: { 'aria-label': 'Programs' },
        }}
      >
        {groups.flatMap((group) => [
          <ListSubheader key={`h-${group.label}`} className="dg-menu-head" disableSticky>{group.label}</ListSubheader>,
          ...group.programs.map((p) => {
            const on = p.id === program.id;
            return (
              <MenuItem
                key={p.id}
                role="menuitemradio"
                aria-checked={on}
                className={`dg-menu-item ${on ? 'is-on' : ''}`.trim()}
                selected={false}
                onClick={() => {
                  close();
                  if (!on) onChoose(p);
                }}
              >
                <Icon name={on ? 'radio_button_checked' : 'radio_button_unchecked'} size={21} filled={on} />
                {p.name}
              </MenuItem>
            );
          }),
        ])}
      </Menu>
    </>
  );
}
