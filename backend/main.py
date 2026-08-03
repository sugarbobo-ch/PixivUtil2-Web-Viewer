# -*- coding: utf-8 -*-
import io
import json
import hashlib
import os
import re
import configparser
import shutil
import tempfile
import zipfile
from typing import List, Dict, Any, Optional, Literal
from fastapi import FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from starlette.background import BackgroundTask
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from PIL import Image

import db
import config_paths
import source_resolver

app = FastAPI(title="PixivUtil2 Web Viewer Backend API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WORKSPACE_ROOT = config_paths.WORKSPACE_ROOT
THUMB_CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache_thumbs")
os.makedirs(THUMB_CACHE_DIR, exist_ok=True)
THUMB_CACHE_HEADERS = {"Cache-Control": "public, max-age=86400, immutable"}

WEB_CONFIG_PATH = config_paths.WEB_CONFIG_PATH

DEFAULT_WEB_CONFIG = {
    "webTheme": "dark",
    "defaultViewMode": "grid",
    "thumbnailSize": 320,
    "itemsPerPage": 200,
    "autoOpenBrowser": True,
    "pixivConfigPath": "",
    "groupMangaPosts": False,
    "blurEnabled": False,
    "preloadImageCount": 3,
}


def normalize_web_config_file(data: Any) -> Dict[str, Any]:
    """Fill in settings introduced after older web_config.json versions."""
    current = dict(data) if isinstance(data, dict) else {}

    # Migrate the old mosaic name to the canonical blur name while keeping old
    # config files and API clients readable.
    if "blurEnabled" not in current and "mosaicEnabled" in current:
        current["blurEnabled"] = current["mosaicEnabled"]
    current.pop("mosaicEnabled", None)

    normalized = {**DEFAULT_WEB_CONFIG, **current}

    # Preserve the old thumbnailWidth/thumbnailHeight settings during migration.
    if "thumbnailSize" not in current:
        normalized["thumbnailSize"] = current.get(
            "thumbnailWidth",
            current.get("thumbnailHeight", DEFAULT_WEB_CONFIG["thumbnailSize"]),
        )

    return normalized


def get_root_directory() -> str:
    config_path = config_paths.get_pixiv_config_path()
    if os.path.exists(config_path):
        try:
            config = configparser.ConfigParser(interpolation=None)
            config.read(config_path, encoding="utf-8")
            root_dir = config.get("Settings", "rootDirectory", fallback=".")
            if root_dir and root_dir != ".":
                return os.path.abspath(root_dir)
        except Exception:
            pass
    return WORKSPACE_ROOT


def resolve_image_path(image_id: Optional[int], save_name: Optional[str]) -> Optional[str]:
    """Dynamically resolves local media file path without mutating SQLite DB."""
    if save_name and not db.is_internal_media_path(save_name) and os.path.isfile(save_name):
        return os.path.abspath(save_name)

    root_dir = get_root_directory()

    # Attempt 1: Relative save_name combined with rootDirectory or WORKSPACE_ROOT
    if save_name:
        candidate = os.path.abspath(os.path.join(root_dir, save_name))
        if not db.is_internal_media_path(candidate) and os.path.isfile(candidate):
            return candidate
        candidate2 = os.path.abspath(os.path.join(WORKSPACE_ROOT, save_name))
        if not db.is_internal_media_path(candidate2) and os.path.isfile(candidate2):
            return candidate2

    # Attempt 2: Dynamic filename search by image_id in rootDirectory & WORKSPACE_ROOT
    if image_id:
        target_str = str(image_id)
        valid_exts = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4"}
        for search_base in [root_dir, WORKSPACE_ROOT]:
            if not os.path.exists(search_base):
                continue
            for root, dirs, files in os.walk(search_base):
                dirs[:] = [directory for directory in dirs if not db.is_internal_directory_name(directory)]
                for f in files:
                    ext = os.path.splitext(f)[1].lower()
                    candidate = os.path.abspath(os.path.join(root, f))
                    if ext in valid_exts and f.startswith(target_str) and not db.is_internal_media_path(candidate):
                        return candidate

    return None


class BatchDeleteItem(BaseModel):
    image_id: int
    path: str


class BatchDeleteRequest(BaseModel):
    image_ids: List[int] = Field(default_factory=list)
    items: List[BatchDeleteItem] = Field(default_factory=list)


class BatchDownloadItem(BaseModel):
    image_id: int
    path: str


class BatchDownloadRequest(BaseModel):
    image_ids: List[int] = Field(default_factory=list)
    items: List[BatchDownloadItem] = Field(default_factory=list)


class RescanRequest(BaseModel):
    directory: Optional[str] = None


class PixivConfigItemUpdate(BaseModel):
    section: str
    option: str
    value: str


class BulkPixivConfigUpdate(BaseModel):
    updates: List[PixivConfigItemUpdate]


class OpenMediaRequest(BaseModel):
    path: str
    image_id: Optional[int] = None
    target: Literal["file", "folder"]


# --- Web Viewer Dedicated Config API (web_config.json) ---

@app.get("/api/web-config")
def get_web_config():
    if not os.path.exists(WEB_CONFIG_PATH):
        default_config = dict(DEFAULT_WEB_CONFIG)
        with open(WEB_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(default_config, f, indent=2)
        return default_config
    try:
        with open(WEB_CONFIG_PATH, "r", encoding="utf-8") as f:
            current = json.load(f)
        normalized = normalize_web_config_file(current)
        if normalized != current:
            with open(WEB_CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(normalized, f, indent=2)
        return normalized
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to read web_config.json: {err}")


@app.post("/api/web-config")
def update_web_config(data: Dict[str, Any]):
    try:
        current = {}
        if os.path.exists(WEB_CONFIG_PATH):
            with open(WEB_CONFIG_PATH, "r", encoding="utf-8") as f:
                current = json.load(f)
        current = normalize_web_config_file(current)
        incoming = dict(data)
        if "blurEnabled" not in incoming and "mosaicEnabled" in incoming:
            incoming["blurEnabled"] = incoming["mosaicEnabled"]
        incoming.pop("mosaicEnabled", None)
        if "pixivConfigPath" in data:
            configured_path = data.get("pixivConfigPath")
            if configured_path and not os.path.isfile(config_paths.resolve_config_path(configured_path)):
                resolved_path = config_paths.resolve_config_path(configured_path)
                raise HTTPException(
                    status_code=400,
                    detail=f"找不到 PixivUtil2 設定檔：{resolved_path}"
                )

        current.update(incoming)
        if "thumbnailSize" in incoming:
            current.pop("thumbnailWidth", None)
            current.pop("thumbnailHeight", None)
        with open(WEB_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2)
        return {"status": "success", "webConfig": current}
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to save web_config.json: {err}")


# --- PixivUtil2 Complete config.ini All-Section API ---

@app.get("/api/pixiv-config")
def get_pixiv_config():
    config_path = config_paths.get_pixiv_config_path()
    backup_path = config_paths.get_backup_path(config_path)
    if not os.path.exists(config_path):
        raise HTTPException(status_code=404, detail=f"找不到 PixivUtil2 設定檔：{config_path}")
    try:
        config = configparser.ConfigParser(interpolation=None)
        config.read(config_path, encoding="utf-8")
        result = {}
        for section in config.sections():
            result[section] = dict(config.items(section))
        return {
            "sections": result,
            "hasBackup": os.path.exists(backup_path),
            "configPath": config_path,
            "backupPath": backup_path,
            "defaultConfigPath": config_paths.DEFAULT_CONFIG_INI_PATH,
            "usingDefaultPath": os.path.normcase(config_path) == os.path.normcase(config_paths.DEFAULT_CONFIG_INI_PATH)
        }
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to parse config.ini: {err}")


@app.post("/api/pixiv-config")
def update_pixiv_config(req: BulkPixivConfigUpdate):
    config_path = config_paths.get_pixiv_config_path()
    backup_path = config_paths.get_backup_path(config_path)
    if not os.path.exists(config_path):
        raise HTTPException(status_code=404, detail=f"找不到 PixivUtil2 設定檔：{config_path}")

    # Step 1: Backup to config.ini.bak
    try:
        shutil.copyfile(config_path, backup_path)
    except Exception as ex:
        raise HTTPException(status_code=500, detail=f"Failed to create backup config.ini.bak: {ex}")

    # Step 2: Update specified sections and options
    try:
        config = configparser.ConfigParser(interpolation=None)
        config.read(config_path, encoding="utf-8")

        for item in req.updates:
            if not config.has_section(item.section):
                config.add_section(item.section)
            config.set(item.section, item.option, item.value)

        with open(config_path, "w", encoding="utf-8") as f:
            config.write(f)

        return {
            "status": "success",
            "message": "config.ini updated safely.",
            "hasBackup": True,
            "configPath": config_path,
            "backupPath": backup_path
        }
    except Exception as err:
        if os.path.exists(backup_path):
            shutil.copyfile(backup_path, config_path)
        raise HTTPException(status_code=500, detail=f"Failed to write config.ini (restored from backup): {err}")


@app.post("/api/settings/backup")
def backup_settings():
    config_path = config_paths.get_pixiv_config_path()
    backup_path = config_paths.get_backup_path(config_path)
    if not os.path.exists(config_path):
        raise HTTPException(status_code=404, detail=f"找不到 PixivUtil2 設定檔：{config_path}")

    try:
        shutil.copyfile(config_path, backup_path)
        return {
            "status": "success",
            "message": "PixivUtil2 設定檔已建立手動備份。",
            "hasBackup": True,
            "configPath": config_path,
            "backupPath": backup_path
        }
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to create config backup: {err}")


@app.post("/api/settings/restore")
def restore_settings():
    config_path = config_paths.get_pixiv_config_path()
    backup_path = config_paths.get_backup_path(config_path)
    if not os.path.exists(backup_path):
        raise HTTPException(status_code=404, detail=f"找不到備份檔：{backup_path}")
    try:
        shutil.copyfile(backup_path, config_path)
        return {
            "status": "success",
            "message": "config.ini successfully restored from backup.",
            "configPath": config_path,
            "backupPath": backup_path,
            "hasBackup": True
        }
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
    return {"status": "success", "archived_members": result.get("archived_members", 0)}


@app.get("/api/artists")
def read_artists():
    return db.get_all_artists()


@app.get("/api/source-link")
def read_source_link(path: str = Query(..., min_length=1)):
    """Resolve a verified Pixiv/FANBOX source page for one local file."""
    return source_resolver.resolve_source_link(path)


@app.get("/api/artist-source-link")
def read_artist_source_link(artist_id: int = Query(...)):
    """Resolve source pages only for the currently selected artist."""
    return source_resolver.resolve_artist_source(artist_id)


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
        only_db = False

    images, total_count, available_months = db.get_images(
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
        "offset": offset,
        "months": available_months,
    }


@app.get("/api/file")
def get_media_file(path: str, image_id: Optional[int] = None):
    resolved = resolve_image_path(image_id, path)
    if not resolved or not os.path.isfile(resolved):
        raise HTTPException(status_code=404, detail="File not found")

    mime_type = "application/octet-stream"
    ext = os.path.splitext(resolved)[1].lower()
    if ext in {".jpg", ".jpeg", ".png", ".gif", ".webp"} and not db.is_usable_media_file(resolved):
        raise HTTPException(status_code=422, detail="Image file is invalid or incomplete")
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


@app.post("/api/open-media")
def open_media_with_windows_default(req: OpenMediaRequest):
    """Open a verified media file or its containing folder through Windows."""
    if os.name != "nt":
        raise HTTPException(status_code=501, detail="Windows default open is only available on Windows")

    resolved = resolve_image_path(req.image_id, req.path)
    if not resolved or not os.path.isfile(resolved):
        raise HTTPException(status_code=404, detail="File not found")

    if os.path.splitext(resolved)[1].lower() not in db.MEDIA_EXTENSIONS:
        raise HTTPException(status_code=422, detail="Only media files can be opened")

    target_path = resolved if req.target == "file" else os.path.dirname(resolved)
    start_file = getattr(os, "startfile", None)
    if start_file is None:
        raise HTTPException(status_code=501, detail="Windows default open is unavailable")

    try:
        start_file(target_path)
    except OSError as err:
        raise HTTPException(status_code=500, detail=f"Failed to open path: {err}") from err

    return {"status": "success", "target": req.target}


def generate_fallback_svg(filename: str) -> str:
    import html
    safe_title = html.escape(os.path.basename(filename))
    display_title = safe_title if len(safe_title) <= 26 else safe_title[:12] + "..." + safe_title[-10:]
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
  <rect width="320" height="320" fill="#18181b"/>
  <rect x="20" y="20" width="280" height="280" rx="16" fill="#27272a" stroke="#3f3f46" stroke-width="2"/>
  <circle cx="160" cy="140" r="40" fill="#4f46e5" fill-opacity="0.9"/>
  <polygon points="152,124 176,140 152,156" fill="#ffffff"/>
  <text x="160" y="225" font-family="sans-serif" font-size="12" font-weight="600" fill="#e4e4e7" text-anchor="middle">{display_title}</text>
</svg>"""


def generate_media_error_svg(filename: str) -> str:
    import html
    safe_title = html.escape(os.path.basename(filename))
    display_title = safe_title if len(safe_title) <= 34 else safe_title[:16] + "..." + safe_title[-14:]
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
  <rect width="640" height="480" fill="#18181b"/>
  <rect x="24" y="24" width="592" height="432" rx="24" fill="#27272a" stroke="#f59e0b" stroke-opacity="0.55" stroke-width="3"/>
  <path d="M320 112 392 240h-144z" fill="#f59e0b"/>
  <rect x="314" y="168" width="12" height="44" rx="6" fill="#18181b"/>
  <circle cx="320" cy="230" r="6" fill="#18181b"/>
  <text x="320" y="300" font-family="sans-serif" font-size="24" font-weight="700" fill="#fef3c7" text-anchor="middle">圖片檔案有問題</text>
  <text x="320" y="336" font-family="sans-serif" font-size="15" fill="#a1a1aa" text-anchor="middle">檔案可能未完成或已損壞</text>
  <text x="320" y="386" font-family="sans-serif" font-size="13" fill="#71717a" text-anchor="middle">{display_title}</text>
</svg>"""


def extract_video_frame(video_path: str, thumb_path: str, width: int = 320, height: int = 320) -> bool:
    try:
        import cv2
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return False

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # Sample candidates: 15% into video, 5% into video, frame 30, frame 5, frame 0
        candidates = []
        if total_frames > 0:
            candidates = [
                min(int(total_frames * 0.15), total_frames - 1),
                min(int(total_frames * 0.05), total_frames - 1),
                min(30, total_frames - 1),
                min(5, total_frames - 1),
                0
            ]
        else:
            candidates = [60, 30, 15, 5, 0]

        frame = None
        ret = False
        for f_pos in candidates:
            if f_pos < 0:
                continue
            cap.set(cv2.CAP_PROP_POS_FRAMES, f_pos)
            ret, frame = cap.read()
            if ret and frame is not None:
                # Ensure frame is not completely pitch black
                if frame.any() and frame.mean() > 5.0:
                    break

        cap.release()

        if ret and frame is not None:
            color_converted = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(color_converted)
            pil_img.thumbnail((width, height), Image.Resampling.LANCZOS)
            pil_img.save(thumb_path, "WEBP", quality=80)
            return True
    except Exception as ex:
        print(f"Error extracting video frame from {video_path}: {ex}")
    return False


@app.get("/api/thumbnail")
def get_thumbnail(
    path: str,
    image_id: Optional[int] = None,
    size: Optional[int] = Query(None, ge=16, le=4096),
    width: int = Query(320, ge=16, le=4096),
    height: int = Query(320, ge=16, le=4096),
):
    if size is not None:
        width = size
        height = size
    resolved = resolve_image_path(image_id, path)
    if not resolved or not os.path.isfile(resolved):
        raise HTTPException(status_code=404, detail="Original image not found")

    ext = os.path.splitext(resolved)[1].lower()
    filename = os.path.basename(resolved)
    if ext in {".jpg", ".jpeg", ".png", ".gif", ".webp"} and not db.is_usable_media_file(resolved):
        return Response(content=generate_media_error_svg(filename), media_type="image/svg+xml")

    # Use a stable, content-aware key so generated thumbnails remain reusable
    # after a backend restart while changed source files get a fresh cache
    # entry. Python's built-in hash() is intentionally randomized per process.
    try:
        source_stat = os.stat(resolved)
        source_key = f"{os.path.normcase(resolved)}:{source_stat.st_mtime_ns}:{source_stat.st_size}:{width}x{height}"
    except OSError:
        source_key = f"{os.path.normcase(resolved)}:{width}x{height}"
    thumb_key = hashlib.sha1(source_key.encode("utf-8")).hexdigest()
    thumb_name = f"{thumb_key}_{width}x{height}.webp"
    thumb_path = os.path.join(THUMB_CACHE_DIR, thumb_name)

    if os.path.exists(thumb_path):
        return FileResponse(thumb_path, media_type="image/webp", headers=THUMB_CACHE_HEADERS)

    if ext in [".mp4", ".mkv", ".webm", ".avi", ".mov"]:
        if extract_video_frame(resolved, thumb_path, width, height):
            return FileResponse(thumb_path, media_type="image/webp", headers=THUMB_CACHE_HEADERS)
        return Response(content=generate_fallback_svg(filename), media_type="image/svg+xml")

    if ext == ".zip":
        return Response(content=generate_fallback_svg(filename), media_type="image/svg+xml")

    try:
        with Image.open(resolved) as img:
            img.thumbnail((width, height), Image.Resampling.LANCZOS)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGBA")
            else:
                img = img.convert("RGB")
            img.save(thumb_path, "WEBP", quality=80)
        return FileResponse(thumb_path, media_type="image/webp", headers=THUMB_CACHE_HEADERS)
    except Exception as err:
        return FileResponse(resolved)


def cleanup_temporary_file(path: str) -> None:
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
    except OSError:
        pass


@app.post("/api/images/download-zip")
def download_selected_images(req: BatchDownloadRequest):
    """Create a ZIP containing the selected local media files."""
    selected_records = db.get_image_paths_by_ids(req.image_ids)
    selected_records.extend((item.image_id, item.path) for item in req.items)

    resolved_files = []
    seen_paths = set()
    for image_id, path in selected_records:
        resolved = resolve_image_path(image_id, path)
        if not resolved or not os.path.isfile(resolved):
            continue
        if db.is_internal_media_path(resolved):
            continue
        if os.path.splitext(resolved)[1].lower() not in db.MEDIA_EXTENSIONS:
            continue

        normalized_path = os.path.normcase(os.path.abspath(resolved))
        if normalized_path in seen_paths:
            continue
        seen_paths.add(normalized_path)
        resolved_files.append((image_id, resolved))

    if not resolved_files:
        raise HTTPException(status_code=404, detail="找不到可下載的選取作品")

    temporary_path = ""
    try:
        with tempfile.NamedTemporaryFile(prefix="pixivutil2-selected-", suffix=".zip", delete=False) as temporary_file:
            temporary_path = temporary_file.name

        archive_names = set()
        with zipfile.ZipFile(temporary_path, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
            for image_id, resolved in resolved_files:
                filename = os.path.basename(resolved) or f"image-{image_id}"
                archive_name = f"{image_id}_{filename}"
                stem, extension = os.path.splitext(archive_name)
                suffix = 2
                while archive_name.casefold() in archive_names:
                    archive_name = f"{stem}_{suffix}{extension}"
                    suffix += 1
                archive_names.add(archive_name.casefold())
                archive.write(resolved, arcname=archive_name)

        return FileResponse(
            temporary_path,
            media_type="application/zip",
            filename="pixivutil2-selected-works.zip",
            background=BackgroundTask(cleanup_temporary_file, temporary_path),
        )
    except Exception as err:
        if temporary_path:
            cleanup_temporary_file(temporary_path)
        raise HTTPException(status_code=500, detail=f"建立 ZIP 下載檔失敗：{err}") from err


@app.post("/api/images/batch-trash")
@app.post("/api/images/batch-delete")
def batch_trash(req: BatchDeleteRequest):
    """Move selected media to a recoverable trash directory.

    ``batch-delete`` remains as a safe compatibility alias for older clients;
    neither route permanently deletes a file or database record.
    """
    requested_ids = list(dict.fromkeys(
        [*req.image_ids, *(item.image_id for item in req.items)]
    ))
    if not requested_ids and not req.items:
        return {
            "trashed_items": 0,
            "moved_files": 0,
            "missing_files": 0,
            "errors": [],
        }

    selected_records = db.get_image_paths_by_ids(requested_ids)
    selected_records.extend((item.image_id, item.path) for item in req.items)

    moved_records = []
    moved_paths = []
    seen_records = set()
    seen_sources = set()
    missing_files = 0

    def rollback_moves() -> None:
        for original_path, trash_path in reversed(moved_paths):
            if not os.path.exists(trash_path):
                continue
            try:
                os.makedirs(os.path.dirname(original_path), exist_ok=True)
                shutil.move(trash_path, original_path)
            except OSError as rollback_error:
                print(f"Failed to restore {original_path} after trash error: {rollback_error}")

    try:
        for image_id, database_path in selected_records:
            record_key = (
                int(image_id),
                os.path.normcase(os.path.normpath(str(database_path or ""))),
            )
            if record_key in seen_records:
                continue
            seen_records.add(record_key)

            # Do not fall back to an image-ID filename search here. A missing
            # DB path must never cause an unrelated file to be moved.
            resolved = resolve_image_path(None, database_path)
            if not resolved or not os.path.isfile(resolved):
                missing_files += 1
                continue
            if db.is_internal_media_path(resolved):
                continue

            normalized_source = os.path.normcase(os.path.abspath(resolved))
            if normalized_source in seen_sources:
                continue
            seen_sources.add(normalized_source)

            trash_path = db.get_trash_destination(resolved, int(image_id))
            os.makedirs(os.path.dirname(trash_path), exist_ok=True)
            shutil.move(resolved, trash_path)
            moved_paths.append((resolved, trash_path))
            moved_records.append((int(image_id), database_path, resolved, trash_path))
    except OSError as err:
        rollback_moves()
        raise HTTPException(status_code=500, detail=f"移至回收區失敗：{err}") from err

    try:
        trashed_db_entries = db.mark_images_as_trashed(requested_ids, moved_records)
    except Exception as err:
        rollback_moves()
        raise HTTPException(status_code=500, detail=f"記錄回收區項目失敗：{err}") from err

    # Trashed files must not remain in the in-memory gallery/index cache.
    db.invalidate_scan_cache()

    moved_ids = {image_id for image_id, *_ in moved_records}
    return {
        "trashed_items": max(len(moved_ids), trashed_db_entries),
        "trashed_db_entries": trashed_db_entries,
        "moved_files": len(moved_records),
        "missing_files": missing_files,
        "errors": [],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
