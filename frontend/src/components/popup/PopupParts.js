import React from 'react';
import { DragIndicatorRounded } from '../icons';
import { useDraggableItem } from '../dnd';

/** D7: a failed request, in the tile or pop-up body. */
export function CouldntLoad({ onRetry, className = '' }) {
  return (
    <p className={`pop-error ${className}`.trim()} role="alert">
      Couldn&apos;t load · <button type="button" className="pop-link-btn" onClick={onRetry}>Retry</button>
    </p>
  );
}

/** A 404: the item is gone, so there is nothing to retry. */
export function NotFound({ children }) {
  return <p className="pop-error" role="status">{children}</p>;
}

/** 404 from an ApiError. */
export const isNotFound = (error) => error?.status === 404;

/**
 * A pop-up header as a drag source (D4): the header is the dragged node and
 * the grip is its only handle, so the header's buttons keep working.
 *
 *   const drag = usePopupDrag({ type: 'course', id, title });
 *   <header ref={drag.ref} className={drag.className}> … <DragGrip drag={drag} label="…" /> </header>
 */
export function usePopupDrag(item) {
  return useDraggableItem({ ...item, disabled: !item.id });
}

export function DragGrip({ drag, label, className = '' }) {
  return (
    <button
      type="button"
      ref={drag.gripRef}
      {...drag.handleProps}
      className={`pop-grip ${className}`.trim()}
      aria-label={label}
      title="Drag"
    >
      <DragIndicatorRounded fontSize="small" aria-hidden="true" />
    </button>
  );
}
