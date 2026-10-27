import React, { useState } from 'react';
import { Popover } from '@mui/material';
import { CircleHelp, FileText, MoreHorizontal, Search, Sparkles, Users } from 'lucide-react';
import AdvisorSidebarPicker from './AdvisorSidebarPicker';

/**
 * The chat header's ⋯ menu. Holds the advisor-panel features (answer style,
 * which advisors are on, Canvas) so the frame itself reads as Campus Companion.
 */
export default function ChatMoreMenu({
  responseMode,
  onResponseModeChange,
  thinkingAdvisors = [],
  dialogInset = 0,
  canvasLabel = 'Canvas',
  onOpenCanvas,
  onSearchChats,
  onOpenGuide,
}) {
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
        <div className="chat-more-menu">
          <div className="chat-more-section">
            <span className="chat-more-label">Advisor answers</span>
            <div className="chat-more-segment" role="group" aria-label="Advisor answer style">
              {[
                { mode: 'panel', icon: <Users size={14} />, label: 'Panel' },
                { mode: 'aggregated', icon: <Sparkles size={14} />, label: 'Combined' },
              ].map(({ mode, icon, label }) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={responseMode === mode}
                  className={responseMode === mode ? 'is-active' : ''}
                  onClick={() => onResponseModeChange?.(mode)}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>

          <div className="chat-more-section chat-more-advisors">
            <AdvisorSidebarPicker thinkingAdvisors={thinkingAdvisors} dialogInset={dialogInset} />
          </div>

          <div className="chat-more-section">
            <button type="button" className="chat-more-item" role="menuitem" onClick={run(onSearchChats)}>
              <Search size={15} /> Search chats
            </button>
            <button type="button" className="chat-more-item" role="menuitem" onClick={run(onOpenCanvas)}>
              <FileText size={15} /> {canvasLabel}
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
