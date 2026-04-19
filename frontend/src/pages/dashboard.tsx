import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  Button,
  Box,
  Stack,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Tooltip,
  Autocomplete,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AccountBalance as AccountBalanceIcon,
  PlayCircle as PlayCircleIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon,
  CloudDone as CloudDoneIcon,
  CloudOff as CloudOffIcon,
} from '@mui/icons-material';
import ReactECharts from 'echarts-for-react';

const API_URL = 'http://localhost:8000/api/v1';

interface StockData {
  symbol: string;
  trade_date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  pct_change: number;
}

interface DataSource {
  name: string;
  id: string;
  available: boolean;
  description: string;
}

interface StockOption {
  code: string;
  name: string;
  search_key: string;
}

export const DashboardPage: React.FC = () => {
  const [symbol, setSymbol] = useState('sh600000');
  const [stockData, setStockData] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [selectedSource, setSelectedSource] = useState('baostock');
  const [lastFetchMessage, setLastFetchMessage] = useState<string | null>(null);
  const [stockOptions, setStockOptions] = useState<StockOption[]>([]);
  const [selectedStock, setSelectedStock] = useState<StockOption | null>(null);
  const [searchInput, setSearchInput] = useState('');

  // 获取数据源列表
  const fetchDataSources = async () => {
    try {
      const response = await fetch(`${API_URL}/market/sources`);
      if (response.ok) {
        const data = await response.json();
        setDataSources(data.sources);
      }
    } catch (err) {
      console.error('Failed to fetch data sources:', err);
    }
  };

  // 搜索股票
  const searchStocks = async (query: string) => {
    if (!query || query.length < 1) {
      setStockOptions([]);
      return;
    }
    try {
      const response = await fetch(`${API_URL}/market/search?q=${encodeURIComponent(query)}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        setStockOptions(data);
      }
    } catch (err) {
      console.error('Failed to search stocks:', err);
    }
  };

  // 获取已有数据
  const fetchStockData = async (stockSymbol: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/market/${stockSymbol}?limit=100`);
      if (!response.ok) {
        throw new Error('获取数据失败');
      }
      const data = await response.json();
      setStockData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取数据失败');
      setStockData([]);
    } finally {
      setLoading(false);
    }
  };

  // 从数据源获取新数据
  const handleFetchData = async () => {
    if (!symbol) {
      setError('请先选择或输入股票代码');
      return;
    }
    setFetching(true);
    setError(null);
    setLastFetchMessage(null);
    try {
      const response = await fetch(
        `${API_URL}/market/fetch/${symbol}?start_date=20240101&end_date=20240418&source=${selectedSource}`,
        { method: 'POST' }
      );
      const result = await response.json();
      setLastFetchMessage(`${result.source}: ${result.message} (${result.records_count} 条)`);

      if (result.records_count > 0) {
        fetchStockData(symbol);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取数据失败');
    } finally {
      setFetching(false);
    }
  };

  // 处理股票选择
  const handleStockSelect = (_event: any, newValue: StockOption | null) => {
    if (newValue) {
      setSelectedStock(newValue);
      // 根据代码判断交易所前缀
      const code = newValue.code;
      if (code.startsWith('6')) {
        setSymbol(`sh${code}`);
      } else {
        setSymbol(`sz${code}`);
      }
    }
  };

  // 处理搜索输入
  const handleSearchChange = (event: React.SyntheticEvent, value: string) => {
    setSearchInput(value);
    searchStocks(value);
  };

  useEffect(() => {
    fetchDataSources();
    fetchStockData(symbol);
  }, []);

  // 计算统计数据
  const latestData = stockData.length > 0 ? stockData[0] : null;
  const prevData = stockData.length > 1 ? stockData[1] : null;

  const todayChange = latestData && prevData
    ? ((latestData.close - prevData.close) / prevData.close * 100).toFixed(2)
    : '0.00';

  const chartOption = {
    title: { text: `${symbol} K线走势` },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
    },
    grid: { left: '10%', right: '10%', bottom: '15%', top: '15%' },
    xAxis: {
      type: 'category',
      data: stockData.map(d => d.trade_date).reverse(),
      axisLabel: { rotate: 45 },
    },
    yAxis: { scale: true, boundaryGap: ['10%', '10%'] },
    series: [
      {
        type: 'candlestick',
        data: stockData.map(d => [d.open, d.close, d.low, d.high]).reverse(),
        itemStyle: {
          color: '#ef0428',
          color0: '#00c853',
          borderColor: '#ef0428',
          borderColor0: '#00c853',
        },
      },
    ],
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', start: 0, end: 100 },
    ],
  };

  const StatCard: React.FC<{
    title: string;
    value: number | string;
    icon: React.ReactNode;
    color?: string;
    suffix?: string;
  }> = ({ title, value, icon, color, suffix }) => (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 48,
              height: 48,
              borderRadius: 2,
              bgcolor: `${color || '#1890ff'}15`,
              mr: 2,
            }}
          >
            {icon}
          </Box>
          <Typography color="textSecondary" variant="body2">
            {title}
          </Typography>
        </Box>
        <Typography variant="h4" component="div" sx={{ fontWeight: 500, color }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
          {suffix}
        </Typography>
      </CardContent>
    </Card>
  );

  return (
    <Box>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="账户总资产"
            value="112,893.00"
            suffix=" CNY"
            icon={<AccountBalanceIcon sx={{ color: '#1890ff' }} />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="今日收益"
            value={`${parseFloat(todayChange) >= 0 ? '+' : ''}${todayChange}%`}
            icon={<TrendingDownIcon sx={{ color: parseFloat(todayChange) >= 0 ? '#ef0428' : '#00c853' }} />}
            color={parseFloat(todayChange) >= 0 ? '#ef0428' : '#00c853'}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="运行策略数"
            value={3}
            icon={<PlayCircleIcon sx={{ color: '#3f8600' }} />}
            color="#3f8600"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="待处理风控警告"
            value={0}
            icon={<WarningIcon sx={{ color: '#faad14' }} />}
            color="#faad14"
          />
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              行情监控视图
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              {dataSources.map((ds) => (
                <Tooltip key={ds.id} title={ds.description}>
                  <Chip
                    size="small"
                    icon={ds.available ? <CloudDoneIcon /> : <CloudOffIcon />}
                    label={ds.name}
                    color={ds.available ? 'success' : 'default'}
                    variant="outlined"
                  />
                </Tooltip>
              ))}
            </Stack>
          </Box>

          <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
            <Autocomplete
              size="small"
              options={stockOptions}
              getOptionLabel={(option) => option.search_key}
              onInputChange={handleSearchChange}
              onChange={handleStockSelect}
              inputValue={searchInput}
              value={selectedStock}
              placeholder="搜索股票代码或名称"
              sx={{ width: 280 }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="股票"
                  placeholder="输入代码或名称搜索..."
                />
              )}
              noOptionsText="输入股票代码或名称搜索"
            />
            <TextField
              size="small"
              label="代码"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              sx={{ width: 140 }}
              disabled
            />
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>数据源</InputLabel>
              <Select
                value={selectedSource}
                label="数据源"
                onChange={(e) => setSelectedSource(e.target.value)}
              >
                <MenuItem value="baostock">BaoStock（推荐）</MenuItem>
                <MenuItem value="akshare" disabled={!dataSources.find(d => d.id === 'akshare')?.available}>
                  AKShare
                </MenuItem>
                <MenuItem value="tushare" disabled={!dataSources.find(d => d.id === 'tushare')?.available}>
                  Tushare
                </MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="contained"
              onClick={handleFetchData}
              disabled={fetching}
              startIcon={<RefreshIcon />}
            >
              {fetching ? '获取中...' : '获取数据'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => fetchStockData(symbol)}
              disabled={loading}
            >
              刷新图表
            </Button>
          </Stack>

          {lastFetchMessage && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {lastFetchMessage}
            </Alert>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : stockData.length > 0 ? (
            <ReactECharts option={chartOption} style={{ height: 500 }} />
          ) : (
            <Alert severity="info">
              暂无数据，请搜索并选择股票后点击"获取数据"
            </Alert>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};
