import React from 'react';
import { Box, Typography } from '@mui/material';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, action }) => (
  <Box
    sx={{
      mb: 3,
      display: 'flex',
      flexDirection: { xs: 'column', sm: 'row' },
      alignItems: { xs: 'stretch', sm: 'flex-start' },
      justifyContent: 'space-between',
      gap: 2,
    }}
  >
    <Box sx={{ minWidth: 0 }}>
      <Typography component="h1" variant="h4" sx={{ fontWeight: 600, letterSpacing: -0.02 }}>
        {title}
      </Typography>
      {subtitle ? (
        <Typography color="text.secondary" variant="body1" sx={{ mt: 0.5 }}>
          {subtitle}
        </Typography>
      ) : null}
    </Box>
    {action ? <Box sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'center' } }}>{action}</Box> : null}
  </Box>
);
