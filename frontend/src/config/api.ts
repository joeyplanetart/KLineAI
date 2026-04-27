const DEFAULT_API_BASE_URL = '/api/v1';

const normalizeApiBaseUrl = (value: string | undefined): string => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return DEFAULT_API_BASE_URL;
  }
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
};

export const API_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
