import { renderHook } from '@testing-library/react';
import useViewport, { isPhoneWidth } from './useViewport';

/** Pretend the window is `width` px wide for every media query. */
function setWidth(width) {
  window.matchMedia = (media) => {
    const min = media.match(/min-width:\s*(\d+)px/);
    const max = media.match(/max-width:\s*(\d+)px/);
    const matches = (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
    return {
      matches, media, addEventListener: () => {}, removeEventListener: () => {},
    };
  };
}

const realMatchMedia = window.matchMedia;
afterEach(() => { window.matchMedia = realMatchMedia; });

test.each([
  [390, 'phone'], [700, 'phone'], [701, 'tablet'], [1099, 'tablet'], [1100, 'desktop'], [1440, 'desktop'],
])('%ipx is %s', (width, expected) => {
  setWidth(width);
  const { result } = renderHook(() => useViewport());
  expect(result.current).toBe(expected);
  expect(isPhoneWidth()).toBe(expected === 'phone');
});

test('without matchMedia it reports desktop', () => {
  window.matchMedia = undefined;
  const { result } = renderHook(() => useViewport());
  expect(result.current).toBe('desktop');
  expect(isPhoneWidth()).toBe(false);
});
