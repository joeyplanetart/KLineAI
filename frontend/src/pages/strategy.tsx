import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import {
  AutoFixHigh as AutoFixHighIcon,
  CandlestickChart as CandlestickChartIcon,
  QueryStats as QueryStatsIcon,
} from '@mui/icons-material';
import ReactECharts from 'echarts-for-react';

const API_URL = 'http://localhost:8000/api/v1';

const DEFAULT_CODE = `my_indicator_name = "示例：布林带触发"
my_indicator_description = "简单布林带策略信号"

period = 20
mult = 2.0

mid = df['close'].rolling(period).mean()
std = df['close'].rolling(period).std()
upper = mid + mult * std
lower = mid - mult * std

raw_buy = df['close'] < lower
raw_sell = df['close'] > upper

buy = raw_buy.fillna(False) & (~raw_buy.shift(1).fillna(False))
sell = raw_sell.fillna(False) & (~raw_sell.shift(1).fillna(False))

df['buy'] = buy.astype(bool)
df['sell'] = sell.astype(bool)
`;

type PeriodType = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';

interface StockOption {
  code: string;
  name: string;
  search_key: string;
}

interface Candle {
  trade_date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  pct_change?: number;
}

interface IndicatorOption {
  id: string;
  label: string;
}

const INDICATOR_OPTIONS: IndicatorOption[] = [
  { id: 'MA5', label: 'MA5' },
  { id: 'MA10', label: 'MA10' },
  { id: 'MA20', label: 'MA20' },
  { id: 'EMA12', label: 'EMA12' },
  { id: 'EMA26', label: 'EMA26' },
  { id: 'BOLL', label: 'BOLL' },
];

const rollingAverage = (values: number[], period: number): Array<number | null> =>
  values.map((_, index) => {
    if (index < period - 1) {
      return null;
    }
    let sum = 0;
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      sum += values[cursor];
    }
    return Number((sum / period).toFixed(3));
  });

const rollingStd = (values: number[], period: number): Array<number | null> =>
  values.map((_, index) => {
    if (index < period - 1) {
      return null;
    }
    let sum = 0;
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      sum += values[cursor];
    }
    const mean = sum / period;
    let variance = 0;
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      variance += (values[cursor] - mean) ** 2;
    }
    return Number(Math.sqrt(variance / period).toFixed(3));
  });

const calcEma = (values: number[], period: number): Array<number | null> => {
  if (values.length === 0) {
    return [];
  }
  const multiplier = 2 / (period + 1);
  const result: Array<number | null> = new Array(values.length).fill(null);
  let previousEma = values[0];
  result[0] = Number(previousEma.toFixed(3));
  for (let i = 1; i < values.length; i += 1) {
    previousEma = (values[i] - previousEma) * multiplier + previousEma;
    result[i] = Number(previousEma.toFixed(3));
  }
  return result;
};

const normalizeSymbol = (code: string): string => (code.startsWith('6') ? `sh${code}` : `sz${code}`);

export const StrategyPage: React.FC = () => {
  const [editorCode, setEditorCode] = useState(DEFAULT_CODE);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [symbolKeyword, setSymbolKeyword] = useState('');
  const [symbolOptions, setSymbolOptions] = useState<StockOption[]>([]);
  const [symbolLoading, setSymbolLoading] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<StockOption | null>(null);

  const [period, setPeriod] = useState<PeriodType>('1d');
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>(['MA5', 'MA20', 'BOLL']);

  const [candles, setCandles] = useState<Candle[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const hasUserSelectedSymbol = useRef(false);
  const searchSeq = useRef(0);

  useEffect(() => {
    const debounceTimer = setTimeout(async () => {
      if (!symbolKeyword.trim()) {
        setSymbolOptions([]);
        return;
      }
      const currentSeq = ++searchSeq.current;
      setSymbolLoading(true);
      try {
        const response = await fetch(
          `${API_URL}/market/search?q=${encodeURIComponent(symbolKeyword.trim())}&limit=20`,
        );
        if (currentSeq !== searchSeq.current) return;
        const data = (await response.json()) as StockOption[];
        const unique = data.filter((item, idx, arr) => arr.findIndex(v => v.code === item.code) === idx);
        setSymbolOptions(unique || []);
      } catch {
        setGlobalError('股票搜索失败，请检查后端服务');
      } finally {
        setSymbolLoading(false);
      }
    }, 250);
    return () => clearTimeout(debounceTimer);
  }, [symbolKeyword]);

  useEffect(() => {
    if (!selectedSymbol) {
      return;
    }
    const loadChartData = async () => {
      setChartLoading(true);
      setGlobalError(null);
      try {
        const symbol = normalizeSymbol(selectedSymbol.code);
        const response = await fetch(`${API_URL}/market/${symbol}?page=1&page_size=240`);
        const data = await response.json();
        const rows = ((data?.data || []) as Candle[]).slice().reverse();
        setCandles(rows);
      } catch {
        setGlobalError('图表数据加载失败，请确认该股票存在历史数据');
        setCandles([]);
      } finally {
        setChartLoading(false);
      }
    };
    loadChartData();
  }, [selectedSymbol, period]);

  useEffect(() => {
    if (selectedSymbol || symbolOptions.length === 0 || hasUserSelectedSymbol.current) {
      return;
    }
    setSelectedSymbol(symbolOptions[0]);
  }, [symbolOptions, selectedSymbol]);

  // Load from watchlist on mount
  useEffect(() => {
    const saved = localStorage.getItem('ai_analysis_watchlist');
    if (saved) {
      try {
        const watchlist = JSON.parse(saved);
        if (watchlist.length > 0) {
          const recent = watchlist[watchlist.length - 1];
          const code = recent.symbol.replace(/^(sz|sh)/i, '');
          const exchange = recent.symbol.toLowerCase().startsWith('sh') ? 'SH' : 'SZ';
          const stockOption: StockOption = {
            code,
            name: recent.name,
            search_key: `${recent.name} (${code}.${exchange})`,
          };
          setSelectedSymbol(stockOption);
          hasUserSelectedSymbol.current = true;
          setSymbolKeyword(code);
          setSymbolOptions([stockOption]);
        }
      } catch (e) {
        console.error('Failed to load watchlist:', e);
      }
    }
  }, []);

  const handleGenerateCode = async () => {
    if (!aiPrompt.trim()) {
      return;
    }
    setAiLoading(true);
    setGlobalError(null);
    try {
      const response = await fetch(`${API_URL}/strategy/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: aiPrompt,
          name: 'indicator_ide_generated',
          save: false,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || 'AI 生成失败');
      }
      setEditorCode(data.code || DEFAULT_CODE);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : 'AI 生成失败');
    } finally {
      setAiLoading(false);
    }
  };

  const chartOption = useMemo(() => {
    const dates = candles.map((item) => item.trade_date);
    const closeValues = candles.map((item) => item.close);
    const klineData = candles.map((item) => [item.open, item.close, item.low, item.high]);
    const volumeData = candles.map((item) => item.volume);
    const candleMap = new Map(candles.map((item) => [item.trade_date, item]));

    const ma5 = rollingAverage(closeValues, 5);
    const ma10 = rollingAverage(closeValues, 10);
    const ma20 = rollingAverage(closeValues, 20);
    const ema12 = calcEma(closeValues, 12);
    const ema26 = calcEma(closeValues, 26);
    const bollMid = rollingAverage(closeValues, 20);
    const bollStd = rollingStd(closeValues, 20);
    const bollUpper = bollMid.map((mid, idx) =>
      mid === null || bollStd[idx] === null ? null : Number((mid + (bollStd[idx] as number) * 2).toFixed(3)),
    );
    const bollLower = bollMid.map((mid, idx) =>
      mid === null || bollStd[idx] === null ? null : Number((mid - (bollStd[idx] as number) * 2).toFixed(3)),
    );

    const indicatorSeries = [];
    if (selectedIndicators.includes('MA5')) {
      indicatorSeries.push({ name: 'MA5', type: 'line', data: ma5, smooth: true, showSymbol: false, lineStyle: { width: 1.1, color: '#ffb300' } });
    }
    if (selectedIndicators.includes('MA10')) {
      indicatorSeries.push({ name: 'MA10', type: 'line', data: ma10, smooth: true, showSymbol: false, lineStyle: { width: 1.1, color: '#26a69a' } });
    }
    if (selectedIndicators.includes('MA20')) {
      indicatorSeries.push({ name: 'MA20', type: 'line', data: ma20, smooth: true, showSymbol: false, lineStyle: { width: 1.1, color: '#42a5f5' } });
    }
    if (selectedIndicators.includes('EMA12')) {
      indicatorSeries.push({ name: 'EMA12', type: 'line', data: ema12, smooth: true, showSymbol: false, lineStyle: { width: 1.1, color: '#ff7043' } });
    }
    if (selectedIndicators.includes('EMA26')) {
      indicatorSeries.push({ name: 'EMA26', type: 'line', data: ema26, smooth: true, showSymbol: false, lineStyle: { width: 1.1, color: '#7e57c2' } });
    }
    if (selectedIndicators.includes('BOLL')) {
      indicatorSeries.push(
        { name: 'BOLL.UP', type: 'line', data: bollUpper, showSymbol: false, lineStyle: { width: 1, type: 'dashed', color: '#00acc1' } },
        { name: 'BOLL.MID', type: 'line', data: bollMid, showSymbol: false, lineStyle: { width: 1, color: '#66bb6a' } },
        { name: 'BOLL.LOW', type: 'line', data: bollLower, showSymbol: false, lineStyle: { width: 1, type: 'dashed', color: '#ef5350' } },
      );
    }

    return {
      animation: false,
      legend: { top: 8 },
      axisPointer: { link: [{ xAxisIndex: [0, 1] }] },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const date = params[0].axisValue;
          const kline = params.find((p: any) => p.seriesName === 'K线');
          if (!kline) return date;
          const candle = candleMap.get(date);
          if (!candle) return date;
          const { open, close, high, low, pct_change } = candle;
          if (open == null || close == null) return date;
          const isUp = pct_change != null ? pct_change >= 0 : close >= open;
          const color = isUp ? '#f44336' : '#26a69a';
          const sign = isUp ? '↑' : '↓';
          const changePct = pct_change != null ? Math.abs(pct_change).toFixed(2) : (Math.abs((close - open) / open * 100)).toFixed(2);
          let html = `<div style="font-size:12px"><b>${date}</b><br/>`;
          html += `开: ${open.toFixed(2)}<br/>`;
          html += `收: <span style="color:${color}">${close.toFixed(2)}</span> `;
          html += `<span style="color:${color}">${sign}${changePct}%</span><br/>`;
          html += `高: ${(high ?? close).toFixed(2)}<br/>`;
          html += `低: ${(low ?? open).toFixed(2)}<br/>`;
          const vol = params.find((p: any) => p.seriesName === '成交量');
          if (vol) {
            const volValue = vol.data?.value ?? vol.data;
            if (volValue != null) {
              html += `<span style="color:${color}">成交量: ${(Number(volValue) / 10000).toFixed(2)}万手</span>`;
            }
          }
          return html;
        },
      },
      grid: [
        { left: '4%', right: '2%', top: 44, height: '58%' },
        { left: '4%', right: '2%', top: '74%', height: '20%' },
      ],
      xAxis: [
        { type: 'category', data: dates, boundaryGap: true, axisLine: { onZero: false }, min: 'dataMin', max: 'dataMax', axisLabel: { color: '#666', formatter: (val: string) => { const d = val.split('-'); return d[0] === '2026' ? `${d[1]}-${d[2]}` : val; } } },
        { type: 'category', gridIndex: 1, data: dates, boundaryGap: true, axisLine: { onZero: false }, axisLabel: { show: false }, axisTick: { show: false }, min: 'dataMin', max: 'dataMax' },
      ],
      yAxis: [
        { scale: true, splitArea: { show: true }, axisLabel: { color: '#666', formatter: (v: number) => v.toFixed(0) } },
        { scale: true, gridIndex: 1, splitNumber: 2, axisLabel: { formatter: (value: number) => `${Math.round(value / 10000000)}`, color: '#666' } },
      ],
      dataZoom: [
        { type: 'inside', xAxisIndex: [0, 1], start: 0, end: 100 },
        { show: true, type: 'slider', xAxisIndex: [0, 1], bottom: 4, start: 0, end: 100 },
      ],
      series: [
        {
          name: 'K线',
          type: 'candlestick',
          data: klineData,
          itemStyle: {
            color: '#f44336',
            color0: '#26a69a',
            borderColor: '#f44336',
            borderColor0: '#26a69a',
          },
        },
        ...indicatorSeries,
        {
          name: '成交量',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: candles.map((c) => {
            const isUp = c.pct_change != null ? c.pct_change >= 0 : c.close >= c.open;
            return {
              value: c.volume,
              itemStyle: { color: isUp ? '#f44336' : '#26a69a' },
            };
          }),
        },
      ],
    };
  }, [candles, selectedIndicators]);

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
        指标IDE（策略中心）
      </Typography>

      {globalError && (
        <Alert sx={{ mb: 2 }} severity="error" onClose={() => setGlobalError(null)}>
          {globalError}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  指标代码编辑器
                </Typography>
                <Chip icon={<QueryStatsIcon />} size="small" label="Python" />
              </Box>
              <TextField
                value={editorCode}
                onChange={(event) => setEditorCode(event.target.value)}
                multiline
                minRows={22}
                fullWidth
                placeholder="在此编辑指标代码..."
                sx={{
                  '& .MuiInputBase-root': {
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    fontSize: 13,
                    bgcolor: '#111827',
                    color: '#e5e7eb',
                    borderRadius: 1,
                  },
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#334155 !important',
                  },
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <AutoFixHighIcon color="primary" />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  AI 生成代码
                </Typography>
              </Box>
              <TextField
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.target.value)}
                multiline
                minRows={4}
                fullWidth
                placeholder="描述你想要生成的指标逻辑，例如：5日均线上穿20日均线时做多..."
              />
              <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary">
                  将生成结果覆盖到左侧编辑器
                </Typography>
                <Button
                  variant="contained"
                  onClick={handleGenerateCode}
                  disabled={!aiPrompt.trim() || aiLoading}
                  startIcon={aiLoading ? <CircularProgress size={16} color="inherit" /> : <AutoFixHighIcon />}
                >
                  {aiLoading ? '生成中...' : '生成代码'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 8 }}>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
                图表与交易
              </Typography>
              <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
                <Grid size={{ xs: 12, md: 3 }}>
                  <Autocomplete
                    options={symbolOptions}
                    loading={symbolLoading}
                    value={selectedSymbol}
                    onChange={(_, value) => { hasUserSelectedSymbol.current = true; setSelectedSymbol(value); }}
                    onInputChange={(_, value) => setSymbolKeyword(value)}
                    getOptionLabel={(option) => option.search_key}
                    isOptionEqualToValue={(option, value) => option.code === value.code}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        size="small"
                        label="股票标的"
                        placeholder="输入代码或名称，例如 601398"
                      />
                    )}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 3 }}>
                  <ToggleButtonGroup
                    value={period}
                    exclusive
                    onChange={(_, value: PeriodType | null) => {
                      if (value) {
                        setPeriod(value);
                      }
                    }}
                    size="small"
                    fullWidth
                  >
                    <ToggleButton value="30m">30M</ToggleButton>
                    <ToggleButton value="1h">1H</ToggleButton>
                    <ToggleButton value="1d">1D</ToggleButton>
                  </ToggleButtonGroup>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Autocomplete
                    multiple
                    size="small"
                    options={INDICATOR_OPTIONS}
                    value={INDICATOR_OPTIONS.filter((item) => selectedIndicators.includes(item.id))}
                    onChange={(_, next) => setSelectedIndicators(next.map((item) => item.id))}
                    getOptionLabel={(item) => item.label}
                    renderInput={(params) => <TextField {...params} label="指标选择器" />}
                  />
                </Grid>
              </Grid>

              <Divider sx={{ mb: 1.5 }} />

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CandlestickChartIcon color="primary" />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  图表窗口（K线 + 指标）
                </Typography>
              </Box>

              <Box sx={{ minHeight: 520, position: 'relative' }}>
                {chartLoading && (
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 1,
                      bgcolor: 'rgba(255, 255, 255, 0.55)',
                    }}
                  >
                    <CircularProgress />
                  </Box>
                )}
                {candles.length > 0 ? (
                  <ReactECharts option={chartOption} style={{ height: 520 }} notMerge />
                ) : (
                  <Box
                    sx={{
                      minHeight: 520,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 1,
                    }}
                  >
                    <Typography color="text.secondary">暂无K线数据</Typography>
                    <Typography variant="caption" color="text.secondary">
                      请先通过搜索框选择有历史行情的股票标的
                    </Typography>
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};
