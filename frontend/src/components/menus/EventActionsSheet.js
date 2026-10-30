import React from 'react';
import Menu, { MenuItem } from './Menu';

/**
 * An event's actions on a phone (menus.html "Event actions on phone"): a
 * bottom sheet with a grab handle and 52px rows: Directions (walk minutes at
 * the right), Add to calendar, Save / Saved (tint when saved), Ask about
 * this, Share. A handler left out hides its row.
 *
 * Props: open, onClose, label (the event's title, the sheet's name),
 * walkText ("7 min"), saved, onDirections, onAddToCalendar,
 * onToggleSave(nextSaved), onAsk, onShare.
 */
export default function EventActionsSheet({
  open, onClose, label = 'Event actions', walkText, saved = false,
  onDirections, onAddToCalendar, onToggleSave, onAsk, onShare,
}) {
  const run = (action, ...args) => () => {
    onClose?.();
    action?.(...args);
  };
  return (
    <Menu open={Boolean(open)} onClose={onClose} label={label} sheet>
      {onDirections && (
        <MenuItem icon="directions_walk" value={walkText} onSelect={run(onDirections)}>Directions</MenuItem>
      )}
      {onAddToCalendar && (
        <MenuItem icon="calendar_add_on" onSelect={run(onAddToCalendar)}>Add to calendar</MenuItem>
      )}
      {onToggleSave && (
        <MenuItem
          icon="bookmark"
          role="menuitemcheckbox"
          selected={saved}
          onSelect={run(onToggleSave, !saved)}
        >
          {saved ? 'Saved' : 'Save'}
        </MenuItem>
      )}
      {onAsk && <MenuItem icon="forum" onSelect={run(onAsk)}>Ask about this</MenuItem>}
      {onShare && <MenuItem icon="ios_share" onSelect={run(onShare)}>Share</MenuItem>}
    </Menu>
  );
}
