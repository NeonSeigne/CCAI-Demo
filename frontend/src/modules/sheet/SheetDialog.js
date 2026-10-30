/**
 * Where a band sheet is shown: over the page column, with the rail and the
 * Ask dock left live (eng R10, R15; plan R1: only the page column dims, the
 * dialog is aria-modal="false"), centred on desktop and a bottom sheet on
 * phones (≤700px). The shell's pop-up host shows ?course=, ?event= and
 * ?place= through it; a screen can show a sheet without a URL the same way.
 */
import React from 'react';
import AppDialog from '../../components/AppDialog';
import { usePopupContainer } from '../../components/shell/PageColumnContext';
import useMediaMatch from '../../hooks/useMediaMatch';
import './BandSheet.css';

/** Phone width (DESIGN.md): below it a sheet rises from the bottom edge. */
export const PHONE_SHEET = '(max-width: 700px)';

/**
 * Props: open (default true), onClose(event, reason), labelledBy (the
 * title's id), size ('wide' 1000px, 'medium' 760px, 'narrow' 400px), children.
 * Renders nothing until the page column exists, so the dialog never lands
 * on the body first (which would hide the rail and the dock).
 */
export default function SheetDialog({
  open = true, onClose, labelledBy, size = 'wide', children,
}) {
  const { container, ready } = usePopupContainer();
  if (!ready) return null;
  return (
    <AppDialog
      open={open}
      container={container}
      onClose={onClose}
      maxWidth={false}
      aria-labelledby={labelledBy}
      slotProps={{ paper: { className: `pop-dialog-paper pop-dialog-paper--${size}` } }}
    >
      {children}
    </AppDialog>
  );
}

/**
 * The phone presentation on its own (design Q7): on a phone, `children`
 * open as a bottom sheet while `open`; wider, they render in place and
 * `open` is ignored. For a card that sits in the page on desktop, such as
 * My degree's detail card.
 */
export function PhoneSheet({
  open, onClose, labelledBy, children,
}) {
  const phone = useMediaMatch(PHONE_SHEET);
  if (!phone) return children;
  return (
    <SheetDialog open={Boolean(open)} onClose={onClose} labelledBy={labelledBy} size="narrow">
      {children}
    </SheetDialog>
  );
}
