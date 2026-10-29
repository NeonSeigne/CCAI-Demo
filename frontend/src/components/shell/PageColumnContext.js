import { createContext, useContext } from 'react';

/**
 * The app shell's slots (eng R15): `pageColumn` is the element between the
 * rail and the chat dock, where pop-ups render (AppDialog `container`), so
 * only page content is hidden from screen readers while one is open;
 * `railSlot` is where CampusRail portals its rail, outside the page column.
 * Both are null outside the shell.
 */
export const PageColumnContext = createContext({ pageColumn: null, railSlot: null });

/** The page-column element, or null outside the app shell. */
export function usePageColumn() {
  return useContext(PageColumnContext).pageColumn;
}

/** Where the rail renders, or null (the rail then renders in place). */
export function useRailSlot() {
  return useContext(PageColumnContext).railSlot;
}
