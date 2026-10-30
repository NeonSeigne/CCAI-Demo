import React, { useState } from 'react';
import Menu, { MenuItem, MenuSeparator } from './Menu';

export const EXPORT_FORMATS = [
  { id: 'pdf', label: 'PDF', icon: 'picture_as_pdf' },
  { id: 'docx', label: 'DOCX', icon: 'description' },
];

/**
 * The chat's ⋯ menu (menus.html "Chat"): Rename, Pin (Unpin when pinned),
 * Share, Export (PDF, DOCX), Search chats, then Delete in the harder colour.
 * Export opens the two formats in their own menu at the same anchor.
 *
 * Props: anchorEl, onClose, pinned, onRename, onPin, onShare,
 * onExport(format: 'pdf' | 'docx'), onSearchChats, onDelete. A handler left
 * out hides its row.
 */
export default function ChatMenu({
  anchorEl, onClose, pinned = false, onRename, onPin, onShare, onExport, onSearchChats, onDelete,
}) {
  const [exportAnchor, setExportAnchor] = useState(null);
  const run = (action, ...args) => () => {
    onClose?.();
    action?.(...args);
  };
  return (
    <>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl) && !exportAnchor} onClose={onClose} label="Chat">
        {onRename && <MenuItem icon="edit" onSelect={run(onRename)}>Rename</MenuItem>}
        {onPin && (
          <MenuItem icon="push_pin" onSelect={run(onPin, !pinned)}>{pinned ? 'Unpin' : 'Pin'}</MenuItem>
        )}
        {onShare && <MenuItem icon="ios_share" onSelect={run(onShare)}>Share</MenuItem>}
        {onExport && (
          <MenuItem
            icon="download"
            value="PDF, DOCX"
            aria-haspopup="menu"
            onSelect={() => setExportAnchor(anchorEl)}
          >
            Export
          </MenuItem>
        )}
        {onSearchChats && <MenuItem icon="search" onSelect={run(onSearchChats)}>Search chats</MenuItem>}
        {onDelete && <MenuSeparator />}
        {onDelete && <MenuItem icon="delete" danger onSelect={run(onDelete)}>Delete</MenuItem>}
      </Menu>
      <Menu
        anchorEl={exportAnchor}
        onClose={() => { setExportAnchor(null); onClose?.(); }}
        label="Export"
      >
        {EXPORT_FORMATS.map((format) => (
          <MenuItem
            key={format.id}
            icon={format.icon}
            onSelect={() => {
              setExportAnchor(null);
              onClose?.();
              onExport?.(format.id);
            }}
          >
            {format.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
