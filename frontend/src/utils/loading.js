import { useEffect, useState } from 'react';

/** How long a load runs before its placeholder shows (9A). */
export const PLACEHOLDER_DELAY_MS = 300;

/** True once `active` has stayed true for `delay` ms, so fast loads never flash a placeholder (9A). */
export function useDelayedFlag(active, delay = PLACEHOLDER_DELAY_MS) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return undefined;
    }
    const timer = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(timer);
  }, [active, delay]);
  return active && shown;
}

/** A fetch cancelled by its AbortController, which callers ignore. */
export const isAbort = (error) => error?.name === 'AbortError';
