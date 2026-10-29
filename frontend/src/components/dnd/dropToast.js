import { useMemo } from 'react';
import { useToast } from '../Toast';

/**
 * Toasts for drops (D8), on the shared Toast:
 *   done('Added to Spring 2027', { onUndo })   → "Added to Spring 2027 · Undo"
 *   failed({ onRetry })                         → "Couldn't save · Retry"
 */
export default function useDropToast() {
  const toast = useToast();
  return useMemo(() => ({
    done: (message, { onUndo } = {}) => toast.show({
      message,
      actions: onUndo ? [{ label: 'Undo', onClick: onUndo }] : [],
    }),
    failed: ({ message = 'Couldn’t save', onRetry } = {}) => toast.show({
      message,
      tone: 'error',
      actions: onRetry ? [{ label: 'Retry', onClick: onRetry }] : [],
    }),
  }), [toast]);
}
