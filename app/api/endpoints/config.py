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
    DATABASE = "database"
    REDIS = "redis"
    API_KEYS = "api_keys"
    DATA_COLLECTION = "data_collection"
    DATA_VALIDATION = "data_validation"
    JWT = "jwt"


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


# Config definitions
CONFIG_DEFINITIONS = {
    # Database
    "POSTGRES_SERVER": {"description": "PostgreSQL 服务器地址", "category": ConfigCategory.DATABASE, "is_secret": False},
    "POSTGRES_PORT": {"description": "PostgreSQL 端口", "category": ConfigCategory.DATABASE, "is_secret": False},
    "POSTGRES_DB": {"description": "PostgreSQL 数据库名", "category": ConfigCategory.DATABASE, "is_secret": False},
    "POSTGRES_USER": {"description": "PostgreSQL 用户名", "category": ConfigCategory.DATABASE, "is_secret": False},
    "POSTGRES_PASSWORD": {"description": "PostgreSQL 密码", "category": ConfigCategory.DATABASE, "is_secret": True},

    # Redis
    "REDIS_URL": {"description": "Redis 连接地址", "category": ConfigCategory.REDIS, "is_secret": False},

    # API Keys
    "MINIMAX_API_KEY": {"description": "MiniMax API Key", "category": ConfigCategory.API_KEYS, "is_secret": True},
    "TUSHARE_TOKEN": {"description": "Tushare API Token", "category": ConfigCategory.API_KEYS, "is_secret": True},

    # Data Collection
    "BATCH_SIZE": {"description": "批量采集大小", "category": ConfigCategory.DATA_COLLECTION, "is_secret": False, "value_type": "number"},
    "RATE_LIMIT_DELAY": {"description": "采集间隔(秒)", "category": ConfigCategory.DATA_COLLECTION, "is_secret": False, "value_type": "number"},
    "MAX_RETRIES": {"description": "最大重试次数", "category": ConfigCategory.DATA_COLLECTION, "is_secret": False, "value_type": "number"},
    "REDIS_CACHE_TTL_REALTIME": {"description": "实时行情缓存TTL(秒)", "category": ConfigCategory.DATA_COLLECTION, "is_secret": False, "value_type": "number"},
    "REDIS_CACHE_TTL_DAILY": {"description": "日线数据缓存TTL(秒)", "category": ConfigCategory.DATA_COLLECTION, "is_secret": False, "value_type": "number"},
    "REDIS_CACHE_TTL_STOCK_LIST": {"description": "股票列表缓存TTL(秒)", "category": ConfigCategory.DATA_COLLECTION, "is_secret": False, "value_type": "number"},

    # Data Validation
    "MAX_PCT_CHANGE": {"description": "最大涨跌幅阈值(%)", "category": ConfigCategory.DATA_VALIDATION, "is_secret": False, "value_type": "number"},
    "MAX_AMPLITUDE": {"description": "最大振幅阈值(%)", "category": ConfigCategory.DATA_VALIDATION, "is_secret": False, "value_type": "number"},
    "MIN_PRICE": {"description": "最小价格", "category": ConfigCategory.DATA_VALIDATION, "is_secret": False, "value_type": "number"},

    # JWT
    "ACCESS_TOKEN_EXPIRE_MINUTES": {"description": "访问令牌过期时间(分钟)", "category": ConfigCategory.JWT, "is_secret": False, "value_type": "number"},
    "REFRESH_TOKEN_EXPIRE_DAYS": {"description": "刷新令牌过期时间(天)", "category": ConfigCategory.JWT, "is_secret": False, "value_type": "number"},
}


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
    Get all configuration items with their current values.
    Sensitive values are masked.
    """
    categories = set()
    items = []

    for key, defn in CONFIG_DEFINITIONS.items():
        current_value = get_current_value(key)
        default_value = defn.get("default", current_value)

        if current_value is None:
            current_value = default_value

        # Mask secret values
        display_value = current_value
        if defn.get("is_secret", False) and display_value:
            display_value = "***" + str(display_value)[-4:] if len(str(display_value)) > 4 else "****"

        items.append(ConfigItem(
            key=key,
            value=display_value,
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
        raise HTTPException(status_code=404, detail=f"Config key '{key}' not found")

    defn = CONFIG_DEFINITIONS[key]
    current_value = get_current_value(key)

    # For secret values, return masked value
    if defn.get("is_secret", False) and current_value:
        display_value = "***" + str(current_value)[-4:] if len(str(current_value)) > 4 else "****"
    else:
        display_value = current_value

    return {
        "key": key,
        "value": display_value,
        "default": defn.get("default", current_value),
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
        raise HTTPException(status_code=404, detail=f"Config key '{key}' not found")

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


@router.get("/export/env")
def export_env_file():
    """Export current configuration as .env format"""
    lines = []
    for key in CONFIG_DEFINITIONS.keys():
        value = get_current_value(key)
        if value is not None:
            # Escape special characters
            if isinstance(value, str) and (' ' in value or '"' in value or "'" in value):
                value = f'"{value}"'
            lines.append(f"{key}={value}")

    return {"content": "\n".join(lines)}


@router.get("/runtime/diff")
def get_runtime_diff():
    """Get configuration values that differ from defaults"""
    diffs = []

    for key, defn in CONFIG_DEFINITIONS.items():
        current = get_current_value(key)
        default = defn.get("default")

        # Check if current differs from default (for non-secret values)
        if current != default and not defn.get("is_secret", False):
            diffs.append({
                "key": key,
                "current": current,
                "default": default,
                "category": defn["category"]
            })

    return {"changed": diffs, "count": len(diffs)}
