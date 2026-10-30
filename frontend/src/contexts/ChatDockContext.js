import React, {
  createContext, useCallback, useContext, useMemo, useRef, useState,
} from 'react';
import useMediaMatch from '../hooks/useMediaMatch';

/**
 * Where the chat dock sits and whether it's open (design D17):
 * 'docked' (>= 1280px) a 360px column that collapses to a 48px strip, the
 * choice remembered; 'drawer' (701–1279px) collapsed by default, opening as
 * a 400px drawer; 'sheet' (<= 700px) a bottom sheet the phone Ask tab opens.
 *
 * `available` is false where the page itself is the ask (/home, /chat).
 */
export const ChatDockContext = createContext(null);

export const DOCK_COLLAPSED_KEY = 'cc.chatDock.collapsed';
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

/** 'docked' | 'drawer' | 'sheet' for the current width. */
export function useDockMode() {
  const wide = useMediaMatch(DOCK_WIDE, true);
  const medium = useMediaMatch(DOCK_MEDIUM, true);
  if (wide) return 'docked';
  return medium ? 'drawer' : 'sheet';
}

export function ChatDockProvider({ available = true, children }) {
  const mode = useDockMode();
  const [collapsed, setCollapsed] = useState(readCollapsed);
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

  const open = available && (mode === 'docked' ? !collapsed : overlayOpen);

  const setOpen = useCallback((next) => {
    if (mode === 'docked') {
      setCollapsed(!next);
      writeCollapsed(!next);
    } else {
      setOverlayOpen(next);
    }
  }, [mode]);

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
  }), [available, mode, open, setOpen, openDock, closeDock, snap, focusRequest, requestComposerFocus, claimComposerFocus]);

  return <ChatDockContext.Provider value={value}>{children}</ChatDockContext.Provider>;
}

/** The dock state, or null outside the app shell. */
export function useChatDock() {
  return useContext(ChatDockContext);
}

export default ChatDockContext;
