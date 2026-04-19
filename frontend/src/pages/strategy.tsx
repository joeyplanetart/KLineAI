import React, { useState, useEffect } from 'react';
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  PlayArrow as PlayArrowIcon,
  Code as CodeIcon,
  FlashOn as FlashOnIcon,
} from '@mui/icons-material';
import ReactECharts from 'echarts-for-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const API_URL = 'http://localhost:8000/api/v1';

interface Strategy {
  id: number;
  name: string;
  description: string;
  code?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface BuiltinStrategy {
  id: string;
  name: string;
  description: string;
  code?: string;
}

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
  const [strategyName, setStrategyName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 保存的策略列表
  const [savedStrategies, setSavedStrategies] = useState<Strategy[]>([]);
  const [strategiesLoading, setStrategiesLoading] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [codeDialogOpen, setCodeDialogOpen] = useState(false);

  // 内置策略
  const [builtinStrategies, setBuiltinStrategies] = useState<BuiltinStrategy[]>([]);
  const [selectedBuiltin, setSelectedBuiltin] = useState<BuiltinStrategy | null>(null);

  // 回测相关状态
  const [backtestSymbol, setBacktestSymbol] = useState('000001');
  const [backtestCapital, setBacktestCapital] = useState(1000000);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);

  // 加载保存的策略
  const loadStrategies = async () => {
    setStrategiesLoading(true);
    try {
      const response = await fetch(`${API_URL}/strategy/list`);
      const data = await response.json();
      setSavedStrategies(data.strategies || []);
    } catch (err) {
      console.error('加载策略列表失败', err);
    } finally {
      setStrategiesLoading(false);
    }
  };

  // 加载内置策略
  const loadBuiltinStrategies = async () => {
    try {
      const response = await fetch(`${API_URL}/strategy/builtin`);
      const data = await response.json();
      setBuiltinStrategies(data.strategies || []);
    } catch (err) {
      console.error('加载内置策略失败', err);
    }
  };

  useEffect(() => {
    loadStrategies();
    loadBuiltinStrategies();
  }, []);

  // 应用内置策略
  const handleApplyBuiltin = async (builtin: BuiltinStrategy) => {
    try {
      const response = await fetch(`${API_URL}/strategy/builtin/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy_id: builtin.id,
          name: builtin.name,
          description: builtin.description,
        }),
      });
      const data = await response.json();
      if (data.id) {
        setSavedStrategies([data, ...savedStrategies]);
        setCode(data.code || '');
        setDescription(data.description || '');
      }
    } catch (err) {
      setError('应用内置策略失败');
    }
  };

  // 查看内置策略代码
  const handleViewBuiltinCode = async (builtin: BuiltinStrategy) => {
    try {
      const response = await fetch(`${API_URL}/strategy/builtin/${builtin.id}/code`);
      const data = await response.json();
      setSelectedBuiltin(data);
      setCode(data.code || '');
      setDescription(data.description || '');
      setCodeDialogOpen(true);
    } catch (err) {
      setError('加载策略代码失败');
    }
  };

  // 加载策略代码
  const handleLoadStrategy = async (strategy: Strategy) => {
    try {
      const response = await fetch(`${API_URL}/strategy/${strategy.id}`);
      const data = await response.json();
      setSelectedStrategy(data);
      setCode(data.code || '');
      setDescription(data.description || '');
      setCodeDialogOpen(true);
    } catch (err) {
      setError('加载策略失败');
    }
  };

  // 运行回测（从保存的策略）
  const handleRunBacktest = async (strategy: Strategy) => {
    try {
      const response = await fetch(`${API_URL}/strategy/${strategy.id}/backtest?symbol=${backtestSymbol}&initial_capital=${backtestCapital}`, {
        method: 'POST',
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || '回测失败');
      }
      const result = await response.json();
      setBacktestResult(result);
      setSelectedStrategy({ ...strategy, code: strategy.code || '' });
      setCode(strategy.code || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : '回测失败');
    }
  };

  const handleGenerate = async (save: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/strategy/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          name: strategyName,
          save,
        }),
      });
      const data = await response.json();
      setCode(data.code || '获取代码失败');
      if (save && data.id) {
        setSavedStrategies([data, ...savedStrategies]);
        setStrategyName('');
      }
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

      {/* 内置策略 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <FlashOnIcon color="primary" />
            <Typography variant="h6">内置策略</Typography>
          </Box>
          <Grid container spacing={2}>
            {builtinStrategies.map((s) => (
              <Grid key={s.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <Card variant="outlined" sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}>
                  <CardContent sx={{ pb: '16px !important' }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {s.name}
                    </Typography>
                    <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                      {s.description}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<CodeIcon />}
                        onClick={() => handleViewBuiltinCode(s)}
                      >
                        查看
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<PlayArrowIcon />}
                        onClick={() => handleApplyBuiltin(s)}
                      >
                        应用
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* 保存的策略列表 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6">我的策略</Typography>
            <IconButton onClick={loadStrategies} disabled={strategiesLoading}>
              <RefreshIcon />
            </IconButton>
          </Box>
          {savedStrategies.length > 0 ? (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>策略名称</TableCell>
                    <TableCell>描述</TableCell>
                    <TableCell>状态</TableCell>
                    <TableCell>创建时间</TableCell>
                    <TableCell align="right">操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {savedStrategies.map((s) => (
                    <TableRow key={s.id} hover>
                      <TableCell>{s.name}</TableCell>
                      <TableCell sx={{ maxWidth: 200 }}>{s.description?.substring(0, 50)}...</TableCell>
                      <TableCell>
                        <Chip size="small" label={s.status === 'active' ? '使用中' : '草稿'} color={s.status === 'active' ? 'primary' : 'default'} />
                      </TableCell>
                      <TableCell>{new Date(s.created_at).toLocaleDateString()}</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => handleLoadStrategy(s)} title="查看代码">
                          <CodeIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleRunBacktest(s)} title="运行回测">
                          <PlayArrowIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography variant="body2" color="textSecondary">
              暂无保存的策略，请生成并保存策略
            </Typography>
          )}
        </CardContent>
      </Card>

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
                rows={4}
                fullWidth
                placeholder="例如：当5日均线上穿20日均线时买入，下穿时卖出..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                size="small"
                placeholder="策略名称（保存时必填）"
                value={strategyName}
                onChange={(e) => setStrategyName(e.target.value)}
                sx={{ mb: 2 }}
              />
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button
                  variant="outlined"
                  onClick={() => handleGenerate(false)}
                  disabled={!description || loading}
                >
                  {loading ? '生成中...' : '生成'}
                </Button>
                <Button
                  variant="contained"
                  onClick={() => handleGenerate(true)}
                  disabled={!description || !strategyName || loading}
                >
                  {loading ? '保存中...' : '生成并保存'}
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
                策略代码
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
                {code ? (
                  <SyntaxHighlighter
                    language="python"
                    style={vscDarkPlus}
                    customStyle={{ margin: 0, borderRadius: 4, maxHeight: 400 }}
                  >
                    {code}
                  </SyntaxHighlighter>
                ) : (
                  <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
                    请先生成或加载策略代码
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>

          {/* 回测结果 */}
          {backtestResult && (
            <Card sx={{ mt: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  回测结果 {selectedStrategy?.name && `- ${selectedStrategy.name}`}
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
                        sx={{ color: backtestResult.total_return >= 0 ? '#ef0428' : '#00c853' }}
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
                      <Typography variant="h5" sx={{ color: '#00c853' }}>
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
                            color={trade.action === 'BUY' ? 'error' : 'success'}
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

      {/* 代码查看对话框 */}
      <Dialog open={codeDialogOpen} onClose={() => setCodeDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{(selectedStrategy || selectedBuiltin)?.name || '策略代码'}</DialogTitle>
        <DialogContent>
          {((selectedStrategy || selectedBuiltin))?.code && (
            <SyntaxHighlighter
              language="python"
              style={vscDarkPlus}
              customStyle={{ margin: 0, borderRadius: 4, maxHeight: '60vh' }}
            >
              {(selectedStrategy || selectedBuiltin)?.code || ''}
            </SyntaxHighlighter>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};
