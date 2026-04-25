import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Autocomplete,
  TextField,
  Chip,
  Divider,
  LinearProgress,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import {
  Psychology as PsychologyIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import ReactECharts from 'echarts-for-react';

const API_URL = 'http://localhost:8000/api/v1';

interface StockOption {
  code: string;
  name: string;
  search_key: string;
}

interface WatchlistItem {
  symbol: string;
  name: string;
  price?: number;
  pct_change?: number;
  recommendation?: string;
  composite_score?: number;
}

interface CyclePrediction {
  direction: string;
  strength: number;
}

interface AnalysisResult {
  id: number;
  symbol: string;
  name: string;
  recommendation: string;
  confidence: number;
  composite_score: number;
  technical_score: number;
  fundamental_score: number;
  sentiment_score: number;
  cycle_predictions: {
    '24h'?: CyclePrediction;
    '3d'?: CyclePrediction;
    '1w'?: CyclePrediction;
    '1m'?: CyclePrediction;
  };
  technical_details: any;
  support_level: number;
  resistance_level: number;
  risk_warnings: string[];
  report: string;
  created_at: string;
}

const directionColors: Record<string, string> = {
  bullish: '#ef0428',
  bearish: '#00c853',
  neutral: '#888',
  volatile: '#faad14',
};

const periodLabels: Record<string, string> = {
  '24h': '24小时',
  '3d': '3天',
  '1w': '1周',
  '1m': '1月',
};

const directionLabels: Record<string, string> = {
  bullish: '看多',
  bearish: '看空',
  neutral: '中性',
  volatile: '震荡',
};

export const AnalysisPanel: React.FC = () => {
  const [selectedStock, setSelectedStock] = useState<StockOption | null>(null);
  const [stockOptions, setStockOptions] = useState<StockOption[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stockData, setStockData] = useState<any[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load watchlist from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('ai_analysis_watchlist');
    if (saved) {
      try {
        setWatchlist(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load watchlist:', e);
      }
    }
  }, []);

  // Save watchlist to localStorage
  const saveWatchlist = useCallback((list: WatchlistItem[]) => {
    localStorage.setItem('ai_analysis_watchlist', JSON.stringify(list));
  }, []);

  // Add stock to watchlist
  const addToWatchlist = useCallback((symbol: string, name: string, result?: AnalysisResult) => {
    setWatchlist(prev => {
      // Check if already in watchlist
      if (prev.some(item => item.symbol === symbol)) {
        return prev;
      }
      const newList = [{
        symbol,
        name,
        price: result?.technical_details?.close,
        pct_change: result?.technical_details?.pct_change,
        recommendation: result?.recommendation,
        composite_score: result?.composite_score,
      }, ...prev];
      saveWatchlist(newList);
      return newList;
    });
  }, [saveWatchlist]);

  // Remove stock from watchlist
  const removeFromWatchlist = useCallback((symbol: string) => {
    setWatchlist(prev => {
      const newList = prev.filter(item => item.symbol !== symbol);
      saveWatchlist(newList);
      return newList;
    });
  }, [saveWatchlist]);

  const searchStocks = useCallback(async (query: string) => {
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
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (searchInput) {
        searchStocks(searchInput);
      }
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchInput, searchStocks]);

  // Poll for analysis status
  useEffect(() => {
    if (!jobId || status === 'completed' || status === 'failed') {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/analysis/status/${jobId}`);
        if (response.ok) {
          const data = await response.json();
          setStatus(data.status);

          if (data.status === 'completed') {
            const resultResponse = await fetch(`${API_URL}/analysis/${data.symbol}`);
            if (resultResponse.ok) {
              const result = await resultResponse.json();
              setAnalysisResult(result);
              fetchStockData(data.symbol);
              addToWatchlist(data.symbol, result.name || data.symbol, result);
            }
          } else if (data.status === 'failed') {
            setError('分析失败，请重试');
            setStatus('failed');
          }
        }
      } catch (err) {
        console.error('Failed to poll status:', err);
      }
    }, 2000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [jobId, status, addToWatchlist]);

  // Fetch stock data from local database
  const fetchStockData = async (symbol: string) => {
    try {
      const response = await fetch(`${API_URL}/market/${symbol}?page=1&page_size=100`);
      if (response.ok) {
        const data = await response.json();
        return data.data || [];
      }
    } catch (err) {
      console.error('Failed to fetch stock data:', err);
    }
    return [];
  };

  // Check if stock data is sufficient (at least 30 days)
  const hasSufficientData = (data: any[]): boolean => {
    if (!data || data.length < 20) return false;
    // Check if data spans at least 30 days
    const latest = data[0]?.trade_date;
    const oldest = data[data.length - 1]?.trade_date;
    if (!latest || !oldest) return false;
    const daysDiff = (new Date(latest).getTime() - new Date(oldest).getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff >= 30;
  };

  // Fetch data from external source (baostock)
  const fetchDataFromSource = async (symbol: string, source: string = 'baostock') => {
    setFetching(true);
    try {
      const today = new Date();
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(today.getMonth() - 3);
      const startDate = threeMonthsAgo.toISOString().slice(0, 10).replace(/-/g, '');
      const endDate = today.toISOString().slice(0, 10).replace(/-/g, '');

      const response = await fetch(
        `${API_URL}/market/fetch/${symbol}?start_date=${startDate}&end_date=${endDate}&source=${source}`,
        { method: 'POST' }
      );
      const result = await response.json();
      if (result.records_count > 0) {
        // Re-fetch local data after external fetch
        const newData = await fetchStockData(symbol);
        setStockData(newData);
      }
      return result;
    } catch (err) {
      console.error('Failed to fetch data from source:', err);
    } finally {
      setFetching(false);
    }
  };

  const handleStartAnalysis = async () => {
    if (!selectedStock) {
      setError('请先选择股票');
      return;
    }

    const symbol = selectedStock.code.startsWith('6')
      ? `sh${selectedStock.code}`
      : `sz${selectedStock.code}`;

    setLoading(true);
    setError(null);
    setAnalysisResult(null);
    setStockData([]);

    try {
      // Check and fetch data if needed before analysis
      const data = await fetchStockData(symbol);
      if (!hasSufficientData(data)) {
        await fetchDataFromSource(symbol, 'baostock');
      }

      const response = await fetch(`${API_URL}/analysis/${symbol}?name=${encodeURIComponent(selectedStock.name)}`, {
        method: 'POST',
      });

      if (response.ok) {
        const respData = await response.json();
        setJobId(respData.job_id);
        setStatus(respData.status);

        if (respData.status === 'completed') {
          const resultResponse = await fetch(`${API_URL}/analysis/${symbol}`);
          if (resultResponse.ok) {
            const result = await resultResponse.json();
            setAnalysisResult(result);
            const newData = await fetchStockData(symbol);
            setStockData(newData);
            addToWatchlist(symbol, result.name || selectedStock.name, result);
          }
        }
      } else {
        setError('启动分析失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动分析失败');
    } finally {
      setLoading(false);
    }
  };

  const handleWatchlistClick = async (item: WatchlistItem) => {
    // Create stock option from watchlist item
    const code = item.symbol.replace(/^(sh|sz)/, '');
    const stockOption: StockOption = {
      code,
      name: item.name,
      search_key: `${item.name} (${code.toUpperCase()}.${item.symbol.startsWith('sh') ? 'SH' : 'SZ'})`,
    };
    setSelectedStock(stockOption);

    // Fetch latest analysis
    try {
      const response = await fetch(`${API_URL}/analysis/${item.symbol}`);
      if (response.ok) {
        const result = await response.json();
        setAnalysisResult(result);
      }

      // Check and fetch data if needed
      const data = await fetchStockData(item.symbol);
      setStockData(data);
      if (!hasSufficientData(data)) {
        await fetchDataFromSource(item.symbol, 'baostock');
      }
    } catch (err) {
      console.error('Failed to load analysis:', err);
    }
  };

  const handleStockSelect = async (_event: any, newValue: StockOption | null) => {
    setSelectedStock(newValue);
    setAnalysisResult(null);
    setStockData([]);
    if (newValue) {
      const symbol = newValue.code.startsWith('6')
        ? `sh${newValue.code}`
        : `sz${newValue.code}`;

      // First fetch existing data
      const data = await fetchStockData(symbol);
      setStockData(data);

      // Check if data is sufficient (at least 1 month)
      if (!hasSufficientData(data)) {
        // Auto fetch 3 months of data from baostock
        await fetchDataFromSource(symbol, 'baostock');
      }
    }
  };

  // K-line chart option - reversed for display (oldest on left, latest on right)
  const reversedData = [...stockData].reverse();
  const chartOption = {
    title: { text: `${selectedStock?.code || ''} K线走势`, textStyle: { fontSize: 14 } },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: any) => {
        const data = params[0];
        const idx = data.dataIndex;
        // reversedData[idx] gives the correct item since reversedData is [oldest...latest]
        const item = reversedData[idx];
        if (!item) return '';
        const pct = item.pct_change || 0;
        const pctStr = pct >= 0 ? `+${pct.toFixed(2)}%` : `${pct.toFixed(2)}%`;
        return `
          <div style="font-family: Arial, sans-serif; font-size: 12px;">
            <div style="margin-bottom: 4px; color: #666;">${item.trade_date}</div>
            <div>开盘: <b>${item.open.toFixed(2)}</b></div>
            <div>收盘: <b>${item.close.toFixed(2)}</b></div>
            <div>最高: <b>${item.high.toFixed(2)}</b></div>
            <div>最低: <b>${item.low.toFixed(2)}</b></div>
            <div>涨跌: <b style="color: ${pct >= 0 ? '#ef0428' : '#00c853'}">${pctStr}</b></div>
          </div>
        `;
      },
    },
    grid: { left: '8%', right: '8%', bottom: '15%', top: '15%' },
    xAxis: {
      type: 'category',
      data: reversedData.map(d => d.trade_date),
      axisLabel: { rotate: 45, fontSize: 10 },
    },
    yAxis: { scale: true, boundaryGap: ['10%', '10%'] },
    series: [
      {
        type: 'candlestick',
        data: reversedData.map(d => [d.open, d.close, d.low, d.high]),
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

  const recommendationColor = {
    'BUY': '#ef0428',
    'SELL': '#00c853',
    'HOLD': '#faad14',
  }[analysisResult?.recommendation || 'HOLD'] || '#faad14';

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 200px)', gap: 2 }}>
      {/* Left Panel - Main Analysis Content */}
      <Box sx={{ flex: 1, overflow: 'auto', pr: 1 }}>
        {/* Search Header */}
        <Box
          sx={{
            bgcolor: '#0a1628',
            borderRadius: 2,
            p: 2,
            mb: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Autocomplete
              size="small"
              options={stockOptions}
              getOptionLabel={(option) => option.search_key}
              onInputChange={(_e, value) => setSearchInput(value)}
              onChange={handleStockSelect}
              inputValue={searchInput}
              value={selectedStock}
              sx={{ width: 280, bgcolor: '#0d1b2a', borderRadius: 1 }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="搜索股票代码或名称"
                  size="small"
                />
              )}
              noOptionsText="输入股票代码或名称搜索"
            />
            <Button
              variant="contained"
              onClick={handleStartAnalysis}
              disabled={loading || fetching || !selectedStock}
              startIcon={loading || fetching ? <CircularProgress size={18} color="inherit" /> : <PsychologyIcon />}
              sx={{
                bgcolor: '#1890ff',
                '&:hover': { bgcolor: '#0077e6' },
                minWidth: 120,
              }}
            >
              {loading ? '分析中...' : fetching ? '采集中...' : '开始分析'}
            </Button>
            {analysisResult && (
              <Chip
                label={`综合评分: ${analysisResult.composite_score}`}
                sx={{ bgcolor: '#1890ff15', color: '#1890ff' }}
              />
            )}
          </Box>
        </Box>

        {/* Status indicator */}
        {status && status !== 'completed' && status !== 'failed' && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="textSecondary">
                {status === 'pending' ? '等待分析...' : '分析中...'}
              </Typography>
            </Box>
            <LinearProgress />
          </Box>
        )}

        {/* Error alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Analysis Result */}
        {analysisResult && (
          <Box>
            {/* Core recommendation card */}
            <Box
              sx={{
                bgcolor: '#0a1628',
                borderRadius: 2,
                p: 3,
                mb: 2,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <Box sx={{ position: 'absolute', top: 0, right: 0, width: 200, height: 200, opacity: 0.05 }}>
                <Box
                  component="svg"
                  viewBox="0 0 200 200"
                  sx={{ width: '100%', height: '100%' }}
                >
                  <circle cx="100" cy="100" r="80" fill="none" stroke="#1890ff" strokeWidth="2" />
                  <circle cx="100" cy="100" r="60" fill="none" stroke="#1890ff" strokeWidth="1" />
                  <circle cx="100" cy="100" r="40" fill="none" stroke="#1890ff" strokeWidth="1" />
                </Box>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="caption" sx={{ color: '#8899a6', textTransform: 'uppercase', letterSpacing: 1 }}>
                    核心建议
                  </Typography>
                  <Typography
                    variant="h3"
                    sx={{ fontWeight: 700, color: recommendationColor, letterSpacing: 2 }}
                  >
                    {analysisResult.recommendation}
                  </Typography>
                </Box>
                <Divider orientation="vertical" sx={{ height: 60, borderColor: '#233342' }} />
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="caption" sx={{ color: '#8899a6', textTransform: 'uppercase', letterSpacing: 1 }}>
                    置信度
                  </Typography>
                  <Typography variant="h3" sx={{ fontWeight: 700, color: '#fff' }}>
                    {analysisResult.confidence}
                    <Typography component="span" variant="body2" sx={{ color: '#8899a6' }}>%</Typography>
                  </Typography>
                </Box>
                <Divider orientation="vertical" sx={{ height: 60, borderColor: '#233342' }} />
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="caption" sx={{ color: '#8899a6', textTransform: 'uppercase', letterSpacing: 1 }}>
                    综合评分
                  </Typography>
                  <Typography variant="h3" sx={{ fontWeight: 700, color: '#1890ff' }}>
                    {analysisResult.composite_score}
                  </Typography>
                </Box>
              </Box>
            </Box>

            {/* Four-dimensional scores */}
            <Box
              sx={{
                bgcolor: '#0a1628',
                borderRadius: 2,
                p: 2,
                mb: 2,
              }}
            >
              <Typography variant="subtitle2" sx={{ color: '#8899a6', mb: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
                四维评分
              </Typography>
              <Box sx={{ display: 'flex', gap: 3 }}>
                {[
                  { label: '技术面', score: analysisResult.technical_score, color: '#ef0428' },
                  { label: '基本面', score: analysisResult.fundamental_score, color: '#00c853' },
                  { label: '情绪面', score: analysisResult.sentiment_score, color: '#faad14' },
                  { label: '综合', score: analysisResult.composite_score, color: '#1890ff' },
                ].map(({ label, score, color }) => (
                  <Box key={label} sx={{ textAlign: 'center', flex: 1 }}>
                    <Typography variant="caption" sx={{ color: '#8899a6' }}>{label}</Typography>
                    <Box
                      sx={{
                        width: 50,
                        height: 50,
                        borderRadius: '50%',
                        border: `3px solid ${color}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mx: 'auto',
                        mb: 0.5,
                      }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 700, color }}>
                        {score}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>

            {/* Cycle predictions */}
            <Box
              sx={{
                bgcolor: '#0a1628',
                borderRadius: 2,
                p: 2,
                mb: 2,
              }}
            >
              <Typography variant="subtitle2" sx={{ color: '#8899a6', mb: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
                周期趋势预判
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                {Object.entries(analysisResult.cycle_predictions || {}).map(([period, prediction]) => (
                  <Box
                    key={period}
                    sx={{
                      flex: 1,
                      textAlign: 'center',
                      p: 1.5,
                      bgcolor: '#132033',
                      borderRadius: 1,
                      border: `1px solid ${directionColors[prediction.direction] || '#233342'}33`,
                    }}
                  >
                    <Typography variant="caption" sx={{ color: '#8899a6', display: 'block', mb: 0.5 }}>
                      {periodLabels[period] || period}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600, color: directionColors[prediction.direction] || '#8899a6' }}
                    >
                      {directionLabels[prediction.direction] || prediction.direction}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#566778' }}>
                      强度 {prediction.strength}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>

            {/* K-line chart */}
            {stockData.length > 0 && (
              <Box
                sx={{
                  bgcolor: '#0a1628',
                  borderRadius: 2,
                  p: 2,
                  mb: 2,
                }}
              >
                <Typography variant="subtitle2" sx={{ color: '#8899a6', mb: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
                  K线走势
                </Typography>
                <ReactECharts option={chartOption} style={{ height: 280 }} />
              </Box>
            )}

            {/* Support/Resistance */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <Box
                sx={{
                  flex: 1,
                  bgcolor: '#0a1628',
                  borderRadius: 2,
                  p: 2,
                  borderLeft: '3px solid #00c853',
                }}
              >
                <Typography variant="caption" sx={{ color: '#8899a6' }}>支撑位</Typography>
                <Typography variant="h5" sx={{ fontWeight: 600, color: '#00c853' }}>
                  {analysisResult.support_level?.toFixed(2) || '-'}
                </Typography>
              </Box>
              <Box
                sx={{
                  flex: 1,
                  bgcolor: '#0a1628',
                  borderRadius: 2,
                  p: 2,
                  borderLeft: '3px solid #ef0428',
                }}
              >
                <Typography variant="caption" sx={{ color: '#8899a6' }}>阻力位</Typography>
                <Typography variant="h5" sx={{ fontWeight: 600, color: '#ef0428' }}>
                  {analysisResult.resistance_level?.toFixed(2) || '-'}
                </Typography>
              </Box>
            </Box>

            {/* Risk warnings */}
            {analysisResult.risk_warnings && analysisResult.risk_warnings.length > 0 && (
              <Box
                sx={{
                  bgcolor: '#0a1628',
                  borderRadius: 2,
                  p: 2,
                  mb: 2,
                  border: '1px solid #faad1433',
                }}
              >
                <Typography variant="subtitle2" sx={{ color: '#faad14', mb: 1.5, textTransform: 'uppercase', letterSpacing: 1 }}>
                  风险提示
                </Typography>
                {analysisResult.risk_warnings.map((warning, index) => (
                  <Box
                    key={index}
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 1,
                      mb: 1,
                      '&:last-child': { mb: 0 },
                    }}
                  >
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: '#faad14',
                        mt: 0.8,
                        flexShrink: 0,
                      }}
                    />
                    <Typography variant="body2" sx={{ color: '#8899a6' }}>
                      {warning}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}

            {/* AI Report */}
            {analysisResult.report && (
              <Box
                sx={{
                  bgcolor: '#0a1628',
                  borderRadius: 2,
                  p: 2,
                }}
              >
                <Typography variant="subtitle2" sx={{ color: '#8899a6', mb: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
                  AI 分析报告
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: '#c5d1db', whiteSpace: 'pre-wrap', lineHeight: 1.8 }}
                >
                  {analysisResult.report}
                </Typography>
              </Box>
            )}
          </Box>
        )}

        {/* Empty state */}
        {!analysisResult && !loading && !error && (
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: '#0a1628',
              borderRadius: 2,
              py: 8,
            }}
          >
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                bgcolor: '#1890ff15',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 3,
              }}
            >
              <PsychologyIcon sx={{ fontSize: 40, color: '#1890ff' }} />
            </Box>
            <Typography variant="h6" sx={{ color: '#fff', mb: 1 }}>
              AI 智能分析引擎
            </Typography>
            <Typography variant="body2" sx={{ color: '#8899a6', mb: 3, textAlign: 'center' }}>
              多维数据驱动 · 量化级别洞察 · 实时市场脉搏
            </Typography>
            <Button
              variant="contained"
              onClick={handleStartAnalysis}
              disabled={!selectedStock}
              startIcon={<PsychologyIcon />}
              sx={{
                bgcolor: '#1890ff',
                '&:hover': { bgcolor: '#0077e6' },
              }}
            >
              开始分析
            </Button>
          </Box>
        )}
      </Box>

      {/* Right Panel - Watchlist */}
      <Box
        sx={{
          width: 280,
          bgcolor: '#0d1b2a',
          borderRadius: 2,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Watchlist Header */}
        <Box
          sx={{
            p: 2,
            borderBottom: '1px solid #1b2838',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <StarIcon sx={{ color: '#ffd700', fontSize: 20 }} />
            <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 600 }}>
              我的自选股
            </Typography>
            <Chip
              label={watchlist.length}
              size="small"
              sx={{
                height: 20,
                fontSize: 12,
                bgcolor: '#1b2838',
                color: '#8899a6',
              }}
            />
          </Box>
          <IconButton size="small" sx={{ color: '#8899a6' }}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Watchlist Items */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {watchlist.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: '#8899a6' }}>
                自选股为空
              </Typography>
              <Typography variant="caption" sx={{ color: '#566778' }}>
                分析股票后将自动添加到这里
              </Typography>
            </Box>
          ) : (
            <List disablePadding>
              {watchlist.map((item) => (
                <ListItem
                  key={item.symbol}
                  disablePadding
                  secondaryAction={
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromWatchlist(item.symbol);
                      }}
                      sx={{ color: '#566778', '&:hover': { color: '#ef0428' } }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemButton
                    onClick={() => handleWatchlistClick(item)}
                    sx={{
                      py: 1.5,
                      px: 2,
                      borderBottom: '1px solid #1b2838',
                      '&:hover': { bgcolor: '#1b2838' },
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Typography
                          variant="body2"
                          sx={{ color: '#fff', fontWeight: 600 }}
                          noWrap
                        >
                          {item.name}
                        </Typography>
                        <Chip
                          label={item.recommendation || '-'}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: 10,
                            fontWeight: 600,
                            bgcolor: item.recommendation === 'BUY' ? '#ef042815' :
                                   item.recommendation === 'SELL' ? '#00c85315' :
                                   '#faad1415',
                            color: item.recommendation === 'BUY' ? '#ef0428' :
                                   item.recommendation === 'SELL' ? '#00c853' :
                                   '#faad14',
                          }}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption" sx={{ color: '#8899a6' }}>
                          {item.symbol.replace(/^(sh|sz)/, '').toUpperCase()}
                        </Typography>
                        {item.composite_score !== undefined && (
                          <Typography
                            variant="caption"
                            sx={{
                              color: '#1890ff',
                              fontWeight: 600,
                            }}
                          >
                            {item.composite_score}分
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Box>
    </Box>
  );
};