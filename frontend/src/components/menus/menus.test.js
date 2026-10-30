import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  AccountMenu, ChatMenu, EventActionsSheet, FilterMenu, ProgramMenu, groupPrograms, useMenu,
} from '.';

const itemNames = (menu) => [...menu.querySelectorAll('[role^="menuitem"]')].map((item) => [...item.querySelectorAll('.cc-menu-label, .cc-menu-value')].map((part) => part.textContent).join(''));

function WithTrigger({ render: renderMenu }) {
  const menu = useMenu();
  return (
    <>
      <button type="button" {...menu.triggerProps}>Open</button>
      {renderMenu(menu)}
    </>
  );
}

describe('ChatMenu', () => {
  const handlers = () => ({
    onRename: jest.fn(),
    onPin: jest.fn(),
    onShare: jest.fn(),
    onExport: jest.fn(),
    onSearchChats: jest.fn(),
    onDelete: jest.fn(),
  });

  const open = (props) => {
    render(<WithTrigger render={(menu) => <ChatMenu anchorEl={menu.anchorEl} onClose={menu.closeMenu} {...props} />} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    return screen.getByRole('menu', { name: 'Chat' });
  };

  test('Rename, Pin, Share, Export, Search chats and Delete, labels only', () => {
    const menu = open(handlers());
    expect(itemNames(menu)).toEqual(['Rename', 'Pin', 'Share', 'ExportPDF, DOCX', 'Search chats', 'Delete']);
    expect(within(menu).getByRole('separator')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Delete' })).toHaveClass('is-danger');
  });

  test('a pinned chat offers Unpin and passes the new state', () => {
    const props = handlers();
    const menu = open({ ...props, pinned: true });
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Unpin' }));
    expect(props.onPin).toHaveBeenCalledWith(false);
  });

  test('Export opens PDF and DOCX; choosing one exports it', () => {
    const props = handlers();
    const menu = open(props);
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Export/ }));
    const formats = screen.getByRole('menu', { name: 'Export' });
    expect(itemNames(formats)).toEqual(['PDF', 'DOCX']);
    fireEvent.click(within(formats).getByRole('menuitem', { name: 'DOCX' }));
    expect(props.onExport).toHaveBeenCalledWith('docx');
  });

  test('rows without a handler are left out', () => {
    const menu = open({ onSearchChats: jest.fn() });
    expect(itemNames(menu)).toEqual(['Search chats']);
    expect(within(menu).queryByRole('separator')).not.toBeInTheDocument();
  });
});

test('AccountMenu: Profile, Settings, Model with its name, Help, Sign out', () => {
  const onSignOut = jest.fn();
  render(<WithTrigger render={(menu) => (
    <AccountMenu anchorEl={menu.anchorEl} onClose={menu.closeMenu} modelName="Gemini" onSignOut={onSignOut} />
  )} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  const menu = screen.getByRole('menu', { name: 'Account' });
  expect(itemNames(menu)).toEqual(['Profile', 'Settings', 'ModelGemini', 'Help', 'Sign out']);
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Sign out' }));
  expect(onSignOut).toHaveBeenCalled();
});

describe('ProgramMenu', () => {
  const PROGRAMS = [
    { id: 'bio', name: 'Biology B.A.', level: 'undergraduate' },
    { id: 'econ', name: 'Economics B.A.', level: 'undergraduate' },
    { id: 'mpp', name: 'Master of Public Policy', level: 'graduate' },
  ];

  function Harness() {
    const [value, setValue] = useState('econ');
    return <ProgramMenu programs={PROGRAMS} value={value} onChange={setValue} />;
  }

  test('groups by level with radio rows; the current one is checked', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Program: Economics B.A.' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: 'Program' });
    expect(within(menu).getByText('Undergraduate')).toBeInTheDocument();
    expect(within(menu).getByText('Graduate')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitemradio', { name: 'Economics B.A.' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Master of Public Policy' }));
    expect(screen.getByRole('button', { name: 'Program: Master of Public Policy' })).toBeInTheDocument();
  });

  test('programs without a level are one plain list', () => {
    expect(groupPrograms([{ id: 'a', name: 'A' }])).toEqual([[null, [{ id: 'a', name: 'A' }]]]);
  });
});

test('EventActionsSheet: a sheet with walk minutes, Saved in tint, and actions that close it', () => {
  const onClose = jest.fn();
  const onToggleSave = jest.fn();
  const onAsk = jest.fn();
  render(
    <EventActionsSheet
      open
      onClose={onClose}
      label="Jazz night"
      walkText="7 min"
      saved
      onDirections={jest.fn()}
      onAddToCalendar={jest.fn()}
      onToggleSave={onToggleSave}
      onAsk={onAsk}
      onShare={jest.fn()}
    />,
  );
  const menu = screen.getByRole('menu', { name: 'Jazz night' });
  expect(itemNames(menu)).toEqual(['Directions7 min', 'Add to calendar', 'Saved', 'Ask about this', 'Share']);
  expect(menu.closest('.cc-menu')).toHaveClass('cc-menu--sheet');
  expect(within(menu).getByRole('menuitemcheckbox', { name: 'Saved' })).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'Saved' }));
  expect(onToggleSave).toHaveBeenCalledWith(false);
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Ask about this' }));
  expect(onAsk).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(2);
});

test('FilterMenu: When with a check, Kind with dots and counts', () => {
  const onChange = jest.fn();
  const onToggle = jest.fn();
  render(<WithTrigger render={(menu) => (
    <FilterMenu
      anchorEl={menu.anchorEl}
      onClose={menu.closeMenu}
      when={{ options: [{ id: 'today', label: 'Today' }, { id: 'tonight', label: 'Tonight' }], value: 'today', onChange }}
      kinds={{
        options: [{ id: 'academic', label: 'Academics', domain: 'academics', count: 14 }],
        selected: [],
        onToggle,
      }}
    />
  )} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  const menu = screen.getByRole('menu', { name: 'Filter' });
  expect(within(menu).getByRole('menuitemradio', { name: 'Today' })).toHaveAttribute('aria-checked', 'true');
  expect(within(menu).getByRole('menuitemcheckbox', { name: /Academics/ })).toHaveTextContent('14');
  fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: /Academics/ }));
  expect(onToggle).toHaveBeenCalledWith('academic');
  fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Tonight' }));
  expect(onChange).toHaveBeenCalledWith('tonight');
});
