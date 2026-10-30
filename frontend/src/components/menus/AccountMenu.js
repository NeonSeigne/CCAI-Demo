import React from 'react';
import Menu, { MenuItem, MenuSeparator } from './Menu';

/**
 * The account menu (menus.html "Account"): Profile, Settings, Model (with
 * the model's name at the right), Help, then Sign out. A bottom sheet on
 * phones (design Q1).
 *
 * Props: anchorEl, onClose, placement, modelName, onProfile, onSettings,
 * onModel, onHelp, onSignOut.
 */
export default function AccountMenu({
  anchorEl, onClose, placement = 'top-start', modelName, onProfile, onSettings, onModel, onHelp, onSignOut,
}) {
  const run = (action) => () => {
    onClose?.();
    action?.();
  };
  return (
    <Menu anchorEl={anchorEl} onClose={onClose} label="Account" placement={placement}>
      <MenuItem icon="person" onSelect={run(onProfile)}>Profile</MenuItem>
      <MenuItem icon="tune" onSelect={run(onSettings)}>Settings</MenuItem>
      <MenuItem icon="smart_toy" value={modelName} onSelect={run(onModel)}>Model</MenuItem>
      <MenuItem icon="help" onSelect={run(onHelp)}>Help</MenuItem>
      <MenuSeparator />
      <MenuItem icon="logout" onSelect={run(onSignOut)}>Sign out</MenuItem>
    </Menu>
  );
}
