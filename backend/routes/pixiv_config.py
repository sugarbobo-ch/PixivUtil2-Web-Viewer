"""HTTP boundary for PixivUtil2 config.ini and its recoverable backup."""

from __future__ import annotations

import configparser
import os
import shutil
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import config_paths


router = APIRouter()


class PixivConfigItemUpdate(BaseModel):
    section: str
    option: str
    value: str


class BulkPixivConfigUpdate(BaseModel):
    updates: List[PixivConfigItemUpdate]


@router.get("/api/pixiv-config")
def get_pixiv_config():
    config_path = config_paths.get_pixiv_config_path()
    backup_path = config_paths.get_backup_path(config_path)
    if not os.path.exists(config_path):
        raise HTTPException(status_code=404, detail=f"找不到 PixivUtil2 設定檔：{config_path}")
    try:
        config = configparser.ConfigParser(interpolation=None)
        config.read(config_path, encoding="utf-8")
        result = {section: dict(config.items(section)) for section in config.sections()}
        database_path = config_paths.get_pixiv_database_path()
        return {
            "sections": result,
            "hasBackup": os.path.exists(backup_path),
            "configPath": config_path,
            "backupPath": backup_path,
            "defaultConfigPath": config_paths.DEFAULT_CONFIG_INI_PATH,
            "usingDefaultPath": os.path.normcase(config_path) == os.path.normcase(config_paths.DEFAULT_CONFIG_INI_PATH),
            "databasePath": database_path,
            "databaseDetected": os.path.isfile(database_path),
        }
    except (OSError, configparser.Error) as error:
        raise HTTPException(status_code=500, detail=f"Failed to parse config.ini: {error}") from error


@router.post("/api/pixiv-config")
def update_pixiv_config(req: BulkPixivConfigUpdate):
    config_path = config_paths.get_pixiv_config_path()
    backup_path = config_paths.get_backup_path(config_path)
    if not os.path.exists(config_path):
        raise HTTPException(status_code=404, detail=f"找不到 PixivUtil2 設定檔：{config_path}")

    try:
        shutil.copyfile(config_path, backup_path)
    except OSError as error:
        raise HTTPException(status_code=500, detail=f"Failed to create backup config.ini.bak: {error}") from error

    try:
        config = configparser.ConfigParser(interpolation=None)
        config.read(config_path, encoding="utf-8")
        for item in req.updates:
            if not config.has_section(item.section):
                config.add_section(item.section)
            config.set(item.section, item.option, item.value)
        with open(config_path, "w", encoding="utf-8") as handle:
            config.write(handle)
        return {
            "status": "success",
            "message": "config.ini updated safely.",
            "hasBackup": True,
            "configPath": config_path,
            "backupPath": backup_path,
        }
    except (OSError, configparser.Error) as error:
        if os.path.exists(backup_path):
            shutil.copyfile(backup_path, config_path)
        raise HTTPException(status_code=500, detail=f"Failed to write config.ini (restored from backup): {error}") from error


@router.post("/api/settings/backup")
def backup_settings():
    config_path = config_paths.get_pixiv_config_path()
    backup_path = config_paths.get_backup_path(config_path)
    if not os.path.exists(config_path):
        raise HTTPException(status_code=404, detail=f"找不到 PixivUtil2 設定檔：{config_path}")
    try:
        shutil.copyfile(config_path, backup_path)
    except OSError as error:
        raise HTTPException(status_code=500, detail=f"Failed to create config backup: {error}") from error
    return {
        "status": "success",
        "message": "PixivUtil2 設定檔已建立手動備份。",
        "hasBackup": True,
        "configPath": config_path,
        "backupPath": backup_path,
    }


@router.post("/api/settings/restore")
def restore_settings():
    config_path = config_paths.get_pixiv_config_path()
    backup_path = config_paths.get_backup_path(config_path)
    if not os.path.exists(backup_path):
        raise HTTPException(status_code=404, detail=f"找不到備份檔：{backup_path}")
    try:
        shutil.copyfile(backup_path, config_path)
    except OSError as error:
        raise HTTPException(status_code=500, detail=f"Failed to restore config.ini: {error}") from error
    return {
        "status": "success",
        "message": "config.ini successfully restored from backup.",
        "configPath": config_path,
        "backupPath": backup_path,
        "hasBackup": True,
    }
