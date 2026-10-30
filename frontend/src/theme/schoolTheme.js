import { createTheme } from '@mui/material/styles';

/*
 * The app's colours (DESIGN.md). Shared roles live here; each school's own
 * roles come from app.theme in its school.yaml via /api/config. One resolved
 * set per mode is written to <html> as CSS variables (`deep_raised` becomes
 * `--deep-raised`) and the MUI theme is built from the same values.
 */

export const SHARED = {
  light: {
    surface: '#FFFFFF', raised: '#F1F3F6', ink: '#14171F', muted: '#5B6270', faint: '#6B7280',
    line: '#E3E6EB', rule: '#EEF0F3', control: '#D5D9E0', track: '#B6BCC6', open: '#8A919E',
    good: '#156B3A', good_tint: '#E3F4EA', error: '#B42318', error_tint: '#FDECEA',
    academics: '#2F5BEA', life: '#E8730C', campus: '#1E9E5A',
    easier: '#156B3A', typical: '#8A4206', harder: '#B42318',
    // Difficulty on the always-dark band: the dark data colours, in both modes.
    band_easier_text: '#7FDCA4', band_typical_text: '#F5B36E', band_harder_text: '#FF8F87',
  },
  dark: {
    surface: '#1A1D24', raised: '#23272F', ink: '#EEF0F4', muted: '#A4AAB6', faint: '#8C93A0',
    line: '#2B3039', rule: '#252930', control: '#3A404B', track: '#4A515D', open: '#7A8290',
    good: '#7FDCA4', good_tint: '#143323', error: '#FF8F87', error_tint: '#3A1A18',
    academics: '#7EA1FF', life: '#F5A35C', campus: '#5CC98A',
    easier: '#7FDCA4', typical: '#F5B36E', harder: '#FF8F87',
    band_easier_text: '#7FDCA4', band_typical_text: '#F5B36E', band_harder_text: '#FF8F87',
  },
};

// A school without a theme block: ink and paper, no school colour.
export const NEUTRAL_SCHOOL = {
  light: {
    deep: '#14171F', deep_raised: '#2A2E38', on_deep: '#FFFFFF', on_deep_soft: '#FFFFFFB3',
    signal: '#14171F', signal_hover: '#2A2E38', on_signal: '#FFFFFF',
    tint: '#EEF0F3', tint_strong: '#D5D9E0', tint_ink: '#14171F',
    band: '#14171F', mark_bg: '#FFFFFF', mark_ink: '#14171F', canvas: '#F3F4F7',
    line_1: '#2F5BEA', line_2: '#6E56CF', line_3: '#1E9E5A',
  },
  dark: {
    deep: '#0B0D12', deep_raised: '#1E222A', on_deep: '#FFFFFF', on_deep_soft: '#FFFFFFA8',
    signal: '#EEF0F4', signal_hover: '#FFFFFF', on_signal: '#14171F',
    tint: '#23272F', tint_strong: '#3A404B', tint_ink: '#EEF0F4',
    band: '#0B0D12', mark_bg: '#EEF0F4', mark_ink: '#14171F', canvas: '#101217',
    line_1: '#7EA1FF', line_2: '#A792F0', line_3: '#5CC98A',
  },
};

export const MODES = ['light', 'dark'];

const BAND_DIFFICULTY = ['easier', 'typical', 'harder'];

/**
 * Every role for one mode: shared roles, then the school's (which may
 * override shared data colours). The band is dark in both modes, so its
 * difficulty colours follow the school's dark overrides (UW's harder is ink).
 */
export function resolveRoles(theme, mode) {
  const school = theme?.[mode] || NEUTRAL_SCHOOL[mode];
  const dark = theme?.dark || {};
  const band = Object.fromEntries(BAND_DIFFICULTY
    .filter((name) => dark[name])
    .map((name) => [`band_${name}_text`, dark[name]]));
  return { ...SHARED[mode], ...NEUTRAL_SCHOOL[mode], ...band, ...school };
}

/** `{deep_raised: '#…'}` → `{'--deep-raised': '#…'}`. */
export function cssVars(roles) {
  return Object.fromEntries(Object.entries(roles).map(([k, v]) => [`--${k.replace(/_/g, '-')}`, v]));
}

/** Write one mode's variables and data-theme on <html>. */
export function applyRoles(vars, mode, root = document.documentElement) {
  Object.entries(vars).forEach(([name, value]) => root.style.setProperty(name, value));
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
}

/** MUI needs concrete colours; component styles keep reading the CSS variables. */
export function buildMuiTheme(roles, mode) {
  return createTheme({
    palette: {
      mode,
      primary: { main: roles.signal, contrastText: roles.on_signal },
      error: { main: roles.error },
      background: { default: roles.canvas, paper: roles.surface },
      text: { primary: roles.ink, secondary: roles.muted },
      divider: roles.line,
    },
    typography: {
      fontFamily: 'var(--font-app)',
      ...Object.fromEntries(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((variant) => [
        variant, { fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.02em' },
      ])),
      button: { textTransform: 'none', fontWeight: 700 },
      // A plain label, never an all-caps eyebrow (DESIGN.md Do's and Don'ts).
      overline: { textTransform: 'none', letterSpacing: 0, fontSize: 13, fontWeight: 700, lineHeight: 1.5 },
    },
    // 1, so sx radii are pixels; components use the --r-* ramp by name.
    shape: { borderRadius: 1 },
    breakpoints: { values: { xs: 0, sm: 701, md: 1100, lg: 1280, xl: 1280 } },
    components: {
      MuiAppBar: {
        defaultProps: { color: 'transparent', elevation: 0 },
        styleOverrides: {
          root: { backgroundColor: 'var(--surface)', color: 'var(--ink)', backgroundImage: 'none', boxShadow: 'none' },
        },
      },
      MuiToolbar: { styleOverrides: { root: { borderColor: 'var(--line)' } } },
      MuiDrawer: {
        styleOverrides: {
          paper: { backgroundColor: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--line)', boxShadow: 'var(--shadow-float)' },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiDialog: {
        defaultProps: { fullWidth: true },
        styleOverrides: {
          paper: {
            backgroundColor: 'var(--surface)',
            backgroundImage: 'none',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-2xl)',
            boxShadow: 'var(--shadow-float)',
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: {
            color: 'var(--ink)', fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700,
            letterSpacing: '-0.02em', padding: '20px 24px 16px',
          },
        },
      },
      MuiDialogContent: { styleOverrides: { root: { color: 'var(--ink)', padding: '8px 24px 24px' } } },
      MuiDialogActions: { styleOverrides: { root: { gap: 8, padding: '0 24px 20px' } } },
      // Menus and popovers float without a scrim on tablet and desktop; on
      // phones they rise as sheets over it (menus.html, R1).
      MuiBackdrop: {
        styleOverrides: {
          root: {
            backgroundColor: 'var(--scrim)',
            '@media (min-width: 701px)': { '&.MuiBackdrop-invisible': { backgroundColor: 'transparent' } },
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: 'var(--r-xl)', border: '1px solid var(--line)', boxShadow: 'var(--shadow-float)',
            backgroundColor: 'var(--surface)', padding: 6,
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            minHeight: 44, borderRadius: 'var(--r-lg)', fontWeight: 600, gap: 12,
            '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: 'var(--tint)', color: 'var(--tint-ink)' },
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            minHeight: 42, padding: '0 18px', borderRadius: 'var(--r-full)', fontWeight: 700,
            transition: 'transform 120ms ease-out, background-color 150ms ease',
            '&:active': { transform: 'scale(0.95)' },
            '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:active': { transform: 'none' } },
          },
          containedPrimary: {
            backgroundColor: 'var(--signal)',
            color: 'var(--on-signal)',
            '&:hover': { backgroundColor: 'var(--signal-hover)' },
          },
          // Danger: ink with an icon, never red alone (UW: red is the school colour).
          containedError: {
            backgroundColor: 'var(--harder)',
            color: 'var(--surface)',
            '&:hover': { backgroundColor: 'var(--harder)', opacity: 0.9 },
          },
          outlined: {
            borderColor: 'var(--control)', backgroundColor: 'var(--surface)', color: 'var(--ink)',
            '&:hover': { borderColor: 'var(--control)', backgroundColor: 'var(--raised)' },
          },
          text: { color: 'var(--ink)', '&:hover': { backgroundColor: 'var(--raised)' } },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 'var(--r-lg)',
            backgroundColor: 'var(--surface)',
            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--control)' },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--control)' },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--ink)', borderWidth: 1 },
          },
        },
      },
      // The segmented control: a raised round track, the choice on surface.
      MuiToggleButtonGroup: {
        styleOverrides: {
          root: { gap: 2, padding: 3, borderRadius: 'var(--r-full)', backgroundColor: 'var(--raised)' },
          grouped: {
            border: 0,
            borderRadius: 'var(--r-full) !important',
            margin: 0,
          },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            border: 0, borderRadius: 'var(--r-full)', padding: '6px 14px', textTransform: 'none',
            fontWeight: 700, color: 'var(--muted)',
            '&.Mui-selected, &.Mui-selected:hover': {
              backgroundColor: 'var(--surface)', color: 'var(--ink)', boxShadow: 'var(--shadow-rest)',
            },
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: 'var(--r-lg)', fontWeight: 600, alignItems: 'center' },
          filledSuccess: { backgroundColor: 'var(--ink)', color: 'var(--surface)' },
          filledError: { backgroundColor: 'var(--ink)', color: 'var(--surface)' },
          filledInfo: { backgroundColor: 'var(--ink)', color: 'var(--surface)' },
        },
      },
      MuiSnackbarContent: {
        styleOverrides: { root: { borderRadius: 'var(--r-lg)', backgroundColor: 'var(--ink)', color: 'var(--surface)' } },
      },
      MuiIconButton: {
        styleOverrides: {
          root: { color: 'var(--muted)', '&:hover': { backgroundColor: 'var(--raised)', color: 'var(--ink)' } },
        },
      },
      // Rows inside a panel are r-md; only rail nav items are pills.
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 'var(--r-md)',
            '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: 'var(--tint)', color: 'var(--tint-ink)' },
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { backgroundColor: 'var(--ink)', color: 'var(--surface)', fontSize: 12, borderRadius: 'var(--r-sm)' },
        },
      },
    },
  });
}
