import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const MAIN_ID = 'main-content';

/** Focus without a scroll jump; elements that aren't focusable get tabindex -1. */
function focusElement(element) {
  if (!element) return false;
  if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '-1');
  element.focus({ preventScroll: false });
  return document.activeElement === element;
}

/** The page's H1, else its main region. */
export function pageHeading() {
  const main = document.getElementById(MAIN_ID) || document.querySelector('main');
  return (main && main.querySelector('h1')) || document.querySelector('h1') || main;
}

/**
 * "Skip to content" (design 28A): the first stop for keyboard users, jumping
 * past the rail to the page's main region.
 */
export function SkipLink() {
  return (
    <a
      className="skip-link"
      href={`#${MAIN_ID}`}
      onClick={(event) => {
        const main = document.getElementById(MAIN_ID) || document.querySelector('main');
        if (!main) return;
        event.preventDefault();
        focusElement(main);
      }}
    >
      Skip to content
    </a>
  );
}

/**
 * Moves focus to the new page's H1 after a route change, so screen readers
 * announce where the student landed (design 28A). The first load is left
 * alone. Lazy pages may draw their heading a moment later, so it looks a few
 * times before giving up.
 */
export default function RouteFocus() {
  const { pathname } = useLocation();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    let tries = 0;
    let timer = null;
    const attempt = () => {
      const target = pageHeading();
      if (target && focusElement(target)) return;
      tries += 1;
      if (tries < 10) timer = setTimeout(attempt, 100);
    };
    timer = setTimeout(attempt, 0);
    return () => clearTimeout(timer);
  }, [pathname]);

  return null;
}
