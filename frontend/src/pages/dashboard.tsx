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
  Divider,
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
import { AnalysisPanel } from '../components/AnalysisPanel';

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

interface IndexOverviewItem {
  symbol: string;
  name: string;
  price: number | null;
  pct_change: number | null;
  available: boolean;
}

interface MarketOverview {
  total_amount: number;
  up_count: number;
  down_count: number;
  flat_count: number;
  indices: IndexOverviewItem[];
  hk_indices: IndexOverviewItem[];
}

export const DashboardPage: React.FC = () => {
  const [symbol, setSymbol] = useState('');
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
  const [marketOverview, setMarketOverview] = useState<MarketOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

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
      const response = await fetch(`${API_URL}/market/${stockSymbol}?page=1&page_size=100`);
      if (!response.ok) {
        throw new Error('获取数据失败');
      }
      const data = await response.json();
      setStockData(data.data || []);
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
      // Calculate date range: from 3 months ago to today (YYYYMMDD format)
      const today = new Date();
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(today.getMonth() - 3);
      const startDate = threeMonthsAgo.toISOString().slice(0, 10).replace(/-/g, '');
      const endDate = today.toISOString().slice(0, 10).replace(/-/g, '');

      const response = await fetch(
        `${API_URL}/market/fetch/${symbol}?start_date=${startDate}&end_date=${endDate}&source=${selectedSource}`,
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

  // 获取市场概览数据
  const fetchMarketOverview = async () => {
    setOverviewLoading(true);
    try {
      const response = await fetch(`${API_URL}/market/overview`);
      if (response.ok) {
        const data = await response.json();
        setMarketOverview(data);
      }
    } catch (err) {
      console.error('Failed to fetch market overview:', err);
    } finally {
      setOverviewLoading(false);
    }
  };

  useEffect(() => {
    fetchDataSources();
    fetchStockData(symbol);
    fetchMarketOverview();
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

      {/* 市场概览区域 */}
      {marketOverview && (
        <>
          {/* 左侧：成交额 + 涨跌家数；右侧：主要指数（BaoStock） */}
          <Grid container spacing={2} sx={{ mb: 3 }} alignItems="stretch">
            <Grid size={{ xs: 12, lg: 5 }}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: { xs: 'column', sm: 'row' },
                      alignItems: { xs: 'stretch', sm: 'center' },
                      gap: { xs: 2, sm: 3 },
                    }}
                  >
                    <Box sx={{ flexShrink: 0 }}>
                      <Typography color="textSecondary" variant="body2" gutterBottom>
                        沪深两市成交额
                      </Typography>
                      <Typography variant="h5" sx={{ fontWeight: 500, color: '#1890ff' }}>
                        {marketOverview.total_amount.toLocaleString()} 亿
                      </Typography>
                    </Box>
                    <Divider
                      orientation="vertical"
                      flexItem
                      sx={{ display: { xs: 'none', sm: 'block' } }}
                    />
                    <Divider sx={{ display: { xs: 'block', sm: 'none' } }} />
                    <Box
                      sx={{
                        display: 'flex',
                        flex: 1,
                        justifyContent: { xs: 'space-between', sm: 'flex-end' },
                        gap: 2,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Box sx={{ textAlign: { xs: 'center', sm: 'right' }, minWidth: 72 }}>
                        <Typography color="textSecondary" variant="body2" gutterBottom>
                          上涨
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 500, color: '#ef0428' }}>
                          {marketOverview.up_count}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: { xs: 'center', sm: 'right' }, minWidth: 72 }}>
                        <Typography color="textSecondary" variant="body2" gutterBottom>
                          下跌
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 500, color: '#00c853' }}>
                          {marketOverview.down_count}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: { xs: 'center', sm: 'right' }, minWidth: 72 }}>
                        <Typography color="textSecondary" variant="body2" gutterBottom>
                          持平
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 500, color: '#888' }}>
                          {marketOverview.flat_count}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                  <Divider sx={{ my: 2 }} />
                  <Typography color="textSecondary" variant="caption" sx={{ display: 'block', mb: 1.25 }}>
                    港股主要指数（优先 BaoStock；港股不支持则新浪 / 东财，无数据占位）
                  </Typography>
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 1.25,
                      rowGap: 1.5,
                    }}
                  >
                    {(marketOverview.hk_indices ?? []).map((index) => {
                      const pct = index.pct_change;
                      const hasPct = index.available && pct != null && !Number.isNaN(pct);
                      return (
                        <Box
                          key={`hk-${index.symbol}-${index.name}`}
                          sx={{
                            flex: '1 1 30%',
                            minWidth: 100,
                            border: 1,
                            borderColor: 'divider',
                            borderRadius: 1,
                            px: 1,
                            py: 0.75,
                          }}
                        >
                          <Typography color="textSecondary" variant="caption" sx={{ display: 'block', lineHeight: 1.25 }}>
                            {index.name}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.25 }}>
                            {index.available && index.price != null
                              ? index.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : '—'}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              fontWeight: 600,
                              color: !hasPct ? 'text.disabled' : pct >= 0 ? '#ef0428' : '#00c853',
                            }}
                          >
                            {!hasPct
                              ? '—'
                              : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, lg: 7 }}>
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                  <Typography color="textSecondary" variant="caption" sx={{ display: 'block', mb: 1.5 }}>
                    主要指数（BaoStock 日线，无数据时占位）
                  </Typography>
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 1.5,
                      rowGap: 2,
                    }}
                  >
                    {marketOverview.indices.map((index) => {
                      const pct = index.pct_change;
                      const hasPct = index.available && pct != null && !Number.isNaN(pct);
                      return (
                        <Box
                          key={`${index.symbol}-${index.name}`}
                          sx={{
                            flex: '1 1 42%',
                            minWidth: 120,
                            maxWidth: { sm: 200, md: 220 },
                            border: 1,
                            borderColor: 'divider',
                            borderRadius: 1,
                            px: 1.25,
                            py: 1,
                          }}
                        >
                          <Typography color="textSecondary" variant="caption" sx={{ display: 'block', lineHeight: 1.3 }}>
                            {index.name}
                          </Typography>
                          <Typography variant="body1" sx={{ fontWeight: 600, mt: 0.5 }}>
                            {index.available && index.price != null
                              ? index.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : '—'}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              fontWeight: 600,
                              color: !hasPct ? 'text.disabled' : pct >= 0 ? '#ef0428' : '#00c853',
                            }}
                          >
                            {!hasPct
                              ? '—'
                              : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </>
      )}

      <Card>
        <CardContent>
          <AnalysisPanel />
        </CardContent>
      </Card>
    </Box>
  );
};
