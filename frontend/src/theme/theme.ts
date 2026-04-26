import { alpha, createTheme } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';

const shape = { borderRadius: 8 };

const components = {
  MuiButton: {
    defaultProps: {
      disableElevation: true,
    },
    styleOverrides: {
      root: { textTransform: 'none' as const, fontWeight: 500 },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: ({ theme }: { theme: Theme }) => ({
        borderRadius: Number(theme.shape.borderRadius) * 1.5,
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: 'none',
        backgroundImage: 'none',
      }),
    },
  },
  MuiPaper: {
    styleOverrides: {
      root: ({ theme }: { theme: Theme }) =>
        theme.palette.mode === 'light'
          ? {
              backgroundImage: 'none',
            }
          : {},
    },
  },
  MuiAppBar: {
    defaultProps: {
      elevation: 0,
      color: 'inherit' as const,
    },
    styleOverrides: {
      root: ({ theme }: { theme: Theme }) => ({
        backgroundColor: theme.palette.background.paper,
        borderBottom: `1px solid ${theme.palette.divider}`,
      }),
    },
  },
  MuiDrawer: {
    styleOverrides: {
      paper: ({ theme }: { theme: Theme }) => ({
        borderRight: `1px solid ${theme.palette.divider}`,
        backgroundImage: 'none',
      }),
    },
  },
  MuiListItemButton: {
    styleOverrides: {
      root: ({ theme }: { theme: Theme }) => ({
        borderRadius: shape.borderRadius,
        marginLeft: 8,
        marginRight: 8,
        paddingLeft: 12,
        paddingRight: 12,
        '&.Mui-selected': {
          backgroundColor: alpha(theme.palette.primary.main, 0.12),
          '&:hover': {
            backgroundColor: alpha(theme.palette.primary.main, 0.16),
          },
        },
      }),
    },
  },
  MuiTableCell: {
    styleOverrides: {
      head: ({ theme }: { theme: Theme }) => ({
        fontWeight: 600,
        color: theme.palette.text.secondary,
        backgroundColor: 'transparent',
      }),
    },
  },
};

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1976d2' },
    secondary: { main: '#00838f' },
    success: { main: '#2e7d32' },
    warning: { main: '#ed6c02' },
    error: { main: '#d32f2f' },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
    divider: 'rgba(0, 0, 0, 0.08)',
  },
  shape,
  typography: {
    fontFamily: '"Roboto", "Helvetica Neue", Arial, sans-serif',
    h4: { fontWeight: 600, letterSpacing: -0.02 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 500 },
  },
  components,
});

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#90caf9' },
    secondary: { main: '#4dd0e1' },
    success: { main: '#66bb6a' },
    warning: { main: '#ffa726' },
    error: { main: '#f44336' },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
    divider: 'rgba(255, 255, 255, 0.12)',
  },
  shape,
  typography: {
    fontFamily: '"Roboto", "Helvetica Neue", Arial, sans-serif',
    h4: { fontWeight: 600, letterSpacing: -0.02 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 500 },
  },
  components,
});
