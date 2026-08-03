# -*- coding: utf-8 -*-
import os
import re
import sqlite3
import time
import uuid
from typing import List, Dict, Any, Optional, Tuple

import config_paths

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "db.sqlite"))
MEDIA_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4"}
MEDIA_SIGNATURES = {
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".gif": (b"GIF87a", b"GIF89a"),
    ".webp": (b"RIFF",),
}
# Internal working directories created by external archive/import tools are not
# part of the user's image collection. In particular, discord-fanbox-archiver
# stores temporary downloads and extraction staging under ``_state\partial``.
RECYCLE_DIRECTORY_NAME = ".pixivutil2-trash"
INTERNAL_DIRECTORY_NAMES = {"_state", RECYCLE_DIRECTORY_NAME}


def is_internal_directory_name(name: str) -> bool:
    return str(name).casefold() in INTERNAL_DIRECTORY_NAMES


def is_internal_media_path(file_path: Optional[str]) -> bool:
    """Whether a path belongs to an internal tool state directory."""
    if not file_path:
        return False

    normalized = os.path.normpath(os.path.abspath(file_path))
    return any(is_internal_directory_name(part) for part in normalized.split(os.sep))


def _prune_internal_directories(dirs: List[str]) -> None:
    dirs[:] = [directory for directory in dirs if not is_internal_directory_name(directory)]


def is_usable_media_file(file_path: Optional[str]) -> bool:
    """Reject empty/placeholder files before they enter the image index.

    This is intentionally a cheap header check rather than a full image decode.
    It catches the zero-filled PNGs left by interrupted archive extraction while
    keeping directory scans lightweight.
    """
    if not file_path or is_internal_media_path(file_path):
        return False

    abs_file = os.path.abspath(file_path)
    if not os.path.isfile(abs_file):
        return False

    extension = os.path.splitext(abs_file)[1].lower()
    if extension not in MEDIA_EXTENSIONS:
        return False

    try:
        with open(abs_file, "rb") as handle:
            header = handle.read(16)
    except OSError:
        return False

    if not header or not any(header):
        return False

    signatures = MEDIA_SIGNATURES.get(extension)
    if signatures:
        if extension == ".webp":
            return len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP"
        return any(header.startswith(signature) for signature in signatures)

    # MP4 variants are identified by a non-empty header here; the media
    # endpoint/browser performs the complete codec validation when opened.
    return True


def should_keep_database_media(file_path: Optional[str]) -> bool:
    """Keep normal and invalid DB paths visible for diagnostics."""
    return not is_internal_media_path(file_path)


def _get_media_status_uncached(file_path: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """Return a UI-friendly status for a media path without hiding the item."""
    if not file_path:
        return "missing", "找不到圖片檔案路徑"
    if is_internal_media_path(file_path):
        return "internal", "這是工具的暫存檔，不是正式圖片"

    abs_file = os.path.abspath(file_path)
    if not os.path.isfile(abs_file):
        return "missing", "圖片檔案不存在"
    if not is_usable_media_file(abs_file):
        return "invalid", "檔案內容不是有效的圖片，可能是未完成或損壞的檔案"
    return None, None


_MEDIA_STATUS_CACHE: Dict[str, Dict[str, Any]] = {}
MEDIA_STATUS_CACHE_TTL = 300.0


def get_media_status(file_path: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """Return a cached media status, refreshing it at most once per TTL."""
    cache_key = os.path.abspath(file_path) if file_path else "<missing-path>"
    cached = _MEDIA_STATUS_CACHE.get(cache_key)
    if cached and time.monotonic() - cached["timestamp"] < MEDIA_STATUS_CACHE_TTL:
        return cached["status"], cached["error"]

    status, error = _get_media_status_uncached(file_path)
    _MEDIA_STATUS_CACHE[cache_key] = {
        "timestamp": time.monotonic(),
        "status": status,
        "error": error,
    }
    return status, error


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


def init_db_schema():
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pixiv_master_member (
                member_id INTEGER PRIMARY KEY,
                name TEXT,
                save_folder TEXT,
                created_date DATE,
                last_update_date DATE
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pixiv_master_image (
                image_id INTEGER PRIMARY KEY,
                member_id INTEGER,
                title TEXT,
                save_name TEXT,
                created_date DATE,
                last_update_date DATE
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pixivutil2_trash_image (
                trash_id INTEGER PRIMARY KEY AUTOINCREMENT,
                image_id INTEGER NOT NULL,
                original_path TEXT NOT NULL DEFAULT '',
                trash_path TEXT,
                trashed_at TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_pixivutil2_trash_image_id
            ON pixivutil2_trash_image (image_id)
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS pixivutil2_archived_member (
                member_id INTEGER PRIMARY KEY,
                archived_at TEXT NOT NULL,
                reason TEXT NOT NULL DEFAULT ''
            )
        """)
        conn.commit()


def scan_and_index_directory(target_dir: str) -> Dict[str, Any]:
    init_db_schema()
    abs_dir = os.path.abspath(target_dir)
    if not os.path.exists(abs_dir):
        return {"scanned": 0, "indexed": 0, "error": f"Directory does not exist: {abs_dir}"}

    import re, time
    scanned_count = 0
    indexed_count = 0

    with get_db_connection() as conn:
        cursor = conn.cursor()
        # Fetch existing save_names to avoid duplicate indexing
        existing_rows = cursor.execute("SELECT save_name, image_id FROM pixiv_master_image").fetchall()
        existing_paths = {r["save_name"]: r["image_id"] for r in existing_rows if r["save_name"]}

        # Auto-increment generator for unindexed images
        max_id_row = cursor.execute("SELECT MAX(image_id) as max_id FROM pixiv_master_image").fetchone()
        next_custom_id = (max_id_row["max_id"] or 1000000) + 1

        for root, dirs, files in os.walk(abs_dir):
            _prune_internal_directories(dirs)
            dirs.sort(key=natural_sort_key)
            files.sort(key=natural_sort_key)
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                full_path = os.path.join(root, file)
                if ext not in MEDIA_EXTENSIONS or is_internal_media_path(full_path):
                    continue
                scanned_count += 1

                if full_path in existing_paths or file in existing_paths:
                    continue

                # Try to parse Pixiv image_id from filename (e.g. 12345678_p0.jpg or 12345678.png)
                match = re.search(r"(\d{5,12})", file)
                if match:
                    image_id = int(match.group(1))
                else:
                    image_id = next_custom_id
                    next_custom_id += 1

                # Only parse member_id if root is a subfolder, NOT the rootDirectory itself
                member_id = None
                if root != abs_dir:
                    folder_name = os.path.basename(root)
                    member_match = re.search(r"(\d{4,10})", folder_name)
                    if member_match:
                        member_id = int(member_match.group(1))
                    else:
                        # Stable ID hash for non-numeric folder names
                        member_id = abs(hash(folder_name)) % 100000000

                mtime = os.path.getmtime(full_path)
                created_date = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(mtime))
                title = os.path.splitext(file)[0]

                try:
                    cursor.execute("""
                        INSERT OR REPLACE INTO pixiv_master_image 
                        (image_id, member_id, title, save_name, created_date, last_update_date)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (image_id, member_id, title, full_path, created_date, created_date))

                    if member_id and root != abs_dir:
                        cursor.execute("""
                            INSERT OR REPLACE INTO pixiv_master_member
                            (member_id, name, created_date)
                            VALUES (?, ?, ?)
                        """, (member_id, folder_name, created_date))

                    indexed_count += 1
                except Exception as ex:
                    print(f"Error indexing {file}: {ex}")

        conn.commit()

    # A rescan may add/remove files, so the next gallery request must rebuild
    # the cached path list for this directory tree.
    invalidate_scan_cache(abs_dir)
    return {"scanned": scanned_count, "indexed": indexed_count, "directory": abs_dir}


def clean_orphaned_records() -> Dict[str, int]:
    """Archive orphaned member records without deleting database rows."""
    if not os.path.exists(DB_PATH):
        return {"archived_members": 0}

    init_db_schema()
    with get_db_connection() as conn:
        cursor = conn.cursor()

        orphan_rows = cursor.execute("""
            SELECT member_id, '沒有對應圖片' AS reason
            FROM pixiv_master_member
            WHERE member_id NOT IN (
                SELECT DISTINCT member_id
                FROM pixiv_master_image
                WHERE member_id IS NOT NULL
            )
            UNION
            SELECT member_id, '疑似由檔名建立' AS reason
            FROM pixiv_master_member
            WHERE name LIKE '%_p%' OR name LIKE '%.jpg'
               OR name LIKE '%.png' OR name LIKE '%.jpeg'
        """).fetchall()

        archived_at = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())
        archived_members = 0
        for row in orphan_rows:
            cursor.execute(
                """
                    INSERT OR IGNORE INTO pixivutil2_archived_member
                    (member_id, archived_at, reason)
                    VALUES (?, ?, ?)
                """,
                (int(row["member_id"]), archived_at, row["reason"]),
            )
            archived_members += cursor.rowcount

        conn.commit()
    return {"archived_members": archived_members}


# Directory scans are shared by all image/filter requests in the backend
# process. Filtering should operate on this cached path list instead of
# reopening and inspecting every media file on each request.
_SCAN_CACHE: Dict[Tuple[str, str], Dict[str, Any]] = {}
CACHE_TTL = 300.0


def invalidate_scan_cache(folder_path: Optional[str] = None) -> None:
    """Invalidate cached recursive/direct scans for a folder tree."""
    if folder_path is None:
        _SCAN_CACHE.clear()
        _MEDIA_STATUS_CACHE.clear()
        return

    target = os.path.normcase(os.path.abspath(folder_path))
    for cache_key in list(_SCAN_CACHE):
        _, cached_folder = cache_key
        normalized_folder = os.path.normcase(cached_folder)
        if normalized_folder == target or normalized_folder.startswith(target + os.sep):
            _SCAN_CACHE.pop(cache_key, None)
    for media_path in list(_MEDIA_STATUS_CACHE):
        normalized_media_path = os.path.normcase(media_path)
        if normalized_media_path == target or normalized_media_path.startswith(target + os.sep):
            _MEDIA_STATUS_CACHE.pop(media_path, None)


def _get_cached_file_scan(folder_path: str, recursive: bool) -> Dict[str, Any]:
    """Return cached file paths and metadata for a folder."""
    now = time.monotonic()
    abs_folder = os.path.abspath(folder_path)
    cache_key = ("recursive" if recursive else "direct", abs_folder)
    if cache_key in _SCAN_CACHE:
        cached = _SCAN_CACHE[cache_key]
        if now - cached["timestamp"] < CACHE_TTL:
            return cached

    records = []
    if os.path.exists(abs_folder):
        try:
            if recursive:
                file_entries = []
                for root, dirs, files in os.walk(abs_folder):
                    _prune_internal_directories(dirs)
                    dirs.sort(key=natural_sort_key)
                    files.sort(key=natural_sort_key)
                    file_entries.extend(os.path.join(root, file) for file in files)
            else:
                file_entries = [
                    entry.path
                    for entry in os.scandir(abs_folder)
                    if entry.is_file()
                ]

            for file_path in file_entries:
                full_path = os.path.abspath(file_path)
                ext = os.path.splitext(full_path)[1].lower()
                if ext not in MEDIA_EXTENSIONS or is_internal_media_path(full_path):
                    continue
                try:
                    mtime = os.stat(full_path).st_mtime
                except OSError:
                    continue
                records.append({
                    "path": full_path,
                    "file_name": os.path.basename(full_path),
                    "created_date": time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(mtime)),
                    "image_id": abs(hash(full_path)) % 1000000000,
                })
        except Exception as ex:
            print(f"Error scanning folder {abs_folder}: {ex}")

    records.sort(key=lambda record: natural_sort_key(record["path"]))
    records_by_month: Dict[str, List[Dict[str, Any]]] = {}
    records_by_year: Dict[str, List[Dict[str, Any]]] = {}
    for order, record in enumerate(records):
        record["order"] = order
        month_key = record["created_date"][:7]
        year_key = record["created_date"][:4]
        records_by_month.setdefault(month_key, []).append(record)
        records_by_year.setdefault(year_key, []).append(record)

    cached = {
        "timestamp": now,
        "records": records,
        "files": [record["path"] for record in records],
        "records_by_month": records_by_month,
        "records_by_year": records_by_year,
    }
    _SCAN_CACHE[cache_key] = cached
    return cached


def get_folder_files_fast(folder_path: str) -> List[str]:
    return _get_cached_file_scan(folder_path, recursive=True)["files"]


def get_folder_file_records_fast(
    folder_path: str,
    direct: bool = False,
    month_list: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    cached = _get_cached_file_scan(folder_path, recursive=not direct)
    if not month_list:
        return cached["records"]

    matched: Dict[str, Dict[str, Any]] = {}
    for selected in month_list:
        records = (
            cached["records_by_year"].get(selected, [])
            if len(selected) == 4
            else cached["records_by_month"].get(selected, [])
        )
        for record in records:
            matched[record["path"]] = record

    return sorted(matched.values(), key=lambda record: record["order"])


def get_direct_folder_files_fast(folder_path: str) -> List[str]:
    """Return media files directly inside a folder, without descending into subfolders."""
    return _get_cached_file_scan(folder_path, recursive=False)["files"]


def is_direct_media_file(file_path: Optional[str], folder_path: str) -> bool:
    """Whether an existing media file is a direct child of folder_path."""
    if not file_path:
        return False

    abs_file = os.path.abspath(file_path)
    abs_folder = os.path.abspath(folder_path)
    return (
        not is_internal_media_path(abs_file)
        and os.path.isfile(abs_file)
        and os.path.splitext(abs_file)[1].lower() in MEDIA_EXTENSIONS
        and os.path.normcase(os.path.dirname(abs_file)) == os.path.normcase(abs_folder)
    )


def get_configured_root_directory() -> str:
    import configparser

    root_dir = config_paths.WORKSPACE_ROOT
    config_path = config_paths.get_pixiv_config_path()
    if os.path.exists(config_path):
        try:
            config = configparser.ConfigParser(interpolation=None)
            config.read(config_path, encoding="utf-8")
            cfg_dir = config.get("Settings", "rootDirectory", fallback=".")
            if cfg_dir and cfg_dir != ".":
                root_dir = os.path.abspath(cfg_dir)
        except Exception:
            pass
    return root_dir


def _is_path_within(path: str, directory: str) -> bool:
    try:
        normalized_path = os.path.normcase(os.path.abspath(path))
        normalized_directory = os.path.normcase(os.path.abspath(directory))
        return os.path.commonpath([normalized_path, normalized_directory]) == normalized_directory
    except ValueError:
        # Different Windows drives do not have a common path.
        return False


def get_trash_directory_for_path(file_path: str) -> str:
    """Return a recoverable trash directory on the source file's volume."""
    absolute_path = os.path.abspath(file_path)
    root_directory = get_configured_root_directory()
    if _is_path_within(absolute_path, root_directory):
        return os.path.join(root_directory, RECYCLE_DIRECTORY_NAME)
    return os.path.join(os.path.dirname(absolute_path), RECYCLE_DIRECTORY_NAME)


def get_trash_destination(file_path: str, image_id: int) -> str:
    """Build a unique destination path without touching the source file."""
    extension = os.path.splitext(file_path)[1].lower()
    filename = f"{image_id}-{uuid.uuid4().hex}{extension}"
    return os.path.join(get_trash_directory_for_path(file_path), filename)


def get_all_artists() -> List[Dict[str, Any]]:
    import configparser
    config_path = config_paths.get_pixiv_config_path()
    root_dir = config_paths.WORKSPACE_ROOT
    if os.path.exists(config_path):
        try:
            config = configparser.ConfigParser(interpolation=None)
            config.read(config_path, encoding="utf-8")
            cfg_dir = config.get("Settings", "rootDirectory", fallback=".")
            if cfg_dir and cfg_dir != ".":
                root_dir = os.path.abspath(cfg_dir)
        except Exception:
            pass

    if not os.path.exists(root_dir):
        return []

    disk_folders = []
    try:
        disk_folders = [
            f for f in os.listdir(root_dir)
            if os.path.isdir(os.path.join(root_dir, f))
            and not f.startswith(".")
            and not is_internal_directory_name(f)
        ]
        disk_folders.sort()
    except Exception as ex:
        print(f"Error listing root directory folders: {ex}")

    result = []
    with get_db_connection() as conn:
        cursor = conn.cursor()

        for folder_name in disk_folders:
            folder_path = os.path.join(root_dir, folder_name)

            member_row = cursor.execute(
                "SELECT member_id FROM pixiv_master_member WHERE name = ? OR name LIKE ? OR save_folder LIKE ?",
                (folder_name, f"%{folder_name}%", f"%{folder_name}%")
            ).fetchone()

            member_id = member_row["member_id"] if member_row else (abs(hash(folder_name)) % 100000000)

            # Accurately count all media files inside folder_path
            artwork_count = len(get_folder_files_fast(folder_path))

            result.append({
                "member_id": member_id,
                "name": folder_name,
                "folder_name": folder_name,
                "artwork_count": artwork_count,
            })

        # The uncategorized bucket represents files directly in rootDirectory.
        direct_root_files = get_direct_folder_files_fast(root_dir)
        if direct_root_files:
            result.insert(0, {
                "member_id": -1,
                "name": "未分類/單張根目錄圖片",
                "artwork_count": len(direct_root_files)
            })

    return result


def get_all_months() -> List[Dict[str, Any]]:
    if not os.path.exists(DB_PATH):
        return []
    init_db_schema()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        query = """
            SELECT strftime('%Y-%m', created_date) as month, COUNT(*) as count
            FROM pixiv_master_image
            WHERE created_date IS NOT NULL AND created_date != ''
              AND NOT EXISTS (
                  SELECT 1 FROM pixivutil2_trash_image trash
                  WHERE trash.image_id = pixiv_master_image.image_id
              )
            GROUP BY month
            ORDER BY month DESC
        """
        rows = cursor.execute(query).fetchall()
        return [dict(r) for r in rows if r["month"]]


import re

def normalize_date_str(date_val: str) -> str:
    if not date_val:
        return ""
    date_str = str(date_val).strip()
    if not date_str:
        return ""

    match_hyphen = re.match(r'^(\d{4})[\-/](\d{1,2})[\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?', date_str)
    if match_hyphen:
        y, m, d = match_hyphen.group(1), match_hyphen.group(2).zfill(2), match_hyphen.group(3).zfill(2)
        hh = match_hyphen.group(4).zfill(2) if match_hyphen.group(4) else "00"
        mm = match_hyphen.group(5).zfill(2) if match_hyphen.group(5) else "00"
        ss = match_hyphen.group(6).zfill(2) if match_hyphen.group(6) else "00"
        return f"{y}-{m}-{d} {hh}:{mm}:{ss}"

    match_ym = re.match(r'^(\d{4})[\-/](\d{1,2})$', date_str)
    if match_ym:
        return f"{match_ym.group(1)}-{match_ym.group(2).zfill(2)}-01 00:00:00"

    match_8 = re.match(r'^(\d{4})(\d{2})(\d{2})$', date_str)
    if match_8:
        return f"{match_8.group(1)}-{match_8.group(2)}-{match_8.group(3)} 00:00:00"

    match_6 = re.match(r'^(\d{4})(\d{2})$', date_str)
    if match_6:
        return f"{match_6.group(1)}-{match_6.group(2)}-01 00:00:00"

    return date_str


def natural_sort_key(s: str):
    if not s:
        return []
    path_str = os.path.normpath(s).lower()
    return [int(text) if text.isdigit() else text for text in re.split(r'(\d+)', path_str)]


def matches_month_filter(date_val: Optional[str], month_list: List[str]) -> bool:
    """Return whether a date belongs to one of the selected month/year keys."""
    if not month_list:
        return True

    normalized_date = normalize_date_str(date_val or "")
    date_match = re.match(r'^(\d{4})-(\d{2})', normalized_date)
    if not date_match:
        return False

    year_key = date_match.group(1)
    month_key = f"{year_key}-{date_match.group(2)}"
    return any(
        selected == year_key or selected == month_key
        for selected in month_list
    )


def get_images(
    month: Optional[str] = None,
    artist_id: Optional[int] = None,
    search: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
    only_show_db_files: bool = False,
    sort_mode: str = "newest"
) -> Tuple[List[Dict[str, Any]], int, List[Dict[str, Any]]]:
    db_items = []
    month_list = [m.strip() for m in month.split(',') if m.strip()] if month else []
    if os.path.exists(DB_PATH):
        init_db_schema()
        with get_db_connection() as conn:
            cursor = conn.cursor()
            conditions = []
            params = []

            conditions.append(
                "NOT EXISTS ("
                "SELECT 1 FROM pixivutil2_trash_image trash "
                "WHERE trash.image_id = i.image_id"
                ")"
            )

            if month_list:
                month_conds = []
                for m in month_list:
                    if len(m) == 4:
                        month_conds.append("strftime('%Y', i.created_date) = ?")
                    else:
                        month_conds.append("strftime('%Y-%m', i.created_date) = ?")
                    params.append(m)
                conditions.append("(" + " OR ".join(month_conds) + ")")
            if artist_id is not None:
                if artist_id == -1:
                    conditions.append("i.member_id IS NULL")
                else:
                    conditions.append("i.member_id = ?")
                    params.append(artist_id)
            if search:
                conditions.append("(i.title LIKE ? OR m.name LIKE ? OR i.save_name LIKE ? OR CAST(i.image_id AS TEXT) LIKE ?)")
                params.extend([f"%{search}%", f"%{search}%", f"%{search}%", f"%{search}%"])

            where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""
            query = f"""
                SELECT 
                    i.image_id, 
                    i.member_id, 
                    i.title, 
                    i.save_name, 
                    i.created_date, 
                    i.last_update_date,
                    m.name as artist_name
                FROM pixiv_master_image i
                LEFT JOIN pixiv_master_member m ON i.member_id = m.member_id
                {where_clause}
            """
            rows = cursor.execute(query, params).fetchall()
            db_items = [dict(r) for r in rows]

            # Also include multi-page manga entries from DB
            manga_conditions = []
            manga_params = []
            manga_conditions.append(
                "NOT EXISTS ("
                "SELECT 1 FROM pixivutil2_trash_image trash "
                "WHERE trash.image_id = mg.image_id"
                ")"
            )
            if month_list:
                month_conds = []
                for m in month_list:
                    if len(m) == 4:
                        month_conds.append("strftime('%Y', mg.created_date) = ?")
                    else:
                        month_conds.append("strftime('%Y-%m', mg.created_date) = ?")
                    manga_params.append(m)
                manga_conditions.append("(" + " OR ".join(month_conds) + ")")
            if artist_id is not None:
                if artist_id == -1:
                    manga_conditions.append("i.member_id IS NULL")
                else:
                    manga_conditions.append("i.member_id = ?")
                    manga_params.append(artist_id)
            if search:
                manga_conditions.append("(i.title LIKE ? OR m.name LIKE ? OR mg.save_name LIKE ? OR CAST(mg.image_id AS TEXT) LIKE ?)")
                manga_params.extend([f"%{search}%", f"%{search}%", f"%{search}%", f"%{search}%"])

            manga_where = " WHERE " + " AND ".join(manga_conditions) if manga_conditions else ""
            manga_query = f"""
                SELECT
                    mg.image_id,
                    i.member_id,
                    i.title,
                    mg.save_name,
                    mg.created_date,
                    mg.last_update_date,
                    m.name as artist_name
                FROM pixiv_manga_image mg
                LEFT JOIN pixiv_master_image i ON mg.image_id = i.image_id
                LEFT JOIN pixiv_master_member m ON i.member_id = m.member_id
                {manga_where}
            """
            manga_rows = cursor.execute(manga_query, manga_params).fetchall()
            db_items.extend([dict(r) for r in manga_rows])

    # Do not surface stale database rows that point into an external tool's
    # temporary state tree. The files are intentionally ignored by the disk
    # scanner above, so keeping them here would reintroduce them from SQLite.
    db_items = [item for item in db_items if should_keep_database_media(item.get("save_name"))]

    if only_show_db_files:
        if artist_id == -1:
            root_dir = get_configured_root_directory()
            db_items = [
                item for item in db_items
                if is_direct_media_file(item.get("save_name"), root_dir)
            ]
        all_items = list(db_items)
    else:
        import configparser, time
        config_path = config_paths.get_pixiv_config_path()
        root_dir = config_paths.WORKSPACE_ROOT
        if os.path.exists(config_path):
            try:
                config = configparser.ConfigParser(interpolation=None)
                config.read(config_path, encoding="utf-8")
                cfg_dir = config.get("Settings", "rootDirectory", fallback=".")
                if cfg_dir and cfg_dir != ".":
                    root_dir = os.path.abspath(cfg_dir)
            except Exception:
                pass

        # A root-level item is determined by its physical path, not by stale
        # NULL member_id records that may have been created during a subfolder scan.
        if artist_id == -1:
            db_items = [
                item for item in db_items
                if is_direct_media_file(item.get("save_name"), root_dir)
            ]

        target_scan_dir = root_dir
        if artist_id is not None and artist_id != -1:
            target_scan_dir = None
            if os.path.exists(DB_PATH):
                with get_db_connection() as conn:
                    m_row = conn.execute("SELECT name FROM pixiv_master_member WHERE member_id = ?", (artist_id,)).fetchone()
                    if m_row and m_row["name"]:
                        cand = os.path.join(root_dir, m_row["name"])
                        if os.path.isdir(cand):
                            target_scan_dir = cand
            if not target_scan_dir and os.path.exists(root_dir):
                for f in os.listdir(root_dir):
                    if os.path.isdir(os.path.join(root_dir, f)) and (abs(hash(f)) % 100000000) == artist_id:
                        target_scan_dir = os.path.join(root_dir, f)
                        break

        existing_paths = {}
        all_items = []
        for item in db_items:
            if item.get("save_name"):
                abs_p = os.path.abspath(item["save_name"])
                if abs_p not in existing_paths:
                    existing_paths[abs_p] = item
                    all_items.append(item)

        if target_scan_dir and os.path.exists(target_scan_dir):
            file_records = get_folder_file_records_fast(
                target_scan_dir,
                direct=artist_id == -1,
                month_list=month_list,
            )
            for record in file_records:
                full_path = record["path"]
                if full_path not in existing_paths:
                    file = record["file_name"]
                    created_date = record["created_date"]
                    item_id = record["image_id"]

                    rel_p = os.path.relpath(full_path, root_dir)
                    parts = os.path.normpath(rel_p).split(os.sep)
                    art_name = parts[0] if len(parts) > 1 else os.path.basename(target_scan_dir)

                    new_item = {
                        "image_id": item_id,
                        "member_id": artist_id,
                        "title": os.path.splitext(file)[0],
                        "save_name": full_path,
                        "created_date": created_date,
                        "last_update_date": created_date,
                        "artist_name": art_name
                    }
                    all_items.append(new_item)
                    existing_paths[full_path] = new_item

    if search:
        s_lower = search.lower()
        all_items = [
            it for it in all_items
            if s_lower in (it.get("title") or "").lower()
            or s_lower in (it.get("artist_name") or "").lower()
            or s_lower in (it.get("save_name") or "").lower()
            or s_lower in str(it.get("image_id") or "")
        ]

    # Normalize created_date format for all items
    for item in all_items:
        if item.get("created_date"):
            item["created_date"] = normalize_date_str(item["created_date"])

    # Disk-backed files that are not indexed in SQLite are added above after
    # the database query. Apply the same month/year filter to the combined
    # result so selecting one or more months never leaks unindexed files from
    # other months into the gallery.
    if month_list:
        all_items = [
            item for item in all_items
            if matches_month_filter(item.get("created_date"), month_list)
        ]

    # Sort Items based on sort_mode
    if sort_mode == "oldest":
        all_items.sort(key=lambda x: (x.get("created_date") or "", natural_sort_key(x.get("save_name") or "")))
    elif sort_mode == "natural_name":
        all_items.sort(key=lambda x: natural_sort_key(x.get("save_name") or ""))
    elif sort_mode == "newest_month_oldest_works":
        # Newest month section first, but within month works are ordered oldest to newest
        month_groups = {}
        for item in all_items:
            ym = (item.get("created_date") or "")[:7] or "未指定"
            month_groups.setdefault(ym, []).append(item)
        sorted_months = sorted(month_groups.keys(), reverse=True)
        final_items = []
        for ym in sorted_months:
            group = month_groups[ym]
            group.sort(key=lambda x: (x.get("created_date") or "", natural_sort_key(x.get("save_name") or "")))
            final_items.extend(group)
        all_items = final_items
    elif sort_mode == "oldest_month":
        # Month sections ascending (oldest month first), within month posts newest first, pages 1->N
        month_groups = {}
        for item in all_items:
            ym = (item.get("created_date") or "")[:7] or "未指定"
            month_groups.setdefault(ym, []).append(item)
        sorted_months = sorted(month_groups.keys(), reverse=False)
        final_items = []
        for ym in sorted_months:
            group = month_groups[ym]
            d_groups = {}
            for it in group:
                dt = (it.get("created_date") or "")[:10]
                d_groups.setdefault(dt, []).append(it)
            for dt in sorted(d_groups.keys(), reverse=True):
                sub_group = d_groups[dt]
                sub_group.sort(key=lambda x: natural_sort_key(x.get("save_name") or ""))
                final_items.extend(sub_group)
        all_items = final_items
    else: # newest or newest_month
        # Month sections descending (newest month first), within month posts newest first, pages 1->N
        month_groups = {}
        for item in all_items:
            ym = (item.get("created_date") or "")[:7] or "未指定"
            month_groups.setdefault(ym, []).append(item)
        sorted_months = sorted(month_groups.keys(), reverse=True)
        final_items = []
        for ym in sorted_months:
            group = month_groups[ym]
            d_groups = {}
            for it in group:
                dt = (it.get("created_date") or "")[:10]
                d_groups.setdefault(dt, []).append(it)
            for dt in sorted(d_groups.keys(), reverse=True):
                sub_group = d_groups[dt]
                sub_group.sort(key=lambda x: natural_sort_key(x.get("save_name") or ""))
                final_items.extend(sub_group)
        all_items = final_items

    available_month_counts: Dict[str, int] = {}
    available_month_offsets: Dict[str, int] = {}
    for item_offset, item in enumerate(all_items):
        month_key = (item.get("created_date") or "")[:7]
        if len(month_key) == 7 and month_key[4] == "-":
            available_month_counts[month_key] = available_month_counts.get(month_key, 0) + 1
            available_month_offsets.setdefault(month_key, item_offset)

    available_months = [
        {
            "month": month_key,
            "count": count,
            "offset": available_month_offsets[month_key],
        }
        for month_key, count in sorted(available_month_counts.items(), reverse=True)
        if count > 0
    ]

    # Media validation is only needed for cards returned to the browser. The
    # month index and total count above use metadata only, so checking every
    # matching file here makes a page jump pay the cost of the whole library.
    # Keep the checks page-scoped so the first paint can start as soon as the
    # requested page has been sorted and sliced.
    page_items = all_items[offset:offset+limit]
    for item in page_items:
        media_status, media_error = get_media_status(item.get("save_name"))
        if media_status:
            item["media_status"] = media_status
            item["media_error"] = media_error

    return page_items, len(all_items), available_months


def get_image_paths_by_ids(image_ids: List[int]) -> List[Tuple[int, str]]:
    """Return database media paths for the requested image IDs."""
    unique_ids = list(dict.fromkeys(image_ids))
    if not os.path.exists(DB_PATH) or not unique_ids:
        return []
    init_db_schema()

    records: List[Tuple[int, str]] = []
    with get_db_connection() as conn:
        # Keep each IN clause below SQLite's variable limit so selecting a
        # large page remains downloadable on older SQLite builds as well.
        for offset in range(0, len(unique_ids), 500):
            id_chunk = unique_ids[offset:offset + 500]
            placeholders = ",".join(["?"] * len(id_chunk))
            rows = conn.execute(
                f"""
                    SELECT image_id, save_name
                    FROM pixiv_master_image
                    WHERE image_id IN ({placeholders})
                      AND NOT EXISTS (
                          SELECT 1 FROM pixivutil2_trash_image trash
                          WHERE trash.image_id = pixiv_master_image.image_id
                      )
                """,
                id_chunk,
            ).fetchall()
            records.extend((int(row["image_id"]), row["save_name"]) for row in rows if row["save_name"])

            try:
                manga_rows = conn.execute(
                    f"""
                        SELECT image_id, save_name
                        FROM pixiv_manga_image
                        WHERE image_id IN ({placeholders})
                          AND NOT EXISTS (
                              SELECT 1 FROM pixivutil2_trash_image trash
                              WHERE trash.image_id = pixiv_manga_image.image_id
                          )
                    """,
                    id_chunk,
                ).fetchall()
            except sqlite3.OperationalError:
                manga_rows = []
            records.extend((int(row["image_id"]), row["save_name"]) for row in manga_rows if row["save_name"])

    return records


def _path_key(file_path: Optional[str]) -> str:
    if not file_path:
        return ""
    return os.path.normcase(os.path.normpath(str(file_path)))


def mark_images_as_trashed(
    image_ids: List[int],
    moved_records: List[Tuple[int, str, str, str]],
) -> int:
    """Record a reversible trash operation without deleting DB rows."""
    unique_ids = list(dict.fromkeys(int(image_id) for image_id in image_ids))
    if not os.path.exists(DB_PATH) or not unique_ids:
        return 0

    init_db_schema()
    moved_by_record = {
        (int(image_id), _path_key(database_path)): (original_path, trash_path)
        for image_id, database_path, original_path, trash_path in moved_records
    }

    with get_db_connection() as conn:
        cursor = conn.cursor()
        placeholders = ",".join(["?"] * len(unique_ids))
        master_rows = cursor.execute(
            f"""
                SELECT image_id, save_name
                FROM pixiv_master_image
                WHERE image_id IN ({placeholders})
            """,
            unique_ids,
        ).fetchall()
        manga_rows = []
        try:
            manga_rows = cursor.execute(
                f"""
                    SELECT image_id, save_name
                    FROM pixiv_manga_image
                    WHERE image_id IN ({placeholders})
                """,
                unique_ids,
            ).fetchall()
        except sqlite3.OperationalError:
            pass

        existing_ids = {
            int(row["image_id"])
            for row in [*master_rows, *manga_rows]
        }
        already_trashed = {
            int(row["image_id"])
            for row in cursor.execute(
                f"""
                    SELECT DISTINCT image_id
                    FROM pixivutil2_trash_image
                    WHERE image_id IN ({placeholders})
                """,
                unique_ids,
            ).fetchall()
        }
        ids_to_mark = existing_ids - already_trashed
        if not ids_to_mark:
            return 0

        paths_by_id: Dict[int, List[str]] = {}
        for row in [*master_rows, *manga_rows]:
            image_id = int(row["image_id"])
            if image_id not in ids_to_mark:
                continue
            path = row["save_name"] or ""
            if path and path not in paths_by_id.setdefault(image_id, []):
                paths_by_id[image_id].append(path)

        trashed_at = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())
        for image_id in sorted(ids_to_mark):
            paths = paths_by_id.get(image_id) or [""]
            for database_path in paths:
                moved = moved_by_record.get((image_id, _path_key(database_path)))
                original_path = moved[0] if moved else database_path
                trash_path = moved[1] if moved else None
                cursor.execute(
                    """
                        INSERT INTO pixivutil2_trash_image
                        (image_id, original_path, trash_path, trashed_at)
                        VALUES (?, ?, ?, ?)
                    """,
                    (image_id, original_path, trash_path, trashed_at),
                )
        conn.commit()
    return len(ids_to_mark)
