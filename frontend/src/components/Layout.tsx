import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Menu,
  MenuItem,
  ListItemIcon as ListItemIconBase,
  Divider,
  Button,
  Tooltip,
  Avatar,
} from '@mui/material';
import {
  Menu as MenuIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Dashboard as DashboardIcon,
  Psychology as StrategyIcon,
  Apps as AppsIcon,
  Brightness4 as Brightness4Icon,
  Brightness7 as Brightness7Icon,
  Logout as LogoutIcon,
  AdminPanelSettings as AdminIcon,
  Timeline as TimelineIcon,
  Storage as StorageIcon,
  BarChart as BarChartIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useThemeMode } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

const DRAWER_WIDTH = 256;
const COLLAPSED_WIDTH = 72;

const menuItems = [
  { text: 'AI分析', path: '/', icon: <DashboardIcon /> },
  { text: '板块指数', path: '/board-index', icon: <BarChartIcon /> },
  { text: '指标IDE', path: '/strategy', icon: <StrategyIcon /> },
  { text: '指标广场', path: '/indicator-square', icon: <AppsIcon /> },
  { text: '数据管理', path: '/data-management', icon: <StorageIcon /> },
  { text: '用量统计', path: '/usage', icon: <TimelineIcon /> },
  { text: '系统配置', path: '/config', icon: <SettingsIcon /> },
];

function pageTitleForPath(pathname: string): string {
  const hit = menuItems.find((item) => item.path === pathname);
  return hit?.text ?? 'KLineAI';
}

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [sidebarAnchorEl, setSidebarAnchorEl] = useState<null | HTMLElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, toggleTheme } = useThemeMode();
  const { user, logout, isAuthenticated } = useAuth();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleCollapseToggle = () => {
    setCollapsed(!collapsed);
  };

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    handleUserMenuClose();
    logout();
  };

  const drawerWidth = collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH;
  const appBarTitle = pageTitleForPath(location.pathname);

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          px: collapsed ? 0 : 1.5,
          minHeight: 56,
        }}
      >
        {!collapsed ? (
          <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 1, minWidth: 0, pl: 0.5 }}>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              K
            </Box>
            <Typography variant="subtitle1" noWrap sx={{ fontWeight: 700 }}>
              KLineAI
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1,
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            K
          </Box>
        )}
        <IconButton
          onClick={handleCollapseToggle}
          size="small"
          sx={{
            display: { xs: 'none', sm: 'inline-flex' },
            color: 'text.secondary',
            borderRadius: 1,
            border: 1,
            borderColor: 'divider',
            width: 32,
            height: 32,
          }}
        >
          {collapsed ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
        </IconButton>
      </Toolbar>
      <Divider />
      <List sx={{ flexGrow: 1, py: 1.5, px: 0.5 }}>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding sx={{ display: 'block', mb: 0.25 }}>
            <Tooltip title={collapsed ? item.text : ''} placement="right">
              <ListItemButton
                onClick={() => {
                  navigate(item.path);
                  setMobileOpen(false);
                }}
                selected={location.pathname === item.path}
                sx={{
                  minHeight: 44,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  px: collapsed ? 0 : 1.5,
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 0,
                    mr: collapsed ? 0 : 2,
                    justifyContent: 'center',
                    color: location.pathname === item.path ? 'primary.main' : 'text.secondary',
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                {!collapsed && (
                  <ListItemText
                    primary={item.text}
                    slotProps={{ primary: { variant: 'body2', sx: { fontWeight: 500 } } }}
                  />
                )}
              </ListItemButton>
            </Tooltip>
          </ListItem>
        ))}
      </List>

      {isAuthenticated && user && (
        <>
          <Divider />
          <Box sx={{ p: 2 }}>
            {collapsed ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <Tooltip title={user.username} placement="right">
                  <IconButton onClick={(e) => setSidebarAnchorEl(e.currentTarget)} size="small">
                    <Avatar className="MuiAvatar-root MuiAvatar-circular" sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: 14 }}>
                      {user.username?.charAt(0).toUpperCase() ?? '?'}
                    </Avatar>
                  </IconButton>
                </Tooltip>
                <Tooltip title="退出登录" placement="right">
                  <IconButton onClick={logout} size="small" sx={{ color: 'text.secondary' }}>
                    <LogoutIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 1.5, cursor: 'pointer', flex: 1, minWidth: 0 }} onClick={(e) => setSidebarAnchorEl(e.currentTarget)}>
                  <Avatar className="MuiAvatar-root MuiAvatar-circular" sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: 14 }}>
                    {user.username?.charAt(0).toUpperCase() ?? '?'}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" noWrap>
                      {user.username}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {user.role === 'admin' ? '管理员' : '用户'}
                    </Typography>
                  </Box>
                </Box>
                <Tooltip title="退出登录">
                  <IconButton onClick={logout} size="small" sx={{ color: 'text.secondary' }}>
                    <LogoutIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </Box>
          <Menu
            anchorEl={sidebarAnchorEl}
            open={Boolean(sidebarAnchorEl)}
            onClose={() => setSidebarAnchorEl(null)}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          >
            {user.role === 'admin' && (
              <MenuItem
                onClick={() => {
                  setSidebarAnchorEl(null);
                  navigate('/admin');
                }}
              >
                <ListItemIconBase>
                  <AdminIcon fontSize="small" />
                </ListItemIconBase>
                <ListItemText primary="用户管理" />
              </MenuItem>
            )}
          </Menu>
        </>
      )}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { xs: '100%', sm: `calc(100% - ${drawerWidth}px)` },
          ml: { xs: 0, sm: `${drawerWidth}px` },
          transition: 'width 0.2s, margin 0.2s',
          zIndex: (t) => t.zIndex.drawer + 1,
        }}
      >
        <Toolbar variant="dense" sx={{ minHeight: 56, gap: 1 }}>
          <IconButton
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 1, display: { sm: 'none' }, color: 'text.primary' }}
            aria-label="open menu"
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 600, color: 'text.primary' }}>
            {appBarTitle}
          </Typography>
          <IconButton onClick={toggleTheme} size="small" sx={{ color: 'text.secondary' }}>
            {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
          </IconButton>

          {!isAuthenticated && (
            <Button color="primary" variant="text" onClick={() => navigate('/login')} sx={{ fontWeight: 600 }}>
              登录
            </Button>
          )}
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 }, transition: 'width 0.2s' }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
              transition: 'width 0.2s',
              overflowX: 'hidden',
              bgcolor: 'background.paper',
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          minHeight: '100vh',
          bgcolor: 'background.default',
          transition: 'width 0.2s',
        }}
      >
        <Toolbar sx={{ minHeight: 56 }} />
        <Box sx={{ p: { xs: 2, sm: 3 }, pb: 4 }}>{children}</Box>
      </Box>
    </Box>
  );
};
