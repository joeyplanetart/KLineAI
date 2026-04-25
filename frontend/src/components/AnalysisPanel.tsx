import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Stack,
  Button,
  CircularProgress,
  Alert,
  Autocomplete,
  TextField,
  Chip,
  Divider,
  LinearProgress,
} from '@mui/material';
import {
  Psychology as PsychologyIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import ReactECharts from 'echarts-for-react';

const API_URL = 'http://localhost:8000/api/v1';

interface StockOption {
  code: string;
  name: string;
  search_key: string;
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

export const AnalysisPanel: React.FC = () => {
  const [selectedStock, setSelectedStock] = useState<StockOption | null>(null);
  const [stockOptions, setStockOptions] = useState<StockOption[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stockData, setStockData] = useState<any[]>([]);

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
    if (!jobId || status === 'completed' || status === 'failed') return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/analysis/status/${jobId}`);
        if (response.ok) {
          const data = await response.json();
          setStatus(data.status);

          if (data.status === 'completed') {
            // Fetch the actual result
            const resultResponse = await fetch(`${API_URL}/analysis/${data.symbol}`);
            if (resultResponse.ok) {
              const result = await resultResponse.json();
              setAnalysisResult(result);
              // Also fetch stock data for K-line chart
              fetchStockData(data.symbol);
            }
          } else if (data.status === 'failed') {
            setError('Analysis failed. Please try again.');
          }
        }
      } catch (err) {
        console.error('Failed to poll status:', err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [jobId, status]);

  const fetchStockData = async (symbol: string) => {
    try {
      const response = await fetch(`${API_URL}/market/${symbol}?page=1&page_size=100`);
      if (response.ok) {
        const data = await response.json();
        setStockData(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch stock data:', err);
    }
  };

  const handleStartAnalysis = async () => {
    if (!selectedStock) {
      setError('Please select a stock first');
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
      const response = await fetch(`${API_URL}/analysis/${symbol}?name=${encodeURIComponent(selectedStock.name)}`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        setJobId(data.job_id);
        setStatus(data.status);

        // If already completed, fetch result immediately
        if (data.status === 'completed') {
          const resultResponse = await fetch(`${API_URL}/analysis/${symbol}`);
          if (resultResponse.ok) {
            const result = await resultResponse.json();
            setAnalysisResult(result);
            fetchStockData(symbol);
          }
        }
      } else {
        setError('Failed to start analysis');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start analysis');
    } finally {
      setLoading(false);
    }
  };

  const handleStockSelect = (_event: any, newValue: StockOption | null) => {
    setSelectedStock(newValue);
    setAnalysisResult(null);
    setStockData([]);
    if (newValue) {
      const symbol = newValue.code.startsWith('6')
        ? `sh${newValue.code}`
        : `sz${newValue.code}`;
      fetchStockData(symbol);
    }
  };

  // K-line chart option
  const chartOption = {
    title: { text: `${selectedStock?.code || ''} K线走势` },
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

  const recommendationColor = {
    'BUY': '#ef0428',
    'SELL': '#00c853',
    'HOLD': '#faad14',
  }[analysisResult?.recommendation || 'HOLD'] || '#faad14';

  return (
    <Box>
      {/* Header: Stock selector + Start button */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Autocomplete
              size="small"
              options={stockOptions}
              getOptionLabel={(option) => option.search_key}
              onInputChange={(_e, value) => setSearchInput(value)}
              onChange={handleStockSelect}
              inputValue={searchInput}
              value={selectedStock}
              placeholder="搜索股票代码或名称"
              sx={{ width: 300 }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="选择标的"
                  placeholder="输入代码或名称搜索..."
                />
              )}
              noOptionsText="输入股票代码或名称搜索"
            />
            <Button
              variant="contained"
              onClick={handleStartAnalysis}
              disabled={loading || !selectedStock}
              startIcon={loading ? <CircularProgress size={20} /> : <PsychologyIcon />}
              sx={{ bgcolor: '#1890ff' }}
            >
              {loading ? '分析中...' : '开始分析'}
            </Button>
            {analysisResult && (
              <Chip
                label={`综合评分: ${analysisResult.composite_score}`}
                sx={{ bgcolor: '#1890ff15', color: '#1890ff' }}
              />
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Status indicator */}
      {status && status !== 'completed' && status !== 'failed' && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <CircularProgress size={24} />
              <Typography>
                {status === 'pending' ? '等待分析...' : '分析中...'}
              </Typography>
            </Box>
            <LinearProgress sx={{ mt: 1 }} />
          </CardContent>
        </Card>
      )}

      {/* Error alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Analysis Result */}
      {analysisResult && (
        <>
          {/* Core recommendation card */}
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="caption" color="textSecondary">
                    核心建议
                  </Typography>
                  <Typography
                    variant="h4"
                    sx={{ fontWeight: 600, color: recommendationColor }}
                  >
                    {analysisResult.recommendation}
                  </Typography>
                </Box>
                <Divider orientation="vertical" flexItem />
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="caption" color="textSecondary">
                    置信度
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 600 }}>
                    {analysisResult.confidence}%
                  </Typography>
                </Box>
                <Divider orientation="vertical" flexItem />
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="caption" color="textSecondary">
                    综合评分
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 600, color: '#1890ff' }}>
                    {analysisResult.composite_score}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Four-dimensional scores */}
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ mb: 2 }}>
                四维评分
              </Typography>
              <Stack direction="row" spacing={2} flexWrap="wrap">
                <Box sx={{ textAlign: 'center', minWidth: 80 }}>
                  <Typography variant="caption" color="textSecondary">技术面</Typography>
                  <Typography variant="h5" sx={{ color: '#ef0428' }}>{analysisResult.technical_score}</Typography>
                </Box>
                <Box sx={{ textAlign: 'center', minWidth: 80 }}>
                  <Typography variant="caption" color="textSecondary">基本面</Typography>
                  <Typography variant="h5" sx={{ color: '#00c853' }}>{analysisResult.fundamental_score}</Typography>
                </Box>
                <Box sx={{ textAlign: 'center', minWidth: 80 }}>
                  <Typography variant="caption" color="textSecondary">情绪面</Typography>
                  <Typography variant="h5" sx={{ color: '#faad14' }}>{analysisResult.sentiment_score}</Typography>
                </Box>
                <Box sx={{ textAlign: 'center', minWidth: 80 }}>
                  <Typography variant="caption" color="textSecondary">综合</Typography>
                  <Typography variant="h5" sx={{ color: '#1890ff' }}>{analysisResult.composite_score}</Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          {/* Cycle predictions */}
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ mb: 2 }}>
                周期趋势预判
              </Typography>
              <Stack direction="row" spacing={2} flexWrap="wrap">
                {Object.entries(analysisResult.cycle_predictions || {}).map(([period, prediction]) => (
                  <Box
                    key={period}
                    sx={{
                      textAlign: 'center',
                      minWidth: 80,
                      p: 1,
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1,
                    }}
                  >
                    <Typography variant="caption" color="textSecondary">
                      {period === '24h' ? '24小时' : period === '3d' ? '3天' : period === '1w' ? '1周' : '1月'}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600, color: directionColors[prediction.direction] || '#888' }}
                    >
                      {prediction.direction === 'bullish' ? '看多' :
                       prediction.direction === 'bearish' ? '看空' :
                       prediction.direction === 'volatile' ? '震荡' : '中性'}
                    </Typography>
                    <Typography variant="caption">
                      强度: {prediction.strength}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>

          {/* K-line chart */}
          {stockData.length > 0 && (
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 2 }}>
                  K线走势
                </Typography>
                <ReactECharts option={chartOption} style={{ height: 400 }} />
              </CardContent>
            </Card>
          )}

          {/* Support/Resistance */}
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ mb: 2 }}>
                支撑位 / 阻力位
              </Typography>
              <Stack direction="row" spacing={4}>
                <Box>
                  <Typography variant="caption" color="textSecondary">支撑位</Typography>
                  <Typography variant="h6" sx={{ color: '#00c853' }}>
                    {analysisResult.support_level?.toFixed(2) || '-'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="textSecondary">阻力位</Typography>
                  <Typography variant="h6" sx={{ color: '#ef0428' }}>
                    {analysisResult.resistance_level?.toFixed(2) || '-'}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          {/* Risk warnings */}
          {analysisResult.risk_warnings && analysisResult.risk_warnings.length > 0 && (
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 2, color: '#faad14' }}>
                  风险提示
                </Typography>
                {analysisResult.risk_warnings.map((warning, index) => (
                  <Alert severity="warning" key={index} sx={{ mb: 1 }}>
                    {warning}
                  </Alert>
                ))}
              </CardContent>
            </Card>
          )}

          {/* AI Report */}
          {analysisResult.report && (
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 2 }}>
                  AI 分析报告
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {analysisResult.report}
                </Typography>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Empty state */}
      {!analysisResult && !loading && !error && (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <PsychologyIcon sx={{ fontSize: 64, color: '#1890ff', mb: 2 }} />
            <Typography variant="h6" sx={{ mb: 1 }}>
              AI 智能分析引擎
            </Typography>
            <Typography variant="body2" color="textSecondary">
              从左侧选择标的，或点击下方快速开始
            </Typography>
            <Button
              variant="contained"
              onClick={handleStartAnalysis}
              disabled={!selectedStock}
              sx={{ mt: 2, bgcolor: '#1890ff' }}
            >
              开始分析
            </Button>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};