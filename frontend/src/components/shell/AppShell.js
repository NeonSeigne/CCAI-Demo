import React, { useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import ChatDock from '../ChatDock';
import { DndProvider } from '../dnd';
import { ChatDockProvider } from '../../contexts/ChatDockContext';
import { PageColumnContext } from './PageColumnContext';
import '../../styles/AppShell.css';

/** Pages that are the ask themselves, so they show no dock (D17). */
const NO_DOCK = ['/home', '/chat'];
/** The chat page keeps its rail in place; it slides in as a drawer there. */
const RAIL_IN_PAGE = ['/chat'];

const onPath = (paths, pathname) => paths.some(
  (path) => pathname === path || pathname.startsWith(`${path}/`),
);

/**
 * The signed-in layout (eng R15): rail | page column | chat dock, inside one
 * drag-and-drop context. Pages keep rendering their own CampusRail; it
 * portals into the rail slot here. Pop-ups render into the page column
 * (usePageColumn), so the rail and dock stay usable and readable.
 */
export default function AppShell({ children }) {
  const { pathname } = useLocation();
  const [railSlot, setRailSlot] = useState(null);
  const [pageColumn, setPageColumn] = useState(null);
  const dockAvailable = !onPath(NO_DOCK, pathname);
  const portalRail = !onPath(RAIL_IN_PAGE, pathname);

  const slots = useMemo(
    () => ({ pageColumn, railSlot: portalRail ? railSlot : null }),
    [pageColumn, railSlot, portalRail],
  );

  return (
    <PageColumnContext.Provider value={slots}>
      <ChatDockProvider available={dockAvailable}>
        <DndProvider>
          <div className="cc-shell">
            <div className="cc-shell-rail" ref={setRailSlot} />
            <div className="cc-shell-page" ref={setPageColumn}>
              {children || <Outlet />}
            </div>
            <ChatDock />
          </div>
        </DndProvider>
      </ChatDockProvider>
    </PageColumnContext.Provider>
  );
}
