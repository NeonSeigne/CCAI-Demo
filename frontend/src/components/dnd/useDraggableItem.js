import { useCallback, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';

export const DRAG_TYPES = ['course', 'event', 'place'];

/** The dnd-kit id for an item: "course:ECON 3720". */
export const dragId = (item) => `${item.type}:${item.id}`;

/**
 * Makes a course, event or place draggable onto drop targets (D4).
 *
 *   const drag = useDraggableItem({ type: 'course', id: 'ECON 3720', title: 'Intermediate Macro' });
 *   <div ref={drag.ref} {...drag.handleProps} className={drag.className}>…</div>
 *
 * or, with a grip as the only handle:
 *
 *   <div ref={drag.ref} className={drag.className}>
 *     <button ref={drag.gripRef} {...drag.handleProps} aria-label="Drag ECON 3720">⋮⋮</button>
 *   </div>
 *
 * `handleProps` carry the pointer, touch and keyboard listeners and the
 * button role / description. Space or Enter lifts only when pressed on the
 * handle itself, so buttons inside a draggable card keep working. The source
 * stays in place while a chip follows the pointer.
 */
export default function useDraggableItem({
  type, id, title, extra, disabled = false,
}) {
  const item = { type, id, title, extra };
  const {
    setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging,
  } = useDraggable({ id: dragId(item), data: { item }, disabled });
  const hasGrip = useRef(false);

  // React attaches a child's ref before its parent's, so a grip inside the
  // card has claimed the handle by the time the card's ref runs.
  const gripRef = useCallback((node) => {
    hasGrip.current = Boolean(node);
    setActivatorNodeRef(node);
  }, [setActivatorNodeRef]);

  const ref = useCallback((node) => {
    setNodeRef(node);
    if (!hasGrip.current) setActivatorNodeRef(node);
  }, [setNodeRef, setActivatorNodeRef]);

  const onKeyDown = (event) => {
    if (event.target !== event.currentTarget) return; // a button inside the card
    listeners?.onKeyDown?.(event);
  };

  return {
    ref,
    gripRef,
    handleProps: { ...attributes, ...listeners, onKeyDown },
    isDragging,
    className: isDragging ? 'dnd-source is-dragging' : 'dnd-source',
  };
}
