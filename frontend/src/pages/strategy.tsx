import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  Box,
  CircularProgress,
  Alert,
  Divider,
  Chip,
  Stack,
} from '@mui/material';
import ReactECharts from 'echarts-for-react';

const API_URL = 'http://localhost:8000/api/v1';

interface BacktestResult {
  strategy_code: string;
  initial_capital: number;
  final_value: number;
  total_return: number;
  sharpe_ratio: number;
  max_drawdown: number;
  total_trades: number;
  trades: Array<{ date: string; action: string; price: number; shares: number }>;
  portfolio_values: Array<{ date: string; value: number }>;
}

export const StrategyPage: React.FC = () => {
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 回测相关状态
  const [backtestSymbol, setBacktestSymbol] = useState('sh600000');
  const [backtestCapital, setBacktestCapital] = useState(1000000);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/strategy/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      const data = await response.json();
      setCode(data.code || '获取代码失败');
    } catch (err) {
      setError('生成策略失败，请检查后端服务');
    } finally {
      setLoading(false);
    }
  };

  const handleBacktest = async () => {
    if (!code) {
      setError('请先生成策略代码');
      return;
    }

    setBacktestLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/strategy/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: backtestSymbol,
          strategy_code: code.substring(0, 100), // 截取前100字符作为标识
          initial_capital: backtestCapital,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || '回测失败');
      }

      const result = await response.json();
      setBacktestResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '回测请求失败');
    } finally {
      setBacktestLoading(false);
    }
  };

  // 收益率曲线配置
  const chartOption = backtestResult ? {
    title: { text: '收益率曲线' },
    tooltip: { trigger: 'axis' },
    grid: { left: '10%', right: '10%', bottom: '15%', top: '15%' },
    xAxis: {
      type: 'category',
      data: backtestResult.portfolio_values.map(p => p.date),
      axisLabel: { rotate: 45 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (value: number) => `${(value / 10000).toFixed(0)}万` },
    },
    series: [
      {
        name: '资产价值',
        type: 'line',
        data: backtestResult.portfolio_values.map(p => p.value),
        smooth: true,
        areaStyle: { opacity: 0.3 },
      },
    ],
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', start: 0, end: 100 },
    ],
  } : {};

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* 左侧：策略生成 */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                智能策略生成
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                请用自然语言描述您的量化交易策略想法：
              </Typography>
              <TextField
                multiline
                rows={6}
                fullWidth
                placeholder="例如：当5日均线上穿20日均线时买入，下穿时卖出..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <Box sx={{ mt: 2, textAlign: 'right' }}>
                <Button
                  variant="contained"
                  onClick={handleGenerate}
                  disabled={!description || loading}
                >
                  {loading ? '生成中...' : '生成策略代码'}
                </Button>
              </Box>
            </CardContent>
          </Card>

          {/* 回测参数 */}
          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                回测参数
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    size="small"
                    fullWidth
                    label="股票代码"
                    value={backtestSymbol}
                    onChange={(e) => setBacktestSymbol(e.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    size="small"
                    fullWidth
                    label="初始资金"
                    type="number"
                    value={backtestCapital}
                    onChange={(e) => setBacktestCapital(Number(e.target.value))}
                  />
                </Grid>
              </Grid>
              <Box sx={{ mt: 2, textAlign: 'right' }}>
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={handleBacktest}
                  disabled={!code || backtestLoading}
                >
                  {backtestLoading ? '回测中...' : '运行回测'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* 右侧：代码展示和回测结果 */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                生成的策略代码
              </Typography>
              <Box sx={{ position: 'relative', minHeight: 200 }}>
                {loading && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: 'rgba(255,255,255,0.9)',
                      zIndex: 1,
                    }}
                  >
                    <CircularProgress />
                  </Box>
                )}
                <TextField
                  multiline
                  rows={12}
                  fullWidth
                  value={code}
                  InputProps={{ readOnly: true }}
                  sx={{
                    '& .MuiInputBase-input': {
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                    },
                  }}
                />
              </Box>
            </CardContent>
          </Card>

          {/* 回测结果 */}
          {backtestResult && (
            <Card sx={{ mt: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  回测结果
                </Typography>

                {/* 统计指标 */}
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid size={{ xs: 3 }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" color="textSecondary">
                        总收益率
                      </Typography>
                      <Typography
                        variant="h5"
                        sx={{ color: backtestResult.total_return >= 0 ? '#3f8600' : '#cf1322' }}
                      >
                        {backtestResult.total_return >= 0 ? '+' : ''}
                        {backtestResult.total_return}%
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid size={{ xs: 3 }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" color="textSecondary">
                        夏普比率
                      </Typography>
                      <Typography variant="h5">
                        {backtestResult.sharpe_ratio}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid size={{ xs: 3 }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" color="textSecondary">
                        最大回撤
                      </Typography>
                      <Typography variant="h5" sx={{ color: '#cf1322' }}>
                        -{backtestResult.max_drawdown}%
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid size={{ xs: 3 }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" color="textSecondary">
                        交易次数
                      </Typography>
                      <Typography variant="h5">
                        {backtestResult.total_trades}
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>

                <Divider sx={{ my: 2 }} />

                {/* 收益率曲线 */}
                <Typography variant="subtitle1" gutterBottom>
                  资产曲线
                </Typography>
                <ReactECharts option={chartOption} style={{ height: 300 }} />

                {/* 最近交易记录 */}
                {backtestResult.trades.length > 0 && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle1" gutterBottom>
                      最近交易
                    </Typography>
                    <Stack spacing={1}>
                      {backtestResult.trades.slice(-5).map((trade, idx) => (
                        <Box
                          key={idx}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            p: 1,
                            bgcolor: 'background.default',
                            borderRadius: 1,
                          }}
                        >
                          <Chip
                            size="small"
                            label={trade.action}
                            color={trade.action === 'BUY' ? 'success' : 'error'}
                          />
                          <Typography variant="body2">
                            {trade.date} - ¥{trade.price.toFixed(2)} × {trade.shares}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>
    </Box>
  );
};
