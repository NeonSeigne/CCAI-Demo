import React, { useEffect, useRef, useState } from 'react';

/**
 * Where the plan sits at each width (design 5A, 15A, 16A):
 * 'desktop' (>= 1200px) the right-panel slot, 'tablet' (768–1199px) a
 * 400px drawer over the chat, 'phone' (< 768px) a bottom sheet.
 */
export function placementFor(width) {
  if (width >= 1200) return 'desktop';
  if (width >= 768) return 'tablet';
  return 'phone';
}

export function usePlanPlacement() {
  const read = () => placementFor(typeof window === 'undefined' ? 1440 : window.innerWidth);
  const [placement, setPlacement] = useState(read);
  useEffect(() => {
    const onResize = () => setPlacement(read());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return placement;
}

const DRAG_THRESHOLD = 60;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Phone bottom sheet with snaps at 45% and 92% of 100dvh (15A). Drag the
 * handle up for 92%, down for 45% or closed; Esc closes. Focus is held
 * inside only at 92%; the caller returns focus to the Plan toggle on close.
 */
export default function PlanSheet({ snap = 'half', onSnap, onClose, children }) {
  const sheetRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    sheetRef.current?.focus();
  }, []);

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || snap !== 'full') return;
    const nodes = [...(sheetRef.current?.querySelectorAll(FOCUSABLE) || [])];
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const onPointerDown = (event) => {
    dragRef.current = { y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerUp = (event) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const delta = event.clientY - drag.y;
    if (Math.abs(delta) <= DRAG_THRESHOLD) return; // a tap: the click toggles
    suppressClick.current = true;
    if (delta > 0) {
      if (snap === 'full') onSnap('half'); else onClose();
    } else {
      onSnap('full');
    }
  };

  const onHandleClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onSnap(snap === 'full' ? 'half' : 'full');
  };

  return (
    <div
      ref={sheetRef}
      className={`plan-sheet ${snap === 'full' ? 'is-full' : ''}`.trim()}
      role="dialog"
      aria-modal={snap === 'full' ? 'true' : undefined}
      aria-label="Your plan"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        className="plan-sheet-handle"
        aria-label={snap === 'full' ? 'Shrink plan' : 'Expand plan'}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onClick={onHandleClick}
      >
        <span aria-hidden="true" />
      </button>
      <div className="plan-sheet-body">{children}</div>
    </div>
  );
}
