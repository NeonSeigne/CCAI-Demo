import { useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { DRAG_TYPES } from './useDraggableItem';
import '../../styles/dnd.css';

/** The class a drop target wears: dashed while a valid drag runs, solid + tint on hover (D8). */
export function dropTargetClass({ ready, over }) {
  if (over) return 'dnd-target is-drop-ready is-drop-over';
  if (ready) return 'dnd-target is-drop-ready';
  return 'dnd-target';
}

/**
 * Makes an element a drop target.
 *
 *   const target = useDropTarget({ id: 'saved', label: 'Saved', onDrop: (item) => save(item) });
 *   <li ref={target.ref} className={target.className}>…</li>
 *
 * `accepts` limits the item types (default: course, event, place). `label`
 * is read out in the drop announcements. `ready` is true while a drag this
 * target accepts is running; `over` while it hovers here.
 */
export default function useDropTarget({
  id, label, onDrop, accepts = DRAG_TYPES, disabled = false,
}) {
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const { setNodeRef, isOver, active } = useDroppable({
    id,
    disabled,
    data: { label, accepts, onDrop: (item) => onDropRef.current?.(item) },
  });

  const type = active?.data?.current?.item?.type;
  const ready = !disabled && Boolean(type) && accepts.includes(type);
  const over = ready && isOver;

  return {
    ref: setNodeRef,
    ready,
    over,
    className: dropTargetClass({ ready, over }),
  };
}
