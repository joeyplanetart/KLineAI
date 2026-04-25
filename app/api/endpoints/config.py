from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.core.db import get_db
from app.core.config import settings
import json
import os

router = APIRouter()


# Config categories for grouping
class ConfigCategory(str):
    DATA_COLLECTION = "data_collection"
    DATA_VALIDATION = "data_validation"
    CACHE = "cache"
    TASK = "task"
    LLM = "llm"


# Runtime config storage (in-memory for now, can be extended to use Redis/DB)
_runtime_config: Dict[str, Any] = {}


class ConfigItem(BaseModel):
    key: str
    value: Any
    default: Any
    description: str
    category: str
    is_secret: bool = False
    value_type: str = "string"  # string, number, boolean


class ConfigResponse(BaseModel):
    categories: List[str]
    items: List[ConfigItem]


class ConfigUpdateRequest(BaseModel):
    key: str
    value: Any


class ConfigUpdateResponse(BaseModel):
    success: bool
    key: str
    old_value: Any
    new_value: Any
    message: str


# Config definitions - only UI-manageable settings (NO sensitive .env items)
# Database, API keys, JWT secrets should ONLY be in .env
CONFIG_DEFINITIONS = {
    # Data Collection
    "BATCH_SIZE": {
        "description": "批量采集每批数量",
        "category": ConfigCategory.DATA_COLLECTION,
        "is_secret": False,
        "value_type": "number",
        "default": 100
    },
    "RATE_LIMIT_DELAY": {
        "description": "采集间隔延迟(秒)",
        "category": ConfigCategory.DATA_COLLECTION,
        "is_secret": False,
        "value_type": "number",
        "default": 0.1
    },
    "MAX_RETRIES": {
        "description": "最大重试次数",
        "category": ConfigCategory.DATA_COLLECTION,
        "is_secret": False,
        "value_type": "number",
        "default": 3
    },

    # Cache TTL
    "REDIS_CACHE_TTL_REALTIME": {
        "description": "实时行情缓存TTL(秒)",
        "category": ConfigCategory.CACHE,
        "is_secret": False,
        "value_type": "number",
        "default": 30
    },
    "REDIS_CACHE_TTL_DAILY": {
        "description": "日线数据缓存TTL(秒)",
        "category": ConfigCategory.CACHE,
        "is_secret": False,
        "value_type": "number",
        "default": 300
    },
    "REDIS_CACHE_TTL_STOCK_LIST": {
        "description": "股票列表缓存TTL(秒)",
        "category": ConfigCategory.CACHE,
        "is_secret": False,
        "value_type": "number",
        "default": 3600
    },

    # Data Validation
    "MAX_PCT_CHANGE": {
        "description": "最大涨跌幅阈值(%)",
        "category": ConfigCategory.DATA_VALIDATION,
        "is_secret": False,
        "value_type": "number",
        "default": 20.0
    },
    "MAX_AMPLITUDE": {
        "description": "最大振幅阈值(%)",
        "category": ConfigCategory.DATA_VALIDATION,
        "is_secret": False,
        "value_type": "number",
        "default": 25.0
    },
    "MIN_PRICE": {
        "description": "最小价格",
        "category": ConfigCategory.DATA_VALIDATION,
        "is_secret": False,
        "value_type": "number",
        "default": 0.01
    },

    # LLM Settings
    "LLM_PROVIDER": {
        "description": "LLM 服务提供商",
        "category": ConfigCategory.LLM,
        "is_secret": False,
        "value_type": "string",
        "default": ""
    },
    "AI_CODE_GEN_MODEL": {
        "description": "代码生成模型",
        "category": ConfigCategory.LLM,
        "is_secret": False,
        "value_type": "string",
        "default": ""
    },
}


# LLM Provider info for UI
LLM_PROVIDERS = [
    {"id": "openrouter", "name": "OpenRouter", "models": ["openai/gpt-4o", "openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet", "meta/llama-3.1-70b-instruct"]},
    {"id": "openai", "name": "OpenAI", "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]},
    {"id": "google", "name": "Google Gemini", "models": ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"]},
    {"id": "deepseek", "name": "DeepSeek", "models": ["deepseek-chat", "deepseek-coder"]},
    {"id": "grok", "name": "xAI Grok", "models": ["grok-beta", "grok-2"]},
    {"id": "minimax", "name": "MiniMax", "models": ["MiniMax-M2.7", "MiniMax-M2.0-Flash"]},
    {"id": "custom", "name": "自定义", "models": []},
]


def get_current_value(key: str) -> Any:
    """Get current value of a config key"""
    if key in _runtime_config:
        return _runtime_config[key]
    if hasattr(settings, key):
        return getattr(settings, key)
    return None


@router.get("/", response_model=ConfigResponse)
def get_all_config():
    """
    Get all UI-manageable configuration items.
    Note: Sensitive settings (database, API keys, secrets) are NOT exposed via API.
    Those should be configured via .env file only.
    """
    categories = set()
    items = []

    for key, defn in CONFIG_DEFINITIONS.items():
        current_value = get_current_value(key)
        default_value = defn.get("default", current_value)

        if current_value is None:
            current_value = default_value

        items.append(ConfigItem(
            key=key,
            value=current_value,
            default=default_value,
            description=defn["description"],
            category=defn["category"],
            is_secret=defn.get("is_secret", False),
            value_type=defn.get("value_type", "string")
        ))
        categories.add(defn["category"])

    return ConfigResponse(
        categories=sorted(list(categories)),
        items=items
    )


@router.get("/{key}")
def get_config(key: str):
    """Get a specific config item"""
    if key not in CONFIG_DEFINITIONS:
        raise HTTPException(status_code=404, detail=f"Config key '{key}' not found or not accessible via API")

    defn = CONFIG_DEFINITIONS[key]
    current_value = get_current_value(key)
    default_value = defn.get("default", current_value)

    if current_value is None:
        current_value = default_value

    return {
        "key": key,
        "value": current_value,
        "default": default_value,
        "description": defn["description"],
        "category": defn["category"],
        "is_secret": defn.get("is_secret", False),
        "value_type": defn.get("value_type", "string")
    }


@router.post("/", response_model=ConfigUpdateResponse)
def update_config(request: ConfigUpdateRequest):
    """
    Update a configuration value at runtime.
    Note: Changes are temporary and won't persist across restarts.
    For permanent changes, update the .env file.
    """
    key = request.key

    if key not in CONFIG_DEFINITIONS:
        raise HTTPException(status_code=404, detail=f"Config key '{key}' not found or not accessible via API")

    defn = CONFIG_DEFINITIONS[key]
    old_value = get_current_value(key)

    # Validate value type
    value_type = defn.get("value_type", "string")
    try:
        if value_type == "number":
            request.value = float(request.value) if '.' in str(request.value) else int(request.value)
        elif value_type == "boolean":
            request.value = bool(request.value)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid value type for {key}")

    # Update runtime config
    _runtime_config[key] = request.value

    return ConfigUpdateResponse(
        success=True,
        key=key,
        old_value=old_value,
        new_value=request.value,
        message=f"Config '{key}' updated. Note: This change is temporary and won't persist across restarts."
    )


@router.post("/batch", response_model=List[ConfigUpdateResponse])
def batch_update_config(updates: List[ConfigUpdateRequest]):
    """Batch update multiple config items"""
    results = []
    for update in updates:
        try:
            result = update_config(update)
            results.append(ConfigUpdateResponse(
                success=True,
                key=result.key,
                old_value=result.old_value,
                new_value=result.new_value,
                message=result.message
            ))
        except HTTPException as e:
            results.append(ConfigUpdateResponse(
                success=False,
                key=update.key,
                old_value=None,
                new_value=update.value,
                message=str(e.detail)
            ))

    return results


@router.get("/runtime/diff")
def get_runtime_diff():
    """Get configuration values that differ from defaults"""
    diffs = []

    for key, defn in CONFIG_DEFINITIONS.items():
        current = get_current_value(key)
        default = defn.get("default")

        if current != default:
            diffs.append({
                "key": key,
                "current": current,
                "default": default,
                "category": defn["category"]
            })

    return {"changed": diffs, "count": len(diffs)}


@router.get("/llm/providers")
def get_llm_providers():
    """Get available LLM providers and their models"""
    from app.services.llm import LLMService

    service = LLMService()
    providers = []

    for p in LLM_PROVIDERS:
        api_key = service.get_api_key(
            type("LLMProvider", (), {"value": p["id"]})()
        ) if p["id"] != "custom" else ""
        providers.append({
            **p,
            "configured": bool(api_key) or p["id"] == "custom",
        })

    return {
        "providers": providers,
        "current_provider": settings.LLM_PROVIDER or service.provider.value,
        "current_model": settings.AI_CODE_GEN_MODEL or service.get_default_model(),
    }
