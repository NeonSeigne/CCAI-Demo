import React, { useCallback, useRef, useState } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor,
  pointerWithin, useSensor, useSensors,
} from '@dnd-kit/core';
import { centerWithin, targetCoordinates } from './keyboard';
import '../../styles/dnd.css';

/**
 * One drag-and-drop context for the signed-in app (eng R5, design D8, D18):
 * pointer, touch and keyboard sensors (Space lifts, arrows move, Space
 * drops, Escape cancels), a chip that follows the pointer, and lift / over /
 * drop announcements in a polite live region.
 *
 * Drag sources use useDraggableItem; drop targets use useDropTarget, whose
 * onDrop(item) runs here when the drag ends over them.
 */

const itemOf = (active) => active?.data?.current?.item || null;
const labelOf = (over) => over?.data?.current?.label || 'the drop target';
const titleOf = (active) => itemOf(active)?.title || 'Item';

// dnd-kit's own announcer is assertive; ours is polite, so it stays silent.
const silent = {
  onDragStart: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};

export const announcements = {
  start: (active) => `Picked up ${titleOf(active)}.`,
  over: (active, over) => (over
    ? `${titleOf(active)} is over ${labelOf(over)}.`
    : `${titleOf(active)} is not over a drop target.`),
  end: (active, over) => (over
    ? `Dropped ${titleOf(active)} on ${labelOf(over)}.`
    : `Dropped ${titleOf(active)}. Nothing changed.`),
  cancel: (active) => `Cancelled. ${titleOf(active)} was not moved.`,
};

/**
 * Pointer and touch drags hit the target under the pointer; keyboard drags
 * (no pointer) hit the target holding the dragged item's centre, so lifting
 * and dropping in place drops nowhere.
 */
export function collisionDetection(args) {
  return args.pointerCoordinates ? pointerWithin(args) : centerWithin(args);
}

const accepts = (over, item) => {
  const types = over?.data?.current?.accepts;
  return Boolean(item) && (!types || types.includes(item.type));
};

export default function DndProvider({ children }) {
  const [message, setMessage] = useState('');
  const [dragging, setDragging] = useState(null);
  // The first "over" lands in the same moment as the lift; say both.
  const liftRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: targetCoordinates }),
  );

  const onDragStart = useCallback(({ active }) => {
    setDragging(itemOf(active));
    liftRef.current = { text: announcements.start(active), at: Date.now() };
    setMessage(liftRef.current.text);
  }, []);

  const onDragOver = useCallback(({ active, over }) => {
    const lift = liftRef.current && Date.now() - liftRef.current.at < 250 ? liftRef.current.text : null;
    liftRef.current = null;
    setMessage([lift, announcements.over(active, over)].filter(Boolean).join(' '));
  }, []);

  const onDragEnd = useCallback(({ active, over }) => {
    setDragging(null);
    liftRef.current = null;
    const item = itemOf(active);
    const target = over && accepts(over, item) && !over.disabled ? over : null;
    setMessage(announcements.end(active, target));
    if (target) target.data.current.onDrop?.(item);
  }, []);

  const onDragCancel = useCallback(({ active }) => {
    setDragging(null);
    liftRef.current = null;
    setMessage(announcements.cancel(active));
  }, []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{ announcements: silent }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {children}
      <DragOverlay dropAnimation={null} zIndex={1400}>
        {dragging ? <div className="dnd-chip">{dragging.title}</div> : null}
      </DragOverlay>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{message}</div>
    </DndContext>
  );
}
