# -*- coding: utf-8 -*-
"""Persistent, single-worker media library jobs."""

from __future__ import annotations

import hashlib
import json
import os
import queue
import re
import shutil
import sqlite3
import tempfile
import threading
import time
import traceback
import uuid
from collections import Counter
from typing import Any, Dict, Optional

from PIL import Image

import db
import config_paths


INTERACTIVE_QUIET_WINDOW_SECONDS = 0.15
THUMB_CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache_thumbs")
THUMB_CACHE_RECOVERY_DIR = os.path.join(THUMB_CACHE_DIR, ".viewer-trash")
THUMB_CACHE_DIMENSIONS_RE = re.compile(r"_(\d+)x(\d+)\.webp$", re.IGNORECASE)
_INTERACTIVE_ACTIVITY_LOCK = threading.Lock()
_LAST_INTERACTIVE_MEDIA_AT = 0.0
_CACHE_ACCESS_LOCK = threading.Lock()
_CACHE_ACCESS_LAST_TOUCH: Dict[str, float] = {}
_CACHE_ACCESS_THROTTLE_SECONDS = 30.0


def note_interactive_media_activity() -> None:
    """Record an image request so maintenance yields at the next file boundary."""
    global _LAST_INTERACTIVE_MEDIA_AT
    with _INTERACTIVE_ACTIVITY_LOCK:
        _LAST_INTERACTIVE_MEDIA_AT = time.monotonic()


def wait_for_interactive_quiet(cancel_event: Any = None) -> None:
    """Briefly back off while interactive media requests are arriving."""
    while True:
        with _INTERACTIVE_ACTIVITY_LOCK:
            elapsed = time.monotonic() - _LAST_INTERACTIVE_MEDIA_AT
        remaining = INTERACTIVE_QUIET_WINDOW_SECONDS - elapsed
        if remaining <= 0:
            return
        if cancel_event is not None and cancel_event.is_set():
            return
        time.sleep(min(remaining, 0.05))


def _configured_thumbnail_size() -> int:
    try:
        with open(config_paths.WEB_CONFIG_PATH, "r", encoding="utf-8") as handle:
            value = json.load(handle).get("thumbnailSize", 320)
        return max(16, min(4096, int(value)))
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        return 320


def _thumbnail_cache_name(
    file_path: str,
    width: int,
    height: int,
    source_stat: Optional[os.stat_result] = None,
) -> str:
    stat = source_stat or os.stat(file_path)
    source_key = (
        f"{os.path.normcase(os.path.abspath(file_path))}:"
        f"{stat.st_mtime_ns}:{stat.st_size}:{width}x{height}"
    )
    thumb_key = hashlib.sha1(source_key.encode("utf-8")).hexdigest()
    return f"{thumb_key}_{width}x{height}.webp"


def thumbnail_cache_name(
    file_path: str,
    width: int,
    height: int,
    source_stat: Optional[os.stat_result] = None,
) -> str:
    """Return the cache key shared by thumbnail serving and maintenance."""
    return _thumbnail_cache_name(file_path, width, height, source_stat)


def _existing_thumbnail_path(file_path: str) -> Optional[str]:
    """Resolve the current configured thumbnail without creating a new file."""
    try:
        source_stat = os.stat(file_path)
        size = _configured_thumbnail_size()
        thumb_name = _thumbnail_cache_name(file_path, size, size, source_stat)
        thumb_path = os.path.join(
            THUMB_CACHE_DIR,
            thumb_name,
        )
        return thumb_path if os.path.isfile(thumb_path) else None
    except OSError:
        return None


def record_thumbnail_cache_access(
    cache_name: str,
    source_path: str,
    source_stat: os.stat_result,
    width: int,
    height: int,
) -> None:
    """Persist cache provenance while throttling hot thumbnail requests."""
    now = time.monotonic()
    with _CACHE_ACCESS_LOCK:
        previous = _CACHE_ACCESS_LAST_TOUCH.get(cache_name, 0.0)
        if now - previous < _CACHE_ACCESS_THROTTLE_SECONDS:
            return
        _CACHE_ACCESS_LAST_TOUCH[cache_name] = now

    cache_path = os.path.join(THUMB_CACHE_DIR, cache_name)
    try:
        cache_bytes = os.path.getsize(cache_path)
        db.upsert_thumbnail_cache_entry(
            cache_name,
            source_path,
            source_stat.st_size,
            source_stat.st_mtime_ns,
            width,
            height,
            cache_bytes=cache_bytes,
        )
    except (OSError, ValueError, sqlite3.Error) as error:
        # Cache bookkeeping must never make an otherwise valid thumbnail fail.
        print(f"thumbnail cache metadata failed for {cache_name}: {error}")


def _active_thumbnail_files() -> list[Dict[str, Any]]:
    os.makedirs(THUMB_CACHE_DIR, exist_ok=True)
    files: list[Dict[str, Any]] = []
    try:
        entries = os.scandir(THUMB_CACHE_DIR)
    except OSError:
        return files

    with entries:
        for entry in entries:
            if not entry.is_file() or not entry.name.lower().endswith(".webp"):
                continue
            try:
                stat = entry.stat()
            except OSError:
                continue
            match = THUMB_CACHE_DIMENSIONS_RE.search(entry.name)
            files.append({
                "cache_name": entry.name,
                "path": entry.path,
                "cache_bytes": int(stat.st_size),
                "mtime": float(stat.st_mtime),
                "width": int(match.group(1)) if match else None,
                "height": int(match.group(2)) if match else None,
            })
    return files


def _recovery_manifests() -> list[Dict[str, Any]]:
    if not os.path.isdir(THUMB_CACHE_RECOVERY_DIR):
        return []

    manifests: list[Dict[str, Any]] = []
    try:
        directories = os.scandir(THUMB_CACHE_RECOVERY_DIR)
    except OSError:
        return manifests

    with directories:
        for directory in directories:
            if not directory.is_dir():
                continue
            manifest_path = os.path.join(directory.path, "manifest.json")
            try:
                with open(manifest_path, "r", encoding="utf-8") as handle:
                    manifest = json.load(handle)
            except (OSError, ValueError, json.JSONDecodeError):
                continue
            if not isinstance(manifest, dict):
                continue
            entries = manifest.get("entries")
            if not isinstance(entries, list):
                entries = []
            recoverable_files = 0
            recoverable_bytes = 0
            for item in entries:
                if not isinstance(item, dict):
                    continue
                recovery_name = os.path.basename(str(item.get("recovery_name") or ""))
                recovery_path = os.path.join(directory.path, recovery_name)
                try:
                    stat = os.stat(recovery_path)
                except OSError:
                    continue
                if not os.path.isfile(recovery_path):
                    continue
                recoverable_files += 1
                recoverable_bytes += int(stat.st_size)
            manifests.append({
                "job_id": str(manifest.get("job_id") or directory.name),
                "created_at": manifest.get("created_at"),
                "moved": len(entries),
                "recoverable_files": recoverable_files,
                "recoverable_bytes": recoverable_bytes,
                "restorable": recoverable_files > 0,
            })
    return manifests


def _recovery_job_directory(job_id: str) -> str:
    """Resolve one recovery directory without allowing path traversal."""
    if not isinstance(job_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", job_id):
        raise ValueError("invalid cache organization job id")

    recovery_root = os.path.abspath(THUMB_CACHE_RECOVERY_DIR)
    job_directory = os.path.abspath(os.path.join(recovery_root, job_id))
    try:
        is_within_recovery_root = os.path.commonpath([recovery_root, job_directory]) == recovery_root
    except ValueError:
        is_within_recovery_root = False
    if not is_within_recovery_root:
        raise ValueError("invalid cache organization job id")
    return job_directory


def _recovery_entry_name(value: Any) -> Optional[str]:
    name = str(value or "")
    if (
        not name
        or name in {".", ".."}
        or os.path.basename(name) != name
        or "/" in name
        or "\\" in name
    ):
        return None
    return name


def _load_recovery_manifest(job_id: str) -> tuple[str, Dict[str, Any]]:
    job_directory = _recovery_job_directory(job_id)
    manifest_path = os.path.join(job_directory, "manifest.json")
    try:
        with open(manifest_path, "r", encoding="utf-8") as handle:
            manifest = json.load(handle)
    except FileNotFoundError as error:
        raise FileNotFoundError("thumbnail cache recovery manifest not found") from error
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise ValueError("invalid thumbnail cache recovery manifest") from error

    if not isinstance(manifest, dict) or not isinstance(manifest.get("entries"), list):
        raise ValueError("invalid thumbnail cache recovery manifest")
    return job_directory, manifest


def _as_positive_int(value: Any) -> Optional[int]:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _read_recovery_entries(
    job_id: str,
) -> tuple[str, Dict[str, Any], list[Dict[str, Any]]]:
    job_directory, manifest = _load_recovery_manifest(job_id)
    raw_entries = manifest.get("entries") or []
    cache_names = [
        str(item.get("cache_name"))
        for item in raw_entries
        if isinstance(item, dict)
        and _recovery_entry_name(item.get("cache_name"))
    ]
    metadata_by_name = {
        row["cache_name"]: row
        for row in db.get_thumbnail_cache_entries(cache_names)
    }

    entries: list[Dict[str, Any]] = []
    for item in raw_entries:
        if not isinstance(item, dict):
            continue
        recovery_name = _recovery_entry_name(item.get("recovery_name"))
        if recovery_name is None:
            continue
        recovery_path = os.path.join(job_directory, recovery_name)
        try:
            stat = os.stat(recovery_path)
        except OSError:
            continue
        if not os.path.isfile(recovery_path):
            continue

        cache_name = _recovery_entry_name(item.get("cache_name"))
        metadata = metadata_by_name.get(cache_name or "", {})
        source_path_value = metadata.get("normalized_path") or item.get("original_path")
        source_path = str(source_path_value) if source_path_value else None
        source_file_size = metadata.get("source_file_size")
        source_mtime_ns = metadata.get("source_mtime_ns")
        if source_path and (source_file_size is None or source_mtime_ns is None):
            try:
                source_stat = os.stat(source_path)
            except OSError:
                source_stat = None
            if source_stat is not None and os.path.isfile(source_path):
                if source_file_size is None:
                    source_file_size = int(source_stat.st_size)
                if source_mtime_ns is None:
                    source_mtime_ns = int(source_stat.st_mtime_ns)
        entries.append({
            "recovery_name": recovery_name,
            "cache_name": cache_name,
            "cache_bytes": int(stat.st_size),
            "width": _as_positive_int(item.get("width")) or _as_positive_int(metadata.get("width")),
            "height": _as_positive_int(item.get("height")) or _as_positive_int(metadata.get("height")),
            "reason": str(item.get("reason") or "cache-maintenance"),
            "moved_at": item.get("moved_at"),
            "source_path": source_path,
            "source_file_size": source_file_size,
            "source_mtime_ns": source_mtime_ns,
            "generated_at": metadata.get("generated_at"),
            "last_accessed_at": metadata.get("last_accessed_at"),
        })

    return job_directory, manifest, entries


def get_thumbnail_cache_recovery_entries(
    job_id: str,
    offset: int = 0,
    limit: int = 24,
) -> Dict[str, Any]:
    """Return paginated recovery entries with preview-friendly metadata."""
    if offset < 0:
        raise ValueError("offset must be non-negative")
    if limit < 1 or limit > 100:
        raise ValueError("limit must be between 1 and 100")

    _job_directory, manifest, entries = _read_recovery_entries(job_id)
    total_bytes = sum(int(entry["cache_bytes"]) for entry in entries)
    page = entries[offset:offset + limit]
    return {
        "job_id": job_id,
        "created_at": manifest.get("created_at"),
        "moved": len(manifest.get("entries") or []),
        "total": len(entries),
        "total_bytes": total_bytes,
        "offset": offset,
        "limit": limit,
        "has_more": offset + len(page) < len(entries),
        "entries": page,
    }


def get_thumbnail_cache_recovery_path(job_id: str, recovery_name: str) -> str:
    """Return a validated recovery thumbnail path for the preview endpoint."""
    job_directory, _manifest, entries = _read_recovery_entries(job_id)
    safe_name = _recovery_entry_name(recovery_name)
    if safe_name is None or not any(entry["recovery_name"] == safe_name for entry in entries):
        raise FileNotFoundError("thumbnail cache preview not found")

    recovery_path = os.path.join(job_directory, safe_name)
    if not os.path.isfile(recovery_path):
        raise FileNotFoundError("thumbnail cache preview not found")
    return recovery_path


def permanently_delete_thumbnail_cache(job_id: str) -> Dict[str, Any]:
    """Permanently remove only the recovered files belonging to one job."""
    job_directory, manifest = _load_recovery_manifest(job_id)
    remaining_entries: list[Dict[str, Any]] = []
    cache_names_to_remove: list[str] = []
    errors: list[str] = []
    deleted = 0
    bytes_freed = 0

    for item in manifest.get("entries") or []:
        if not isinstance(item, dict):
            continue
        recovery_name = _recovery_entry_name(item.get("recovery_name"))
        if recovery_name is None:
            errors.append("manifest contains an invalid recovery file name")
            continue

        recovery_path = os.path.join(job_directory, recovery_name)
        try:
            cache_bytes = int(os.path.getsize(recovery_path))
        except FileNotFoundError:
            continue
        except OSError as error:
            remaining_entries.append(item)
            errors.append(f"{recovery_name}: {error}")
            continue

        try:
            os.remove(recovery_path)
        except OSError as error:
            remaining_entries.append(item)
            errors.append(f"{recovery_name}: {error}")
            continue

        deleted += 1
        bytes_freed += max(0, cache_bytes)
        cache_name = _recovery_entry_name(item.get("cache_name"))
        if cache_name and not os.path.isfile(os.path.join(THUMB_CACHE_DIR, cache_name)):
            cache_names_to_remove.append(cache_name)

    try:
        metadata_removed = db.delete_thumbnail_cache_entries(cache_names_to_remove)
    except Exception as error:
        metadata_removed = 0
        errors.append(f"thumbnail metadata: {error}")

    manifest["entries"] = remaining_entries
    manifest["purged_at"] = db._utc_timestamp()
    manifest["purge_summary"] = {
        "deleted": deleted,
        "bytes_freed": bytes_freed,
        "metadata_removed": metadata_removed,
        "errors": len(errors),
    }
    _write_cache_manifest(job_id, manifest)

    return {
        "deleted": deleted,
        "bytes_freed": bytes_freed,
        "metadata_removed": metadata_removed,
        "remaining": len(remaining_entries),
        "errors": errors,
    }


def get_thumbnail_cache_stats() -> Dict[str, Any]:
    """Return active and recoverable thumbnail storage without decoding images."""
    active_files = _active_thumbnail_files()
    recovery_jobs = _recovery_manifests()
    tracked_names = {row["cache_name"] for row in db.get_thumbnail_cache_entries()}
    return {
        "active_files": len(active_files),
        "active_bytes": sum(item["cache_bytes"] for item in active_files),
        "tracked_files": sum(1 for item in active_files if item["cache_name"] in tracked_names),
        "recoverable_files": sum(item["recoverable_files"] for item in recovery_jobs),
        "recoverable_bytes": sum(item["recoverable_bytes"] for item in recovery_jobs),
        "recovery_jobs": recovery_jobs,
    }


def _thumbnail_cache_limit_bytes() -> int:
    try:
        with open(config_paths.WEB_CONFIG_PATH, "r", encoding="utf-8") as handle:
            value = json.load(handle).get("thumbnailCacheLimitMiB", 1024)
        limit_mib = max(128, min(102400, int(value)))
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        limit_mib = 1024
    return limit_mib * 1024 * 1024


def _automatic_cache_management_enabled() -> bool:
    try:
        with open(config_paths.WEB_CONFIG_PATH, "r", encoding="utf-8") as handle:
            value = json.load(handle).get("manageThumbnailCache", True)
        if isinstance(value, str):
            return value.strip().lower() not in {"", "0", "false", "no", "off"}
        return bool(value)
    except (OSError, TypeError, ValueError, json.JSONDecodeError):
        return True


def _write_cache_manifest(job_id: str, manifest: Dict[str, Any]) -> str:
    job_directory = os.path.join(THUMB_CACHE_RECOVERY_DIR, job_id)
    os.makedirs(job_directory, exist_ok=True)
    manifest_path = os.path.join(job_directory, "manifest.json")
    temporary_path = ""
    try:
        file_descriptor, temporary_path = tempfile.mkstemp(
            prefix=".manifest-",
            suffix=".tmp",
            dir=job_directory,
        )
        with os.fdopen(file_descriptor, "w", encoding="utf-8") as handle:
            json.dump(manifest, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temporary_path, manifest_path)
        temporary_path = ""
    finally:
        if temporary_path:
            try:
                os.remove(temporary_path)
            except OSError:
                pass
    return manifest_path


def _is_direct_active_cache_path(path: str) -> bool:
    try:
        return os.path.normcase(os.path.abspath(os.path.dirname(path))) == os.path.normcase(os.path.abspath(THUMB_CACHE_DIR))
    except (OSError, TypeError):
        return False


def organize_thumbnail_cache(
    job_id: str,
    cancel_event: Any = None,
    progress_callback: Optional[Any] = None,
    interactive_wait_callback: Optional[Any] = None,
    limit_bytes: Optional[int] = None,
) -> Dict[str, Any]:
    """Move stale/LRU thumbnails to a manifest-backed recovery directory."""
    active_files = _active_thumbnail_files()
    cache_names = [item["cache_name"] for item in active_files]
    known_by_name = {
        row["cache_name"]: row
        for row in db.get_thumbnail_cache_entries(cache_names)
    }
    current_size = _configured_thumbnail_size()
    candidates: list[Dict[str, Any]] = []
    for item in active_files:
        row = known_by_name.get(item["cache_name"])
        width = int(row["width"]) if row else item["width"]
        height = int(row["height"]) if row else item["height"]
        reason = "lru"
        priority = 3
        if row:
            source_path = str(row["normalized_path"])
            try:
                source_stat = os.stat(source_path)
            except OSError:
                source_stat = None
            if source_stat is None:
                reason = "missing-source"
                priority = 0
            elif (
                int(row["source_file_size"]) != int(source_stat.st_size)
                or int(row["source_mtime_ns"]) != int(source_stat.st_mtime_ns)
            ):
                reason = "stale-source"
                priority = 1
        if priority > 1 and (width != current_size or height != current_size):
            reason = "old-size"
            priority = 2
        candidates.append({
            **item,
            "width": width,
            "height": height,
            "reason": reason,
            "priority": priority,
            "last_accessed_at": str(row["last_accessed_at"]) if row else "",
        })

    candidates.sort(key=lambda item: (
        int(item["priority"]),
        item["last_accessed_at"] or "",
        float(item["mtime"]),
    ))
    target_limit = _thumbnail_cache_limit_bytes() if limit_bytes is None else max(0, int(limit_bytes))
    remaining_bytes = sum(item["cache_bytes"] for item in active_files)
    selected_names: set[str] = set()
    for item in candidates:
        if item["priority"] < 3:
            selected_names.add(item["cache_name"])
            remaining_bytes -= item["cache_bytes"]
    if remaining_bytes > target_limit:
        for item in candidates:
            if item["priority"] < 3 or item["cache_name"] in selected_names:
                continue
            selected_names.add(item["cache_name"])
            remaining_bytes -= item["cache_bytes"]
            if remaining_bytes <= target_limit:
                break

    result: Dict[str, Any] = {
        "phase": "organizing_cache",
        "discovered": len(active_files),
        "total": len(candidates),
        "processed": 0,
        "cache_moved": 0,
        "errors": 0,
        "error_details": [],
        "cancelled": False,
        "active_bytes_before": sum(item["cache_bytes"] for item in active_files),
        "active_bytes_after": sum(item["cache_bytes"] for item in active_files),
    }
    manifest: Dict[str, Any] = {
        "version": 1,
        "job_id": job_id,
        "created_at": db._utc_timestamp(),
        "entries": [],
    }
    if progress_callback:
        progress_callback(dict(result, current_file=None))

    for index, item in enumerate(candidates):
        if cancel_event is not None and cancel_event.is_set():
            result["cancelled"] = True
            break
        if interactive_wait_callback:
            interactive_wait_callback(cancel_event)
            if cancel_event is not None and cancel_event.is_set():
                result["cancelled"] = True
                break

        if item["cache_name"] in selected_names:
            try:
                os.makedirs(THUMB_CACHE_RECOVERY_DIR, exist_ok=True)
                recovery_name = f"{index:06d}-{item['cache_name']}"
                recovery_directory = os.path.join(THUMB_CACHE_RECOVERY_DIR, job_id)
                os.makedirs(recovery_directory, exist_ok=True)
                recovery_path = os.path.join(recovery_directory, recovery_name)
                if not _is_direct_active_cache_path(item["path"]):
                    raise ValueError("thumbnail cache path is outside the active cache directory")
                shutil.move(item["path"], recovery_path)
                manifest["entries"].append({
                    "cache_name": item["cache_name"],
                    "original_path": os.path.abspath(item["path"]),
                    "recovery_name": recovery_name,
                    "moved_at": db._utc_timestamp(),
                    "reason": item["reason"],
                    "size": item["cache_bytes"],
                    "width": item["width"],
                    "height": item["height"],
                })
                result["cache_moved"] += 1
                result["active_bytes_after"] -= item["cache_bytes"]
                _write_cache_manifest(job_id, manifest)
            except Exception as error:
                result["errors"] += 1
                if len(result["error_details"]) < 20:
                    result["error_details"].append(f"{item['cache_name']}: {error}")

        result["processed"] += 1
        if progress_callback:
            progress_callback({
                "phase": "organizing_cache",
                "discovered": result["discovered"],
                "total": result["total"],
                "processed": result["processed"],
                "cache_moved": result["cache_moved"],
                "errors": result["errors"],
                "current_file": item["cache_name"],
            })
        if index % 25 == 0:
            time.sleep(0.002)

    return result


def restore_thumbnail_cache(job_id: str) -> Dict[str, Any]:
    """Restore one cache organization manifest without overwriting new files."""
    job_directory, manifest = _load_recovery_manifest(job_id)

    restored = 0
    conflicts = 0
    errors: list[str] = []
    for item in manifest["entries"]:
        if not isinstance(item, dict):
            continue
        original_path = os.path.abspath(str(item.get("original_path") or ""))
        recovery_name = os.path.basename(str(item.get("recovery_name") or ""))
        recovery_path = os.path.join(job_directory, recovery_name)
        if not _is_direct_active_cache_path(original_path):
            errors.append("manifest contains an invalid original cache path")
            continue
        if not os.path.isfile(recovery_path):
            continue
        if os.path.exists(original_path):
            conflicts += 1
            item["restore_status"] = "conflict"
            continue
        try:
            os.makedirs(os.path.dirname(original_path), exist_ok=True)
            shutil.move(recovery_path, original_path)
            restored += 1
            item["restore_status"] = "restored"
            item["restored_at"] = db._utc_timestamp()
        except Exception as error:
            errors.append(f"{recovery_name}: {error}")
            item["restore_status"] = "error"

    manifest["restored_at"] = db._utc_timestamp()
    manifest["restore_summary"] = {
        "restored": restored,
        "conflicts": conflicts,
        "errors": len(errors),
    }
    _write_cache_manifest(job_id, manifest)
    return {"restored": restored, "conflicts": conflicts, "errors": errors}


def _calculate_dominant_color(file_path: str) -> Optional[str]:
    """Calculate a stable #RRGGBB bucket from an image or existing thumbnail."""
    color_source = _existing_thumbnail_path(file_path) or file_path
    extension = os.path.splitext(file_path)[1].lower()
    if extension in {".mp4", ".mkv", ".webm", ".avi", ".mov"} and color_source == file_path:
        return None

    with Image.open(color_source) as source:
        if getattr(source, "is_animated", False):
            source.seek(0)
        image = source.convert("RGBA")
        image.thumbnail((64, 64), Image.Resampling.BILINEAR)
        flattened_data = getattr(image, "get_flattened_data", None)
        raw_pixels = flattened_data() if callable(flattened_data) else image.getdata()
        pixels = [pixel for pixel in raw_pixels if pixel[3] > 0]

    if not pixels:
        return None

    buckets = Counter(
        (
            min(248, (red // 16) * 16 + 8),
            min(248, (green // 16) * 16 + 8),
            min(248, (blue // 16) * 16 + 8),
        )
        for red, green, blue, _alpha in pixels
    )
    red, green, blue = buckets.most_common(1)[0][0]
    return f"#{red:02X}{green:02X}{blue:02X}"


def analyze_missing_dominant_colors(
    directory: str,
    cancel_event: Any = None,
    progress_callback: Optional[Any] = None,
    interactive_wait_callback: Optional[Any] = None,
) -> Dict[str, Any]:
    """Analyze indexed files whose current dominant-color metadata is missing."""
    rows = [
        row for row in db.get_media_metadata_for_directory(directory)
        if os.path.isfile(row["normalized_path"])
    ]
    existing_colors = db.get_dominant_colors([row["normalized_path"] for row in rows])
    result: Dict[str, Any] = {
        "phase": "analyzing_colors",
        "discovered": len(rows),
        "total": len(rows),
        "processed": 0,
        "colors_created": 0,
        "colors_reused": len(existing_colors),
        "errors": 0,
        "error_details": [],
        "cancelled": False,
    }

    if progress_callback:
        progress_callback(dict(result, current_file=None))

    for row in rows:
        if cancel_event is not None and cancel_event.is_set():
            result["cancelled"] = True
            break
        if interactive_wait_callback:
            interactive_wait_callback(cancel_event)
            if cancel_event is not None and cancel_event.is_set():
                result["cancelled"] = True
                break

        path = row["normalized_path"]
        try:
            if path not in existing_colors:
                dominant_color = _calculate_dominant_color(path)
                db.save_dominant_color(path, row["fingerprint"], dominant_color)
                result["colors_created"] += 1
        except Exception as error:
            result["errors"] += 1
            if len(result["error_details"]) < 20:
                result["error_details"].append(f"{path}: {error}")

        result["processed"] += 1
        if progress_callback:
            progress_callback({
                "phase": "analyzing_colors",
                "discovered": result["discovered"],
                "total": result["total"],
                "processed": result["processed"],
                "colors_created": result["colors_created"],
                "colors_reused": result["colors_reused"],
                "errors": result["errors"],
                "current_file": path,
            })

    return result


class LibraryJobAlreadyRunning(Exception):
    """Raised when a second library job is requested while one is active."""

    def __init__(self, job: Dict[str, Any]):
        self.job = job
        super().__init__(f"Library job {job.get('job_id')} is already running")


class LibraryJobManager:
    """Run one persistent media-library job at a time in a daemon thread."""

    PROGRESS_PERSIST_INTERVAL = 0.2
    SUPPORTED_JOB_TYPES = {
        "update-library",
        "analyze-missing-colors",
        "organize-thumbnail-cache",
    }

    def __init__(self, auto_start: bool = True):
        db.init_db_schema()
        db.recover_interrupted_library_jobs()
        self._queue: queue.Queue[Optional[str]] = queue.Queue()
        self._cancel_events: Dict[str, threading.Event] = {}
        self._last_progress_at: Dict[str, float] = {}
        self._last_progress_phase: Dict[str, Optional[str]] = {}
        self._lock = threading.RLock()
        self._stop_event = threading.Event()
        self._worker: Optional[threading.Thread] = None

        if auto_start:
            self._worker = threading.Thread(
                target=self._worker_loop,
                name="media-library-worker",
                daemon=True,
            )
            self._worker.start()

    def start(
        self,
        job_type: str,
        directory: str,
        analyze_colors: bool = False,
    ) -> Dict[str, Any]:
        if job_type not in self.SUPPORTED_JOB_TYPES:
            raise ValueError(f"Unsupported library job type: {job_type}")

        with self._lock:
            active_job = db.get_current_library_job()
            if active_job and active_job.get("status") in db.LIBRARY_JOB_ACTIVE_STATUSES:
                raise LibraryJobAlreadyRunning(active_job)

            job_id = str(uuid.uuid4())
            job = db.create_library_job(job_id, job_type, directory, analyze_colors)
            self._cancel_events[job_id] = threading.Event()
            self._last_progress_at[job_id] = 0.0
            self._last_progress_phase[job_id] = None
            self._queue.put(job_id)
            return job

    def current(self) -> Optional[Dict[str, Any]]:
        return db.get_current_library_job()

    def get(self, job_id: str) -> Optional[Dict[str, Any]]:
        return db.get_library_job(job_id)

    def cancel(self, job_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            job = db.get_library_job(job_id)
            if job is None or job.get("status") in db.LIBRARY_JOB_TERMINAL_STATUSES:
                return job

            event = self._cancel_events.get(job_id)
            if event is not None:
                event.set()
            return db.request_library_job_cancel(job_id)

    def close(self, timeout: float = 2.0) -> None:
        """Stop the worker for tests or controlled application shutdown."""
        self._stop_event.set()
        self._queue.put(None)
        if self._worker and self._worker.is_alive():
            self._worker.join(timeout=timeout)

    def _worker_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                job_id = self._queue.get(timeout=0.2)
            except queue.Empty:
                continue

            try:
                if job_id is not None:
                    self._run_job(job_id)
            finally:
                self._queue.task_done()

    def _run_job(self, job_id: str) -> None:
        with self._lock:
            cancel_event = self._cancel_events.get(job_id)
        if cancel_event is None:
            return

        job = db.get_library_job(job_id)
        if job is None:
            self._forget_job(job_id)
            return

        try:
            if cancel_event.is_set() or job.get("cancel_requested"):
                self._finish_cancelled(job_id, job)
                return

            db.update_library_job(
                job_id,
                status="running",
                phase=(
                    "discovering"
                    if job["job_type"] == "update-library"
                    else "organizing_cache"
                    if job["job_type"] == "organize-thumbnail-cache"
                    else "analyzing_colors"
                ),
                started_at=db._utc_timestamp(),
                error_message=None,
            )

            if job["job_type"] == "update-library":
                result = db.scan_and_index_directory(
                    job["directory"],
                    cancel_event=cancel_event,
                    progress_callback=self._progress_callback(job_id),
                    interactive_wait_callback=wait_for_interactive_quiet,
                )
                auto_cache = _automatic_cache_management_enabled()
                if result.get("cancelled") or result.get("error") or (
                    not job.get("analyze_colors") and not auto_cache
                ):
                    self._finish_scan(job_id, result)
                else:
                    color_result = None
                    if job.get("analyze_colors"):
                        color_result = self._run_color_analysis(
                            job_id,
                            job["directory"],
                            cancel_event,
                            finalize=False,
                        )
                    if (
                        not cancel_event.is_set()
                        and not (color_result or {}).get("cancelled")
                        and _automatic_cache_management_enabled()
                    ):
                        self._run_cache_organization(job_id, cancel_event, finalize=False)
                    self._finish_running_job(
                        job_id,
                        cancelled=cancel_event.is_set() or bool((color_result or {}).get("cancelled")),
                        scan_result=result,
                    )
            elif job["job_type"] == "analyze-missing-colors":
                self._run_color_analysis(job_id, job["directory"], cancel_event)
            else:
                self._run_cache_organization(job_id, cancel_event)
        except Exception as error:
            print(f"media library job {job_id} failed: {error}")
            traceback.print_exc()
            db.update_library_job(
                job_id,
                status="failed",
                phase="failed",
                error_message=str(error),
                finished_at=db._utc_timestamp(),
                current_file=None,
            )
        finally:
            self._forget_job(job_id)

    def _finish_scan(self, job_id: str, result: Dict[str, Any]) -> None:
        current_job = db.get_library_job(job_id) or {}
        cancelled = bool(result.get("cancelled"))
        status = "cancelled" if cancelled else "failed" if result.get("error") else "completed"
        phase = status

        total = result.get("total")
        if total is None:
            total = current_job.get("total")
        if total is None and not cancelled:
            total = result.get("scanned", 0)

        error_message = result.get("error")
        if status == "cancelled":
            error_message = None

        db.update_library_job(
            job_id,
            status=status,
            phase=phase,
            discovered=result.get("scanned", current_job.get("discovered", 0)),
            total=total,
            processed=result.get("processed", current_job.get("processed", 0)),
            added=result.get("added", current_job.get("added", 0)),
            updated=result.get("updated", current_job.get("updated", 0)),
            unchanged=result.get("unchanged", current_job.get("unchanged", 0)),
            conflicts=result.get("conflicts", current_job.get("conflicts", 0)),
            errors=result.get("errors", current_job.get("errors", 0)),
            colors_created=result.get("colors_created", current_job.get("colors_created", 0)),
            colors_reused=result.get("colors_reused", current_job.get("colors_reused", 0)),
            cache_moved=result.get("cache_moved", current_job.get("cache_moved", 0)),
            current_file=None,
            error_message=error_message,
            finished_at=db._utc_timestamp(),
        )

    def _run_color_analysis(
        self,
        job_id: str,
        directory: str,
        cancel_event: threading.Event,
        finalize: bool = True,
    ) -> Dict[str, Any]:
        db.update_library_job(
            job_id,
            status="running",
            phase="analyzing_colors",
            total=None,
            processed=0,
            current_file=None,
        )
        result = analyze_missing_dominant_colors(
            directory,
            cancel_event=cancel_event,
            progress_callback=self._progress_callback(job_id),
            interactive_wait_callback=wait_for_interactive_quiet,
        )
        current_job = db.get_library_job(job_id) or {}
        status = "cancelled" if result.get("cancelled") else "completed"
        db.update_library_job(
            job_id,
            **({"status": status, "phase": status, "finished_at": db._utc_timestamp()} if finalize else {
                "status": "running",
                "phase": "analyzing_colors",
            }),
            discovered=result.get("discovered", current_job.get("discovered", 0)),
            total=result.get("total", current_job.get("total")),
            processed=result.get("processed", current_job.get("processed", 0)),
            errors=current_job.get("errors", 0) + result.get("errors", 0),
            colors_created=result.get("colors_created", current_job.get("colors_created", 0)),
            colors_reused=result.get("colors_reused", current_job.get("colors_reused", 0)),
            current_file=None,
            error_message=None,
        )
        return result

    def _finish_cancelled(self, job_id: str, job: Dict[str, Any]) -> None:
        db.update_library_job(
            job_id,
            status="cancelled",
            phase="cancelled",
            finished_at=db._utc_timestamp(),
            current_file=None,
            error_message=None,
        )

    def _run_cache_organization(
        self,
        job_id: str,
        cancel_event: threading.Event,
        finalize: bool = True,
    ) -> Dict[str, Any]:
        db.update_library_job(
            job_id,
            status="running",
            phase="organizing_cache",
            total=None,
            processed=0,
            current_file=None,
        )
        result = organize_thumbnail_cache(
            job_id,
            cancel_event=cancel_event,
            progress_callback=self._progress_callback(job_id),
            interactive_wait_callback=wait_for_interactive_quiet,
        )
        current_job = db.get_library_job(job_id) or {}
        status = "cancelled" if result.get("cancelled") else "failed" if result.get("errors") and not result.get("cache_moved") else "completed"
        error_message = None
        if status == "failed":
            details = result.get("error_details") or []
            error_message = "；".join(str(detail) for detail in details[:3]) or "縮圖快取整理失敗"
        db.update_library_job(
            job_id,
            **({"status": status, "phase": status, "finished_at": db._utc_timestamp(), "error_message": error_message} if finalize else {
                "status": "running",
                "phase": "organizing_cache",
            }),
            discovered=result.get("discovered", current_job.get("discovered", 0)),
            total=result.get("total", current_job.get("total")),
            processed=result.get("processed", current_job.get("processed", 0)),
            errors=current_job.get("errors", 0) + result.get("errors", 0),
            cache_moved=current_job.get("cache_moved", 0) + result.get("cache_moved", 0),
            current_file=None,
        )
        return result

    def _finish_running_job(
        self,
        job_id: str,
        cancelled: bool = False,
        error_message: Optional[str] = None,
        scan_result: Optional[Dict[str, Any]] = None,
    ) -> None:
        status = "cancelled" if cancelled else "completed"
        current_job = db.get_library_job(job_id) or {}
        updates: Dict[str, Any] = {
            "status": status,
            "phase": status,
            "current_file": None,
            "error_message": None if cancelled else error_message,
            "finished_at": db._utc_timestamp(),
        }
        if scan_result is not None:
            updates.update({
                "discovered": scan_result.get("scanned", current_job.get("discovered", 0)),
                "total": scan_result.get("total", current_job.get("total")),
                "added": scan_result.get("added", current_job.get("added", 0)),
                "updated": scan_result.get("updated", current_job.get("updated", 0)),
                "unchanged": scan_result.get("unchanged", current_job.get("unchanged", 0)),
                "conflicts": scan_result.get("conflicts", current_job.get("conflicts", 0)),
            })
        db.update_library_job(
            job_id,
            **updates,
        )

    def _progress_callback(self, job_id: str):
        """Create a callback that can reuse an in-flight scan connection."""
        def callback(
            payload: Dict[str, Any],
            connection: Optional[Any] = None,
        ) -> None:
            self._persist_progress(job_id, payload, connection=connection)

        # ``db._emit_scan_progress`` uses this private callback capability only
        # for the indexing path; other job phases call the callback normally.
        callback.accepts_database_connection = True
        return callback

    def _persist_progress(
        self,
        job_id: str,
        payload: Dict[str, Any],
        connection: Optional[Any] = None,
    ) -> None:
        now = time.monotonic()
        phase = payload.get("phase")
        progress_phases = {"discovering", "indexing", "analyzing_colors", "organizing_cache"}
        with self._lock:
            last_persisted = self._last_progress_at.get(job_id, 0.0)
            previous_phase = self._last_progress_phase.get(job_id)
            force_persist = phase != previous_phase or (
                phase in progress_phases
                and now - last_persisted >= self.PROGRESS_PERSIST_INTERVAL
            )
            if not force_persist:
                return
            self._last_progress_at[job_id] = now
            self._last_progress_phase[job_id] = phase

        allowed_fields = {
            "phase", "discovered", "total", "processed", "added", "updated",
            "unchanged", "conflicts", "errors", "colors_created", "colors_reused",
            "cache_moved", "current_file",
        }
        progress = {key: value for key, value in payload.items() if key in allowed_fields}
        if progress:
            db.update_library_job(job_id, _connection=connection, **progress)

    def _forget_job(self, job_id: str) -> None:
        with self._lock:
            self._cancel_events.pop(job_id, None)
            self._last_progress_at.pop(job_id, None)
            self._last_progress_phase.pop(job_id, None)
