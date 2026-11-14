import React from 'react';
import { Popper } from '@mui/material';
import { Icon } from '../icons';
import Menu, { MenuItem, MenuSeparator, useMenu } from '../menus/Menu';
import { useAppConfig } from '../../contexts/AppConfigContext';
import { useChat } from '../../contexts/ChatContext';
import { AdvisorAvatar, advisorFor } from './PanelRow';
import '../../styles/Panel.css';

/**
 * Choosing the panel (panel-answers phase 4): the advisors a student can
 * ask, the menu that picks the next message's panel, the composer's panel
 * chip and the `@` suggestions.
 */

/** The advisors to choose from: /api/config's, minus the ones turned off. */
export function useAdvisorChoices() {
  const { config } = useAppConfig();
  const chat = useChat();
  const personas = config?.personas?.items || [];
  const available = chat?.availableAdvisors;
  return personas
    .filter((p) => p?.id && (!Array.isArray(available) || available.includes(p.id)))
    .map((p) => advisorFor(p.id, personas, p.name));
}

/** "@ca" at the end of the text before the caret: the query ("ca"), else null. */
export function mentionQuery(text = '', caret = text.length) {
  const match = /(^|\s)@([^\s@]*)$/.exec(text.slice(0, caret));
  return match ? match[2] : null;
}

/** The advisors whose name or id contains the query. */
export function filterAdvisors(advisors, query = '') {
  const q = query.trim().toLowerCase();
  if (!q) return advisors;
  return advisors.filter((a) => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q.replace(/\s+/g, '_')));
}

/**
 * The advisor menu (DESIGN.md Menus): Auto, then one checkable row per
 * advisor. Toggling advisors keeps it open; Auto clears the choice and closes it.
 */
export function AdvisorMenu({ anchorEl, onClose, placement = 'top-start' }) {
  const chat = useChat();
  const advisors = useAdvisorChoices();
  const selected = chat?.nextAdvisors || [];
  const toggle = (id) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    chat.chooseAdvisors(next);
  };
  return (
    <Menu anchorEl={anchorEl} onClose={onClose} label="Advisors" placement={placement}>
      <MenuItem
        role="menuitemradio"
        selected={!selected.length}
        icon="auto_mode"
        onSelect={() => { chat.chooseAdvisors([]); onClose?.(); }}
      >
        Auto
      </MenuItem>
      <MenuSeparator />
      {advisors.map((advisor) => (
        <MenuItem
          key={advisor.id}
          role="menuitemcheckbox"
          selected={selected.includes(advisor.id)}
          icon={<AdvisorAvatar advisor={advisor} size="sm" />}
          onSelect={() => toggle(advisor.id)}
        >
          {advisor.name}
        </MenuItem>
      ))}
    </Menu>
  );
}

/**
 * The composer's panel chip: the chosen advisors' stacked avatars and "Same
 * panel" (the last exchange's advisors) or "Auto". Tapping it opens the menu.
 */
export function PanelChip() {
  const chat = useChat();
  const advisors = useAdvisorChoices();
  const { config } = useAppConfig();
  const menu = useMenu();
  const personas = config?.personas?.items || [];
  const selected = (chat?.nextAdvisors || []).map((id) => (
    advisors.find((a) => a.id === id) || advisorFor(id, personas)
  ));
  let label = null;
  if (!selected.length) label = 'Auto';
  else if (chat.samePanel) label = 'Same panel';
  else if (selected.length === 1) label = selected[0].name;
  const names = selected.map((a) => a.name).join(', ');
  return (
    <>
      <button
        type="button"
        className="ap-chip"
        aria-label={`Panel: ${label || names}${label && names && label !== names ? ` (${names})` : ''}`}
        {...menu.triggerProps}
      >
        {selected.length ? (
          <span className="ap-stack" aria-hidden="true">
            {selected.slice(0, 3).map((advisor) => <AdvisorAvatar key={advisor.id} advisor={advisor} size="sm" />)}
          </span>
        ) : <Icon name="auto_mode" size={18} />}
        {label && <span className="ap-chip-label">{label}</span>}
      </button>
      <AdvisorMenu anchorEl={menu.anchorEl} onClose={menu.closeMenu} />
    </>
  );
}

/**
 * The `@` suggestions over the composer: the advisor rows, filtered by what
 * follows the @. Focus stays in the text box; `activeIndex` is the row
 * Enter picks.
 */
export function AdvisorSuggestions({
  anchorEl, advisors, activeIndex = 0, onPick, id,
}) {
  const open = Boolean(anchorEl) && advisors.length > 0;
  return (
    <Popper open={open} anchorEl={anchorEl} placement="top-start" className="ap-suggest-popper">
      <ul id={id} role="listbox" aria-label="Advisors" className="cc-menu ap-suggest">
        {advisors.map((advisor, index) => (
          <li
            key={advisor.id}
            id={`${id}-${advisor.id}`}
            role="option"
            aria-selected={index === activeIndex}
            className={`cc-menu-item ap-suggest-item${index === activeIndex ? ' is-active' : ''}`}
            // Keep focus in the text box.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(advisor)}
          >
            <AdvisorAvatar advisor={advisor} size="sm" />
            <span className="cc-menu-label">{advisor.name}</span>
          </li>
        ))}
      </ul>
    </Popper>
  );
}
