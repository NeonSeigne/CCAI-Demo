import { useEffect, useState } from 'react';

const query = (media) => (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia(media)
  : null);

/**
 * Whether a media query matches, kept live. Where matchMedia doesn't exist
 * (old test environments) it returns `fallback`.
 */
export default function useMediaMatch(media, fallback = false) {
  const [matches, setMatches] = useState(() => query(media)?.matches ?? fallback);

  useEffect(() => {
    const list = query(media);
    if (!list) return undefined;
    const update = () => setMatches(list.matches);
    update();
    if (list.addEventListener) list.addEventListener('change', update);
    else list.addListener?.(update);
    return () => {
      if (list.removeEventListener) list.removeEventListener('change', update);
      else list.removeListener?.(update);
    };
  }, [media]);

  return matches;
}
