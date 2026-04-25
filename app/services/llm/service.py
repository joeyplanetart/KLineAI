"""
LLM service with multi-provider support.
Ported from QuantDinger, adapted for KLineAI's config system.
"""
import json
import logging
import os
import requests
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.services.llm.provider import LLMProvider, PROVIDER_CONFIGS

logger = logging.getLogger(__name__)

# Provider auto-detection priority order
_PROVIDER_PRIORITY = [
    LLMProvider.DEEPSEEK,
    LLMProvider.GROK,
    LLMProvider.MINIMAX,
    LLMProvider.OPENAI,
    LLMProvider.GOOGLE,
    LLMProvider.OPENROUTER,
]


class LLMService:
    """Multi-provider LLM wrapper with auto-detection and fallback chains."""

    def __init__(self, provider: str = None):
        self._provider_override = provider

    @property
    def provider(self) -> LLMProvider:
        """Resolve the active LLM provider."""
        if self._provider_override:
            try:
                return LLMProvider(self._provider_override.lower())
            except ValueError:
                pass

        provider_name = (settings.LLM_PROVIDER or "").strip().lower()
        if provider_name:
            try:
                return LLMProvider(provider_name)
            except ValueError:
                pass

        # Auto-detect: first provider with a configured API key
        for p in _PROVIDER_PRIORITY:
            if self.get_api_key(p):
                logger.info(f"Auto-detected LLM provider: {p.value}")
                return p

        return LLMProvider.OPENROUTER

    def get_api_key(self, provider: LLMProvider = None) -> str:
        """Get API key for the specified provider."""
        p = provider or self.provider
        key_map = {
            LLMProvider.OPENROUTER: settings.OPENROUTER_API_KEY,
            LLMProvider.OPENAI: settings.OPENAI_API_KEY,
            LLMProvider.GOOGLE: settings.GOOGLE_API_KEY,
            LLMProvider.DEEPSEEK: settings.DEEPSEEK_API_KEY,
            LLMProvider.GROK: settings.GROK_API_KEY,
            LLMProvider.CUSTOM: settings.CUSTOM_API_KEY,
            LLMProvider.MINIMAX: settings.MINIMAX_API_KEY,
        }
        return (key_map.get(p) or "").strip()

    def get_base_url(self, provider: LLMProvider = None) -> str:
        """Get base URL for the specified provider."""
        p = provider or self.provider

        if p == LLMProvider.MINIMAX and settings.MINIMAX_BASE_URL:
            return settings.MINIMAX_BASE_URL.rstrip("/")

        env_key = f"{p.value.upper()}_BASE_URL"
        custom_url = os.getenv(env_key, "").strip()
        if p == LLMProvider.CUSTOM and not custom_url:
            custom_url = (settings.CUSTOM_API_URL or "").strip()
        if custom_url:
            return custom_url.rstrip("/")

        return PROVIDER_CONFIGS[p]["base_url"]

    def get_default_model(self, provider: LLMProvider = None) -> str:
        """Get default model for the specified provider."""
        p = provider or self.provider
        env_key = f"{p.value.upper()}_MODEL"
        custom_model = os.getenv(env_key, "").strip()
        if p == LLMProvider.CUSTOM and not custom_model:
            custom_model = (settings.CUSTOM_MODEL or "").strip()
        if custom_model:
            return custom_model
        return PROVIDER_CONFIGS[p]["default_model"]

    def get_code_generation_model(self, provider: LLMProvider = None) -> str:
        """Get model for code generation; falls back to provider default."""
        model = (settings.AI_CODE_GEN_MODEL or "").strip()
        if model:
            return model
        return self.get_default_model(provider)

    # -- Internal call methods --

    def _call_openai_compatible(self, messages: list, model: str, temperature: float,
                                 api_key: str, base_url: str, timeout: int,
                                 use_json_mode: bool = True) -> str:
        """Call OpenAI-compatible API (OpenAI, DeepSeek, Grok, OpenRouter, MiniMax, Custom)."""
        url = f"{base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        if "openrouter" in base_url:
            headers["HTTP-Referer"] = "https://klineai.local"
            headers["X-Title"] = "KLineAI Analysis"

        data = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }
        if use_json_mode:
            data["response_format"] = {"type": "json_object"}

        response = requests.post(url, headers=headers, json=data, timeout=timeout)

        if response.status_code >= 400:
            error_detail = ""
            try:
                err_data = response.json() or {}
                err_info = err_data.get("error")
                if isinstance(err_info, dict):
                    error_detail = str(err_info.get("message", "")).strip()
                elif isinstance(err_info, str):
                    error_detail = err_info.strip()
            except Exception:
                error_detail = (response.text or "").strip()[:300]
            raise ValueError(
                f"LLM API {response.status_code}: {error_detail or 'Unknown error'}"
            )

        result = response.json()
        if "choices" in result and len(result["choices"]) > 0:
            content = result["choices"][0]["message"]["content"]
            if not content:
                raise ValueError(f"Model {model} returned empty content")
            return content
        raise ValueError("API response is missing 'choices'")

    def _call_google_gemini(self, messages: list, model: str, temperature: float,
                             api_key: str, base_url: str, timeout: int) -> str:
        """Call Google Gemini API."""
        url = f"{base_url}/models/{model}:generateContent?key={api_key}"
        contents = []
        system_instruction = None

        for msg in messages:
            role = msg["role"]
            content = msg["content"]
            if role == "system":
                system_instruction = content
            elif role == "user":
                contents.append({"role": "user", "parts": [{"text": content}]})
            elif role == "assistant":
                contents.append({"role": "model", "parts": [{"text": content}]})

        data = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "responseMimeType": "application/json",
            },
        }
        if system_instruction:
            data["systemInstruction"] = {"parts": [{"text": system_instruction}]}

        headers = {"Content-Type": "application/json"}
        response = requests.post(url, headers=headers, json=data, timeout=timeout)
        response.raise_for_status()

        result = response.json()
        if "candidates" in result and len(result["candidates"]) > 0:
            candidate = result["candidates"][0]
            if "content" in candidate and "parts" in candidate["content"]:
                text = candidate["content"]["parts"][0].get("text", "")
                if text:
                    return text
        raise ValueError("Gemini API response is missing content")

    def _normalize_model_for_provider(self, model: str, provider: LLMProvider) -> str:
        """Normalize model name for the target provider (e.g. 'openai/gpt-4o' -> 'gpt-4o')."""
        if not model:
            return self.get_default_model(provider)

        model = model.strip()
        if provider == LLMProvider.OPENROUTER:
            return model

        if '/' in model:
            prefix, actual_model = model.split('/', 1)
            prefix_lower = prefix.lower()
            prefix_to_provider = {
                'openai': LLMProvider.OPENAI,
                'google': LLMProvider.GOOGLE,
                'deepseek': LLMProvider.DEEPSEEK,
                'x-ai': LLMProvider.GROK,
                'xai': LLMProvider.GROK,
                'minimax': LLMProvider.MINIMAX,
            }
            matched = prefix_to_provider.get(prefix_lower)
            if matched == provider:
                return actual_model
            logger.warning(f"Model '{model}' doesn't match provider '{provider.value}', using default")
            return self.get_default_model(provider)

        return model

    def _detect_provider_from_model(self, model: str) -> Optional[LLMProvider]:
        """Detect provider from model name prefix."""
        if not model or '/' not in model:
            return None
        prefix = model.split('/')[0].lower()
        prefix_to_provider = {
            'openai': LLMProvider.OPENAI,
            'google': LLMProvider.GOOGLE,
            'deepseek': LLMProvider.DEEPSEEK,
            'x-ai': LLMProvider.GROK,
            'xai': LLMProvider.GROK,
            'minimax': LLMProvider.MINIMAX,
            'anthropic': LLMProvider.OPENROUTER,
            'meta': LLMProvider.OPENROUTER,
            'mistral': LLMProvider.OPENROUTER,
        }
        return prefix_to_provider.get(prefix)

    def _try_alternative_providers(self, messages: list, model: str, temperature: float,
                                    use_json_mode: bool, excluded_provider: LLMProvider = None) -> str:
        """Fallback to alternative providers when the current one fails."""
        for alt in _PROVIDER_PRIORITY:
            if alt == excluded_provider:
                continue
            if not self.get_api_key(alt):
                continue
            logger.info(f"Trying alternative provider: {alt.value}")
            try:
                return self.call_llm_api(
                    messages, model, temperature,
                    use_fallback=True, provider=alt,
                    use_json_mode=use_json_mode,
                    try_alternative_providers=False,
                )
            except Exception as e:
                logger.warning(f"Alternative provider {alt.value} failed: {e}")
                continue
        raise Exception("All LLM providers failed. Check API key configuration.")

    # -- Public API --

    def call_llm_api(self, messages: list, model: str = None, temperature: float = 0.7,
                     use_fallback: bool = True, provider: LLMProvider = None,
                     use_json_mode: bool = True, try_alternative_providers: bool = True) -> str:
        """
        Call LLM API with the specified or auto-detected provider.

        Returns generated text content.
        """
        # Smart provider detection from model name
        if model and not provider:
            detected = self._detect_provider_from_model(model)
            if detected and detected != LLMProvider.OPENROUTER:
                if self.get_api_key(detected):
                    provider = detected

        p = provider or self.provider
        api_key = self.get_api_key(p)

        if not api_key:
            if try_alternative_providers:
                for alt in _PROVIDER_PRIORITY:
                    if alt != p and self.get_api_key(alt):
                        logger.warning(f"No API key for {p.value}, switching to {alt.value}")
                        p = alt
                        api_key = self.get_api_key(p)
                        break
            if not api_key:
                raise ValueError(
                    f"No API key configured. Set one of: DEEPSEEK_API_KEY, MINIMAX_API_KEY, "
                    f"OPENAI_API_KEY, GOOGLE_API_KEY, OPENROUTER_API_KEY in .env"
                )

        base_url = self.get_base_url(p)
        if p == LLMProvider.CUSTOM and not base_url:
            raise ValueError("CUSTOM_API_URL must be set when using custom provider")

        model = self._normalize_model_for_provider(model, p)
        timeout = int(os.getenv("LLM_TIMEOUT", "120"))

        models_to_try = [model]
        if use_fallback:
            fallback = PROVIDER_CONFIGS[p].get("fallback_model")
            if fallback and fallback != model:
                models_to_try.append(fallback)

        last_error = None
        last_status_code = None

        for current_model in models_to_try:
            try:
                if p == LLMProvider.GOOGLE:
                    return self._call_google_gemini(
                        messages, current_model, temperature, api_key, base_url, timeout
                    )
                else:
                    return self._call_openai_compatible(
                        messages, current_model, temperature, api_key, base_url, timeout,
                        use_json_mode=use_json_mode,
                    )
            except requests.exceptions.HTTPError as e:
                last_status_code = e.response.status_code if e.response else None
                logger.error(f"{p.value} HTTP error ({current_model}): {last_status_code}")
                last_error = str(e)
                if last_status_code in (402, 403) and try_alternative_providers and current_model == models_to_try[-1]:
                    return self._try_alternative_providers(
                        messages, model, temperature, use_json_mode, excluded_provider=p
                    )
                if last_status_code in (402, 403, 404, 429):
                    continue
                if not use_fallback or current_model == models_to_try[-1]:
                    raise
            except requests.exceptions.RequestException as e:
                logger.error(f"{p.value} request error ({current_model}): {e}")
                last_error = str(e)
                if not use_fallback or current_model == models_to_try[-1]:
                    raise
            except ValueError as e:
                logger.warning(f"Model {current_model} returned invalid data: {e}")
                last_error = str(e)
                if current_model == models_to_try[-1]:
                    raise

        raise Exception(f"All model calls failed for {p.value}. Last error: {last_error}")

    def safe_call_llm(self, system_prompt: str, user_prompt: str,
                      default_structure: Dict[str, Any], model: str = None,
                      provider: LLMProvider = None) -> Dict[str, Any]:
        """Safe LLM call with robust JSON parsing and fallback."""
        response_text = ""
        try:
            response_text = self.call_llm_api([
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ], model=model, provider=provider)

            clean_text = response_text.strip()
            if clean_text.startswith("```"):
                first_newline = clean_text.find("\n")
                if first_newline != -1:
                    clean_text = clean_text[first_newline + 1:]
                if clean_text.endswith("```"):
                    clean_text = clean_text[:-3]
            clean_text = clean_text.strip()

            return json.loads(clean_text)
        except json.JSONDecodeError:
            logger.error(f"JSON parse failed. Raw text: {response_text[:200] if response_text else 'N/A'}")
            if response_text:
                try:
                    start = response_text.find('{')
                    end = response_text.rfind('}') + 1
                    if start >= 0 and end > start:
                        return json.loads(response_text[start:end])
                except Exception:
                    pass
            default_structure['report'] = f"Failed to parse analysis result JSON. Raw output (partial): {response_text[:500] if response_text else 'N/A'}"
            return default_structure
        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            default_structure['report'] = f"Analysis failed: {str(e)}"
            return default_structure

    @classmethod
    def get_available_providers(cls) -> List[Dict[str, Any]]:
        """Get list of available (configured) providers."""
        providers = []
        service = cls()
        for p in LLMProvider:
            api_key = service.get_api_key(p)
            providers.append({
                "id": p.value,
                "name": p.value.title(),
                "configured": bool(api_key),
                "default_model": PROVIDER_CONFIGS[p]["default_model"],
            })
        return providers
