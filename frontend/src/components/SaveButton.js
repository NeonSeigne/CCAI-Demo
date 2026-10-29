import React from 'react';
import { Bookmark } from './icons';
import { useSaved } from '../contexts/SavedContext';
import { useToast } from './Toast';
import '../styles/SaveButton.css';

/**
 * One tap saves to Unsorted (design 12A), tap again removes; both undoable.
 * Renders nothing outside a SavedProvider or without a key (older chat cards
 * saved before ids reached them).
 *
 * item: {kind: 'course'|'event'|'place', key, display_name, event_start?, event_end?}
 */
export default function SaveButton({ item, className = '' }) {
  const saved = useSaved();
  const toast = useToast();
  if (!saved || !item?.kind || !item?.key) return null;

  const { kind, key } = item;
  const name = item.display_name || key;
  const on = saved.isSaved(kind, key);

  const doSave = (entry = item, quiet = false) => {
    if (!quiet) {
      toast.show({
        message: 'Saved to Unsorted',
        actions: [
          { label: 'Move', to: '/saved' },
          { label: 'Undo', onClick: () => saved.unsave(kind, key).catch(() => {}) },
        ],
      });
    }
    saved.save(entry).catch(() => toast.show({
      message: "Couldn't save",
      tone: 'error',
      actions: [{ label: 'Retry', onClick: () => doSave(entry) }],
    }));
  };

  const doUnsave = () => {
    toast.show({ message: 'Removed', actions: [{ label: 'Undo', onClick: () => doSave(item, true) }] });
    saved.unsave(kind, key)
      .then((removed) => {
        if (!removed) return;
        // Undo puts it back where it was (its collection, not just Unsorted).
        toast.show({ message: 'Removed', actions: [{ label: 'Undo', onClick: () => doSave(removed, true) }] });
      })
      .catch(() => toast.show({
        message: "Couldn't remove",
        tone: 'error',
        actions: [{ label: 'Retry', onClick: doUnsave }],
      }));
  };

  return (
    <button
      type="button"
      className={`cc-save ${on ? 'is-saved' : ''} ${className}`.trim()}
      aria-pressed={on}
      aria-label={`Save ${name}`}
      title={on ? 'Saved' : 'Save'}
      onClick={() => (on ? doUnsave() : doSave())}
    >
      <Bookmark size={18} aria-hidden="true" />
    </button>
  );
}
