import useMediaMatch from './useMediaMatch';

/**
 * The app's breakpoints (DESIGN.md Layout, design Q18): phone up to 700px,
 * tablet 701–1099px, desktop from 1100px. The Ask dock docks from 1280px
 * (ChatDockContext). Stylesheets use the same widths in their media queries.
 */
export const BP_PHONE = 700;
export const BP_DESKTOP = 1100;

export const PHONE_QUERY = `(max-width: ${BP_PHONE}px)`;
export const DESKTOP_QUERY = `(min-width: ${BP_DESKTOP}px)`;

/** Whether the window is phone width right now; false where matchMedia is missing. */
export const isPhoneWidth = () => typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia(PHONE_QUERY).matches;

/**
 * 'phone' | 'tablet' | 'desktop' for the current width, kept live. Where
 * matchMedia is missing (tests, old browsers) it reports 'desktop'.
 */
export default function useViewport() {
  const phone = useMediaMatch(PHONE_QUERY, false);
  const desktop = useMediaMatch(DESKTOP_QUERY, true);
  if (phone) return 'phone';
  return desktop ? 'desktop' : 'tablet';
}
