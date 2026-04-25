"""
LLM provider enum and configurations.
Supports: OpenRouter, OpenAI, Google Gemini, DeepSeek, Grok, Custom, MiniMax.
"""
from enum import Enum


class LLMProvider(Enum):
    OPENROUTER = "openrouter"
    OPENAI = "openai"
    GOOGLE = "google"
    DEEPSEEK = "deepseek"
    GROK = "grok"
    CUSTOM = "custom"
    MINIMAX = "minimax"


PROVIDER_CONFIGS = {
    LLMProvider.OPENROUTER: {
        "base_url": "https://openrouter.ai/api/v1",
        "default_model": "openai/gpt-4o",
        "fallback_model": "openai/gpt-4o-mini",
    },
    LLMProvider.OPENAI: {
        "base_url": "https://api.openai.com/v1",
        "default_model": "gpt-4o",
        "fallback_model": "gpt-4o-mini",
    },
    LLMProvider.GOOGLE: {
        "base_url": "https://generativelanguage.googleapis.com/v1beta",
        "default_model": "gemini-1.5-flash",
        "fallback_model": "gemini-1.5-flash",
    },
    LLMProvider.DEEPSEEK: {
        "base_url": "https://api.deepseek.com/v1",
        "default_model": "deepseek-chat",
        "fallback_model": "deepseek-chat",
    },
    LLMProvider.GROK: {
        "base_url": "https://api.x.ai/v1",
        "default_model": "grok-beta",
        "fallback_model": "grok-beta",
    },
    LLMProvider.CUSTOM: {
        "base_url": "",
        "default_model": "",
        "fallback_model": "",
    },
    LLMProvider.MINIMAX: {
        "base_url": "https://api.minimax.io/v1",
        "default_model": "MiniMax-M2.7",
        "fallback_model": "MiniMax-M2.7-highspeed",
    },
}
