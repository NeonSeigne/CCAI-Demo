import { useEffect, useRef, useState } from 'react';
import { useSaved } from '../../contexts/SavedContext';
import useViewport from '../../hooks/useViewport';
import useDropTarget from './useDropTarget';
import useDropToast from './dropToast';

const PULSE_MS = 600;

/** The saved entry for a dragged item: {kind, key, display_name, event_start?, event_end?}. */
export function savedEntryFor(item) {
  const extra = item.extra || {};
  return {
    kind: item.type,
    key: String(item.id),
    display_name: item.title || String(item.id),
    ...(extra.event_start ? { event_start: extra.event_start } : {}),
    ...(extra.event_end ? { event_end: extra.event_end } : {}),
  };
}

/**
 * The Saved rail item as a drop target (D20). A drop saves through
 * SavedContext and pulses the count; an item already saved only pulses.
 * It never navigates. No target where the rail is hidden (phones).
 */
export default function useSavedDropTarget() {
  const saved = useSaved();
  const toast = useDropToast();
  const phone = useViewport() === 'phone';
  const [pulse, setPulse] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const pulseCount = () => {
    clearTimeout(timer.current);
    setPulse(false);
    // Next frame, so a second drop restarts the animation.
    window.requestAnimationFrame(() => {
      setPulse(true);
      timer.current = setTimeout(() => setPulse(false), PULSE_MS);
    });
  };

  const save = (entry) => saved.save(entry).catch(() => toast.failed({ onRetry: () => save(entry) }));

  const target = useDropTarget({
    id: 'rail-saved',
    label: 'Saved',
    disabled: phone || !saved?.save,
    onDrop: (item) => {
      const entry = savedEntryFor(item);
      pulseCount();
      if (!saved.isSaved?.(entry.kind, entry.key)) save(entry);
    },
  });

  return { ...target, pulse };
}
