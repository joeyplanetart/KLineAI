import React from 'react';
import { Box, Typography, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';

export const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        bgcolor: 'background.default',
        px: 2,
        gap: 2,
        textAlign: 'center',
      }}
    >
      <Typography variant="h3" component="h1" sx={{ fontWeight: 700 }}>
        404
      </Typography>
      <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 480 }}>
        未找到该页面
      </Typography>
      <Button variant="contained" size="large" onClick={() => navigate('/')}>
        返回首页
      </Button>
    </Box>
  );
};
