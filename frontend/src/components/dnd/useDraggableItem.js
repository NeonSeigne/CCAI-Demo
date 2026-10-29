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
 * `handleProps` carry the pointer, touch and keyboard listeners and the
 * button role / description; spread them on the whole card or on a grip.
 * The source stays in place while a chip follows the pointer.
 */
export default function useDraggableItem({ type, id, title, extra, disabled = false }) {
  const item = { type, id, title, extra };
  const {
    setNodeRef, attributes, listeners, isDragging,
  } = useDraggable({ id: dragId(item), data: { item }, disabled });

  return {
    ref: setNodeRef,
    handleProps: { ...attributes, ...listeners },
    isDragging,
    className: isDragging ? 'dnd-source is-dragging' : 'dnd-source',
  };
}
