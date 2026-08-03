# -*- coding: utf-8 -*-
"""Shared PixivUtil2 config path resolution for the web viewer."""

import json
import os
from typing import Any, Dict, Optional


WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
WEB_CONFIG_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "web_config.json"))
DEFAULT_CONFIG_INI_PATH = os.path.join(WORKSPACE_ROOT, "config.ini")


def read_web_config() -> Dict[str, Any]:
    if not os.path.exists(WEB_CONFIG_PATH):
        return {}

    try:
        with open(WEB_CONFIG_PATH, "r", encoding="utf-8") as config_file:
            data = json.load(config_file)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def resolve_config_path(configured_path: Optional[str]) -> str:
    """Resolve a user-entered config path, or return the viewer default."""
    if not configured_path or not str(configured_path).strip():
        return os.path.abspath(DEFAULT_CONFIG_INI_PATH)

    path = os.path.expandvars(os.path.expanduser(str(configured_path).strip()))
    if not os.path.isabs(path):
        path = os.path.join(WORKSPACE_ROOT, path)
    return os.path.abspath(path)


def get_pixiv_config_path(config: Optional[Dict[str, Any]] = None) -> str:
    settings = config if config is not None else read_web_config()
    return resolve_config_path(settings.get("pixivConfigPath"))


def get_backup_path(config_path: Optional[str] = None) -> str:
    return f"{config_path or get_pixiv_config_path()}.bak"
