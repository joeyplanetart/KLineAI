import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Timeline as TimelineIcon,
  TrendingUp as TrendingUpIcon,
  AttachMoney as CostIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config/api';

interface UsageSummary {
  total_calls: number;
  total_tokens: number;
  total_cost: number;
  avg_latency_ms: number;
}

interface UsageByModel {
  model: string;
  calls: number;
  total_tokens: number;
  cost: number;
}

interface UsageTrendItem {
  date: string;
  calls: number;
  tokens: number;
  cost: number;
}

interface UsageResponse {
  summary: UsageSummary;
  by_model: UsageByModel[];
  recent_trend: UsageTrendItem[];
}

export const UsagePage: React.FC = () => {
  const { accessToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usageData, setUsageData] = useState<UsageResponse | null>(null);
  const [days, setDays] = useState(7);

  useEffect(() => {
    fetchUsage();
  }, [days]);

  const fetchUsage = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/usage?days=${days}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw new Error('获取用量统计失败');
      }
      const data = await response.json();
      setUsageData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
          <FormControl sx={{ minWidth: 140 }} size="small">
            <InputLabel>时间范围</InputLabel>
            <Select value={days} label="时间范围" onChange={(e) => setDays(e.target.value as number)}>
              <MenuItem value={7}>最近 7 天</MenuItem>
              <MenuItem value={14}>最近 14 天</MenuItem>
              <MenuItem value={30}>最近 30 天</MenuItem>
              <MenuItem value={90}>最近 90 天</MenuItem>
            </Select>
          </FormControl>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {usageData && (
        <>
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <TimelineIcon color="primary" sx={{ fontSize: 40 }} />
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      调用总次数
                    </Typography>
                    <Typography variant="h4">{usageData.summary.total_calls}</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <TrendingUpIcon color="secondary" sx={{ fontSize: 40 }} />
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Token 总量
                    </Typography>
                    <Typography variant="h4">{usageData.summary.total_tokens.toLocaleString()}</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <CostIcon color="success" sx={{ fontSize: 40 }} />
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      费用合计
                    </Typography>
                    <Typography variant="h4">¥{usageData.summary.total_cost.toFixed(6)}</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <SpeedIcon color="warning" sx={{ fontSize: 40 }} />
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      平均延迟
                    </Typography>
                    <Typography variant="h4">{usageData.summary.avg_latency_ms} ms</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    按模型统计
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>模型</TableCell>
                          <TableCell align="right">调用次数</TableCell>
                          <TableCell align="right">Token 数</TableCell>
                          <TableCell align="right">费用（元）</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {usageData.by_model.map((model) => (
                          <TableRow key={model.model}>
                            <TableCell>
                              <Chip label={model.model} size="small" />
                            </TableCell>
                            <TableCell align="right">{model.calls}</TableCell>
                            <TableCell align="right">{model.total_tokens.toLocaleString()}</TableCell>
                            <TableCell align="right">¥{model.cost.toFixed(6)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    按日趋势
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>日期</TableCell>
                          <TableCell align="right">调用次数</TableCell>
                          <TableCell align="right">Token 数</TableCell>
                          <TableCell align="right">费用（元）</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {usageData.recent_trend.map((day) => (
                          <TableRow key={day.date}>
                            <TableCell>{day.date}</TableCell>
                            <TableCell align="right">{day.calls}</TableCell>
                            <TableCell align="right">{day.tokens.toLocaleString()}</TableCell>
                            <TableCell align="right">¥{day.cost.toFixed(6)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
};
