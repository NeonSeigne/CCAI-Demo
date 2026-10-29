import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { useAppConfig } from './AppConfigContext';
import { MODES, applyRoles, buildMuiTheme, cssVars, resolveRoles } from '../theme/schoolTheme';

// Stored choice (Auto, Light or Dark) and the last school's resolved colours.
// public/index.html reads both before first paint, so a reload never flashes.
export const MODE_KEY = 'cc.theme.v1';
export const CACHE_KEY = 'cc.theme.vars.v1';
export const THEME_MODES = ['auto', 'light', 'dark'];

const ThemeContext = createContext(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

const read = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private windows and blocked storage: the theme still applies, it just isn't remembered.
  }
};

export const readMode = () => {
  const stored = read(MODE_KEY);
  return THEME_MODES.includes(stored) ? stored : 'auto';
};

const darkQuery = () => (typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export const ThemeProvider = ({ children }) => {
  const { config } = useAppConfig();
  const [mode, setModeState] = useState(readMode);
  const [systemDark, setSystemDark] = useState(() => Boolean(darkQuery()?.matches));

  useEffect(() => {
    const query = darkQuery();
    if (!query) return undefined;
    const onChange = () => setSystemDark(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved = mode === 'auto' ? (systemDark ? 'dark' : 'light') : mode;
  const schoolTheme = config?.app?.theme;
  const roles = useMemo(() => resolveRoles(schoolTheme, resolved), [schoolTheme, resolved]);

  useEffect(() => {
    applyRoles(cssVars(roles), resolved);
  }, [roles, resolved]);

  // Cache both modes only once the school's own colours have arrived.
  useEffect(() => {
    if (!schoolTheme) return;
    const vars = Object.fromEntries(MODES.map((m) => [m, cssVars(resolveRoles(schoolTheme, m))]));
    write(CACHE_KEY, JSON.stringify(vars));
  }, [schoolTheme]);

  const muiTheme = useMemo(() => buildMuiTheme(roles, resolved), [roles, resolved]);

  const value = useMemo(() => {
    const setMode = (next) => {
      if (!THEME_MODES.includes(next)) return;
      setModeState(next);
      write(MODE_KEY, next);
    };
    return {
      mode,
      setMode,
      theme: resolved,
      isDark: resolved === 'dark',
      isLight: resolved === 'light',
      toggleTheme: () => setMode(resolved === 'dark' ? 'light' : 'dark'),
    };
  }, [mode, resolved]);

  return (
    <ThemeContext.Provider value={value}>
      <MuiThemeProvider theme={muiTheme}>{children}</MuiThemeProvider>
    </ThemeContext.Provider>
  );
};
