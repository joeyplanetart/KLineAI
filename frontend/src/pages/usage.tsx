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
  Paper,
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

const API_URL = 'http://localhost:8000/api/v1';

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
        throw new Error('Failed to fetch usage statistics');
      }
      const data = await response.json();
      setUsageData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Model Usage Statistics</Typography>
        <FormControl sx={{ minWidth: 120 }} size="small">
          <InputLabel>Time Range</InputLabel>
          <Select value={days} label="Time Range" onChange={(e) => setDays(e.target.value as number)}>
            <MenuItem value={7}>Last 7 days</MenuItem>
            <MenuItem value={14}>Last 14 days</MenuItem>
            <MenuItem value={30}>Last 30 days</MenuItem>
            <MenuItem value={90}>Last 90 days</MenuItem>
          </Select>
        </FormControl>
      </Box>

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
                      Total Calls
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
                      Total Tokens
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
                      Total Cost
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
                      Avg Latency
                    </Typography>
                    <Typography variant="h4">{usageData.summary.avg_latency_ms}ms</Typography>
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
                    Usage by Model
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Model</TableCell>
                          <TableCell align="right">Calls</TableCell>
                          <TableCell align="right">Tokens</TableCell>
                          <TableCell align="right">Cost</TableCell>
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
                    Daily Trend
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Date</TableCell>
                          <TableCell align="right">Calls</TableCell>
                          <TableCell align="right">Tokens</TableCell>
                          <TableCell align="right">Cost</TableCell>
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
