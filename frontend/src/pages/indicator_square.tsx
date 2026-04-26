import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Typography,
  Alert,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Add as AddIcon,
  PlayArrow as ApplyIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface SavedIndicator {
  id: number;
  name: string;
  description: string;
  code: string;
  createdAt: string;
}

interface BuiltinIndicator {
  id: string;
  name: string;
  description: string;
  code: string;
}

const BUILTIN_INDICATORS: BuiltinIndicator[] = [
  {
    id: 'builtin_ma_cross',
    name: 'MA金叉死叉',
    description: 'MA5上穿MA20买入，下穿MA20卖出',
    code: `ma5 = df['close'].rolling(5).mean()
ma20 = df['close'].rolling(20).mean()
buy = (ma5 > ma20) & (ma5.shift(1) <= ma20.shift(1))
sell = (ma5 < ma20) & (ma5.shift(1) >= ma20.shift(1))
df['buy'] = buy.fillna(False)
df['sell'] = sell.fillna(False)`,
  },
  {
    id: 'builtin_boll',
    name: '布林带策略',
    description: '价格触及布林带下轨买入，上轨卖出',
    code: `mid = df['close'].rolling(20).mean()
std = df['close'].rolling(20).std()
upper = mid + 2 * std
lower = mid - 2 * std
buy = df['close'] < lower
sell = df['close'] > upper
df['buy'] = buy.fillna(False)
df['sell'] = sell.fillna(False)`,
  },
  {
    id: 'builtin_rsi',
    name: 'RSI超买超卖',
    description: 'RSI<30买入，RSI>70卖出',
    code: `delta = df['close'].diff()
gain = delta.where(delta > 0, 0).rolling(14).mean()
loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
rs = gain / loss
rsi = 100 - (100 / (1 + rs))
buy = rsi < 30
sell = rsi > 70
df['buy'] = buy.fillna(False)
df['sell'] = sell.fillna(False)`,
  },
  {
    id: 'builtin_macd',
    name: 'MACD金叉死叉',
    description: 'DIF上穿DEA买入，下穿卖出',
    code: `ema12 = df['close'].ewm(span=12).mean()
ema26 = df['close'].ewm(span=26).mean()
dif = ema12 - ema26
dea = dif.ewm(span=9).mean()
buy = (dif > dea) & (dif.shift(1) <= dea.shift(1))
sell = (dif < dea) & (dif.shift(1) >= dea.shift(1))
df['buy'] = buy.fillna(False)
df['sell'] = sell.fillna(False)`,
  },
];

export const IndicatorSquarePage: React.FC = () => {
  const navigate = useNavigate();
  const theme = useTheme();
  const [savedIndicators, setSavedIndicators] = useState<SavedIndicator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('saved_indicators');
    if (saved) {
      try {
        setSavedIndicators(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load saved indicators:', e);
      }
    }
    setLoading(false);
  }, []);

  const handleApplyToEditor = (code: string, name: string) => {
    localStorage.setItem('indicator_to_apply_to_editor', JSON.stringify({ code, name }));
    navigate('/strategy');
  };

  const handleApplyToSelector = (id: string, name: string, code?: string) => {
    // Store the code in localStorage for strategy page to use
    if (code) {
      const indicatorCodes = JSON.parse(localStorage.getItem('indicator_codes') || '{}');
      indicatorCodes[id] = code;
      localStorage.setItem('indicator_codes', JSON.stringify(indicatorCodes));
    }
    localStorage.setItem('indicator_to_apply_to_selector', JSON.stringify({ id, name, code }));
    navigate('/strategy');
  };

  const handleDelete = (id: number) => {
    const updated = savedIndicators.filter(ind => ind.id !== id);
    setSavedIndicators(updated);
    localStorage.setItem('saved_indicators', JSON.stringify(updated));
  };

  const renderIndicatorCard = (
    id: string,
    name: string,
    description: string,
    code: string,
    isBuiltin: boolean = false,
    deleteId?: number
  ) => (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, fontSize: 16 }}>
            {name}
          </Typography>
          {isBuiltin ? (
            <Chip label="内置" size="small" color="primary" sx={{ fontSize: 10 }} />
          ) : (
            <Chip label="已保存" size="small" sx={{ fontSize: 10 }} />
          )}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1, minHeight: 40 }}>
          {description}
        </Typography>
        <Box
          sx={{
            bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
            color: theme.palette.mode === 'dark' ? 'grey.100' : 'grey.900',
            p: 1,
            borderRadius: 1,
            fontSize: 11,
            fontFamily: 'ui-monospace, Menlo, Monaco, Consolas, monospace',
            maxHeight: 80,
            overflow: 'hidden',
            whiteSpace: 'pre-wrap',
            border: 1,
            borderColor: 'divider',
          }}
        >
          {code.substring(0, 150)}...
        </Box>
      </CardContent>
      <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 1 }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => handleApplyToEditor(code, name)}
          >
            应用到编辑器
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ApplyIcon />}
            onClick={() => isBuiltin ? handleApplyToSelector(id, name, code) : handleApplyToSelector(`saved_${deleteId}`, name, code)}
          >
            应用到选择器
          </Button>
        </Box>
        {!isBuiltin && (
          <Button
            size="small"
            color="error"
            onClick={() => handleDelete(deleteId!)}
          >
            删除
          </Button>
        )}
      </CardActions>
    </Card>
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>

      {savedIndicators.length > 0 && (
        <>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            我的指标 ({savedIndicators.length})
          </Typography>
          <Grid container spacing={2} sx={{ mb: 4 }}>
            {savedIndicators.map(ind => (
              <Grid size={{ xs: 12, md: 6, lg: 4 }} key={ind.id}>
                {renderIndicatorCard(
                  `saved_${ind.id}`,
                  ind.name,
                  ind.description || '自定义指标',
                  ind.code,
                  false,
                  ind.id
                )}
              </Grid>
            ))}
          </Grid>
        </>
      )}

      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
        内置指标 ({BUILTIN_INDICATORS.length})
      </Typography>
      <Grid container spacing={2}>
        {BUILTIN_INDICATORS.map(ind => (
          <Grid size={{ xs: 12, md: 6, lg: 4 }} key={ind.id}>
            {renderIndicatorCard(ind.id, ind.name, ind.description, ind.code, true)}
          </Grid>
        ))}
      </Grid>

      {savedIndicators.length === 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          暂无已保存的指标，请在指标IDE中编写并保存指标
        </Alert>
      )}
    </Box>
  );
};
