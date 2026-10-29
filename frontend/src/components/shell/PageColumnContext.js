import { createContext, useContext } from 'react';

/**
 * The app shell's slots (eng R15): `pageColumn` is the element between the
 * rail and the chat dock, where pop-ups render (AppDialog `container`), so
 * only page content is hidden from screen readers while one is open;
 * `railSlot` is where CampusRail portals its rail, outside the page column.
 * Both are null outside the shell.
 */
const OUTSIDE_SHELL = { pageColumn: null, railSlot: null };
export const PageColumnContext = createContext(OUTSIDE_SHELL);

/** The page-column element, or null outside the app shell. */
export function usePageColumn() {
  return useContext(PageColumnContext).pageColumn;
}

/** Where the rail renders, or null (the rail then renders in place). */
export function useRailSlot() {
  return useContext(PageColumnContext).railSlot;
}

/**
 * Where a pop-up renders: `{container, ready}`. Inside the shell, `ready`
 * waits for the page column, so a dialog never mounts on the body first
 * (which would aria-hide the rail and the dock). Outside the shell it renders
 * on the body at once.
 */
export function usePopupContainer() {
  const slots = useContext(PageColumnContext);
  const inShell = slots !== OUTSIDE_SHELL;
  return { container: slots.pageColumn || undefined, ready: !inShell || Boolean(slots.pageColumn) };
}
