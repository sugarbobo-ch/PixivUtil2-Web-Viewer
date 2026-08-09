# -*- coding: utf-8 -*-
"""Shared PixivUtil2 config path resolution for the web viewer."""

import json
import os
import configparser
from typing import Any, Dict, Optional


WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
WEB_CONFIG_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "web_config.json"))
DEFAULT_CONFIG_INI_PATH = os.path.join(WORKSPACE_ROOT, "config.ini")
# The Web Viewer owns this database.  PixivUtil2's database remains a
# separate read-only source and is never used for Viewer writes.
VIEWER_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "viewer.sqlite"))


class MediaSourceConfigurationError(ValueError):
    """Raised when the Viewer has no single, explicit media source."""


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


def get_pixiv_database_path(config: Optional[Dict[str, Any]] = None) -> str:
    """Resolve PixivUtil2's read-only database next to its config.ini."""
    settings = config if config is not None else read_web_config()
    if settings.get("librarySourceMode") == "folder":
        return os.path.join(os.path.dirname(__file__), ".folder-only-pixiv-db-disabled")
    return os.path.join(os.path.dirname(get_pixiv_config_path(settings)), "db.sqlite")


def get_media_root_directory(config: Optional[Dict[str, Any]] = None) -> str:
    """Resolve the one configured media root without workspace fallbacks."""
    settings = config if config is not None else read_web_config()
    source_mode = settings.get("librarySourceMode")
    if source_mode == "folder":
        configured_root = str(settings.get("mediaRootPath") or "").strip()
        if configured_root:
            return resolve_config_path(configured_root)
        raise MediaSourceConfigurationError("尚未指定圖片資料夾。")

    if source_mode != "pixiv":
        raise MediaSourceConfigurationError("尚未選擇媒體來源。")

    # Keep the no-argument call for compatibility with test/runtime overrides
    # that replace the path resolver.
    config_path = get_pixiv_config_path() if config is None else get_pixiv_config_path(settings)
    if not os.path.isfile(config_path):
        raise MediaSourceConfigurationError(f"找不到 PixivUtil2 config.ini：{config_path}")
    try:
        parser = configparser.ConfigParser(interpolation=None)
        parser.read(config_path, encoding="utf-8")
        configured_root = parser.get("Settings", "rootDirectory", fallback="").strip()
    except (OSError, configparser.Error) as error:
        raise MediaSourceConfigurationError(f"無法讀取 PixivUtil2 config.ini：{error}") from error
    if not configured_root or configured_root == ".":
        raise MediaSourceConfigurationError("PixivUtil2 config.ini 尚未指定 Settings.rootDirectory。")
    return os.path.abspath(os.path.expandvars(os.path.expanduser(configured_root)))


def get_backup_path(config_path: Optional[str] = None) -> str:
    return f"{config_path or get_pixiv_config_path()}.bak"
