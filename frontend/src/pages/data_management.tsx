import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Tabs,
  Tab,
  Table,
  TableBody,
  Autocomplete,
  TextField,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  Alert,
  CircularProgress,
  Stack,
  Paper,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Snackbar,
  Pagination,
  InputAdornment,
  LinearProgress,
  Divider,
} from '@mui/material';
import {
  CloudDone as CloudDoneIcon,
  CloudOff as CloudOffIcon,
  Sync as SyncIcon,
  Refresh as RefreshIcon,
  Storage as StorageIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  PlayCircle as PlayCircleIcon,
  Schedule as ScheduleIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  PlayArrow as PlayArrowIcon,
  Search as SearchIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { API_URL } from '../config/api';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

interface DataSource {
  name: string;
  id: string;
  available: boolean;
  description: string;
}

interface StockInfo {
  symbol: string;
  code: string;
  name: string;
  search_key?: string;
  exchange: string;
  status: string;
  listing_date: string | null;
  latest: {
    trade_date?: string;
    close?: number;
    pct_change?: number;
    volume?: number;
    amount?: number;
    amplitude?: number;
    volume_ratio?: number;
    limit_status?: 'up' | 'down' | 'none';
    next_limit_up?: number;
    next_limit_down?: number;
  };
}

interface DataQualityAnomaly {
  id: number;
  symbol: string;
  trade_date: string;
  anomaly_type: string;
  field_name: string;
  actual_value: string;
  expected_value: string;
  message: string;
  created_at: string;
  resolved: boolean;
}

interface ConfigItem {
  key: string;
  value: any;
  default: any;
  description: string;
  category: string;
  is_secret: boolean;
  value_type: string;
}

interface TaskInfo {
  task_name: string;
  display_name: string;
  description: string;
  queue: string;
  schedule: string;
  category: string;
  last_run: string | null;
  last_status: string | null;
  is_enabled: boolean;
}

interface PaginationInfo {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export const DataManagementPage: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearMessage, setClearMessage] = useState<string | null>(null);
  const [stockList, setStockList] = useState<StockInfo[]>([]);
  const [stockPagination, setStockPagination] = useState<PaginationInfo>({ page: 1, page_size: 50, total: 0, total_pages: 0 });
  const [stockSearch, setStockSearch] = useState('');
  const [stockExchange, setStockExchange] = useState<string>('');
  const [stockSuggestions, setStockSuggestions] = useState<StockInfo[]>([]);
  const [clearingStock, setClearingStock] = useState<string | null>(null);
  const [anomalies, setAnomalies] = useState<DataQualityAnomaly[]>([]);
  const [anomalyPagination, setAnomalyPagination] = useState<PaginationInfo>({ page: 1, page_size: 50, total: 0, total_pages: 0 });
  const [qualitySummary, setQualitySummary] = useState<any>(null);

  // Batch fetch states
  const [batchSymbols, setBatchSymbols] = useState('');
  const [batchStartDate, setBatchStartDate] = useState(() => {
    // Default: 1 month ago
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [batchEndDate, setBatchEndDate] = useState(() => {
    // Default: today
    return new Date().toISOString().slice(0, 10);
  });
  const [batchResult, setBatchResult] = useState<any>(null);
  const [batchLoading, setBatchLoading] = useState(false);

  // Batch job tracking states
  const [_batchJobId, setBatchJobId] = useState<string | null>(null);
  const [batchJobStatus, setBatchJobStatus] = useState<any>(null);
  const [clearingCache, setClearingCache] = useState(false);

  // Config states
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [configCategories, setConfigCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ConfigItem | null>(null);
  const [editValue, setEditValue] = useState('');
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  // Task states
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [taskLoading, setTaskLoading] = useState(false);
  const [executingTask, setExecutingTask] = useState<string | null>(null);
  const [recentExecutions, setRecentExecutions] = useState<any[]>([]);

  // Fetch data sources
  const fetchDataSources = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/market/sources`);
      if (response.ok) {
        const data = await response.json();
        setDataSources(data.sources);
      }
    } catch (err) {
      console.error('Failed to fetch data sources:', err);
    } finally {
      setLoading(false);
    }
  };

  // Sync stock list
  const handleSyncStockList = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const response = await fetch(`${API_URL}/market/sync`, { method: 'POST' });
      const result = await response.json();
      setSyncMessage(`${result.message} - Added: ${result.added}, Updated: ${result.updated}`);
      if (result.status === 'success') {
        fetchStockList();
      }
    } catch (err) {
      setSyncMessage('同步失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setSyncing(false);
    }
  };

  // Clear all stock data
  const handleClearAllStockData = async () => {
    if (!window.confirm('确定要清空所有股票数据吗？此操作不可恢复！')) {
      return;
    }
    setClearing(true);
    setClearMessage(null);
    try {
      const response = await fetch(`${API_URL}/market/data/all`, { method: 'DELETE' });
      const result = await response.json();
      if (response.ok) {
        setClearMessage(`已清空 ${result.deleted_count} 条股票数据`);
        fetchStockList();
      } else {
        setClearMessage('清空失败: ' + (result.detail || '未知错误'));
      }
    } catch (err) {
      setClearMessage('清空失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setClearing(false);
    }
  };

  // Clear single stock data
  const handleClearSingleStockData = async (symbol: string) => {
    if (!window.confirm(`确定要清空 ${symbol} 的所有数据吗？`)) {
      return;
    }
    setClearingStock(symbol);
    try {
      const response = await fetch(`${API_URL}/market/data/${symbol}`, { method: 'DELETE' });
      const result = await response.json();
      if (response.ok) {
        setSnackbar({ open: true, message: `已清空 ${symbol} 的 ${result.deleted_count} 条数据`, severity: 'success' });
        fetchStockList(stockPagination.page, stockSearch, stockExchange);
      } else {
        setSnackbar({ open: true, message: '清空失败: ' + (result.detail || '未知错误'), severity: 'error' });
      }
    } catch (err) {
      setSnackbar({ open: true, message: '清空失败: ' + (err instanceof Error ? err.message : '未知错误'), severity: 'error' });
    } finally {
      setClearingStock(null);
    }
  };

  // Fetch stock suggestions for autocomplete
  const fetchStockSuggestions = async (q: string) => {
    if (!q || q.length < 1) {
      setStockSuggestions([]);
      return;
    }
    try {
      const response = await fetch(`${API_URL}/market/search?q=${encodeURIComponent(q)}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        setStockSuggestions(data);
      }
    } catch (err) {
      console.error('Failed to fetch stock suggestions:', err);
    }
  };

  // Fetch stock list
  const fetchStockList = async (page: number = 1, search: string = '', exchange: string = '') => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: '50',
      });
      if (search) params.append('search', search);
      if (exchange) params.append('exchange', exchange);

      const response = await fetch(`${API_URL}/market/list?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setStockList(data.data);
        setStockPagination(data.pagination);
      }
    } catch (err) {
      console.error('Failed to fetch stock list:', err);
    }
  };

  // Fetch data quality
  const fetchDataQuality = async (page: number = 1) => {
    try {
      const [summaryRes, anomaliesRes] = await Promise.all([
        fetch(`${API_URL}/market/quality?days=30`),
        fetch(`${API_URL}/market/quality/anomalies?days=30&page=${page}&page_size=50`)
      ]);

      if (summaryRes.ok) {
        setQualitySummary(await summaryRes.json());
      }
      if (anomaliesRes.ok) {
        const anomaliesData = await anomaliesRes.json();
        setAnomalies(anomaliesData.data);
        setAnomalyPagination(anomaliesData.pagination);
      }
    } catch (err) {
      console.error('Failed to fetch data quality:', err);
    }
  };

  // Batch fetch
  const handleBatchFetch = async () => {
    setBatchLoading(true);
    setBatchResult(null);
    try {
      const symbols = batchSymbols.split(',').map(s => s.trim()).filter(s => s);
      const response = await fetch(`${API_URL}/market/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols,
          start_date: batchStartDate.replace(/-/g, ''),
          end_date: batchEndDate.replace(/-/g, ''),
          source: 'baostock'
        })
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || '批量获取失败');
      }
      const msg = symbols.length === 0
        ? `采集全部A股 (${result.success}/${result.total} 成功)`
        : `Batch fetch completed: ${result.success}/${result.total} successful`;
      setBatchResult({ ...result, message: msg });
    } catch (err) {
      setBatchResult({ message: '批量获取失败: ' + (err instanceof Error ? err.message : '未知错误'), success: 0, failed: 0 });
    } finally {
      setBatchLoading(false);
    }
  };

  // Batch all A-shares with progress tracking
  const handleBatchAll = async () => {
    setBatchLoading(true);
    setBatchResult(null);
    setBatchJobStatus(null);
    try {
      // Calculate last trading day
      const today = new Date();
      let lastTradingDay = new Date(today);
      for (let i = 0; i < 7; i++) {
        lastTradingDay = new Date(today);
        lastTradingDay.setDate(today.getDate() - i);
        if (lastTradingDay.getDay() !== 0 && lastTradingDay.getDay() !== 6) break;
      }
      const tradingDay = lastTradingDay.toISOString().slice(0, 10).replace(/-/g, '');

      const response = await fetch(`${API_URL}/market/batch-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: [],
          start_date: tradingDay,
          end_date: tradingDay,
          source: 'baostock'
        })
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || '启动批量采集失败');
      }

      setBatchJobId(result.job_id);
      setBatchJobStatus({
        status: 'started',
        total: result.total,
        current: 0,
        success: 0,
        failed: 0,
        progress: 0
      });

      // Start polling for status
      pollBatchJobStatus(result.job_id);

    } catch (err) {
      setBatchResult({ message: '启动批量采集失败: ' + (err instanceof Error ? err.message : '未知错误'), success: 0, failed: 0 });
      setBatchLoading(false);
    }
  };

  // Poll batch job status
  const pollBatchJobStatus = (jobId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/market/batch-all/${jobId}/status`);
        const status = await response.json();

        setBatchJobStatus(status);

        if (status.status === 'completed' || status.status === 'failed') {
          clearInterval(pollInterval);
          setBatchLoading(false);
          if (status.status === 'completed') {
            setBatchResult({
              message: `采集全部A股完成: ${status.success}/${status.total} 成功`,
              success: status.success,
              failed: status.failed,
              total: status.total
            });
          } else {
            setBatchResult({
              message: `采集失败: ${status.error}`,
              success: status.success,
              failed: status.failed
            });
          }
        }
      } catch (err) {
        console.error('Failed to poll batch job status:', err);
        clearInterval(pollInterval);
        setBatchLoading(false);
      }
    }, 2000); // Poll every 2 seconds
  };

  // Clear batch job cache
  const handleClearBatchCache = async () => {
    if (!window.confirm('确定要清除所有批量采集任务缓存吗？')) {
      return;
    }
    setClearingCache(true);
    try {
      const response = await fetch(`${API_URL}/market/batch-all/cache`, { method: 'DELETE' });
      const result = await response.json();
      if (response.ok) {
        setBatchResult({ message: result.message, success: 0, failed: 0 });
        setBatchJobStatus(null);
        setBatchJobId(null);
      } else {
        setBatchResult({ message: '清除缓存失败: ' + (result.detail || '未知错误'), success: 0, failed: 0 });
      }
    } catch (err) {
      setBatchResult({ message: '清除缓存失败: ' + (err instanceof Error ? err.message : '未知错误'), success: 0, failed: 0 });
    } finally {
      setClearingCache(false);
    }
  };

  // Config functions
  const fetchConfigs = async () => {
    try {
      const response = await fetch(`${API_URL}/config`);
      if (response.ok) {
        const data = await response.json();
        setConfigs(data.items);
        setConfigCategories(data.categories);
      }
    } catch (err) {
      console.error('Failed to fetch configs:', err);
    }
  };

  const handleEditConfig = (config: ConfigItem) => {
    setEditingConfig(config);
    setEditValue(config.value);
    setEditDialogOpen(true);
  };

  const handleSaveConfig = async () => {
    if (!editingConfig) return;

    try {
      const response = await fetch(`${API_URL}/config/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: editingConfig.key,
          value: editingConfig.value_type === 'number' ? Number(editValue) : editValue
        })
      });

      const result = await response.json();
      if (result.success) {
        setSnackbar({ open: true, message: `配置 ${editingConfig.key} 已更新（临时生效，仅当前会话有效）`, severity: 'success' });
        fetchConfigs();
      } else {
        setSnackbar({ open: true, message: result.message || '更新失败', severity: 'error' });
      }
    } catch (err) {
      setSnackbar({ open: true, message: '更新失败: ' + (err instanceof Error ? err.message : '未知错误'), severity: 'error' });
    }

    setEditDialogOpen(false);
  };

  // Task functions
  const fetchTasks = async () => {
    setTaskLoading(true);
    try {
      const response = await fetch(`${API_URL}/tasks/`);
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks);
      }
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setTaskLoading(false);
    }
  };

  const fetchRecentExecutions = async () => {
    try {
      const response = await fetch(`${API_URL}/tasks/executions/recent`);
      if (response.ok) {
        const data = await response.json();
        setRecentExecutions(data.executions || []);
      }
    } catch (err) {
      console.error('Failed to fetch recent executions:', err);
    }
  };

  const handleExecuteTask = async (taskName: string) => {
    setExecutingTask(taskName);
    try {
      const response = await fetch(`${API_URL}/tasks/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_name: taskName })
      });
      const result = await response.json();
      if (result.success) {
        setSnackbar({ open: true, message: `任务已触发: ${result.message}`, severity: 'success' });
        fetchRecentExecutions();
      } else {
        setSnackbar({ open: true, message: result.message || '执行失败', severity: 'error' });
      }
    } catch (err) {
      setSnackbar({ open: true, message: '执行失败: ' + (err instanceof Error ? err.message : '未知错误'), severity: 'error' });
    } finally {
      setExecutingTask(null);
    }
  };

  // Fetch active batch jobs on page load to resume progress
  const fetchActiveBatchJobs = async () => {
    try {
      const response = await fetch(`${API_URL}/market/batch-all/active`);
      if (response.ok) {
        const data = await response.json();
        if (data.active_jobs && data.active_jobs.length > 0) {
          // Resume the most recent active job
          const job = data.active_jobs[0];
          setBatchJobId(job.job_id);
          setBatchJobStatus({
            status: job.status,
            total: job.total,
            current: job.current,
            success: job.success,
            failed: job.failed,
            progress: job.total > 0 ? Math.round(job.current / job.total * 100) : 0
          });
          setBatchLoading(job.status === 'running' || job.status === 'pending');
          // Start polling
          pollBatchJobStatus(job.job_id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch active batch jobs:', err);
      setBatchLoading(false);
    }
  };

  useEffect(() => {
    fetchDataSources();
    fetchStockList();
    fetchDataQuality();
    fetchConfigs();
    fetchTasks();
    fetchRecentExecutions();
    fetchActiveBatchJobs();
  }, []);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const filteredConfigs = selectedCategory === 'all'
    ? configs
    : configs.filter(c => c.category === selectedCategory);

  const getTaskStatusChip = (status: string | null) => {
    switch (status) {
      case 'SUCCESS':
        return <Chip label="成功" color="success" size="small" />;
      case 'FAILURE':
        return <Chip label="失败" color="error" size="small" />;
      case 'PENDING':
      case 'STARTED':
        return <Chip label="执行中" color="info" size="small" />;
      default:
        return <Chip label="未执行" size="small" />;
    }
  };

  return (
    <Box>

      <Tabs value={tabValue} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider', mb: 0 }}>
        <Tab label="股票列表" />
        <Tab label="数据质量" />
        <Tab label="批量采集" />
        <Tab label="配置管理" />
        <Tab label="任务调度" />
        <Tab label="数据源状态" />
      </Tabs>

      {/* 股票列表 */}
      <TabPanel value={tabValue} index={0}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h6">股票列表</Typography>
                <Tooltip title="刷新列表">
                  <IconButton onClick={() => fetchStockList(1, stockSearch, stockExchange)} size="small">
                    <RefreshIcon />
                  </IconButton>
                </Tooltip>
              </Box>
              <Stack direction="row" spacing={1}>
                <Button
                  startIcon={clearing ? <CircularProgress size={20} /> : <DeleteIcon />}
                  onClick={handleClearAllStockData}
                  disabled={clearing}
                  variant="outlined"
                  color="error"
                >
                  {clearing ? '清空中...' : '清空股票数据'}
                </Button>
                <Button
                  startIcon={syncing ? <CircularProgress size={20} /> : <SyncIcon />}
                  onClick={handleSyncStockList}
                  disabled={syncing}
                  variant="contained"
                >
                  {syncing ? '同步中...' : '同步股票列表'}
                </Button>
              </Stack>
            </Box>
            {syncMessage && (
              <Alert severity="info" sx={{ mb: 2 }}>
                {syncMessage}
              </Alert>
            )}
            {clearMessage && (
              <Alert severity={clearMessage.includes('失败') ? 'error' : 'success'} sx={{ mb: 2 }}>
                {clearMessage}
              </Alert>
            )}
            {/* Search and Filter */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <Autocomplete
                freeSolo
                size="small"
                options={stockSuggestions}
                getOptionLabel={(option) =>
                  typeof option === 'string' ? option : (option.search_key ?? `${option.code} ${option.name}`)
                }
                inputValue={stockSearch}
                onInputChange={(_event, newValue) => {
                  setStockSearch(newValue);
                  fetchStockSuggestions(newValue);
                }}
                onChange={(_event, value) => {
                  if (value && typeof value !== 'string') {
                    setStockSearch(value.code);
                    fetchStockList(1, value.code, stockExchange);
                  }
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    fetchStockList(1, stockSearch, stockExchange);
                  }
                }}
                renderInput={(params) => (
                  <TextField
                    placeholder="搜索代码或名称"
                    id={params.id}
                    disabled={params.disabled}
                    fullWidth={params.fullWidth}
                    size={params.size}
                    sx={{ width: 280 }}
                    slotProps={{
                      inputLabel: params.slotProps.inputLabel,
                      htmlInput: params.slotProps.htmlInput,
                      input: {
                        ...params.slotProps.input,
                        endAdornment: (
                          <>
                            {params.slotProps.input.endAdornment}
                            <InputAdornment position="end">
                              <IconButton onClick={() => fetchStockList(1, stockSearch, stockExchange)} edge="end">
                                <SearchIcon />
                              </IconButton>
                            </InputAdornment>
                          </>
                        ),
                      },
                    }}
                  />
                )}
              />
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>交易所</InputLabel>
                <Select
                  value={stockExchange}
                  onChange={(e) => {
                    setStockExchange(e.target.value);
                    fetchStockList(1, stockSearch, e.target.value);
                  }}
                  label="交易所"
                >
                  <MenuItem value="">全部</MenuItem>
                  <MenuItem value="SH">上海</MenuItem>
                  <MenuItem value="SZ">深圳</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>代码</TableCell>
                    <TableCell>名称</TableCell>
                    <TableCell>交易所</TableCell>
                    <TableCell align="right">收盘价</TableCell>
                    <TableCell align="right">涨跌幅</TableCell>
                    <TableCell align="right">成交量</TableCell>
                    <TableCell align="right">成交额</TableCell>
                    <TableCell align="right">振幅</TableCell>
                    <TableCell align="right">量比</TableCell>
                    <TableCell align="center">操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stockList.map((stock) => (
                    <TableRow key={stock.symbol}>
                      <TableCell>{stock.code}</TableCell>
                      <TableCell>{stock.name}</TableCell>
                      <TableCell>{stock.exchange}</TableCell>
                      <TableCell align="right">{stock.latest?.close?.toFixed(2) || '-'}</TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: (stock.latest?.pct_change ?? 0) >= 0 ? 'error.main' : 'success.main' }}>
                            {stock.latest?.pct_change != null ? `${stock.latest.pct_change.toFixed(2)}%` : '-'}
                            {stock.latest?.limit_status === 'up' && <Chip label="涨停" color="error" size="small" sx={{ height: 18, fontSize: '0.7rem' }} />}
                            {stock.latest?.limit_status === 'down' && <Chip label="跌停" color="success" size="small" sx={{ height: 18, fontSize: '0.7rem' }} />}
                          </Box>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            <Box component="span" sx={{ color: 'error.main' }}>{stock.latest?.next_limit_up != null ? `↑${stock.latest.next_limit_up}` : ''}</Box>
                            {' / '}
                            <Box component="span" sx={{ color: 'success.main' }}>{stock.latest?.next_limit_down != null ? `↓${stock.latest.next_limit_down}` : ''}</Box>
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right">{stock.latest?.volume ? (stock.latest.volume / 1000000).toFixed(2) + '万手' : '-'}</TableCell>
                      <TableCell align="right">{stock.latest?.amount ? (stock.latest.amount / 100000000).toFixed(2) + '亿' : '-'}</TableCell>
                      <TableCell align="right">{stock.latest?.amplitude != null ? stock.latest.amplitude.toFixed(2) + '%' : '-'}</TableCell>
                      <TableCell align="right">{stock.latest?.volume_ratio != null ? stock.latest.volume_ratio.toFixed(2) : '-'}</TableCell>
                      <TableCell align="center">
                        <Tooltip title="清空该股票数据">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleClearSingleStockData(stock.symbol)}
                            disabled={clearingStock === stock.symbol}
                          >
                            {clearingStock === stock.symbol ? <CircularProgress size={18} /> : <DeleteIcon />}
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {/* Pagination */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                共 {stockPagination.total} 条记录，第 {stockPagination.page}/{stockPagination.total_pages} 页
              </Typography>
              <Pagination
                count={stockPagination.total_pages}
                page={stockPagination.page}
                onChange={(_, p) => fetchStockList(p, stockSearch, stockExchange)}
                color="primary"
                size="small"
              />
            </Box>
          </CardContent>
        </Card>
      </TabPanel>

      {/* 数据质量 */}
      <TabPanel value={tabValue} index={1}>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">数据质量概览 (近30天)</Typography>
              <Button startIcon={<RefreshIcon />} onClick={() => void fetchDataQuality()}>
                刷新
              </Button>
            </Box>
            {qualitySummary && (
              <Box sx={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
                {Object.entries(qualitySummary.anomalies_by_type || {}).map(([type, count]) => (
                  <Chip
                    key={type}
                    icon={<WarningIcon />}
                    label={`${type}: ${count}`}
                    color="warning"
                    variant="outlined"
                    sx={{ m: 0.5 }}
                  />
                ))}
                <Chip
                  icon={<CheckCircleIcon />}
                  label={`总异常: ${qualitySummary.total_unresolved || 0}`}
                  color={qualitySummary.total_unresolved > 0 ? 'warning' : 'success'}
                  sx={{ m: 0.5 }}
                />
              </Box>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>异常记录</Typography>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>股票</TableCell>
                    <TableCell>日期</TableCell>
                    <TableCell>类型</TableCell>
                    <TableCell>字段</TableCell>
                    <TableCell>实际值</TableCell>
                    <TableCell>说明</TableCell>
                    <TableCell>状态</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {anomalies.map((anomaly) => (
                    <TableRow key={anomaly.id}>
                      <TableCell>{anomaly.symbol}</TableCell>
                      <TableCell>{anomaly.trade_date}</TableCell>
                      <TableCell>{anomaly.anomaly_type}</TableCell>
                      <TableCell>{anomaly.field_name}</TableCell>
                      <TableCell>{anomaly.actual_value}</TableCell>
                      <TableCell>{anomaly.message}</TableCell>
                      <TableCell>
                        <Chip
                          label={anomaly.resolved ? '已解决' : '待处理'}
                          color={anomaly.resolved ? 'success' : 'warning'}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {anomalies.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} align="center">暂无异常记录</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            {/* Pagination */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                共 {anomalyPagination.total} 条记录，第 {anomalyPagination.page}/{anomalyPagination.total_pages} 页
              </Typography>
              <Pagination
                count={anomalyPagination.total_pages}
                page={anomalyPagination.page}
                onChange={(_, p) => fetchDataQuality(p)}
                color="primary"
                size="small"
              />
            </Box>
          </CardContent>
        </Card>
      </TabPanel>

      {/* 批量采集 */}
      <TabPanel value={tabValue} index={2}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>批量采集股票数据</Typography>

            {/* 采集全部A股区域 */}
            <Card
              variant="outlined"
              sx={{
                mb: 3,
                bgcolor: 'action.hover',
                borderColor: 'divider',
              }}
            >
              <CardContent>
                <Typography variant="subtitle1" gutterBottom color="text.primary">
                  一键采集全部A股
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  自动从数据库获取全部5500+只A股，分批采集并显示进度
                </Typography>

                {/* 进度条 */}
                {batchJobStatus && batchJobStatus.status === 'running' && (
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2">
                        采集中... {batchJobStatus.current}/{batchJobStatus.total} 只
                      </Typography>
                      <Typography variant="body2" color="primary">
                        {batchJobStatus.progress}%
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={batchJobStatus.progress}
                      sx={{ height: 10, borderRadius: 5 }}
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                      <Typography variant="caption" color="success">
                        成功: {batchJobStatus.success}
                      </Typography>
                      <Typography variant="caption" color="error">
                        失败: {batchJobStatus.failed}
                      </Typography>
                    </Box>
                  </Box>
                )}

                <Stack direction="row" spacing={2}>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={batchLoading ? <CircularProgress size={20} color="inherit" /> : <PlayCircleIcon />}
                    onClick={handleBatchAll}
                    disabled={batchLoading}
                  >
                    {batchLoading && batchJobStatus?.status === 'running' ? '采集中...' : '采集全部A股'}
                  </Button>
                  <Button
                    variant="outlined"
                    color="warning"
                    startIcon={clearingCache ? <CircularProgress size={20} /> : <DeleteIcon />}
                    onClick={handleClearBatchCache}
                    disabled={clearingCache}
                  >
                    {clearingCache ? '清除中...' : '清除采集缓存'}
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            <Divider sx={{ my: 3 }} />

            <Typography variant="subtitle1" gutterBottom>
              自定义批量采集
            </Typography>
            <Stack spacing={2} sx={{ mb: 3 }}>
              <TextField
                label="股票代码列表"
                value={batchSymbols}
                onChange={(e) => setBatchSymbols(e.target.value)}
                helperText="多个代码用逗号分隔，如：sh600000, sz000001"
                size="small"
                fullWidth
              />
              <Stack direction="row" spacing={2}>
                <TextField
                  label="开始日期"
                  type="date"
                  value={batchStartDate}
                  onChange={(e) => setBatchStartDate(e.target.value)}
                  size="small"
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  label="结束日期"
                  type="date"
                  value={batchEndDate}
                  onChange={(e) => setBatchEndDate(e.target.value)}
                  size="small"
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Stack>
              <Stack direction="row" spacing={2}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={batchLoading && !batchJobStatus ? <CircularProgress size={20} /> : <PlayCircleIcon />}
                  onClick={handleBatchFetch}
                  disabled={batchLoading}
                >
                  开始采集
                </Button>
                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={batchLoading && !batchJobStatus ? <CircularProgress size={20} /> : <SyncIcon />}
                  onClick={async () => {
                    setBatchLoading(true);
                    try {
                      const today = new Date();
                      let lastTradingDay = new Date(today);
                      for (let i = 0; i < 7; i++) {
                        lastTradingDay = new Date(today);
                        lastTradingDay.setDate(today.getDate() - i);
                        if (lastTradingDay.getDay() !== 0 && lastTradingDay.getDay() !== 6) break;
                      }
                      const tradingDay = lastTradingDay.toISOString().slice(0, 10).replace(/-/g, '');

                      const symbols = batchSymbols.split(',').map(s => s.trim()).filter(s => s);
                      const response = await fetch(`${API_URL}/market/batch`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          symbols,
                          start_date: tradingDay,
                          end_date: tradingDay,
                          source: 'baostock'
                        })
                      });
                      const result = await response.json();
                      setBatchResult({ ...result, message: `采集当天(${tradingDay}): ${result.success}/${result.total} 成功` });
                    } catch (err) {
                      setBatchResult({ message: '采集失败: ' + (err instanceof Error ? err.message : '未知错误'), success: 0, failed: 0 });
                    } finally {
                      setBatchLoading(false);
                    }
                  }}
                  disabled={batchLoading}
                >
                  采集当天
                </Button>
              </Stack>
            </Stack>
            {batchResult && (
              <Alert severity={batchResult.failed > 0 ? 'warning' : 'success'} sx={{ mt: 2 }}>
                {batchResult.message}
              </Alert>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <StorageIcon sx={{ fontSize: 18 }} />
              批量采集会为每个股票创建分布式锁，防止重复采集。
            </Typography>
          </CardContent>
        </Card>
      </TabPanel>

      {/* 配置管理 */}
      <TabPanel value={tabValue} index={3}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">系统配置</Typography>
              <Stack direction="row" spacing={1}>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel>分类</InputLabel>
                  <Select
                    value={selectedCategory}
                    label="分类"
                    onChange={(e) => setSelectedCategory(e.target.value)}
                  >
                    <MenuItem value="all">全部</MenuItem>
                    {configCategories.map(cat => (
                      <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button startIcon={<RefreshIcon />} onClick={fetchConfigs}>
                  刷新
                </Button>
              </Stack>
            </Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              下方配置当前为默认值。如需永久修改，请在 .env 文件中添加对应配置项（参考以下格式），然后重启服务使配置生效。
            </Alert>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>配置项</TableCell>
                    <TableCell>当前值</TableCell>
                    <TableCell>默认值</TableCell>
                    <TableCell>描述</TableCell>
                    <TableCell>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredConfigs.map((config) => (
                    <TableRow key={config.key}>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{config.key}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', maxWidth: 200 }}>
                        {config.is_secret ? config.value : config.value}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{config.default}</TableCell>
                      <TableCell>{config.description}</TableCell>
                      <TableCell>
                        <IconButton size="small" onClick={() => handleEditConfig(config)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </TabPanel>

      {/* 任务调度 */}
      <TabPanel value={tabValue} index={4}>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">定时任务</Typography>
              <Button startIcon={<RefreshIcon />} onClick={() => { fetchTasks(); fetchRecentExecutions(); }}>
                刷新
              </Button>
            </Box>
            {taskLoading ? (
              <CircularProgress />
            ) : (
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>任务名称</TableCell>
                      <TableCell>调度周期</TableCell>
                      <TableCell>队列</TableCell>
                      <TableCell>上次执行</TableCell>
                      <TableCell>状态</TableCell>
                      <TableCell>操作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tasks.map((task) => (
                      <TableRow key={task.task_name}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>{task.display_name}</Typography>
                          <Typography variant="caption" color="text.secondary">{task.task_name}</Typography>
                        </TableCell>
                        <TableCell>
                          <Chip icon={<ScheduleIcon />} label={task.schedule} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>{task.queue}</TableCell>
                        <TableCell>{task.last_run || '-'}</TableCell>
                        <TableCell>{getTaskStatusChip(task.last_status)}</TableCell>
                        <TableCell>
                          <Button
                            size="small"
                            startIcon={executingTask === task.task_name ? <CircularProgress size={16} /> : <PlayArrowIcon />}
                            onClick={() => handleExecuteTask(task.task_name)}
                            disabled={executingTask === task.task_name}
                          >
                            执行
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>最近执行记录</Typography>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>任务</TableCell>
                    <TableCell>执行ID</TableCell>
                    <TableCell>状态</TableCell>
                    <TableCell>完成时间</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentExecutions.slice(0, 10).map((exec, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{exec.display_name || exec.task_name}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{exec.task_id}</TableCell>
                      <TableCell>{getTaskStatusChip(exec.status)}</TableCell>
                      <TableCell>{exec.date_done || '-'}</TableCell>
                    </TableRow>
                  ))}
                  {recentExecutions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} align="center">暂无执行记录</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </TabPanel>

      {/* 数据源状态 */}
      <TabPanel value={tabValue} index={5}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">数据源状态</Typography>
              <Button startIcon={<RefreshIcon />} onClick={fetchDataSources} disabled={loading}>
                刷新
              </Button>
            </Box>
            {loading ? (
              <CircularProgress />
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>数据源</TableCell>
                      <TableCell>ID</TableCell>
                      <TableCell>状态</TableCell>
                      <TableCell>描述</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {dataSources.map((ds) => (
                      <TableRow key={ds.id}>
                        <TableCell>{ds.name}</TableCell>
                        <TableCell>{ds.id}</TableCell>
                        <TableCell>
                          <Chip
                            icon={ds.available ? <CloudDoneIcon /> : <CloudOffIcon />}
                            label={ds.available ? '可用' : '不可用'}
                            color={ds.available ? 'success' : 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{ds.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      </TabPanel>

      {/* Edit Config Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>编辑配置</DialogTitle>
        <DialogContent>
          {editingConfig && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography variant="body2">
                <strong>配置项:</strong> {editingConfig.key}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {editingConfig.description}
              </Typography>
              <TextField
                label="值"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                type={editingConfig.value_type === 'number' ? 'number' : 'text'}
                fullWidth
                disabled={editingConfig.is_secret}
              />
              <Alert severity="warning">
                此修改仅在当前服务运行期间有效，重启后会恢复为默认值。如需永久修改，请编辑 .env 文件。
              </Alert>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>取消</Button>
          <Button onClick={handleSaveConfig} variant="contained" startIcon={<SaveIcon />}>
            保存
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
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
