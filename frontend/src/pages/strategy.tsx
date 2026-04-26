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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AutoFixHigh as AutoFixHighIcon,
  History as HistoryIcon,
  PlayArrow as PlayArrowIcon,
  QueryStats as QueryStatsIcon,
  Save as SaveIcon,
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

interface SavedIndicator {
  id: number;
  name: string;
  description: string;
  code: string;
  createdAt: string;
}

const BUILTIN_INDICATORS: IndicatorOption[] = [
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
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>([]);

  const [candles, setCandles] = useState<Candle[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const hasUserSelectedSymbol = useRef(false);
  const searchSeq = useRef(0);
  const [saving, setSaving] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [indicatorNameToSave, setIndicatorNameToSave] = useState('');
  const [savedIndicators, setSavedIndicators] = useState<SavedIndicator[]>([]);
  const [indicatorSignals, setIndicatorSignals] = useState<{ buy: number[]; sell: number[] }>({ buy: [], sell: [] });
  const [activeIndicator, setActiveIndicator] = useState<string | null>(null);
  const [activeRightTab, setActiveRightTab] = useState(0);

  // 回测相关状态
  const [backtestRange, setBacktestRange] = useState('6M');
  const [backtestCapital, setBacktestCapital] = useState('100000');
  const [backtestFee, setBacktestFee] = useState('0.02');
  const [backtestRunning, setBacktestRunning] = useState(false);
  const [backtestResults, setBacktestResults] = useState<any>(null);

  // 回测信号的买卖点（用于图表标记）- 现在是日期字符串列表
  const backtestBuySignals = backtestResults?.buy_signals ?? [];
  const backtestSellSignals = backtestResults?.sell_signals ?? [];

  // 决定使用哪种信号源 - 回测信号基于日期，需要转换成索引
  const displaySignals = useMemo(() => {
    if (backtestResults && (backtestBuySignals.length > 0 || backtestSellSignals.length > 0)) {
      // 将日期信号转换为索引
      const buyIndices = backtestBuySignals.map((date: string) => {
        const idx = candles.findIndex(c => c.trade_date === date);
        return idx;
      }).filter(idx => idx >= 0);

      const sellIndices = backtestSellSignals.map((date: string) => {
        const idx = candles.findIndex(c => c.trade_date === date);
        return idx;
      }).filter(idx => idx >= 0);

      return { buy: buyIndices, sell: sellIndices };
    }
    return indicatorSignals;
  }, [backtestResults, backtestBuySignals, backtestSellSignals, indicatorSignals, candles]);

  const indicatorOptions = useMemo(() => {
    const saved = savedIndicators.map(ind => ({ id: `saved_${ind.id}`, label: ind.name }));
    return [...BUILTIN_INDICATORS, ...saved];
  }, [savedIndicators]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  // Load saved indicators from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('saved_indicators');
    if (saved) {
      try {
        setSavedIndicators(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load saved indicators:', e);
      }
    }

    // Check for pending indicator to apply to editor
    const pendingEditor = localStorage.getItem('indicator_to_apply_to_editor');
    if (pendingEditor) {
      try {
        const { code, name } = JSON.parse(pendingEditor);
        setEditorCode(code);
        setMessage({ type: 'success', text: `指标 "${name}" 已应用` });
        localStorage.removeItem('indicator_to_apply_to_editor');
      } catch (e) {
        console.error('Failed to apply indicator:', e);
      }
    }

    // Check for pending indicator to apply to selector
    const pendingSelector = localStorage.getItem('indicator_to_apply_to_selector');
    if (pendingSelector) {
      localStorage.removeItem('indicator_to_apply_to_selector');
      try {
        const { id, name } = JSON.parse(pendingSelector);
        // Store pending apply info for dedicated effect to process after candles load
        localStorage.setItem('pending_indicator_apply', JSON.stringify({ id }));
        setActiveIndicator(id + '_pending');
        setMessage({ type: 'success', text: `指标 "${name}" 已应用` });
      } catch (e) {
        console.error('Failed to apply indicator to selector:', e);
      }
    }
  }, []); // Empty deps - run once on mount

  // Fetch signals when activeIndicator changes
  useEffect(() => {
    if (!activeIndicator || activeIndicator.endsWith('_pending')) return;
    if (candles.length === 0) return;

    const fetchSignals = () => {
      // Check if it's a saved indicator
      if (activeIndicator.startsWith('saved_')) {
        const indicatorId = parseInt(activeIndicator.replace('saved_', ''));
        const indicator = savedIndicators.find(ind => ind.id === indicatorId);
        if (indicator) {
          const data = candles.map(c => ({
            trade_date: c.trade_date,
            open: c.open,
            close: c.close,
            high: c.high,
            low: c.low,
            volume: c.volume,
          }));
          fetch(`${API_URL}/strategy/indicator/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: indicator.code, data }),
          }).then(res => res.json()).then(signals => {
            setIndicatorSignals(signals);
          });
        }
      } else {
        // Check if it's a builtin or custom indicator with stored code
        const indicatorCodes = JSON.parse(localStorage.getItem('indicator_codes') || '{}');
        const code = indicatorCodes[activeIndicator];
        if (code) {
          const data = candles.map(c => ({
            trade_date: c.trade_date,
            open: c.open,
            close: c.close,
            high: c.high,
            low: c.low,
            volume: c.volume,
          }));
          fetch(`${API_URL}/strategy/indicator/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, data }),
          }).then(res => res.json()).then(signals => {
            setIndicatorSignals(signals);
          });
        }
      }
    };

    fetchSignals();
  }, [activeIndicator, candles.length, savedIndicators]);

  // Dedicated effect to fetch signals when indicator is applied from indicator square
  // This handles the case where candles aren't loaded yet when indicator_to_apply_to_selector is processed
  // Also handles case where candles weren't loaded when pending_indicator_apply was set
  useEffect(() => {
    const pendingApply = localStorage.getItem('pending_indicator_apply');
    if (!pendingApply) return;

    // If activeIndicator still has _pending suffix, it means we haven't fetched signals yet
    if (activeIndicator && activeIndicator.endsWith('_pending')) {
      // This means candles weren't loaded when we tried to apply indicator
      // Now candles are loaded, fetch signals
      const { id } = JSON.parse(pendingApply);
      localStorage.removeItem('pending_indicator_apply');

      // Get the code from indicator_codes localStorage (set by indicator square before navigation)
      const indicatorCodes = JSON.parse(localStorage.getItem('indicator_codes') || '{}');
      const code = indicatorCodes[id];
      if (!code) return;

      const data = candles.map(c => ({
        trade_date: c.trade_date,
        open: c.open,
        close: c.close,
        high: c.high,
        low: c.low,
        volume: c.volume,
      }));
      fetch(`${API_URL}/strategy/indicator/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, data }),
      }).then(res => res.json()).then(signals => {
        setIndicatorSignals(signals);
        setActiveIndicator(id);
        setSelectedIndicators(prev => prev.includes(id) ? prev : [...prev, id]);
      });
    }
  }, [candles.length]); // Only candles.length - activeIndicator is read-only here to avoid infinite loops

  const handleOpenSaveDialog = () => {
    const nameMatch = editorCode.match(/my_indicator_name\s*=\s*["']([^"']+)["']/);
    setIndicatorNameToSave(nameMatch ? nameMatch[1] : '');
    setSaveDialogOpen(true);
  };

  const handleConfirmSave = () => {
    if (!indicatorNameToSave.trim()) return;
    setSaving(true);
    setSaveDialogOpen(false);
    try {
      const descMatch = editorCode.match(/my_indicator_description\s*=\s*["']([^"']+)["']/);
      const description = descMatch ? descMatch[1] : '';
      const newIndicator: SavedIndicator = {
        id: Date.now(),
        name: indicatorNameToSave.trim(),
        description,
        code: editorCode,
        createdAt: new Date().toISOString(),
      };
      const updated = [...savedIndicators, newIndicator];
      setSavedIndicators(updated);
      localStorage.setItem('saved_indicators', JSON.stringify(updated));
      setMessage({ type: 'success', text: `指标 "${newIndicator.name}" 已保存` });
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
      setIndicatorNameToSave('');
    }
  };

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

  const handleRunBacktest = async () => {
    if (!selectedSymbol || candles.length === 0) {
      setGlobalError('请先选择股票标的并加载数据');
      return;
    }
    setBacktestRunning(true);
    setGlobalError(null);
    try {
      const symbol = normalizeSymbol(selectedSymbol.code);
      // 根据 range 计算日期范围
      const now = new Date();
      let startDate: string;
      const rangeValue = parseInt(backtestRange);
      if (backtestRange.endsWith('M')) {
        startDate = new Date(now.setMonth(now.getMonth() - rangeValue)).toISOString().split('T')[0];
      } else if (backtestRange.endsWith('Y')) {
        startDate = new Date(now.setFullYear(now.getFullYear() - rangeValue)).toISOString().split('T')[0];
      } else {
        startDate = '';
      }
      const endDate = new Date().toISOString().split('T')[0];

      const strategyCode = (activeIndicator && !activeIndicator.endsWith('_pending')) ? editorCode : 'default_ma_cross';

      const response = await fetch(`${API_URL}/strategy/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          strategy_code: strategyCode,
          start_date: startDate || undefined,
          end_date: endDate,
          initial_capital: parseFloat(backtestCapital),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || '回测失败');
      }
      setBacktestResults(data);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : '回测失败');
    } finally {
      setBacktestRunning(false);
    }
  };

  const chartOption = useMemo(() => {
    const dates = candles.map((item) => item.trade_date);
    const closeValues = candles.map((item) => item.close);
    const klineData = candles.map((item) => [item.open, item.close, item.low, item.high]);
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
    // MA5, MA10, MA20 always shown by default
    indicatorSeries.push({ name: 'MA5', type: 'line', data: ma5, smooth: true, showSymbol: false, lineStyle: { width: 1.1, color: '#ffb300' } });
    indicatorSeries.push({ name: 'MA10', type: 'line', data: ma10, smooth: true, showSymbol: false, lineStyle: { width: 1.1, color: '#26a69a' } });
    indicatorSeries.push({ name: 'MA20', type: 'line', data: ma20, smooth: true, showSymbol: false, lineStyle: { width: 1.1, color: '#42a5f5' } });
    // Optional indicators controlled by selector
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
          markPoint: displaySignals && (displaySignals.buy.length > 0 || displaySignals.sell.length > 0) ? {
            symbol: 'circle',
            symbolSize: 8,
            data: [
              ...displaySignals.buy.map(idx => ({
                coord: [idx, klineData[idx] ? (klineData[idx][2] as number) - 0.5 : (closeValues[idx] as number) - 0.5],
                value: 'B',
                itemStyle: { color: '#f44336', fontSize: 12, fontWeight: 'bold' },
                label: { show: true, position: 'bottom', formatter: 'B', color: '#f44336', fontSize: 12, fontWeight: 'bold' },
              })),
              ...displaySignals.sell.map(idx => ({
                coord: [idx, klineData[idx] ? (klineData[idx][3] as number) + 0.5 : (closeValues[idx] as number) + 0.5],
                value: 'S',
                itemStyle: { color: '#26a69a', fontSize: 12, fontWeight: 'bold' },
                label: { show: true, position: 'top', formatter: 'S', color: '#26a69a', fontSize: 12, fontWeight: 'bold' },
              })),
            ],
          } : undefined,
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
  }, [candles, selectedIndicators, indicatorSignals, activeIndicator, backtestBuySignals, backtestSellSignals, backtestResults, displaySignals]);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          指标IDE
        </Typography>
      </Box>

      {message && (
        <Alert sx={{ mb: 2 }} severity={message.type} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

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
                  指标编辑器
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Tooltip title="保存指标">
                    <IconButton onClick={handleOpenSaveDialog} disabled={!editorCode.trim()} size="small" color="primary">
                      <SaveIcon />
                    </IconButton>
                  </Tooltip>
                  <Chip icon={<QueryStatsIcon />} size="small" label="Python" />
                </Box>
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
                图表与回测
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
                    options={indicatorOptions}
                    value={indicatorOptions.filter((item) => selectedIndicators.includes(item.id))}
                    onChange={async (_, next) => {
                      setSelectedIndicators(next.map((item) => item.id));
                      // Check if a saved indicator is selected
                      const savedSelected = next.find(item => item.id.startsWith('saved_'));
                      if (savedSelected && candles.length > 0) {
                        const indicatorId = savedSelected.id.replace('saved_', '');
                        const indicator = savedIndicators.find(ind => ind.id === parseInt(indicatorId));
                        if (indicator) {
                          setActiveIndicator(indicator.id.toString());
                          try {
                            const data = candles.map(c => ({
                              trade_date: c.trade_date,
                              open: c.open,
                              close: c.close,
                              high: c.high,
                              low: c.low,
                              volume: c.volume,
                            }));
                            const response = await fetch(`${API_URL}/strategy/indicator/apply`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ code: indicator.code, data }),
                            });
                            if (response.ok) {
                              const signals = await response.json();
                              setIndicatorSignals(signals);
                            }
                          } catch (err) {
                            console.error('Failed to apply indicator:', err);
                          }
                        }
                      } else {
                        setActiveIndicator(null);
                        setIndicatorSignals({ buy: [], sell: [] });
                      }
                    }}
                    getOptionLabel={(item) => item.label}
                    renderInput={(params) => <TextField {...params} label="指标选择器" />}
                  />
                </Grid>
              </Grid>

              <Divider sx={{ mb: 1.5 }} />

              <Tabs value={activeRightTab} onChange={(_, v) => setActiveRightTab(v)} sx={{ mb: 1 }}>
                <Tab label="图表窗口" />
                <Tab label="回测结果" />
              </Tabs>

              {activeRightTab === 1 && (
                <Box>
                  {/* 回测参数区域 */}
                  <Card variant="outlined" sx={{ mb: 2, bgcolor: '#f8fafc' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>回测参数</Typography>
                      <Grid container spacing={2} sx={{ alignItems: 'center' }}>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <FormControl size="small" fullWidth>
                            <InputLabel>日期范围</InputLabel>
                            <Select value={backtestRange} label="日期范围" onChange={(e) => setBacktestRange(e.target.value)}>
                              <MenuItem value="1M">1个月</MenuItem>
                              <MenuItem value="3M">3个月</MenuItem>
                              <MenuItem value="6M">6个月</MenuItem>
                              <MenuItem value="1Y">1年</MenuItem>
                              <MenuItem value="2Y">2年</MenuItem>
                              <MenuItem value="3Y">3年</MenuItem>
                            </Select>
                          </FormControl>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <TextField size="small" label="初始资金" value={backtestCapital} onChange={(e) => setBacktestCapital(e.target.value)} fullWidth />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <TextField size="small" label="手续费(%)" value={backtestFee} onChange={(e) => setBacktestFee(e.target.value)} fullWidth />
                        </Grid>
                        <Grid size={{ xs: 12, md: 3 }}>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Tooltip title="运行回测">
                              <Button variant="contained" startIcon={backtestRunning ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />} onClick={handleRunBacktest} disabled={backtestRunning || !selectedSymbol} size="small" sx={{ minWidth: 0, px: 1.5 }} />
                            </Tooltip>
                            <Tooltip title="历史记录">
                              <Button variant="outlined" startIcon={<HistoryIcon />} size="small" sx={{ minWidth: 0, px: 1.5 }} />
                            </Tooltip>
                          </Box>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>

                  {/* 回测结果区域 */}
                  <Box sx={{ minHeight: 400 }}>
                    {backtestResults ? (
                      <Grid container spacing={2}>
                        <Grid size={{ xs: 12 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>回测结果</Typography>
                        </Grid>
                        {/* 收益统计卡片 */}
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <Card sx={{ bgcolor: backtestResults.total_return >= 0 ? '#fff3e0' : '#e3f2fd', border: '1px solid', borderColor: backtestResults.total_return >= 0 ? '#ff9800' : '#2196f3' }}>
                            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                              <Typography variant="caption" color="text.secondary">总收益率</Typography>
                              <Typography variant="h6" sx={{ fontWeight: 700, color: backtestResults.total_return >= 0 ? '#e65100' : '#1565c0' }}>
                                {backtestResults.total_return?.toFixed(2) ?? '0.00'}%
                              </Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <Card sx={{ bgcolor: '#f5f5f5' }}>
                            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                              <Typography variant="caption" color="text.secondary">最终资金</Typography>
                              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                ¥{(backtestResults.final_value ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                              </Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <Card sx={{ bgcolor: '#ffebee' }}>
                            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                              <Typography variant="caption" color="text.secondary">最大回撤</Typography>
                              <Typography variant="h6" sx={{ fontWeight: 700, color: '#2e7d32' }}>
                                {(backtestResults.max_drawdown ?? 0).toFixed(2)}%
                              </Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <Card sx={{ bgcolor: '#f5f5f5' }}>
                            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                              <Typography variant="caption" color="text.secondary">夏普比率</Typography>
                              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                {backtestResults.sharpe_ratio ?? '0.00'}
                              </Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                        {/* 交易统计 */}
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <Card sx={{ bgcolor: '#f5f5f5' }}>
                            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                              <Typography variant="caption" color="text.secondary">买入次数</Typography>
                              <Typography variant="h6" sx={{ fontWeight: 700 }}>{backtestResults.total_trades ?? 0}</Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <Card sx={{ bgcolor: '#e8f5e9' }}>
                            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                              <Typography variant="caption" color="text.secondary">盈利次数</Typography>
                              <Typography variant="h6" sx={{ fontWeight: 700, color: '#d32f2f' }}>{backtestResults.win_trades ?? 0}</Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <Card sx={{ bgcolor: '#ffebee' }}>
                            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                              <Typography variant="caption" color="text.secondary">亏损次数</Typography>
                              <Typography variant="h6" sx={{ fontWeight: 700, color: '#2e7d32' }}>{backtestResults.lose_trades ?? 0}</Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                          <Card sx={{ bgcolor: '#f5f5f5' }}>
                            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                              <Typography variant="caption" color="text.secondary">胜率</Typography>
                              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                {(backtestResults.win_rate ?? 0).toFixed(1)}%
                              </Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                        {/* 交易记录表格 - 显示完整交易对 */}
                        <Grid size={{ xs: 12 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>交易记录 (共{(backtestResults.completed_trade_details?.length ?? 0)}笔完整交易)</Typography>
                          <TableContainer component={Card}>
                            <Table size="small">
                              <TableHead>
                                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                  <TableCell>序号</TableCell>
                                  <TableCell>买入日期</TableCell>
                                  <TableCell>买入价格</TableCell>
                                  <TableCell>卖出日期</TableCell>
                                  <TableCell>卖出价格</TableCell>
                                  <TableCell align="right">数量</TableCell>
                                  <TableCell align="right">盈亏金额</TableCell>
                                  <TableCell align="right">收益率</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {(backtestResults.completed_trade_details ?? []).map((trade: any, idx: number) => {
                                  const buyAmount = trade.buy_price * trade.shares;
                                  const profitRate = (trade.profit / buyAmount) * 100;
                                  return (
                                    <TableRow key={idx} hover>
                                      <TableCell>{idx + 1}</TableCell>
                                      <TableCell>{trade.buy_date}</TableCell>
                                      <TableCell>¥{trade.buy_price?.toFixed(2)}</TableCell>
                                      <TableCell>{trade.sell_date}</TableCell>
                                      <TableCell>¥{trade.sell_price?.toFixed(2)}</TableCell>
                                      <TableCell align="right">{trade.shares}</TableCell>
                                      <TableCell align="right" sx={{ color: trade.profit >= 0 ? '#d32f2f' : '#2e7d32', fontWeight: 600 }}>
                                        {trade.profit >= 0 ? '+' : ''}¥{trade.profit?.toFixed(2)}
                                      </TableCell>
                                      <TableCell align="right" sx={{ color: profitRate >= 0 ? '#d32f2f' : '#2e7d32', fontWeight: 600 }}>
                                        {profitRate >= 0 ? '+' : ''}{profitRate.toFixed(2)}%
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                                {(!backtestResults.completed_trade_details || backtestResults.completed_trade_details.length === 0) && (
                                  <TableRow>
                                    <TableCell colSpan={8} align="center">
                                      <Typography color="text.secondary" sx={{ py: 2 }}>暂无完整交易记录</Typography>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </Grid>
                      </Grid>
                    ) : (
                      <Box sx={{ minHeight: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                        <QueryStatsIcon sx={{ fontSize: 48, color: '#bdbdbd' }} />
                        <Typography color="text.secondary">请设置回测参数并点击"运行回测"</Typography>
                      </Box>
                    )}
                  </Box>
                </Box>
              )}

              {activeRightTab === 0 && (
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
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>保存指标</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="指标名称"
            value={indicatorNameToSave}
            onChange={(e) => setIndicatorNameToSave(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConfirmSave()}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>取消</Button>
          <Button onClick={handleConfirmSave} variant="contained" disabled={!indicatorNameToSave.trim() || saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
