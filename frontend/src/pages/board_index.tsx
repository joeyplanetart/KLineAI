import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  CircularProgress,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
} from '@mui/icons-material';

const API_URL = 'http://localhost:8000/api/v1';

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

export const BoardIndexPage: React.FC = () => {
  const [marketOverview, setMarketOverview] = useState<MarketOverview | null>(null);
  const [loading, setLoading] = useState(false);

  // 获取市场概览数据
  const fetchMarketOverview = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/market/overview`);
      if (response.ok) {
        const data = await response.json();
        setMarketOverview(data);
      }
    } catch (err) {
      console.error('Failed to fetch market overview:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarketOverview();
  }, []);

  return (
    <Box>

      {loading && !marketOverview ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : marketOverview ? (
        <>
          {/* 左侧：成交额 + 涨跌家数；右侧：主要指数（BaoStock） */}
          <Card sx={{ mb: 3 }}>
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
                  <Typography variant="h5" sx={{ fontWeight: 500, color: 'primary.main' }}>
                    {marketOverview.total_amount.toLocaleString()} 亿
                  </Typography>
                </Box>
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
            </CardContent>
          </Card>

          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 3 }}>
            {/* 港股主要指数 */}
            <Card sx={{ flex: { xs: 1, lg: 'none', xl: 1 }, minWidth: { lg: 320 } }}>
              <CardContent>
                <Typography color="textSecondary" variant="caption" sx={{ display: 'block', mb: 1.5 }}>
                  港股主要指数（优先 BaoStock；港股不支持则新浪 / 东财，无数据占位）
                </Typography>
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 1.5,
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
                          px: 1.5,
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
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {hasPct && (
                            pct >= 0 ? <TrendingUpIcon sx={{ fontSize: 14, color: '#ef0428' }} /> : <TrendingDownIcon sx={{ fontSize: 14, color: '#00c853' }} />
                          )}
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
                      </Box>
                    );
                  })}
                </Box>
              </CardContent>
            </Card>

            {/* 主要指数 */}
            <Card sx={{ flex: 1 }}>
              <CardContent>
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
                          px: 1.5,
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
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {hasPct && (
                            pct >= 0 ? <TrendingUpIcon sx={{ fontSize: 14, color: '#ef0428' }} /> : <TrendingDownIcon sx={{ fontSize: 14, color: '#00c853' }} />
                          )}
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
                      </Box>
                    );
                  })}
                </Box>
              </CardContent>
            </Card>
          </Box>
        </>
      ) : (
        <Card>
          <CardContent>
            <Typography color="textSecondary" sx={{ textAlign: 'center', py: 4 }}>
              暂无数据
            </Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};
