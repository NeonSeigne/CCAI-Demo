import { KeyboardCode } from '@dnd-kit/core';

const NEXT = [KeyboardCode.Down, KeyboardCode.Right];
const PREVIOUS = [KeyboardCode.Up, KeyboardCode.Left];

const center = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

const acceptsItem = (container, item) => {
  const types = container.data?.current?.accepts;
  return Boolean(item) && (!types || types.includes(item.type));
};

/** Enabled targets that take this item, in reading order (top to bottom, then left to right). */
export function keyboardTargets(context, active) {
  const item = active?.data?.current?.item;
  return context.droppableContainers.getEnabled()
    .filter((container) => acceptsItem(container, item))
    .map((container) => ({ id: container.id, rect: context.droppableRects.get(container.id) }))
    .filter(({ rect }) => rect && rect.width > 0 && rect.height > 0)
    .sort((a, b) => (a.rect.top - b.rect.top) || (a.rect.left - b.rect.left));
}

/**
 * Arrow keys step the dragged item to the centre of the next (Down / Right)
 * or previous (Up / Left) drop target that takes it, so the dock and Saved
 * are a press or two away (D18).
 */
export function targetCoordinates(event, { context, currentCoordinates }) {
  const forward = NEXT.includes(event.code);
  if (!forward && !PREVIOUS.includes(event.code)) return undefined;
  event.preventDefault();

  // The sensor's own `active` is only the id; the context has the item.
  const targets = keyboardTargets(context, context.active);
  const { collisionRect } = context;
  if (!targets.length || !collisionRect) return undefined;

  const index = targets.findIndex((target) => target.id === context.over?.id);
  let nextIndex;
  if (index === -1) nextIndex = forward ? 0 : targets.length - 1;
  else nextIndex = (index + (forward ? 1 : -1) + targets.length) % targets.length;

  const to = center(targets[nextIndex].rect);
  const from = center(collisionRect);
  return { x: currentCoordinates.x + to.x - from.x, y: currentCoordinates.y + to.y - from.y };
}

/** Keyboard drags have no pointer: a target counts when it holds the dragged item's centre. */
export function centerWithin({ collisionRect, droppableRects, droppableContainers }) {
  if (!collisionRect) return [];
  const { x, y } = center(collisionRect);
  return droppableContainers
    .filter((container) => {
      const rect = droppableRects.get(container.id);
      return rect && x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
    })
    .map((container) => ({ id: container.id, data: { droppableContainer: container, value: 0 } }));
}
