import React, { useState, useEffect } from 'react';
import { Card, CardContent, Typography, Grid, Box } from '@mui/material';
import {
  TrendingDown as TrendingDownIcon,
  AccountBalance as AccountBalanceIcon,
  PlayCircle as PlayCircleIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { API_URL } from '../config/api';

/** 用于首页「今日收益」示例统计的默认指数 */
const DEFAULT_SYMBOL = 'sh000001';

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

export const DashboardPage: React.FC = () => {
  const [stockData, setStockData] = useState<StockData[]>([]);

  const fetchStockData = async (stockSymbol: string) => {
    try {
      const response = await fetch(`${API_URL}/market/${stockSymbol}?page=1&page_size=100`);
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      setStockData(data.data || []);
    } catch {
      setStockData([]);
    }
  };

  useEffect(() => {
    void fetchStockData(DEFAULT_SYMBOL);
  }, []);

  const latestData = stockData.length > 0 ? stockData[0] : null;
  const prevData = stockData.length > 1 ? stockData[1] : null;

  const todayChange =
    latestData && prevData
      ? (((latestData.close - prevData.close) / prevData.close) * 100).toFixed(2)
      : '0.00';

  const StatCard: React.FC<{
    title: string;
    value: number | string;
    icon: React.ReactNode;
    color?: string;
    suffix?: string;
    accent?: string;
  }> = ({ title, value, icon, color, suffix, accent }) => (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Box
            sx={(theme) => ({
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 48,
              height: 48,
              borderRadius: 2,
              bgcolor: alpha(accent ?? theme.palette.primary.main, 0.12),
              mr: 2,
            })}
          >
            {icon}
          </Box>
          <Typography color="text.secondary" variant="body2">
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
            icon={<AccountBalanceIcon color="primary" />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="今日收益"
            value={`${parseFloat(todayChange) >= 0 ? '+' : ''}${todayChange}%`}
            icon={<TrendingDownIcon sx={{ color: parseFloat(todayChange) >= 0 ? '#ef0428' : '#00c853' }} />}
            color={parseFloat(todayChange) >= 0 ? '#ef0428' : '#00c853'}
            accent={parseFloat(todayChange) >= 0 ? '#ef0428' : '#00c853'}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="运行策略数"
            value={3}
            icon={<PlayCircleIcon color="success" />}
            color="#2e7d32"
            accent="#2e7d32"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="待处理风控警告"
            value={0}
            icon={<WarningIcon color="warning" />}
            color="#ed6c02"
            accent="#ed6c02"
          />
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <AnalysisPanel />
        </CardContent>
      </Card>
    </Box>
  );
};
