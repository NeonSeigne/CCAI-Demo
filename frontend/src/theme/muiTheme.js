import { createTheme } from '@mui/material/styles';

// MUI requires concrete palette values for color calculations. These values
// mirror brand-tokens.css; component overrides continue to consume CSS tokens.
const muiTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#111114',
      contrastText: '#FFFFFF',
    },
    error: {
      main: '#FF5A5F',
    },
    background: {
      default: '#F7F7F5',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#111114',
      secondary: '#6B6B70',
    },
    divider: 'rgba(17, 17, 20, 0.08)',
  },
  typography: {
    fontFamily: 'var(--font-app)',
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 12,
  },
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 769,
      lg: 1200,
      xl: 1536,
    },
  },
  components: {
    MuiAppBar: {
      defaultProps: {
        color: 'transparent',
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundColor: 'var(--paper)',
          color: 'var(--ink)',
          backgroundImage: 'none',
          boxShadow: 'none',
        },
      },
    },
    MuiToolbar: {
      styleOverrides: {
        root: {
          borderColor: 'var(--line)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: 'var(--paper)',
          color: 'var(--ink)',
          borderColor: 'var(--line)',
          boxShadow: 'var(--shadow-soft-md)',
        },
      },
    },
    MuiDialog: {
      defaultProps: {
        fullWidth: true,
      },
      styleOverrides: {
        paper: {
          backgroundColor: 'var(--paper)',
          backgroundImage: 'none',
          border: '1px solid var(--line)',
          borderRadius: 16,
          boxShadow: 'var(--shadow-soft-lg)',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          color: 'var(--ink)',
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          padding: '20px 24px 16px',
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          color: 'var(--ink)',
          padding: '8px 24px 24px',
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          gap: 8,
          padding: '0 24px 20px',
        },
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(17, 17, 20, 0.32)',
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 999,
        },
        containedPrimary: {
          backgroundColor: 'var(--ink)',
          color: 'var(--paper)',
          '&:hover': {
            backgroundColor: 'var(--ink)',
            opacity: 0.9,
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: 'var(--ink-soft)',
          '&:hover': {
            backgroundColor: 'var(--paper-sunken)',
            color: 'var(--ink)',
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          '&.Mui-selected': {
            backgroundColor: 'var(--bg-tertiary)',
            '&:hover': {
              backgroundColor: 'var(--bg-tertiary)',
            },
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: 'var(--ink)',
          color: 'var(--paper)',
          fontSize: 12,
        },
      },
    },
  },
});

export default muiTheme;
