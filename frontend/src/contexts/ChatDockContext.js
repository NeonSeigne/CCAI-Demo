import React, {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import useMediaMatch from '../hooks/useMediaMatch';

/**
 * Where the chat dock sits and whether it's open (design D17):
 * 'docked' (>= 1280px) a 360px column that collapses to a 48px strip, the
 * choice remembered; 'drawer' (701–1279px) collapsed by default, opening as
 * a 400px drawer; 'sheet' (<= 700px) a bottom sheet the phone Ask tab opens.
 *
 * `available` is false where the page itself is the ask (/home, /chat).
 * Map and My degree start with the dock closed (design D3) through
 * `useDockClosedByDefault`; opening it there is remembered per page.
 * `placeholder` is the dock composer's wording for the page ("Ask about
 * these events"); a page can set its own with `useDockPlaceholder`.
 */
export const ChatDockContext = createContext(null);

export const DOCK_COLLAPSED_KEY = 'cc.chatDock.collapsed';
/** {page: true | false}: the docked choice on pages where the dock starts closed. */
export const DOCK_OPEN_ON_KEY = 'cc.chatDock.openOn';
export const DOCK_WIDE = '(min-width: 1280px)';
export const DOCK_MEDIUM = '(min-width: 701px)';
export const SHEET_SNAPS = ['peek', 'half', 'full'];

const readCollapsed = () => {
  try {
    return window.localStorage.getItem(DOCK_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
};

const writeCollapsed = (value) => {
  try {
    window.localStorage.setItem(DOCK_COLLAPSED_KEY, value ? 'true' : 'false');
  } catch {
    // Private mode or blocked storage: the choice lasts for this visit only.
  }
};

const readOpenOn = () => {
  try {
    const value = JSON.parse(window.localStorage.getItem(DOCK_OPEN_ON_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};

const writeOpenOn = (value) => {
  try {
    window.localStorage.setItem(DOCK_OPEN_ON_KEY, JSON.stringify(value));
  } catch {
    // As above: kept for this visit only.
  }
};

/** 'docked' | 'drawer' | 'sheet' for the current width. */
export function useDockMode() {
  const wide = useMediaMatch(DOCK_WIDE, true);
  const medium = useMediaMatch(DOCK_MEDIUM, true);
  if (wide) return 'docked';
  return medium ? 'drawer' : 'sheet';
}

export function ChatDockProvider({ available = true, placeholder = null, children }) {
  const mode = useDockMode();
  const [pagePlaceholder, setPagePlaceholder] = useState(null);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  // The page on screen that starts with the dock closed ('map', 'degree'), and the choices made there.
  const [quietPage, setQuietPage] = useState(null);
  const [openOn, setOpenOn] = useState(readOpenOn);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [snap, setSnap] = useState('half');
  const [focusRequest, setFocusRequest] = useState(0);
  // The phone tab bar's Ask button, and whatever had focus when the dock
  // opened: where focus goes back when the drawer or sheet closes.
  const askTabRef = useRef(null);
  const openerRef = useRef(null);
  // The last focus request a composer has taken.
  const claimedFocusRef = useRef(0);
  // The dock composer's unsent text ({ text, epoch }), kept while the dock is closed.
  const draftRef = useRef(null);

  const dockedOpen = quietPage ? openOn[quietPage] === true : !collapsed;
  const open = available && (mode === 'docked' ? dockedOpen : overlayOpen);

  const setOpen = useCallback((next) => {
    if (mode !== 'docked') {
      setOverlayOpen(next);
    } else if (quietPage) {
      setOpenOn((current) => {
        const updated = { ...current, [quietPage]: Boolean(next) };
        writeOpenOn(updated);
        return updated;
      });
    } else {
      setCollapsed(!next);
      writeCollapsed(!next);
    }
  }, [mode, quietPage]);

  const openDock = useCallback(() => {
    if (typeof document !== 'undefined') openerRef.current = document.activeElement;
    setOpen(true);
    if (mode === 'sheet') setSnap((current) => (current === 'peek' ? 'half' : current));
  }, [mode, setOpen]);

  const closeDock = useCallback(() => setOpen(false), [setOpen]);

  /** Focus the dock's composer once it's on screen. */
  const requestComposerFocus = useCallback(() => setFocusRequest((count) => count + 1), []);

  /**
   * True once per focus request: the composer on screen (the dock's, or the
   * chat page's where there is no dock) calls it when it mounts or a request
   * arrives, and focuses itself when it gets true.
   */
  const claimComposerFocus = useCallback(() => {
    if (claimedFocusRef.current === focusRequest) return false;
    claimedFocusRef.current = focusRequest;
    return true;
  }, [focusRequest]);

  const value = useMemo(() => ({
    available,
    mode,
    open,
    setOpen,
    openDock,
    closeDock,
    snap,
    setSnap,
    focusRequest,
    requestComposerFocus,
    claimComposerFocus,
    askTabRef,
    openerRef,
    draftRef,
    placeholder: pagePlaceholder || placeholder || null,
    setPagePlaceholder,
    setQuietPage,
  }), [
    available, mode, open, setOpen, openDock, closeDock, snap, focusRequest, requestComposerFocus,
    claimComposerFocus, pagePlaceholder, placeholder,
  ]);

  return <ChatDockContext.Provider value={value}>{children}</ChatDockContext.Provider>;
}

/**
 * A page's wording for the dock's composer while it is on screen:
 * `useDockPlaceholder('Ask about this place')`. Cleared when the page leaves.
 */
export function useDockPlaceholder(text) {
  const set = useContext(ChatDockContext)?.setPagePlaceholder;
  useEffect(() => {
    if (!set) return undefined;
    set(text || null);
    return () => set(null);
  }, [set, text]);
}

/**
 * The docked dock starts closed while this page is on screen (design D3:
 * Map and My degree). `page` names the page ('map', 'degree'): a student who
 * opens the dock there keeps it open there, without changing other pages.
 */
export function useDockClosedByDefault(page) {
  const set = useContext(ChatDockContext)?.setQuietPage;
  useLayoutEffect(() => {
    if (!set || !page) return undefined;
    set(page);
    return () => set((current) => (current === page ? null : current));
  }, [set, page]);
}

/** The dock state, or null outside the app shell. */
export function useChatDock() {
  return useContext(ChatDockContext);
}

export default ChatDockContext;
