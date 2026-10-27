import React, { useState } from 'react';
import { Popover } from '@mui/material';
import { CircleHelp, MoreHorizontal, Search } from 'lucide-react';

/** The chat header's ⋯ menu: chat search and the user guide. */
export default function ChatMoreMenu({ onSearchChats, onOpenGuide }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const close = () => setAnchorEl(null);
  const run = (action) => () => {
    close();
    action?.();
  };

  return (
    <>
      <button
        type="button"
        className="chat-head-btn"
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={Boolean(anchorEl)}
        onClick={(event) => setAnchorEl(event.currentTarget)}
      >
        <MoreHorizontal size={18} />
      </button>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { className: 'chat-more-popover' } }}
      >
        <div className="chat-more-menu" role="menu">
          <div className="chat-more-section">
            <button type="button" className="chat-more-item" role="menuitem" onClick={run(onSearchChats)}>
              <Search size={15} /> Search chats
            </button>
            <button type="button" className="chat-more-item" role="menuitem" onClick={run(onOpenGuide)}>
              <CircleHelp size={15} /> User guide
            </button>
          </div>
        </div>
      </Popover>
    </>
  );
}
