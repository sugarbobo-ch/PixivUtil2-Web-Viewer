# -*- coding: utf-8 -*-
import io
import json
import os
import re
import configparser
import shutil
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from PIL import Image

import db

app = FastAPI(title="PixivUtil2 Web Viewer Backend API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
THUMB_CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache_thumbs")
os.makedirs(THUMB_CACHE_DIR, exist_ok=True)

CONFIG_INI_PATH = os.path.join(WORKSPACE_ROOT, "config.ini")
CONFIG_BAK_PATH = os.path.join(WORKSPACE_ROOT, "config.ini.bak")
WEB_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "web_config.json")


def get_root_directory() -> str:
    if os.path.exists(CONFIG_INI_PATH):
        try:
            config = configparser.ConfigParser(interpolation=None)
            config.read(CONFIG_INI_PATH, encoding="utf-8")
            root_dir = config.get("Settings", "rootDirectory", fallback=".")
            if root_dir and root_dir != ".":
                return os.path.abspath(root_dir)
        except Exception:
            pass
    return WORKSPACE_ROOT


def resolve_image_path(image_id: Optional[int], save_name: Optional[str]) -> Optional[str]:
    """Dynamically resolves local media file path without mutating SQLite DB."""
    if save_name and os.path.isfile(save_name):
        return os.path.abspath(save_name)

    root_dir = get_root_directory()

    # Attempt 1: Relative save_name combined with rootDirectory or WORKSPACE_ROOT
    if save_name:
        candidate = os.path.abspath(os.path.join(root_dir, save_name))
        if os.path.isfile(candidate):
            return candidate
        candidate2 = os.path.abspath(os.path.join(WORKSPACE_ROOT, save_name))
        if os.path.isfile(candidate2):
            return candidate2

    # Attempt 2: Dynamic filename search by image_id in rootDirectory & WORKSPACE_ROOT
    if image_id:
        target_str = str(image_id)
        valid_exts = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4"}
        for search_base in [root_dir, WORKSPACE_ROOT]:
            if not os.path.exists(search_base):
                continue
            for root, _, files in os.walk(search_base):
                for f in files:
                    ext = os.path.splitext(f)[1].lower()
                    if ext in valid_exts and f.startswith(target_str):
                        return os.path.abspath(os.path.join(root, f))

    return None


class BatchDeleteRequest(BaseModel):
    image_ids: List[int]


class RescanRequest(BaseModel):
    directory: Optional[str] = None


class PixivConfigItemUpdate(BaseModel):
    section: str
    option: str
    value: str


class BulkPixivConfigUpdate(BaseModel):
    updates: List[PixivConfigItemUpdate]


# --- Web Viewer Dedicated Config API (web_config.json) ---

@app.get("/api/web-config")
def get_web_config():
    if not os.path.exists(WEB_CONFIG_PATH):
        default_config = {
            "webTheme": "dark",
            "defaultViewMode": "grid",
            "thumbnailWidth": 320,
            "thumbnailHeight": 320,
            "itemsPerPage": 200,
            "autoOpenBrowser": True
        }
        with open(WEB_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(default_config, f, indent=2)
        return default_config
    try:
        with open(WEB_CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to read web_config.json: {err}")


@app.post("/api/web-config")
def update_web_config(data: Dict[str, Any]):
    try:
        current = {}
        if os.path.exists(WEB_CONFIG_PATH):
            with open(WEB_CONFIG_PATH, "r", encoding="utf-8") as f:
                current = json.load(f)
        current.update(data)
        with open(WEB_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2)
        return {"status": "success", "webConfig": current}
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to save web_config.json: {err}")


# --- PixivUtil2 Complete config.ini All-Section API ---

@app.get("/api/pixiv-config")
def get_pixiv_config():
    if not os.path.exists(CONFIG_INI_PATH):
        raise HTTPException(status_code=404, detail="config.ini not found")
    try:
        config = configparser.ConfigParser(interpolation=None)
        config.read(CONFIG_INI_PATH, encoding="utf-8")
        result = {}
        for section in config.sections():
            result[section] = dict(config.items(section))
        return {
            "sections": result,
            "hasBackup": os.path.exists(CONFIG_BAK_PATH),
            "configPath": CONFIG_INI_PATH
        }
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to parse config.ini: {err}")


@app.post("/api/pixiv-config")
def update_pixiv_config(req: BulkPixivConfigUpdate):
    if not os.path.exists(CONFIG_INI_PATH):
        raise HTTPException(status_code=404, detail="config.ini not found")

    # Step 1: Backup to config.ini.bak
    try:
        shutil.copyfile(CONFIG_INI_PATH, CONFIG_BAK_PATH)
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"Failed to create backup config.ini.bak: {ex}")

    # Step 2: Update specified sections and options
    try:
        config = configparser.ConfigParser(interpolation=None)
        config.read(CONFIG_INI_PATH, encoding="utf-8")

        for item in req.updates:
            if not config.has_section(item.section):
                config.add_section(item.section)
            config.set(item.section, item.option, item.value)

        with open(CONFIG_INI_PATH, "w", encoding="utf-8") as f:
            config.write(f)

        return {"status": "success", "message": "config.ini updated safely.", "hasBackup": True}
    except Exception as err:
        if os.path.exists(CONFIG_BAK_PATH):
            shutil.copyfile(CONFIG_BAK_PATH, CONFIG_INI_PATH)
        raise HTTPException(status_code=500, detail=f"Failed to write config.ini (restored from backup): {err}")


@app.post("/api/settings/restore")
def restore_settings():
    if not os.path.exists(CONFIG_BAK_PATH):
        raise HTTPException(status_code=404, detail="No config.ini.bak backup file found.")
    try:
        shutil.copyfile(CONFIG_BAK_PATH, CONFIG_INI_PATH)
        return {"status": "success", "message": "config.ini successfully restored from backup."}
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to restore config.ini: {err}")


@app.post("/api/rescan")
def rescan_directory(req: RescanRequest):
    target_dir = req.directory or get_root_directory()
    result = db.scan_and_index_directory(target_dir)
    return result


@app.post("/api/db/clean-orphans")
def clean_db_orphans():
    result = db.clean_orphaned_records()
    return {"status": "success", "deleted_members": result.get("deleted_members", 0)}


@app.get("/api/artists")
def read_artists():
    return db.get_all_artists()


@app.get("/api/months")
def read_months():
    return db.get_all_months()


@app.get("/api/images")
def read_images(
    month: Optional[str] = None,
    artist_id: Optional[int] = None,
    search: Optional[str] = None,
    only_db: Optional[bool] = None,
    sort_mode: str = "newest",
    limit: int = 200,
    offset: int = 0
):
    if only_db is None:
        web_cfg = get_web_config()
        only_db = bool(web_cfg.get("onlyShowDbFiles", False))

    images, total_count = db.get_images(
        month=month,
        artist_id=artist_id,
        search=search,
        limit=limit,
        offset=offset,
        only_show_db_files=only_db,
        sort_mode=sort_mode
    )
    return {
        "images": images,
        "total": total_count,
        "limit": limit,
        "offset": offset
    }


@app.get("/api/file")
def get_media_file(path: str, image_id: Optional[int] = None):
    resolved = resolve_image_path(image_id, path)
    if not resolved or not os.path.isfile(resolved):
        raise HTTPException(status_code=404, detail="File not found")

    mime_type = "application/octet-stream"
    ext = os.path.splitext(resolved)[1].lower()
    if ext in [".jpg", ".jpeg"]:
        mime_type = "image/jpeg"
    elif ext == ".png":
        mime_type = "image/png"
    elif ext == ".gif":
        mime_type = "image/gif"
    elif ext == ".webp":
        mime_type = "image/webp"
    elif ext == ".mp4":
        mime_type = "video/mp4"

    return FileResponse(resolved, media_type=mime_type)


@app.get("/api/thumbnail")
def get_thumbnail(path: str, image_id: Optional[int] = None, width: int = 320, height: int = 320):
    resolved = resolve_image_path(image_id, path)
    if not resolved or not os.path.isfile(resolved):
        raise HTTPException(status_code=404, detail="Original image not found")

    ext = os.path.splitext(resolved)[1].lower()
    if ext in [".mp4", ".zip"]:
        return FileResponse(resolved)

    thumb_name = f"{hash(resolved)}_{width}x{height}.webp"
    thumb_path = os.path.join(THUMB_CACHE_DIR, thumb_name)

    if os.path.exists(thumb_path):
        return FileResponse(thumb_path, media_type="image/webp")

    try:
        with Image.open(resolved) as img:
            img.thumbnail((width, height), Image.Resampling.LANCZOS)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGBA")
            else:
                img = img.convert("RGB")
            img.save(thumb_path, "WEBP", quality=80)
        return FileResponse(thumb_path, media_type="image/webp")
    except Exception as err:
        return FileResponse(resolved)


@app.post("/api/images/batch-delete")
def batch_delete(req: BatchDeleteRequest):
    if not req.image_ids:
        return {"deleted_count": 0, "messages": ["No image IDs provided."]}

    file_paths = db.delete_image_records(req.image_ids)
    deleted_files = 0
    errors = []

    for file_path in file_paths:
        resolved = resolve_image_path(None, file_path)
        if resolved and os.path.isfile(resolved):
            try:
                os.remove(resolved)
                deleted_files += 1
            except Exception as ex:
                errors.append(f"Failed to delete file {file_path}: {ex}")

    return {
        "deleted_db_entries": len(req.image_ids),
        "deleted_physical_files": deleted_files,
        "errors": errors
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
