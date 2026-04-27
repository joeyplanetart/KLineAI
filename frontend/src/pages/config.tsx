import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Alert,
  CircularProgress,
  Divider,
  Chip,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  SmartToy as SmartToyIcon,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { API_URL } from '../config/api';

interface LLMProvider {
  id: string;
  name: string;
  models: string[];
  configured: boolean;
}

interface LLMConfig {
  providers: LLMProvider[];
  current_provider: string;
  current_model: string;
}

export const ConfigPage: React.FC = () => {
  const [llmConfig, setLLMConfig] = useState<LLMConfig | null>(null);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchLLMConfig();
  }, []);

  const fetchLLMConfig = async () => {
    try {
      const response = await fetch(`${API_URL}/config/llm/providers`);
      if (response.ok) {
        const data = await response.json();
        setLLMConfig(data);
        setSelectedProvider(data.current_provider);
        setSelectedModel(data.current_model);
      }
    } catch (err) {
      console.error('Failed to fetch LLM config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId);
    // Find the provider and set its first model as default
    const provider = llmConfig?.providers.find(p => p.id === providerId);
    if (provider && provider.models.length > 0) {
      setSelectedModel(provider.models[0]);
    } else {
      setSelectedModel('');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      // Update provider
      const providerRes = await fetch(`${API_URL}/config/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'LLM_PROVIDER', value: selectedProvider }),
      });

      // Update model
      const modelRes = await fetch(`${API_URL}/config/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'AI_CODE_GEN_MODEL', value: selectedModel }),
      });

      if (providerRes.ok && modelRes.ok) {
        setMessage({ type: 'success', text: 'LLM 配置已保存（仅当前会话有效）' });
        fetchLLMConfig();
      } else {
        setMessage({ type: 'error', text: '保存失败' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: '保存失败: ' + (err instanceof Error ? err.message : '未知错误') });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const currentProviderInfo = llmConfig?.providers.find(p => p.id === selectedProvider);

  return (
    <Box>
      {message && (
        <Alert severity={message.type} sx={{ mb: 3 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {/* LLM 配置 */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <SmartToyIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              AI 模型配置
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            选择 AI 服务提供商和模型。配置变更仅在当前会话生效，永久配置请修改 .env 文件。
          </Typography>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth>
                <InputLabel>服务提供商</InputLabel>
                <Select
                  value={selectedProvider}
                  label="服务提供商"
                  onChange={(e) => handleProviderChange(e.target.value)}
                >
                  {llmConfig?.providers.map((provider) => (
                    <MenuItem key={provider.id} value={provider.id} disabled={!provider.configured && provider.id !== 'custom'}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <span>{provider.name}</span>
                        {!provider.configured && provider.id !== 'custom' && (
                          <Chip label="未配置" size="small" sx={{ fontSize: 10, height: 18 }} />
                        )}
                        {provider.configured && provider.id !== 'custom' && (
                          <Chip label="可用" size="small" color="success" sx={{ fontSize: 10, height: 18 }} />
                        )}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth disabled={!currentProviderInfo?.models.length}>
                <InputLabel>模型</InputLabel>
                <Select
                  value={selectedModel}
                  label="模型"
                  onChange={(e) => setSelectedModel(e.target.value)}
                >
                  {currentProviderInfo?.models.map((model) => (
                    <MenuItem key={model} value={model}>
                      {model}
                    </MenuItem>
                  ))}
                  {selectedProvider === 'custom' && (
                    <MenuItem value="">
                      <Typography variant="body2" color="text.secondary">
                        请在 .env 中配置 CUSTOM_API_URL 和 CUSTOM_MODEL
                      </Typography>
                    </MenuItem>
                  )}
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          <Divider sx={{ my: 3 }} />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={saving || !selectedProvider}
              startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SettingsIcon />}
            >
              {saving ? '保存中...' : '保存配置'}
            </Button>
            {llmConfig && (
              <Chip
                label={`当前: ${llmConfig.current_provider} / ${llmConfig.current_model}`}
                size="small"
                sx={(theme) => ({
                  bgcolor: alpha(theme.palette.primary.main, 0.12),
                  color: 'primary.main',
                })}
              />
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Provider Info */}
      {llmConfig && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              可用提供商
            </Typography>
            <Grid container spacing={2}>
              {llmConfig.providers.map((provider) => (
                <Grid key={provider.id} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Box
                    sx={(theme) => ({
                      p: 2,
                      borderRadius: 1,
                      bgcolor:
                        provider.id === selectedProvider
                          ? alpha(theme.palette.primary.main, 0.08)
                          : 'transparent',
                      border: '1px solid',
                      borderColor: provider.id === selectedProvider ? 'primary.main' : 'divider',
                    })}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {provider.name}
                      </Typography>
                      <Chip
                        label={provider.configured ? '已配置' : '未配置'}
                        size="small"
                        color={provider.configured ? 'success' : 'default'}
                        sx={{ fontSize: 10, height: 18 }}
                      />
                    </Box>
                    {provider.models.length > 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        模型: {provider.models.slice(0, 3).join(', ')}
                        {provider.models.length > 3 && '...'}
                      </Typography>
                    )}
                  </Box>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};
