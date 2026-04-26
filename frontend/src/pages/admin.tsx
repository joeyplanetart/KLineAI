import React, { useState, useEffect } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  FormControl,
  InputLabel,
  Chip,
  CircularProgress,
  Alert,
  Snackbar,
} from '@mui/material';
import {
  MoreVert as MoreVertIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  AdminPanelSettings as AdminIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/PageHeader';

const API_URL = 'http://localhost:8000/api/v1';

interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  created_at: string;
}

interface ApiError {
  detail: string;
}

export const AdminPage: React.FC = () => {
  const { accessToken } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ username: '', email: '', password: '', role: 'user' });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${API_URL}/users/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        const err: ApiError = await response.json();
        throw new Error(err.detail || '获取用户列表失败');
      }
      const data = await response.json();
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, user: User) => {
    setAnchorEl(event.currentTarget);
    setSelectedUser(user);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedUser(null);
  };

  const handleCreateUser = async () => {
    setCreateLoading(true);
    setCreateError(null);
    try {
      const response = await fetch(`${API_URL}/users/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(createForm),
      });
      if (!response.ok) {
        const err: ApiError = await response.json();
        throw new Error(err.detail || '创建用户失败');
      }
      setSnackbar({ open: true, message: '用户已创建', severity: 'success' });
      setCreateDialogOpen(false);
      setCreateForm({ username: '', email: '', password: '', role: 'user' });
      fetchUsers();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '创建用户失败');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleUpdateRole = async (userId: number, newRole: string) => {
    try {
      const response = await fetch(`${API_URL}/users/${userId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ role: newRole }),
      });
      if (!response.ok) {
        const err: ApiError = await response.json();
        throw new Error(err.detail || '更新角色失败');
      }
      setSnackbar({ open: true, message: '角色已更新', severity: 'success' });
      fetchUsers();
    } catch (err) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : '更新角色失败', severity: 'error' });
    }
    handleMenuClose();
  };

  const handleDeleteUser = async (userId: number) => {
    if (!window.confirm('确定要删除该用户吗？')) return;
    try {
      const response = await fetch(`${API_URL}/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        const err: ApiError = await response.json();
        throw new Error(err.detail || '删除用户失败');
      }
      setSnackbar({ open: true, message: '用户已删除', severity: 'success' });
      fetchUsers();
    } catch (err) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : '删除用户失败', severity: 'error' });
    }
    handleMenuClose();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title="用户管理"
        subtitle="创建、编辑角色与删除用户"
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateDialogOpen(true)}>
            添加用户
          </Button>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>用户名</TableCell>
              <TableCell>邮箱</TableCell>
              <TableCell>角色</TableCell>
              <TableCell>创建时间</TableCell>
              <TableCell align="right">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.id}</TableCell>
                <TableCell>{user.username}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Chip
                    icon={user.role === 'admin' ? <AdminIcon /> : <PersonIcon />}
                    label={user.role === 'admin' ? '管理员' : '用户'}
                    color={user.role === 'admin' ? 'primary' : 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell>{formatDate(user.created_at)}</TableCell>
                <TableCell align="right">
                  <IconButton onClick={(e) => handleMenuOpen(e, user)}>
                    <MoreVertIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
        <MenuItem onClick={() => {
          if (selectedUser) {
            handleUpdateRole(selectedUser.id, selectedUser.role === 'admin' ? 'user' : 'admin');
          }
        }}>
          <ListItemIcon>
            {selectedUser?.role === 'admin' ? <PersonIcon /> : <AdminIcon />}
          </ListItemIcon>
          <ListItemText primary={selectedUser?.role === 'admin' ? '改为普通用户' : '设为管理员'} />
        </MenuItem>
        <MenuItem onClick={() => {
          if (selectedUser) {
            handleDeleteUser(selectedUser.id);
          }
        }} sx={{ color: 'error.main' }}>
          <ListItemIcon><DeleteIcon color="error" /></ListItemIcon>
          <ListItemText primary="删除" />
        </MenuItem>
      </Menu>

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>新建用户</DialogTitle>
        <DialogContent>
          {createError && <Alert severity="error" sx={{ mt: 2 }}>{createError}</Alert>}
          <TextField
            fullWidth
            label="用户名"
            value={createForm.username}
            onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="邮箱"
            type="email"
            value={createForm.email}
            onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="密码"
            type="password"
            value={createForm.password}
            onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
            margin="normal"
            required
          />
          <FormControl fullWidth margin="normal">
            <InputLabel>角色</InputLabel>
            <Select
              value={createForm.role}
              label="角色"
              onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
            >
              <MenuItem value="user">普通用户</MenuItem>
              <MenuItem value="admin">管理员</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>取消</Button>
          <Button onClick={handleCreateUser} variant="contained" disabled={createLoading}>
            {createLoading ? <CircularProgress size={24} /> : '创建'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};
