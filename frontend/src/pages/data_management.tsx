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
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  Alert,
  CircularProgress,
  TextField,
  Stack,
  Paper,
  IconButton,
  Tooltip,
  Badge,
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
} from '@mui/icons-material';

const API_URL = 'http://localhost:8000/api/v1';

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
  exchange: string;
  status: string;
  listing_date: string | null;
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

export const DataManagementPage: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [stockList, setStockList] = useState<StockInfo[]>([]);
  const [anomalies, setAnomalies] = useState<DataQualityAnomaly[]>([]);
  const [qualitySummary, setQualitySummary] = useState<any>(null);

  // Batch fetch states
  const [batchSymbols, setBatchSymbols] = useState('sh600000, sz000001');
  const [batchStartDate, setBatchStartDate] = useState('20240101');
  const [batchEndDate, setBatchEndDate] = useState('20240419');
  const [batchResult, setBatchResult] = useState<any>(null);
  const [batchLoading, setBatchLoading] = useState(false);

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
      setSyncMessage('同步失败: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSyncing(false);
    }
  };

  // Fetch stock list
  const fetchStockList = async () => {
    try {
      const response = await fetch(`${API_URL}/market/list?limit=50`);
      if (response.ok) {
        const data = await response.json();
        setStockList(data);
      }
    } catch (err) {
      console.error('Failed to fetch stock list:', err);
    }
  };

  // Fetch data quality
  const fetchDataQuality = async () => {
    try {
      const [summaryRes, anomaliesRes] = await Promise.all([
        fetch(`${API_URL}/market/quality?days=30`),
        fetch(`${API_URL}/market/quality/anomalies?days=30&limit=100`)
      ]);

      if (summaryRes.ok) {
        setQualitySummary(await summaryRes.json());
      }
      if (anomaliesRes.ok) {
        setAnomalies(await anomaliesRes.json());
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
          start_date: batchStartDate,
          end_date: batchEndDate,
          source: 'baostock'
        })
      });
      const result = await response.json();
      setBatchResult(result);
    } catch (err) {
      setBatchResult({ message: '批量获取失败: ' + (err instanceof Error ? err.message : 'Unknown error'), success: 0, failed: 0 });
    } finally {
      setBatchLoading(false);
    }
  };

  useEffect(() => {
    fetchDataSources();
    fetchStockList();
    fetchDataQuality();
  }, []);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        数据管理
      </Typography>

      <Tabs value={tabValue} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="数据源状态" />
        <Tab label="股票列表" />
        <Tab label="数据质量" />
        <Tab label="批量采集" />
      </Tabs>

      {/* 数据源状态 */}
      <TabPanel value={tabValue} index={0}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">数据源状态</Typography>
              <Button
                startIcon={<RefreshIcon />}
                onClick={fetchDataSources}
                disabled={loading}
              >
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

      {/* 股票列表 */}
      <TabPanel value={tabValue} index={1}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">股票列表</Typography>
              <Button
                startIcon={syncing ? <CircularProgress size={20} /> : <SyncIcon />}
                onClick={handleSyncStockList}
                disabled={syncing}
                variant="contained"
              >
                {syncing ? '同步中...' : '同步股票列表'}
              </Button>
            </Box>

            {syncMessage && (
              <Alert severity="info" sx={{ mb: 2 }}>
                {syncMessage}
              </Alert>
            )}

            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>代码</TableCell>
                    <TableCell>名称</TableCell>
                    <TableCell>交易所</TableCell>
                    <TableCell>状态</TableCell>
                    <TableCell>上市日期</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stockList.slice(0, 20).map((stock) => (
                    <TableRow key={stock.symbol}>
                      <TableCell>{stock.code}</TableCell>
                      <TableCell>{stock.name}</TableCell>
                      <TableCell>{stock.exchange}</TableCell>
                      <TableCell>
                        <Chip
                          label={stock.status === 'active' ? '上市' : stock.status}
                          color={stock.status === 'active' ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{stock.listing_date || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
              显示 {Math.min(20, stockList.length)} / {stockList.length} 条记录
            </Typography>
          </CardContent>
        </Card>
      </TabPanel>

      {/* 数据质量 */}
      <TabPanel value={tabValue} index={2}>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">数据质量概览 (近30天)</Typography>
              <Button startIcon={<RefreshIcon />} onClick={fetchDataQuality}>
                刷新
              </Button>
            </Box>

            {qualitySummary && (
              <Stack direction="row" spacing={2} flexWrap="wrap">
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
              </Stack>
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
                  {anomalies.slice(0, 20).map((anomaly) => (
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
                      <TableCell colSpan={7} align="center">
                        暂无异常记录
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </TabPanel>

      {/* 批量采集 */}
      <TabPanel value={tabValue} index={3}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>批量采集股票数据</Typography>

            <Stack spacing={2} sx={{ mb: 3 }}>
              <TextField
                label="股票代码列表"
                value={batchSymbols}
                onChange={(e) => setBatchSymbols(e.target.value)}
                placeholder="sh600000, sz000001, sz000002"
                helperText="用逗号分隔多个股票代码"
                size="small"
              />
              <Stack direction="row" spacing={2}>
                <TextField
                  label="开始日期"
                  value={batchStartDate}
                  onChange={(e) => setBatchStartDate(e.target.value)}
                  placeholder="YYYYMMDD"
                  size="small"
                />
                <TextField
                  label="结束日期"
                  value={batchEndDate}
                  onChange={(e) => setBatchEndDate(e.target.value)}
                  placeholder="YYYYMMDD"
                  size="small"
                />
              </Stack>
              <Button
                variant="contained"
                startIcon={batchLoading ? <CircularProgress size={20} /> : <PlayCircleIcon />}
                onClick={handleBatchFetch}
                disabled={batchLoading}
              >
                {batchLoading ? '采集中...' : '开始采集'}
              </Button>
            </Stack>

            {batchResult && (
              <Alert
                severity={batchResult.failed > 0 ? 'warning' : 'success'}
                sx={{ mt: 2 }}
              >
                {batchResult.message}
              </Alert>
            )}

            <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
              <StorageIcon sx={{ fontSize: 16, verticalAlign: 'middle', mr: 0.5 }} />
              批量采集会为每个股票创建分布式锁，防止重复采集。
              采集结果可通过行情概览页面查看。
            </Typography>
          </CardContent>
        </Card>
      </TabPanel>
    </Box>
  );
};
