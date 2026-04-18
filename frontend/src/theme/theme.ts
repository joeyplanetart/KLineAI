import { createTheme } from '@mui/material/styles';

const commonTheme = {
  typography: {
    fontFamily: '"Roboto", "Helvetica Neue", Arial, sans-serif',
    h5: { fontWeight: 600 },
    h6: { fontWeight: 500 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { borderRadius: 12 },
      },
    },
  },
};

export const lightTheme = createTheme({
  ...commonTheme,
  palette: {
    mode: 'light',
    primary: { main: '#1890ff' },
    secondary: { main: '#faad14' },
    background: {
      default: '#f0f2f5',
      paper: '#ffffff',
    },
  },
});

export const darkTheme = createTheme({
  ...commonTheme,
  palette: {
    mode: 'dark',
    primary: { main: '#1890ff' },
    secondary: { main: '#faad14' },
    background: {
      default: '#141414',
      paper: '#1f1f1f',
    },
  },
});
