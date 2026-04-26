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
        throw new Error(err.detail || 'Failed to fetch users');
      }
      const data = await response.json();
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
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
        throw new Error(err.detail || 'Failed to create user');
      }
      setSnackbar({ open: true, message: 'User created successfully', severity: 'success' });
      setCreateDialogOpen(false);
      setCreateForm({ username: '', email: '', password: '', role: 'user' });
      fetchUsers();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create user');
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
        throw new Error(err.detail || 'Failed to update role');
      }
      setSnackbar({ open: true, message: 'Role updated successfully', severity: 'success' });
      fetchUsers();
    } catch (err) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : 'Failed to update role', severity: 'error' });
    }
    handleMenuClose();
  };

  const handleDeleteUser = async (userId: number) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      const response = await fetch(`${API_URL}/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        const err: ApiError = await response.json();
        throw new Error(err.detail || 'Failed to delete user');
      }
      setSnackbar({ open: true, message: 'User deleted successfully', severity: 'success' });
      fetchUsers();
    } catch (err) {
      setSnackbar({ open: true, message: err instanceof Error ? err.message : 'Failed to delete user', severity: 'error' });
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
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateDialogOpen(true)}>
          添加用户
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Username</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Created At</TableCell>
              <TableCell align="right">Actions</TableCell>
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
                    label={user.role === 'admin' ? 'Admin' : 'User'}
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
          <ListItemText primary={selectedUser?.role === 'admin' ? 'Change to User' : 'Change to Admin'} />
        </MenuItem>
        <MenuItem onClick={() => {
          if (selectedUser) {
            handleDeleteUser(selectedUser.id);
          }
        }} sx={{ color: 'error.main' }}>
          <ListItemIcon><DeleteIcon color="error" /></ListItemIcon>
          <ListItemText primary="Delete" />
        </MenuItem>
      </Menu>

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New User</DialogTitle>
        <DialogContent>
          {createError && <Alert severity="error" sx={{ mt: 2 }}>{createError}</Alert>}
          <TextField
            fullWidth
            label="Username"
            value={createForm.username}
            onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="Email"
            type="email"
            value={createForm.email}
            onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="Password"
            type="password"
            value={createForm.password}
            onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
            margin="normal"
            required
          />
          <FormControl fullWidth margin="normal">
            <InputLabel>Role</InputLabel>
            <Select
              value={createForm.role}
              label="Role"
              onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
            >
              <MenuItem value="user">User</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateUser} variant="contained" disabled={createLoading}>
            {createLoading ? <CircularProgress size={24} /> : 'Create'}
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
