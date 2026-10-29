import fs from 'fs';
import path from 'path';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { CACHE_KEY, MODE_KEY, ThemeProvider, useTheme } from './ThemeContext';
import { SHARED } from '../theme/schoolTheme';

let mockConfig = null;
jest.mock('./AppConfigContext', () => ({ useAppConfig: () => ({ config: mockConfig }) }));

const SCHOOL = {
  light: { deep: '#232D4B', signal: '#E57200', on_signal: '#14171F', canvas: '#F3F4F7' },
  dark: { deep: '#1B2440', signal: '#F28A2E', on_signal: '#14171F', canvas: '#10131B' },
};

// matchMedia stub whose "prefers dark" answer the test can flip.
let systemDark = false;
let listeners = [];
const setSystemDark = (value) => {
  systemDark = value;
  listeners.forEach((fn) => fn());
};
beforeEach(() => {
  systemDark = false;
  listeners = [];
  window.matchMedia = jest.fn(() => ({
    get matches() { return systemDark; },
    addEventListener: (_, fn) => listeners.push(fn),
    removeEventListener: (_, fn) => { listeners = listeners.filter((l) => l !== fn); },
  }));
  window.localStorage.clear();
  mockConfig = { app: { theme: SCHOOL } };
  const root = document.documentElement;
  root.removeAttribute('style');
  delete root.dataset.theme;
});

const root = () => document.documentElement;
const cssVar = (name) => root().style.getPropertyValue(name);

function Probe() {
  const { mode, theme, setMode } = useTheme();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="theme">{theme}</span>
      <button type="button" onClick={() => setMode('dark')}>dark</button>
    </div>
  );
}

describe('ThemeProvider', () => {
  test('Auto follows the system and writes the school colours', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId('mode')).toHaveTextContent('auto');
    expect(root().dataset.theme).toBe('light');
    expect(cssVar('--deep')).toBe('#232D4B');
    expect(cssVar('--surface')).toBe(SHARED.light.surface);

    act(() => setSystemDark(true));
    expect(root().dataset.theme).toBe('dark');
    expect(cssVar('--deep')).toBe('#1B2440');
    expect(cssVar('--surface')).toBe(SHARED.dark.surface);
  });

  test('a stored choice wins over the system and is remembered', () => {
    window.localStorage.setItem(MODE_KEY, 'dark');
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    act(() => setSystemDark(false));
    expect(root().dataset.theme).toBe('dark');
  });

  test('setMode stores the choice', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    act(() => screen.getByText('dark').click());
    expect(window.localStorage.getItem(MODE_KEY)).toBe('dark');
    expect(root().dataset.theme).toBe('dark');
  });

  test('caches both modes once the school colours arrive', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    const cache = JSON.parse(window.localStorage.getItem(CACHE_KEY));
    expect(cache.light['--deep']).toBe('#232D4B');
    expect(cache.dark['--canvas']).toBe('#10131B');
  });

  test('without a school theme it uses neutral colours and caches nothing', () => {
    mockConfig = null;
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(cssVar('--signal')).toBe('#14171F');
    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  test('blocked storage still applies the theme', () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const setSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(cssVar('--deep')).toBe('#232D4B');
    spy.mockRestore();
    setSpy.mockRestore();
  });
});

describe('boot script in public/index.html', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  // eslint-disable-next-line no-new-func
  const boot = () => new Function(script)();

  test('paints the cached school colours for the stored mode', () => {
    window.localStorage.setItem(MODE_KEY, 'dark');
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ light: { '--deep': '#232D4B' }, dark: { '--deep': '#1B2440' } }));
    boot();
    expect(root().dataset.theme).toBe('dark');
    expect(cssVar('--deep')).toBe('#1B2440');
  });

  test('ignores a corrupt cache', () => {
    window.localStorage.setItem(CACHE_KEY, '{not json');
    expect(boot).not.toThrow();
    expect(root().dataset.theme).toBe('light');
  });
});
