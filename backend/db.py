# -*- coding: utf-8 -*-
import os
import re
import sqlite3
import time
import uuid
import hashlib
import threading
import json
from pathlib import Path
from urllib.parse import quote
from typing import Callable, List, Dict, Any, Optional, Tuple

import config_paths

# ``PIXIV_DB_PATH`` is strictly read-only.  ``DB_PATH`` is retained as a
# compatibility alias for tests and existing Viewer callers, but now points to
# the Web Viewer-owned database instead of PixivUtil2's database.
PIXIV_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "db.sqlite"))
VIEWER_DB_PATH = config_paths.VIEWER_DB_PATH
DB_PATH = VIEWER_DB_PATH
MEDIA_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4"}
MEDIA_SIGNATURES = {
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".png": (b"\x89PNG\r\n\x1a\n",),
    ".gif": (b"GIF87a", b"GIF89a"),
    ".webp": (b"RIFF",),
}
SYNTHETIC_MEMBER_ID_BASE = 900_000_000
SYNTHETIC_MEMBER_ID_RANGE = 100_000_000
SYNTHETIC_IMAGE_ID_BASE = 1_000_000_000
SYNTHETIC_IMAGE_ID_RANGE = 8_000_000_000
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
    if os.path.normcase(os.path.abspath(DB_PATH)) == os.path.normcase(os.path.abspath(PIXIV_DB_PATH)):
        raise RuntimeError("Refusing to write Web Viewer data into PixivUtil2's database")
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    return conn


def get_pixiv_db_connection() -> Optional[sqlite3.Connection]:
    """Open PixivUtil2's database in SQLite read-only mode only."""
    if not os.path.isfile(PIXIV_DB_PATH):
        return None

    uri_path = os.path.abspath(PIXIV_DB_PATH).replace("\\", "/")
    try:
        connection = sqlite3.connect(
            f"file:{quote(uri_path, safe='/:')}?mode=ro",
            uri=True,
            timeout=30,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA query_only=ON;")
        connection.execute("PRAGMA busy_timeout=30000;")
        return connection
    except (OSError, sqlite3.Error):
        return None


VIEWER_SCHEMA_VERSION = 6
DOMINANT_COLOR_ALGORITHM_VERSION = "rgb-bucket-v1"
LIBRARY_JOB_ACTIVE_STATUSES = ("queued", "running", "cancelling")
LIBRARY_JOB_TERMINAL_STATUSES = ("completed", "cancelled", "failed", "interrupted")


def _utc_timestamp() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _ensure_viewer_schema(cursor: sqlite3.Cursor) -> None:
    """Create and migrate tables owned by the Web Viewer.

    PixivUtil2's existing tables are intentionally left unchanged. Viewer
    metadata has its own tables so future migrations can evolve independently
    from the upstream database schema.
    """
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS viewer_schema_version (
            schema_name TEXT PRIMARY KEY,
            version INTEGER NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS viewer_media_metadata (
            normalized_path TEXT PRIMARY KEY,
            image_id INTEGER,
            file_size INTEGER NOT NULL,
            mtime_ns INTEGER NOT NULL,
            fingerprint TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_seen_at TEXT,
            is_present INTEGER NOT NULL DEFAULT 1,
            scope_key TEXT
        )
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_viewer_media_metadata_image_id
        ON viewer_media_metadata (image_id)
    """)
    media_metadata_columns = {
        row["name"]
        for row in cursor.execute("PRAGMA table_info(viewer_media_metadata)").fetchall()
    }
    if "last_seen_at" not in media_metadata_columns:
        cursor.execute("ALTER TABLE viewer_media_metadata ADD COLUMN last_seen_at TEXT")
    if "is_present" not in media_metadata_columns:
        cursor.execute(
            "ALTER TABLE viewer_media_metadata ADD COLUMN is_present INTEGER NOT NULL DEFAULT 1"
        )
    if "scope_key" not in media_metadata_columns:
        cursor.execute("ALTER TABLE viewer_media_metadata ADD COLUMN scope_key TEXT")
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_viewer_media_metadata_scope_present
        ON viewer_media_metadata (scope_key, is_present, normalized_path)
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_viewer_media_metadata_path_nocase
        ON viewer_media_metadata (normalized_path COLLATE NOCASE)
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS viewer_dominant_color (
            normalized_path TEXT PRIMARY KEY,
            fingerprint TEXT NOT NULL,
            algorithm_version TEXT NOT NULL,
            dominant_color TEXT,
            updated_at TEXT NOT NULL
        )
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_viewer_dominant_color_lookup
        ON viewer_dominant_color (fingerprint, algorithm_version)
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS viewer_thumbnail_cache (
            cache_name TEXT PRIMARY KEY,
            normalized_path TEXT NOT NULL,
            source_file_size INTEGER NOT NULL,
            source_mtime_ns INTEGER NOT NULL,
            fingerprint TEXT NOT NULL,
            width INTEGER NOT NULL,
            height INTEGER NOT NULL,
            generated_at TEXT NOT NULL,
            last_accessed_at TEXT NOT NULL,
            cache_bytes INTEGER NOT NULL DEFAULT 0
        )
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_viewer_thumbnail_cache_source
        ON viewer_thumbnail_cache (normalized_path, width, height)
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_viewer_thumbnail_cache_access
        ON viewer_thumbnail_cache (last_accessed_at)
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS viewer_library_job (
            job_id TEXT PRIMARY KEY,
            job_type TEXT NOT NULL,
            status TEXT NOT NULL,
            phase TEXT NOT NULL,
            directory TEXT NOT NULL,
            analyze_colors INTEGER NOT NULL DEFAULT 0,
            discovered INTEGER NOT NULL DEFAULT 0,
            total INTEGER,
            processed INTEGER NOT NULL DEFAULT 0,
            added INTEGER NOT NULL DEFAULT 0,
            updated INTEGER NOT NULL DEFAULT 0,
            unchanged INTEGER NOT NULL DEFAULT 0,
            conflicts INTEGER NOT NULL DEFAULT 0,
            errors INTEGER NOT NULL DEFAULT 0,
            colors_created INTEGER NOT NULL DEFAULT 0,
            colors_reused INTEGER NOT NULL DEFAULT 0,
            cache_moved INTEGER NOT NULL DEFAULT 0,
            scope_json TEXT NOT NULL DEFAULT '[]',
            priority INTEGER NOT NULL DEFAULT 50,
            automatic INTEGER NOT NULL DEFAULT 0,
            current_file TEXT,
            error_message TEXT,
            cancel_requested INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            started_at TEXT,
            finished_at TEXT,
            updated_at TEXT NOT NULL
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS viewer_index_scope (
            scope_key TEXT PRIMARY KEY,
            scope_type TEXT NOT NULL,
            member_id INTEGER,
            directory TEXT NOT NULL,
            directory_mtime_ns INTEGER,
            directory_signature TEXT,
            probe_signature TEXT,
            dirty INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'never-indexed',
            last_probe_at TEXT,
            last_indexed_at TEXT,
            last_error TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            last_discovered_at TEXT
        )
    """)
    scope_columns = {
        row["name"]
        for row in cursor.execute("PRAGMA table_info(viewer_index_scope)").fetchall()
    }
    if "probe_signature" not in scope_columns:
        cursor.execute("ALTER TABLE viewer_index_scope ADD COLUMN probe_signature TEXT")
    if "is_active" not in scope_columns:
        cursor.execute(
            "ALTER TABLE viewer_index_scope ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1"
        )
    if "last_discovered_at" not in scope_columns:
        cursor.execute(
            "ALTER TABLE viewer_index_scope ADD COLUMN last_discovered_at TEXT"
        )
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_viewer_index_scope_status
        ON viewer_index_scope (dirty, status, last_indexed_at)
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_viewer_index_scope_artist_active
        ON viewer_index_scope (scope_type, is_active, directory)
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS viewer_source_snapshot (
            source_name TEXT PRIMARY KEY,
            source_path TEXT NOT NULL,
            source_size INTEGER NOT NULL,
            source_mtime_ns INTEGER NOT NULL,
            synced_at TEXT NOT NULL
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS viewer_hidden_artist (
            member_id INTEGER PRIMARY KEY,
            folder_name TEXT NOT NULL DEFAULT '',
            hidden_at TEXT NOT NULL,
            unhidden_at TEXT
        )
    """)
    hidden_artist_columns = {
        row["name"]
        for row in cursor.execute("PRAGMA table_info(viewer_hidden_artist)").fetchall()
    }
    if "unhidden_at" not in hidden_artist_columns:
        cursor.execute(
            "ALTER TABLE viewer_hidden_artist ADD COLUMN unhidden_at TEXT"
        )
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_viewer_library_job_status
        ON viewer_library_job (status, created_at)
    """)
    job_columns = {
        row["name"]
        for row in cursor.execute("PRAGMA table_info(viewer_library_job)").fetchall()
    }
    if "colors_created" not in job_columns:
        cursor.execute(
            "ALTER TABLE viewer_library_job ADD COLUMN colors_created INTEGER NOT NULL DEFAULT 0"
        )
    if "colors_reused" not in job_columns:
        cursor.execute(
            "ALTER TABLE viewer_library_job ADD COLUMN colors_reused INTEGER NOT NULL DEFAULT 0"
        )
    if "cache_moved" not in job_columns:
        cursor.execute(
            "ALTER TABLE viewer_library_job ADD COLUMN cache_moved INTEGER NOT NULL DEFAULT 0"
        )
    if "scope_json" not in job_columns:
        cursor.execute(
            "ALTER TABLE viewer_library_job ADD COLUMN scope_json TEXT NOT NULL DEFAULT '[]'"
        )
    if "priority" not in job_columns:
        cursor.execute(
            "ALTER TABLE viewer_library_job ADD COLUMN priority INTEGER NOT NULL DEFAULT 50"
        )
    if "automatic" not in job_columns:
        cursor.execute(
            "ALTER TABLE viewer_library_job ADD COLUMN automatic INTEGER NOT NULL DEFAULT 0"
        )
    cursor.execute("""
        INSERT INTO viewer_schema_version (schema_name, version, updated_at)
        VALUES ('viewer', ?, ?)
        ON CONFLICT(schema_name) DO UPDATE SET
            version = excluded.version,
            updated_at = excluded.updated_at
    """, (VIEWER_SCHEMA_VERSION, _utc_timestamp()))


def init_db_schema():
    """Initialize only Web Viewer-owned SQLite schema and snapshot metadata.

    PixivUtil2's database is deliberately never initialized, migrated, or
    written here.  Its existing rows are copied into the separate Viewer DB
    through a read-only connection below.
    """
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
            CREATE TABLE IF NOT EXISTS pixiv_manga_image (
                image_id INTEGER NOT NULL,
                save_name TEXT NOT NULL,
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
                trashed_at TEXT NOT NULL,
                sent_to_system_recycle_at TEXT
            )
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_pixivutil2_trash_image_id
            ON pixivutil2_trash_image (image_id)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_viewer_master_image_member_date
            ON pixiv_master_image (member_id, created_date, image_id)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_viewer_manga_image_image
            ON pixiv_manga_image (image_id, created_date)
        """)
        _ensure_viewer_schema(cursor)
        conn.commit()



def sync_pixiv_snapshot() -> None:
    """Import the read-only PixivUtil2 snapshot from a background worker."""
    init_db_schema()
    _sync_pixiv_snapshot()


def _source_table_exists(connection: sqlite3.Connection, table_name: str) -> bool:
    row = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
        (table_name,),
    ).fetchone()
    return row is not None


def _source_table_columns(connection: sqlite3.Connection, table_name: str) -> set[str]:
    return {
        str(row["name"])
        for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    }


def _sync_pixiv_snapshot() -> None:
    """Copy existing PixivUtil2 rows into the Viewer DB without writing source.

    This is a one-way import.  Subsequent file indexing updates the Viewer
    copy only, so PixivUtil2 remains an immutable source of legacy metadata.
    """
    try:
        source_stat = os.stat(PIXIV_DB_PATH)
    except OSError:
        return

    try:
        with get_db_connection() as viewer_conn:
            snapshot = viewer_conn.execute(
                """
                SELECT source_size, source_mtime_ns
                FROM viewer_source_snapshot
                WHERE source_name = 'pixivutil2'
                """
            ).fetchone()
            if snapshot and (
                int(snapshot["source_size"]) == int(source_stat.st_size)
                and int(snapshot["source_mtime_ns"]) == int(source_stat.st_mtime_ns)
            ):
                return
    except sqlite3.Error:
        return

    source_conn = get_pixiv_db_connection()
    if source_conn is None:
        return

    try:
        members = []
        images = []
        manga_images = []
        trash_entries = []
        manga_table_present = False
        if _source_table_exists(source_conn, "pixiv_master_member"):
            members = source_conn.execute(
                """
                SELECT member_id, name, save_folder, created_date, last_update_date
                FROM pixiv_master_member
                """
            ).fetchall()
        if _source_table_exists(source_conn, "pixiv_master_image"):
            images = source_conn.execute(
                """
                SELECT image_id, member_id, title, save_name, created_date, last_update_date
                FROM pixiv_master_image
                """
            ).fetchall()
        if _source_table_exists(source_conn, "pixiv_manga_image"):
            manga_table_present = True
            manga_images = source_conn.execute(
                """
                SELECT image_id, save_name, created_date, last_update_date
                FROM pixiv_manga_image
                """
            ).fetchall()
        if _source_table_exists(source_conn, "pixivutil2_trash_image"):
            trash_columns = _source_table_columns(source_conn, "pixivutil2_trash_image")
            sent_column = "sent_to_system_recycle_at" if "sent_to_system_recycle_at" in trash_columns else "NULL"
            trash_entries = source_conn.execute(
                f"""
                SELECT trash_id, image_id, original_path, trash_path,
                       trashed_at, {sent_column} AS sent_to_system_recycle_at
                FROM pixivutil2_trash_image
                """
            ).fetchall()

        with get_db_connection() as viewer_conn:
            if members:
                viewer_conn.executemany(
                    """
                    INSERT INTO pixiv_master_member
                    (member_id, name, save_folder, created_date, last_update_date)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(member_id) DO UPDATE SET
                        name = excluded.name,
                        save_folder = excluded.save_folder,
                        created_date = excluded.created_date,
                        last_update_date = excluded.last_update_date
                    """,
                    [tuple(row) for row in members],
                )
            if images:
                viewer_conn.executemany(
                    """
                    INSERT INTO pixiv_master_image
                    (image_id, member_id, title, save_name, created_date, last_update_date)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(image_id) DO UPDATE SET
                        member_id = excluded.member_id,
                        title = excluded.title,
                        save_name = excluded.save_name,
                        created_date = excluded.created_date,
                        last_update_date = excluded.last_update_date
                    """,
                    [tuple(row) for row in images],
                )
            if manga_table_present:
                # The legacy manga table has no guaranteed single-column key;
                # replace the Viewer copy to avoid duplicating pages whenever
                # the read-only source snapshot changes.
                viewer_conn.execute("DELETE FROM pixiv_manga_image")
            if manga_images:
                viewer_conn.executemany(
                    """
                    INSERT INTO pixiv_manga_image
                    (image_id, save_name, created_date, last_update_date)
                    VALUES (?, ?, ?, ?)
                    """,
                    [tuple(row) for row in manga_images],
                )
            if trash_entries:
                viewer_conn.executemany(
                    """
                    INSERT INTO pixivutil2_trash_image
                        (trash_id, image_id, original_path, trash_path, trashed_at,
                         sent_to_system_recycle_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(trash_id) DO UPDATE SET
                        image_id = excluded.image_id,
                        original_path = excluded.original_path,
                        trash_path = excluded.trash_path,
                        trashed_at = excluded.trashed_at,
                        sent_to_system_recycle_at = excluded.sent_to_system_recycle_at
                    """,
                    [tuple(row) for row in trash_entries],
                )
            viewer_conn.execute(
                """
                INSERT INTO viewer_source_snapshot
                (source_name, source_path, source_size, source_mtime_ns, synced_at)
                VALUES ('pixivutil2', ?, ?, ?, ?)
                ON CONFLICT(source_name) DO UPDATE SET
                    source_path = excluded.source_path,
                    source_size = excluded.source_size,
                    source_mtime_ns = excluded.source_mtime_ns,
                    synced_at = excluded.synced_at
                """,
                (PIXIV_DB_PATH, int(source_stat.st_size), int(source_stat.st_mtime_ns), _utc_timestamp()),
            )
            viewer_conn.commit()
    except (OSError, sqlite3.Error) as error:
        print(f"PixivUtil2 read-only snapshot import failed: {error}")
    finally:
        source_conn.close()


def _normalise_media_path(file_path: str) -> str:
    return os.path.normcase(os.path.normpath(os.path.abspath(file_path)))


def _get_image_group_key(item: Dict[str, Any]) -> str:
    """Mirror the frontend work-group key for stable webtoon numbering."""
    file_path = item.get("save_name")
    if not file_path:
        return f"item_{item.get('image_id') or 'unknown'}"

    normalized_path = str(file_path).replace("\\", "/")
    separator = normalized_path.rfind("/")
    filename = normalized_path[separator + 1:]
    dir_path = normalized_path[:separator] if separator >= 0 else ""

    pixiv_match = re.match(r"^(\d{5,12})_p\d+", filename, re.IGNORECASE)
    if pixiv_match:
        return f"pixiv_{pixiv_match.group(1)}"

    post_id_match = re.match(r"^(\d{5,12})[_-]", filename, re.IGNORECASE)
    if post_id_match:
        return f"pixiv_{post_id_match.group(1)}"

    title_match = re.match(r"^(.+?)[_-]p\d+", filename, re.IGNORECASE)
    if title_match:
        return f"title_{dir_path.lower()}_{title_match.group(1).lower()}"

    path_parts = [part for part in dir_path.split("/") if part]
    if len(path_parts) >= 3:
        return f"dir_{dir_path.lower()}"

    return f"file_{normalized_path.lower()}"


def _annotate_group_page_numbers(items: List[Dict[str, Any]]) -> None:
    """Attach 1-based page positions and totals for each work group."""
    group_totals: Dict[str, int] = {}
    for item in items:
        group_key = _get_image_group_key(item)
        group_totals[group_key] = group_totals.get(group_key, 0) + 1

    group_positions: Dict[str, int] = {}
    for item in items:
        group_key = _get_image_group_key(item)
        next_position = group_positions.get(group_key, 0) + 1
        group_positions[group_key] = next_position
        item["group_page_index"] = next_position
        item["group_page_total"] = group_totals[group_key]


def _sql_path_prefix_like(directory: str) -> str:
    """Return an escaped SQLite LIKE prefix for one stored directory tree."""
    prefix = _normalise_media_path(directory).rstrip("\\/") + os.sep
    escaped = prefix.replace("!", "!!").replace("%", "!%").replace("_", "!_")
    return f"{escaped}%"


def _stored_media_path_is_within(file_path: Optional[str], directory: str) -> bool:
    if not file_path or is_internal_media_path(file_path):
        return False
    return _is_path_within(str(file_path), directory)


def _stored_media_path_is_direct_child(file_path: Optional[str], directory: str) -> bool:
    if not file_path or is_internal_media_path(file_path):
        return False
    try:
        normalized_file = _normalise_media_path(str(file_path))
        normalized_directory = _normalise_media_path(directory)
        return os.path.dirname(normalized_file) == normalized_directory
    except (OSError, TypeError, ValueError):
        return False


def _media_fingerprint(file_size: int, mtime_ns: int) -> str:
    payload = f"{file_size}:{mtime_ns}".encode("ascii")
    return hashlib.sha1(payload).hexdigest()


def _stable_integer_id(value: str, base: int, value_range: int) -> int:
    """Return a deterministic integer ID without Python's process-local hash()."""
    digest = hashlib.sha1(value.encode("utf-8")).digest()
    return base + (int.from_bytes(digest[:8], "big") % value_range)


def _stable_synthetic_member_id(folder_path: str) -> int:
    return _stable_integer_id(
        _normalise_media_path(folder_path),
        SYNTHETIC_MEMBER_ID_BASE,
        SYNTHETIC_MEMBER_ID_RANGE,
    )


def _stable_synthetic_image_id(file_path: str) -> int:
    return _stable_integer_id(
        _normalise_media_path(file_path),
        SYNTHETIC_IMAGE_ID_BASE,
        SYNTHETIC_IMAGE_ID_RANGE,
    )


def _emit_scan_progress(
    progress_callback: Optional[Callable[..., None]],
    payload: Dict[str, Any],
    connection: Optional[sqlite3.Connection] = None,
) -> None:
    if not progress_callback:
        return
    try:
        if connection is not None and getattr(
            progress_callback,
            "accepts_database_connection",
            False,
        ):
            progress_callback(payload, connection)
        else:
            progress_callback(payload)
    except Exception as error:
        # Progress reporting must never interrupt the indexing transaction.
        print(f"scan progress callback failed: {error}")


def _discover_media_files(
    abs_dir: str,
    cancel_event: Any = None,
    progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
) -> Tuple[List[Dict[str, Any]], bool, int, List[str]]:
    """Walk a directory once and collect cheap file fingerprints.

    The total is intentionally unknown during discovery. The caller can only
    expose a determinate progress bar after this function returns.
    """
    candidates: List[Dict[str, Any]] = []
    discovered = 0
    errors: List[str] = []

    def handle_walk_error(error: OSError) -> None:
        if len(errors) < 20:
            errors.append(f"{getattr(error, 'filename', abs_dir)}: {error}")

    for root, dirs, files in os.walk(abs_dir, onerror=handle_walk_error):
        _prune_internal_directories(dirs)
        dirs.sort(key=natural_sort_key)
        files.sort(key=natural_sort_key)
        for file in files:
            if cancel_event is not None and cancel_event.is_set():
                return candidates, True, discovered, errors

            extension = os.path.splitext(file)[1].lower()
            full_path = os.path.abspath(os.path.join(root, file))
            if extension not in MEDIA_EXTENSIONS or is_internal_media_path(full_path):
                continue

            try:
                file_stat = os.stat(full_path)
            except OSError as error:
                if len(errors) < 20:
                    errors.append(f"{full_path}: {error}")
                continue

            discovered += 1
            candidate = {
                "path": full_path,
                "normalized_path": _normalise_media_path(full_path),
                "file_name": file,
                "root": root,
                "file_size": int(file_stat.st_size),
                "mtime_ns": int(file_stat.st_mtime_ns),
                "fingerprint": _media_fingerprint(int(file_stat.st_size), int(file_stat.st_mtime_ns)),
            }
            candidates.append(candidate)
            _emit_scan_progress(progress_callback, {
                "phase": "discovering",
                "discovered": discovered,
                "total": None,
                "processed": 0,
                "errors": len(errors),
                "current_file": full_path,
            })

    return candidates, False, discovered, errors


def _top_level_folder_for_path(abs_dir: str, root: str) -> Optional[str]:
    """Return the first folder below the scan root for a discovered path."""
    scan_root = os.path.abspath(abs_dir)
    current_root = os.path.abspath(root)
    if os.path.normcase(scan_root) == os.path.normcase(current_root):
        return None

    try:
        relative_root = os.path.relpath(current_root, scan_root)
    except ValueError:
        return None
    if relative_root in (".", os.pardir) or relative_root.startswith(os.pardir + os.sep):
        return None

    top_level_name = relative_root.split(os.sep, 1)[0]
    if not top_level_name or top_level_name in (".", os.pardir):
        return None
    return os.path.join(scan_root, top_level_name)


def _explicit_member_id_from_folder_name(folder_name: str) -> Optional[int]:
    """Read the normal PixivUtil2 ``Artist (member_id)`` folder suffix."""
    member_match = re.search(r"\((\d{4,10})\)\s*$", folder_name)
    if member_match:
        return int(member_match.group(1))
    if re.fullmatch(r"\d{4,10}", folder_name):
        return int(folder_name)
    return None


def get_folder_member_id(folder_path: str, existing_member_id: Optional[int] = None) -> int:
    """Return the stable member identity represented by one top-level folder.

    Numeric PixivUtil2 folder names keep their real member ID. Other folders
    receive a deterministic Web Viewer ID derived from their canonical path;
    this must not use Python's randomized ``hash()``.
    """
    folder_name = os.path.basename(os.path.normpath(folder_path))
    explicit_id = _explicit_member_id_from_folder_name(folder_name)
    if explicit_id is not None:
        return explicit_id
    if existing_member_id is not None:
        return int(existing_member_id)
    return _stable_synthetic_member_id(folder_path)


def _member_for_media_path(
    abs_dir: str,
    root: str,
    existing_members_by_name: Optional[Dict[str, int]] = None,
) -> Tuple[Optional[int], Optional[str]]:
    """Group nested media under the first folder below the scan root."""
    folder_path = _top_level_folder_for_path(abs_dir, root)
    if not folder_path:
        return None, None

    folder_name = os.path.basename(folder_path)
    existing_member_id = None
    if existing_members_by_name:
        existing_member_id = existing_members_by_name.get(os.path.normcase(folder_name))
    return get_folder_member_id(folder_path, existing_member_id), folder_name


def get_index_scope_key(
    directory: str,
    member_id: Optional[int] = None,
) -> str:
    """Return a stable Viewer-owned scope identifier."""
    if member_id is not None:
        return f"artist:{int(member_id)}"
    return f"directory:{_normalise_media_path(directory)}"


def _scope_signature(candidates: List[Dict[str, Any]]) -> str:
    digest = hashlib.sha1()
    for candidate in sorted(candidates, key=lambda item: item["normalized_path"]):
        digest.update(
            f"{candidate['normalized_path']}:{candidate['file_size']}:{candidate['mtime_ns']}\n".encode(
                "utf-8"
            )
        )
    return digest.hexdigest()


def _directory_probe_signature(directory: str) -> Optional[str]:
    """Fingerprint one directory level for cheap change detection.

    This is only a hint. Exact recursive truth still comes from an indexed
    scope scan, while a future OS watcher can mark the same scope dirty.
    """
    if not os.path.isdir(directory):
        return None
    digest = hashlib.sha1()
    try:
        entries = sorted(os.scandir(directory), key=lambda entry: natural_sort_key(entry.name))
        for entry in entries:
            if entry.name.startswith(".") or is_internal_directory_name(entry.name):
                continue
            try:
                stat = entry.stat(follow_symlinks=False)
            except OSError:
                continue
            if entry.is_dir(follow_symlinks=False):
                digest.update(f"d:{entry.name}:{stat.st_mtime_ns}\n".encode("utf-8"))
            elif entry.is_file(follow_symlinks=False):
                extension = os.path.splitext(entry.name)[1].lower()
                if extension in MEDIA_EXTENSIONS:
                    digest.update(
                        f"f:{entry.name}:{stat.st_size}:{stat.st_mtime_ns}\n".encode("utf-8")
                    )
    except OSError:
        return None
    return digest.hexdigest()


def _set_index_scope_state(
    scope_key: str,
    scope_type: str,
    directory: str,
    member_id: Optional[int],
    *,
    status: str,
    dirty: bool,
    candidates: Optional[List[Dict[str, Any]]] = None,
    error: Optional[str] = None,
) -> None:
    try:
        directory_mtime_ns = int(os.stat(directory).st_mtime_ns)
    except OSError:
        directory_mtime_ns = None
    now = _utc_timestamp()
    signature = _scope_signature(candidates or []) if candidates is not None else None
    probe_signature = _directory_probe_signature(directory)
    indexed_at = now if status == "indexed" else None
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO viewer_index_scope
                (scope_key, scope_type, member_id, directory, directory_mtime_ns,
                 directory_signature, probe_signature, dirty, status, last_probe_at,
                 last_indexed_at, last_error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(scope_key) DO UPDATE SET
                scope_type = excluded.scope_type,
                member_id = excluded.member_id,
                directory = excluded.directory,
                directory_mtime_ns = excluded.directory_mtime_ns,
                directory_signature = COALESCE(excluded.directory_signature, viewer_index_scope.directory_signature),
                probe_signature = COALESCE(excluded.probe_signature, viewer_index_scope.probe_signature),
                dirty = excluded.dirty,
                status = excluded.status,
                last_probe_at = excluded.last_probe_at,
                last_indexed_at = COALESCE(excluded.last_indexed_at, viewer_index_scope.last_indexed_at),
                last_error = excluded.last_error
            """,
            (
                scope_key,
                scope_type,
                int(member_id) if member_id is not None else None,
                os.path.abspath(directory),
                directory_mtime_ns,
                signature,
                probe_signature,
                int(bool(dirty)),
                status,
                now,
                indexed_at,
                error,
            ),
        )
        conn.commit()


def _ensure_index_scope_row(
    scope_key: str,
    scope_type: str,
    directory: str,
    member_id: Optional[int] = None,
) -> None:
    """Register a scope without scanning it."""
    init_db_schema()
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO viewer_index_scope
                (scope_key, scope_type, member_id, directory, dirty, status)
            VALUES (?, ?, ?, ?, 1, 'never-indexed')
            ON CONFLICT(scope_key) DO UPDATE SET
                scope_type = excluded.scope_type,
                member_id = excluded.member_id,
                directory = excluded.directory
            """,
            (
                scope_key,
                scope_type,
                int(member_id) if member_id is not None else None,
                os.path.abspath(directory),
            ),
        )
        conn.commit()


def get_root_scope_key(directory: str) -> str:
    return f"root:{_normalise_media_path(directory)}"


def discover_root_scopes(root_directory: str) -> List[Dict[str, Any]]:
    """Discover only immediate artist folders and register their scopes.

    This is intentionally a shallow ``scandir``. It makes newly-created artist
    folders discoverable without making gallery navigation perform a recursive
    HDD walk; exact content discovery remains a background job.
    """
    root = os.path.abspath(root_directory)
    init_db_schema()
    if not os.path.isdir(root):
        return []

    try:
        folders = [
            entry
            for entry in os.scandir(root)
            if entry.is_dir(follow_symlinks=False)
            and not entry.name.startswith(".")
            and not is_internal_directory_name(entry.name)
        ]
    except OSError:
        return []
    folders.sort(key=lambda entry: natural_sort_key(entry.name))

    with get_db_connection() as conn:
        existing_rows = conn.execute(
            "SELECT member_id, name, save_folder FROM pixiv_master_member"
        ).fetchall()
        members_by_name: Dict[str, int] = {}
        for row in existing_rows:
            for value in (row["name"], row["save_folder"]):
                if value:
                    members_by_name[os.path.normcase(str(value))] = int(row["member_id"])

        now = _utc_timestamp()
        scopes: List[Dict[str, Any]] = []
        root_scope_key = get_root_scope_key(root)
        conn.execute(
            """
            INSERT INTO viewer_index_scope
                (scope_key, scope_type, directory, dirty, status, is_active, last_discovered_at)
            VALUES (?, 'root', ?, 1, 'never-indexed', 1, ?)
            ON CONFLICT(scope_key) DO UPDATE SET
                directory = excluded.directory,
                is_active = 1,
                last_discovered_at = excluded.last_discovered_at
            """,
            (root_scope_key, root, now),
        )

        discovered_directories = {
            os.path.normcase(os.path.abspath(entry.path))
            for entry in folders
        }
        existing_artist_scopes = conn.execute(
            """
            SELECT scope_key, directory
            FROM viewer_index_scope
            WHERE scope_type = 'artist'
            """
        ).fetchall()
        for existing_scope in existing_artist_scopes:
            existing_directory = os.path.normcase(
                os.path.abspath(existing_scope["directory"])
            )
            if os.path.normcase(os.path.dirname(existing_directory)) != os.path.normcase(root):
                continue
            if existing_directory in discovered_directories:
                continue
            # Keep the historical scope and its Viewer rows for diagnostics,
            # but make it impossible for a stale member row to recreate the
            # artist in the navigator or as a selectable update target.
            conn.execute(
                """
                UPDATE viewer_index_scope
                SET is_active = 0,
                    dirty = 0,
                    status = 'stale',
                    last_error = NULL
                WHERE scope_key = ?
                """,
                (existing_scope["scope_key"],),
            )

        for entry in folders:
            member_id = get_folder_member_id(
                entry.path,
                members_by_name.get(os.path.normcase(entry.name)),
            )
            conn.execute(
                """
                INSERT INTO pixiv_master_member
                    (member_id, name, save_folder, created_date, last_update_date)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(member_id) DO UPDATE SET
                    name = COALESCE(NULLIF(pixiv_master_member.name, ''), excluded.name),
                    save_folder = COALESCE(NULLIF(pixiv_master_member.save_folder, ''), excluded.save_folder)
                """,
                (member_id, entry.name, entry.name, now, now),
            )
            scope_key = get_index_scope_key(entry.path, member_id)
            conn.execute(
                """
                INSERT INTO viewer_index_scope
                    (scope_key, scope_type, member_id, directory, dirty, status,
                     is_active, last_discovered_at)
                VALUES (?, 'artist', ?, ?, 1, 'never-indexed', 1, ?)
                ON CONFLICT(scope_key) DO UPDATE SET
                    member_id = excluded.member_id,
                    directory = excluded.directory,
                    is_active = 1,
                    last_discovered_at = excluded.last_discovered_at,
                    dirty = CASE
                        WHEN viewer_index_scope.is_active = 0 THEN 1
                        ELSE viewer_index_scope.dirty
                    END,
                    status = CASE
                        WHEN viewer_index_scope.is_active = 0 THEN 'dirty'
                        ELSE viewer_index_scope.status
                    END
                """,
                (scope_key, member_id, os.path.abspath(entry.path), now),
            )
            scopes.append({
                "scope_key": scope_key,
                "scope_type": "artist",
                "member_id": member_id,
                "directory": os.path.abspath(entry.path),
            })
        conn.commit()
    return scopes


def get_index_scopes(
    *,
    dirty_only: bool = False,
    scope_type: Optional[str] = None,
) -> List[Dict[str, Any]]:
    init_db_schema()
    conditions: List[str] = []
    params: List[Any] = []
    if dirty_only:
        conditions.append("dirty = 1")
    if scope_type:
        conditions.append("scope_type = ?")
        params.append(scope_type)
        if scope_type == "artist":
            conditions.extend(["is_active = 1", "last_discovered_at IS NOT NULL"])
    where_clause = " WHERE " + " AND ".join(conditions) if conditions else ""
    with get_db_connection() as conn:
        rows = conn.execute(
            f"SELECT * FROM viewer_index_scope{where_clause} ORDER BY scope_type, directory",
            params,
        ).fetchall()
    return [dict(row) for row in rows]


def get_artist_scope(member_id: int) -> Optional[Dict[str, Any]]:
    init_db_schema()
    with get_db_connection() as conn:
        row = conn.execute(
            """
            SELECT * FROM viewer_index_scope
            WHERE member_id = ? AND scope_type = 'artist'
              AND is_active = 1 AND last_discovered_at IS NOT NULL
            ORDER BY last_indexed_at DESC, directory
            LIMIT 1
            """,
            (int(member_id),),
        ).fetchone()
    if row:
        return dict(row)
    return None


def probe_index_scope(scope_key: str) -> Optional[Dict[str, Any]]:
    """Run a cheap one-level probe and mark a scope dirty when it changed."""
    init_db_schema()
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM viewer_index_scope WHERE scope_key = ?",
            (scope_key,),
        ).fetchone()
    if row is None:
        return None
    scope = dict(row)
    directory = scope["directory"]
    signature = _directory_probe_signature(directory)
    dirty = signature is None or signature != scope.get("probe_signature")
    status = scope.get("status") or "never-indexed"
    if dirty and status not in {"running", "paused"}:
        status = "dirty"
    with get_db_connection() as conn:
        conn.execute(
            """
            UPDATE viewer_index_scope
            SET probe_signature = ?, last_probe_at = ?, dirty = ?, status = ?
            WHERE scope_key = ?
            """,
            (signature, _utc_timestamp(), int(dirty), status, scope_key),
        )
        conn.commit()
        updated = conn.execute(
            "SELECT * FROM viewer_index_scope WHERE scope_key = ?",
            (scope_key,),
        ).fetchone()
    return dict(updated) if updated else None


def mark_index_scopes_dirty_for_path(file_path: str) -> int:
    """Mark affected scopes dirty after an OS directory-change notification."""
    normalized_path = os.path.abspath(file_path)
    init_db_schema()
    marked = 0
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT scope_key, directory, status FROM viewer_index_scope"
        ).fetchall()
        for row in rows:
            if not _is_path_within(normalized_path, row["directory"]):
                continue
            if row["status"] == "running":
                continue
            cursor = conn.execute(
                """
                UPDATE viewer_index_scope
                SET dirty = 1, status = 'dirty', last_error = NULL
                WHERE scope_key = ?
                """,
                (row["scope_key"],),
            )
            marked += max(0, int(cursor.rowcount))
        conn.commit()
    return marked


def scan_and_index_directory(
    target_dir: str,
    cancel_event: Any = None,
    progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    interactive_wait_callback: Optional[Callable[[Any], None]] = None,
    scope_key: Optional[str] = None,
    scope_member_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Discover and index media without replacing unrelated artwork rows.

    Existing callers can continue to call this synchronously. Background jobs
    pass a cancellation event and progress callback; commits are batched so a
    cancelled job retains records that were already processed.
    """
    init_db_schema()
    abs_dir = os.path.abspath(target_dir)
    if scope_key is None:
        scope_key = (
            get_root_scope_key(abs_dir)
            if scope_member_id is None
            else get_index_scope_key(abs_dir, scope_member_id)
        )
    scope_type = (
        "artist"
        if scope_member_id is not None
        else "root"
        if scope_key.startswith("root:")
        else "directory"
    )
    if scope_type == "root":
        # Register only the immediate child folders before the recursive scan
        # starts. Navigation still never calls this function; root discovery
        # belongs to an explicit/background indexing job.
        discover_root_scopes(abs_dir)
    _set_index_scope_state(
        scope_key,
        scope_type,
        abs_dir,
        scope_member_id,
        status="running",
        dirty=False,
    )
    if not os.path.isdir(abs_dir):
        _set_index_scope_state(
            scope_key,
            scope_type,
            abs_dir,
            scope_member_id,
            status="error",
            dirty=True,
            error=f"Directory does not exist: {abs_dir}",
        )
        return {
            "scanned": 0,
            "indexed": 0,
            "added": 0,
            "updated": 0,
            "unchanged": 0,
            "conflicts": 0,
            "errors": 1,
            "error_details": [f"Directory does not exist: {abs_dir}"],
            "processed": 0,
            "total": 0,
            "error": f"Directory does not exist: {abs_dir}",
            "directory": abs_dir,
            "cancelled": False,
        }

    candidates, cancelled_during_discovery, scanned_count, discovery_errors = _discover_media_files(
        abs_dir,
        cancel_event=cancel_event,
        progress_callback=progress_callback,
    )
    result: Dict[str, Any] = {
        "scanned": scanned_count,
        "indexed": 0,
        "added": 0,
        "updated": 0,
        "unchanged": 0,
        "conflicts": 0,
        "errors": len(discovery_errors),
        "error_details": discovery_errors[:20],
        "directory": abs_dir,
        "cancelled": cancelled_during_discovery,
        "processed": 0,
        "total": None if cancelled_during_discovery else len(candidates),
    }

    if cancelled_during_discovery:
        _emit_scan_progress(progress_callback, {
            "phase": "discovering",
            "discovered": scanned_count,
            "total": None,
            "processed": 0,
            "errors": result["errors"],
        })
        _set_index_scope_state(
            scope_key,
            scope_type,
            abs_dir,
            scope_member_id,
            status="paused",
            dirty=True,
            error="Scan cancelled during discovery",
        )
        return result

    _emit_scan_progress(progress_callback, {
        "phase": "indexing",
        "discovered": scanned_count,
        "total": len(candidates),
        "processed": 0,
        "errors": result["errors"],
    })

    with get_db_connection() as conn:
        cursor = conn.cursor()
        existing_rows = cursor.execute("""
            SELECT image_id, member_id, title, save_name, created_date, last_update_date
            FROM pixiv_master_image
        """).fetchall()
        member_rows = cursor.execute("""
            SELECT member_id, name
            FROM pixiv_master_member
            WHERE name IS NOT NULL AND name != ''
        """).fetchall()
        existing_members_by_name = {
            os.path.normcase(str(row["name"])): int(row["member_id"])
            for row in member_rows
            if row["member_id"] is not None
        }
        existing_by_path = {
            _normalise_media_path(row["save_name"]): row
            for row in existing_rows
            if row["save_name"]
        }
        metadata_rows = cursor.execute("""
            SELECT normalized_path, image_id, file_size, mtime_ns, fingerprint,
                   is_present, scope_key
            FROM viewer_media_metadata
        """).fetchall()
        metadata_by_path = {row["normalized_path"]: row for row in metadata_rows}
        used_image_ids = {int(row["image_id"]) for row in existing_rows if row["image_id"] is not None}

        max_id_row = cursor.execute("SELECT MAX(image_id) as max_id FROM pixiv_master_image").fetchone()
        next_custom_id = max(int(max_id_row["max_id"] or 1000000) + 1, 1000001)

        for candidate in candidates:
            if cancel_event is not None and cancel_event.is_set():
                result["cancelled"] = True
                break
            if interactive_wait_callback is not None:
                interactive_wait_callback(cancel_event)
                if cancel_event is not None and cancel_event.is_set():
                    result["cancelled"] = True
                    break

            path_key = candidate["normalized_path"]
            file_name = candidate["file_name"]
            full_path = candidate["path"]
            file_date = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(candidate["mtime_ns"] / 1_000_000_000))
            title = os.path.splitext(file_name)[0]
            if scope_member_id is not None:
                member_id = int(scope_member_id)
                folder_name = os.path.basename(os.path.normpath(abs_dir))
            else:
                member_id, folder_name = _member_for_media_path(
                    abs_dir,
                    candidate["root"],
                    existing_members_by_name,
                )

            try:
                existing = existing_by_path.get(path_key)
                metadata = metadata_by_path.get(path_key)
                if existing:
                    image_id = int(existing["image_id"])
                    is_unchanged = bool(metadata and metadata["fingerprint"] == candidate["fingerprint"])
                    created_date = existing["created_date"] or file_date
                    last_update_date = existing["last_update_date"] or file_date
                    if not is_unchanged:
                        last_update_date = file_date
                        result["updated"] += 1
                    else:
                        result["unchanged"] += 1

                    cursor.execute("""
                        UPDATE pixiv_master_image
                        SET member_id = ?, title = ?, save_name = ?, created_date = ?, last_update_date = ?
                        WHERE image_id = ?
                    """, (member_id, title, full_path, created_date, last_update_date, image_id))
                else:
                    match = re.search(r"(\d{5,12})", file_name)
                    image_id = int(match.group(1)) if match else next_custom_id
                    if not match:
                        next_custom_id += 1
                    if image_id in used_image_ids:
                        result["conflicts"] += 1
                        image_id = next_custom_id
                        while image_id in used_image_ids:
                            image_id += 1
                        next_custom_id = image_id + 1

                    used_image_ids.add(image_id)
                    cursor.execute("""
                        INSERT INTO pixiv_master_image
                        (image_id, member_id, title, save_name, created_date, last_update_date)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (image_id, member_id, title, full_path, file_date, file_date))
                    existing_by_path[path_key] = {
                        "image_id": image_id,
                        "member_id": member_id,
                        "title": title,
                        "save_name": full_path,
                        "created_date": file_date,
                        "last_update_date": file_date,
                    }
                    result["added"] += 1

                cursor.execute("""
                    INSERT INTO viewer_media_metadata
                    (normalized_path, image_id, file_size, mtime_ns, fingerprint,
                     updated_at, last_seen_at, is_present, scope_key)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
                    ON CONFLICT(normalized_path) DO UPDATE SET
                        image_id = excluded.image_id,
                        file_size = excluded.file_size,
                        mtime_ns = excluded.mtime_ns,
                        fingerprint = excluded.fingerprint,
                        updated_at = excluded.updated_at,
                        last_seen_at = excluded.last_seen_at,
                        is_present = 1,
                        scope_key = excluded.scope_key
                """, (
                    path_key,
                    image_id,
                    candidate["file_size"],
                    candidate["mtime_ns"],
                    candidate["fingerprint"],
                    _utc_timestamp(),
                    _utc_timestamp(),
                    scope_key,
                ))
                if metadata and metadata["fingerprint"] != candidate["fingerprint"]:
                    cursor.execute("""
                        UPDATE viewer_dominant_color
                        SET fingerprint = ?, dominant_color = NULL, updated_at = ?
                        WHERE normalized_path = ?
                    """, (candidate["fingerprint"], _utc_timestamp(), path_key))

                if member_id and folder_name:
                    cursor.execute("""
                        INSERT INTO pixiv_master_member
                        (member_id, name, created_date, last_update_date)
                        VALUES (?, ?, ?, ?)
                        ON CONFLICT(member_id) DO UPDATE SET
                            name = excluded.name,
                            last_update_date = excluded.last_update_date
                    """, (member_id, folder_name, file_date, file_date))

                metadata_by_path[path_key] = {
                    "normalized_path": path_key,
                    "image_id": image_id,
                    "file_size": candidate["file_size"],
                    "mtime_ns": candidate["mtime_ns"],
                    "fingerprint": candidate["fingerprint"],
                    "is_present": 1,
                    "scope_key": scope_key,
                }
            except Exception as error:
                result["errors"] += 1
                if len(result["error_details"]) < 20:
                    result["error_details"].append(f"{full_path}: {error}")
                print(f"Error indexing {full_path}: {error}")

            result["processed"] = int(result.get("processed", 0)) + 1
            _emit_scan_progress(progress_callback, {
                "phase": "indexing",
                "discovered": scanned_count,
                "total": len(candidates),
                "processed": result["processed"],
                "added": result["added"],
                "updated": result["updated"],
                "unchanged": result["unchanged"],
                "conflicts": result["conflicts"],
                "errors": result["errors"],
                "current_file": full_path,
            }, connection=conn)

            if result["processed"] % 50 == 0:
                conn.commit()

        conn.commit()

    if not result["cancelled"]:
        # Only a complete scope scan can establish that an old indexed path is
        # gone. A cancelled scan leaves the previous snapshot untouched.
        with get_db_connection() as conn:
            conn.execute(
                """
                UPDATE viewer_media_metadata
                SET is_present = 0, last_seen_at = ?
                WHERE scope_key = ?
                """,
                (_utc_timestamp(), scope_key),
            )
            for candidate in candidates:
                conn.execute(
                    """
                    UPDATE viewer_media_metadata
                    SET is_present = 1, last_seen_at = ?
                    WHERE normalized_path = ? AND scope_key = ?
                    """,
                    (_utc_timestamp(), candidate["normalized_path"], scope_key),
                )
            conn.commit()

    # A rescan may add/remove files, so the next gallery request must rebuild
    # the cached path list for this directory tree.
    invalidate_scan_cache(abs_dir)
    result["indexed"] = result["added"] + result["updated"]
    if result["cancelled"]:
        _set_index_scope_state(
            scope_key,
            scope_type,
            abs_dir,
            scope_member_id,
            status="paused",
            dirty=True,
            error="Scan cancelled",
        )
    else:
        _set_index_scope_state(
            scope_key,
            scope_type,
            abs_dir,
            scope_member_id,
            status="indexed" if not result["errors"] else "indexed-with-errors",
            dirty=bool(result["errors"]),
            candidates=candidates,
            error="; ".join(result["error_details"][:3]) if result["errors"] else None,
        )
        if scope_type == "root" and not result["errors"]:
            # The recursive root scan also established the current shallow
            # state of every artist folder it visited. This prevents startup
            # from immediately rescanning the same tree once per artist.
            now = _utc_timestamp()
            with get_db_connection() as conn:
                artist_scopes = conn.execute(
                    """
                    SELECT scope_key, directory
                    FROM viewer_index_scope
                    WHERE scope_type = 'artist'
                      AND is_active = 1 AND last_discovered_at IS NOT NULL
                    """
                ).fetchall()
                for artist_scope in artist_scopes:
                    if not _is_path_within(artist_scope["directory"], abs_dir):
                        continue
                    try:
                        child_mtime_ns = int(os.stat(artist_scope["directory"]).st_mtime_ns)
                    except OSError:
                        child_mtime_ns = None
                    conn.execute(
                        """
                        UPDATE viewer_index_scope
                        SET directory_mtime_ns = ?, probe_signature = ?, dirty = 0,
                            status = 'indexed', last_probe_at = ?, last_indexed_at = ?, last_error = NULL
                        WHERE scope_key = ?
                        """,
                        (
                            child_mtime_ns,
                            _directory_probe_signature(artist_scope["directory"]),
                            now,
                            now,
                            artist_scope["scope_key"],
                        ),
                    )
                conn.commit()
    return result


def _job_row_to_dict(row: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    result = dict(row)
    result["analyze_colors"] = bool(result.get("analyze_colors"))
    result["cancel_requested"] = bool(result.get("cancel_requested"))
    result["automatic"] = bool(result.get("automatic"))
    raw_scopes = result.get("scope_json") or "[]"
    try:
        scopes = json.loads(raw_scopes)
    except (TypeError, ValueError, json.JSONDecodeError):
        scopes = []
    if not isinstance(scopes, list):
        scopes = []
    result["scopes"] = scopes
    return result


def get_media_metadata_for_directory(directory: str) -> List[Dict[str, Any]]:
    """Return indexed media metadata below a directory without walking disk."""
    normalized_directory = _normalise_media_path(directory).rstrip(os.sep)
    prefix = normalized_directory + os.sep
    with get_db_connection() as conn:
        rows = conn.execute(
            """
                SELECT normalized_path, image_id, file_size, mtime_ns, fingerprint
                FROM viewer_media_metadata
                WHERE is_present = 1
                  AND (normalized_path = ? OR normalized_path LIKE ?)
                ORDER BY normalized_path
            """,
            (normalized_directory, prefix + "%"),
        ).fetchall()
    return [dict(row) for row in rows]


def get_dominant_colors(normalized_paths: List[str]) -> Dict[str, str]:
    """Return only current, validated dominant colors for requested paths."""
    if not normalized_paths:
        return {}

    colors: Dict[str, str] = {}
    with get_db_connection() as conn:
        for offset in range(0, len(normalized_paths), 500):
            chunk = normalized_paths[offset:offset + 500]
            placeholders = ",".join("?" for _ in chunk)
            rows = conn.execute(
                f"""
                    SELECT normalized_path, dominant_color
                    FROM viewer_dominant_color
                    WHERE normalized_path IN ({placeholders})
                      AND fingerprint = (
                          SELECT fingerprint
                          FROM viewer_media_metadata metadata
                          WHERE metadata.normalized_path = viewer_dominant_color.normalized_path
                      )
                      AND algorithm_version = ?
                """,
                (*chunk, DOMINANT_COLOR_ALGORITHM_VERSION),
            ).fetchall()
            for row in rows:
                color = row["dominant_color"]
                if color and re.fullmatch(r"#[0-9A-Fa-f]{6}", color):
                    colors[row["normalized_path"]] = color
    return colors


def save_dominant_color(
    normalized_path: str,
    fingerprint: str,
    dominant_color: Optional[str],
) -> None:
    """Persist a validated color for the current media fingerprint."""
    if dominant_color is not None and not re.fullmatch(r"#[0-9A-Fa-f]{6}", dominant_color):
        raise ValueError("dominant_color must be a #RRGGBB value or null")
    now = _utc_timestamp()
    with get_db_connection() as conn:
        conn.execute(
            """
                INSERT INTO viewer_dominant_color
                (normalized_path, fingerprint, algorithm_version, dominant_color, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(normalized_path) DO UPDATE SET
                    fingerprint = excluded.fingerprint,
                    algorithm_version = excluded.algorithm_version,
                    dominant_color = excluded.dominant_color,
                    updated_at = excluded.updated_at
            """,
            (
                normalized_path,
                fingerprint,
                DOMINANT_COLOR_ALGORITHM_VERSION,
                dominant_color,
                now,
            ),
        )
        conn.commit()


def upsert_thumbnail_cache_entry(
    cache_name: str,
    source_path: str,
    source_file_size: int,
    source_mtime_ns: int,
    width: int,
    height: int,
    cache_bytes: int = 0,
    accessed_at: Optional[str] = None,
) -> None:
    """Record the source version and dimensions behind one generated thumbnail."""
    if not cache_name or os.path.basename(cache_name) != cache_name:
        raise ValueError("cache_name must be a plain file name")
    now = accessed_at or _utc_timestamp()
    normalized_path = _normalise_media_path(source_path)
    fingerprint = _media_fingerprint(int(source_file_size), int(source_mtime_ns))
    with get_db_connection() as conn:
        conn.execute(
            """
                INSERT INTO viewer_thumbnail_cache
                (cache_name, normalized_path, source_file_size, source_mtime_ns,
                 fingerprint, width, height, generated_at, last_accessed_at, cache_bytes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(cache_name) DO UPDATE SET
                    normalized_path = excluded.normalized_path,
                    source_file_size = excluded.source_file_size,
                    source_mtime_ns = excluded.source_mtime_ns,
                    fingerprint = excluded.fingerprint,
                    width = excluded.width,
                    height = excluded.height,
                    last_accessed_at = excluded.last_accessed_at,
                    cache_bytes = excluded.cache_bytes
            """,
            (
                cache_name,
                normalized_path,
                int(source_file_size),
                int(source_mtime_ns),
                fingerprint,
                int(width),
                int(height),
                now,
                now,
                max(0, int(cache_bytes)),
            ),
        )
        conn.commit()


def get_thumbnail_cache_entry(cache_name: str) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM viewer_thumbnail_cache WHERE cache_name = ?",
            (cache_name,),
        ).fetchone()
    return dict(row) if row else None


def get_thumbnail_cache_entries(cache_names: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        if cache_names is None:
            rows = conn.execute(
                "SELECT * FROM viewer_thumbnail_cache ORDER BY last_accessed_at"
            ).fetchall()
        else:
            if not cache_names:
                return []
            entries: List[Dict[str, Any]] = []
            for offset in range(0, len(cache_names), 500):
                chunk = cache_names[offset:offset + 500]
                placeholders = ",".join("?" for _ in chunk)
                rows = conn.execute(
                    f"SELECT * FROM viewer_thumbnail_cache WHERE cache_name IN ({placeholders})",
                    chunk,
                ).fetchall()
                entries.extend(dict(row) for row in rows)
            return entries
    return [dict(row) for row in rows]


def delete_thumbnail_cache_entries(cache_names: List[str]) -> int:
    """Remove metadata for cache files that are no longer present on disk."""
    unique_names = list(dict.fromkeys(
        name for name in cache_names
        if name and os.path.basename(name) == name
    ))
    if not unique_names:
        return 0

    deleted = 0
    with get_db_connection() as conn:
        for offset in range(0, len(unique_names), 500):
            chunk = unique_names[offset:offset + 500]
            placeholders = ",".join("?" for _ in chunk)
            cursor = conn.execute(
                f"DELETE FROM viewer_thumbnail_cache WHERE cache_name IN ({placeholders})",
                chunk,
            )
            deleted += max(0, int(cursor.rowcount))
        conn.commit()
    return deleted


def create_library_job(
    job_id: str,
    job_type: str,
    directory: str,
    analyze_colors: bool,
    scopes: Optional[List[Dict[str, Any]]] = None,
    priority: int = 50,
    automatic: bool = False,
) -> Dict[str, Any]:
    now = _utc_timestamp()
    normalized_scopes = scopes or [{
        "scope_key": get_index_scope_key(directory),
        "scope_type": "directory",
        "directory": os.path.abspath(directory),
        "member_id": None,
    }]
    with get_db_connection() as conn:
        conn.execute("""
            INSERT INTO viewer_library_job
            (job_id, job_type, status, phase, directory, analyze_colors,
             scope_json, priority, automatic, created_at, updated_at)
            VALUES (?, ?, 'queued', 'queued', ?, ?, ?, ?, ?, ?, ?)
        """, (
            job_id,
            job_type,
            os.path.abspath(directory),
            int(analyze_colors),
            json.dumps(normalized_scopes, ensure_ascii=False),
            int(priority),
            int(bool(automatic)),
            now,
            now,
        ))
        conn.commit()
        row = conn.execute("SELECT * FROM viewer_library_job WHERE job_id = ?", (job_id,)).fetchone()
    return _job_row_to_dict(row) or {}


def get_library_job(job_id: str) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        row = conn.execute("SELECT * FROM viewer_library_job WHERE job_id = ?", (job_id,)).fetchone()
    return _job_row_to_dict(row)


def get_current_library_job() -> Optional[Dict[str, Any]]:
    active_placeholders = ",".join("?" for _ in LIBRARY_JOB_ACTIVE_STATUSES)
    with get_db_connection() as conn:
        row = conn.execute(
            f"""
                SELECT * FROM viewer_library_job
                WHERE status IN ({active_placeholders})
                ORDER BY created_at DESC
                LIMIT 1
            """,
            LIBRARY_JOB_ACTIVE_STATUSES,
        ).fetchone()
        if row is None:
            row = conn.execute("""
                SELECT * FROM viewer_library_job
                ORDER BY created_at DESC
                LIMIT 1
            """).fetchone()
    return _job_row_to_dict(row)


def update_library_job(
    job_id: str,
    _connection: Optional[sqlite3.Connection] = None,
    **fields: Any,
) -> Optional[Dict[str, Any]]:
    allowed_fields = {
        "status", "phase", "discovered", "total", "processed", "added", "updated",
        "unchanged", "conflicts", "errors", "colors_created", "colors_reused", "cache_moved",
        "current_file", "error_message",
        "cancel_requested", "started_at", "finished_at",
    }
    updates = {key: value for key, value in fields.items() if key in allowed_fields}
    if not updates:
        return get_library_job(job_id)
    if "cancel_requested" in updates:
        updates["cancel_requested"] = int(bool(updates["cancel_requested"]))
    updates["updated_at"] = _utc_timestamp()
    assignments = ", ".join(f"{key} = ?" for key in updates)
    values = [updates[key] for key in updates]
    values.append(job_id)
    if _connection is not None:
        # A scan may already hold SQLite's single writer transaction. Updating
        # the job on that same connection avoids a self-inflicted
        # ``database is locked`` wait from the progress callback.
        _connection.execute(
            f"UPDATE viewer_library_job SET {assignments} WHERE job_id = ?",
            values,
        )
        row = _connection.execute(
            "SELECT * FROM viewer_library_job WHERE job_id = ?",
            (job_id,),
        ).fetchone()
    else:
        with get_db_connection() as conn:
            conn.execute(
                f"UPDATE viewer_library_job SET {assignments} WHERE job_id = ?",
                values,
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM viewer_library_job WHERE job_id = ?",
                (job_id,),
            ).fetchone()
    return _job_row_to_dict(row)


def request_library_job_cancel(job_id: str) -> Optional[Dict[str, Any]]:
    job = get_library_job(job_id)
    if job is None or job["status"] in LIBRARY_JOB_TERMINAL_STATUSES:
        return job
    return update_library_job(
        job_id,
        status="cancelling",
        phase="cancelling",
        cancel_requested=True,
    )


def recover_interrupted_library_jobs() -> int:
    init_db_schema()
    active_placeholders = ",".join("?" for _ in LIBRARY_JOB_ACTIVE_STATUSES)
    now = _utc_timestamp()
    with get_db_connection() as conn:
        cursor = conn.execute(
            f"""
                UPDATE viewer_library_job
                SET status = 'interrupted',
                    phase = 'interrupted',
                    error_message = 'Backend restarted; run the library job again',
                    finished_at = ?,
                    updated_at = ?
                WHERE status IN ({active_placeholders})
            """,
            (now, now, *LIBRARY_JOB_ACTIVE_STATUSES),
        )
        conn.commit()
    return int(cursor.rowcount)


# Directory scans are shared by all image/filter requests in the backend
# process. Filtering should operate on this cached path list instead of
# reopening and inspecting every media file on each request.
_SCAN_CACHE: Dict[Tuple[str, str], Dict[str, Any]] = {}
_SCAN_CACHE_LOCK = threading.RLock()
_SCAN_INFLIGHT: Dict[Tuple[str, str], threading.Event] = {}
_SCAN_GENERATION = 0
CACHE_TTL = 300.0


def invalidate_scan_cache(folder_path: Optional[str] = None) -> None:
    """Invalidate cached recursive/direct scans for a folder tree."""
    global _SCAN_GENERATION
    with _SCAN_CACHE_LOCK:
        _SCAN_GENERATION += 1
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
    """Return one shared snapshot for concurrent requests for the same folder.

    The artist list, month filters and gallery can all arrive together during a
    cold start.  The in-flight event makes the second request wait for the
    first snapshot instead of walking the HDD a second time.
    """
    abs_folder = os.path.abspath(folder_path)
    cache_key = ("recursive" if recursive else "direct", abs_folder)

    while True:
        with _SCAN_CACHE_LOCK:
            cached = _SCAN_CACHE.get(cache_key)
            if cached and time.monotonic() - cached["timestamp"] < CACHE_TTL:
                return cached

            inflight = _SCAN_INFLIGHT.get(cache_key)
            if inflight is None:
                inflight = threading.Event()
                _SCAN_INFLIGHT[cache_key] = inflight
                scan_generation = _SCAN_GENERATION
                break

        inflight.wait()

    records = []
    try:
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
                        "image_id": _stable_synthetic_image_id(full_path),
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
            "timestamp": time.monotonic(),
            "records": records,
            "files": [record["path"] for record in records],
            "records_by_month": records_by_month,
            "records_by_year": records_by_year,
        }
        with _SCAN_CACHE_LOCK:
            # Do not replace a newer snapshot created after invalidation.
            if scan_generation == _SCAN_GENERATION:
                _SCAN_CACHE[cache_key] = cached
        return cached
    finally:
        with _SCAN_CACHE_LOCK:
            pending = _SCAN_INFLIGHT.pop(cache_key, None)
            if pending is not None:
                pending.set()


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


def get_hidden_artist_ids() -> set[int]:
    if not os.path.exists(DB_PATH):
        return set()
    init_db_schema()
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT member_id FROM viewer_hidden_artist WHERE unhidden_at IS NULL"
        ).fetchall()
    return {int(row["member_id"]) for row in rows}


def get_hidden_artists() -> List[Dict[str, Any]]:
    if not os.path.exists(DB_PATH):
        return []
    init_db_schema()
    with get_db_connection() as conn:
        rows = conn.execute(
            """
                SELECT member_id, folder_name, hidden_at
                FROM viewer_hidden_artist
                WHERE unhidden_at IS NULL
                ORDER BY hidden_at DESC, member_id ASC
            """
        ).fetchall()
    return [dict(row) for row in rows]


def hide_artist(member_id: int, folder_name: str = "") -> None:
    if int(member_id) == -1:
        raise ValueError("未分類圖片無法作為繪師隱藏")
    init_db_schema()
    with get_db_connection() as conn:
        conn.execute(
            """
                INSERT INTO viewer_hidden_artist (member_id, folder_name, hidden_at)
                VALUES (?, ?, ?)
                ON CONFLICT(member_id) DO UPDATE SET
                    folder_name = excluded.folder_name,
                    hidden_at = excluded.hidden_at,
                    unhidden_at = NULL
            """,
            (int(member_id), str(folder_name or ""), _utc_timestamp()),
        )
        conn.commit()


def unhide_artist(member_id: int) -> bool:
    init_db_schema()
    with get_db_connection() as conn:
        cursor = conn.execute(
            """
                UPDATE viewer_hidden_artist
                SET unhidden_at = ?
                WHERE member_id = ? AND unhidden_at IS NULL
            """,
            (_utc_timestamp(), int(member_id)),
        )
        conn.commit()
    return cursor.rowcount > 0


def get_trash_entries() -> List[Dict[str, Any]]:
    """Return source media moved to the app recycle area.

    Entries are retained after being sent to the Windows Recycle Bin for
    auditability, but only pending entries are shown in the Web Viewer.
    """
    if not os.path.exists(DB_PATH):
        return []
    init_db_schema()
    with get_db_connection() as conn:
        rows = conn.execute(
            """
                SELECT
                    trash.trash_id,
                    trash.image_id,
                    trash.original_path,
                    trash.trash_path,
                    trash.trashed_at,
                    image.member_id,
                    member.name AS artist_name
                FROM pixivutil2_trash_image trash
                LEFT JOIN pixiv_master_image image ON image.image_id = trash.image_id
                LEFT JOIN pixiv_master_member member ON member.member_id = image.member_id
                WHERE trash.sent_to_system_recycle_at IS NULL
                ORDER BY trash.trashed_at DESC, trash.trash_id DESC
            """
        ).fetchall()

    root_dir = get_configured_root_directory()
    entries: List[Dict[str, Any]] = []
    for row in rows:
        entry = dict(row)
        original_path = entry.get("original_path") or ""
        artist_name = entry.get("artist_name") or ""
        member_id = entry.get("member_id")
        if not artist_name and original_path and _is_path_within(original_path, root_dir):
            relative_path = os.path.relpath(original_path, root_dir)
            parts = os.path.normpath(relative_path).split(os.sep)
            if len(parts) > 1 and parts[0] not in (".", os.pardir):
                artist_name = parts[0]
                folder_path = os.path.join(root_dir, parts[0])
                member_id = get_folder_member_id(folder_path)

        trash_path = entry.get("trash_path") or ""
        file_size: Optional[int] = None
        if trash_path:
            try:
                file_size = int(os.path.getsize(trash_path))
            except OSError:
                file_size = None
        entry.update({
            "member_id": int(member_id) if member_id is not None else None,
            "artist_name": artist_name or "未分類作品",
            "file_name": os.path.basename(original_path) if original_path else "未知檔案",
            "file_size": file_size,
            "available": bool(trash_path and os.path.isfile(trash_path)),
        })
        entries.append(entry)
    return entries


def mark_trash_entries_sent_to_system_recycle(trash_ids: List[int]) -> int:
    unique_ids = list(dict.fromkeys(int(trash_id) for trash_id in trash_ids))
    if not unique_ids or not os.path.exists(DB_PATH):
        return 0
    init_db_schema()
    placeholders = ",".join("?" for _ in unique_ids)
    with get_db_connection() as conn:
        cursor = conn.execute(
            f"""
                UPDATE pixivutil2_trash_image
                SET sent_to_system_recycle_at = ?
                WHERE trash_id IN ({placeholders})
                  AND sent_to_system_recycle_at IS NULL
            """,
            [_utc_timestamp(), *unique_ids],
        )
        conn.commit()
    return int(cursor.rowcount)


def _get_all_artists_from_viewer_snapshot() -> List[Dict[str, Any]]:
    """Build the artist navigator from active root-first-level scopes only.

    ``pixiv_master_member`` also contains the read-only PixivUtil2 snapshot,
    so it is intentionally not used as the set of artists. Stored media paths
    are used for counts as well: the first directory below root is the source
    of truth even when an imported row has a stale or unrelated member_id.
    """
    init_db_schema()
    hidden_artist_ids = get_hidden_artist_ids()
    root_directory = os.path.abspath(get_configured_root_directory())

    with get_db_connection() as conn:
        scope_rows = conn.execute(
            """
            SELECT scope_key, member_id, directory
            FROM viewer_index_scope
            WHERE scope_type = 'artist'
              AND is_active = 1 AND last_discovered_at IS NOT NULL
            ORDER BY directory COLLATE NOCASE
            """
        ).fetchall()
        media_rows = conn.execute(
            """
            SELECT image.member_id, image.save_name
            FROM pixiv_master_image image
            WHERE NOT EXISTS (
                SELECT 1 FROM pixivutil2_trash_image trash
                WHERE trash.image_id = image.image_id
            )
            """
        ).fetchall()

    active_scopes: List[Dict[str, Any]] = []
    for row in scope_rows:
        directory = os.path.abspath(str(row["directory"] or ""))
        # A historical scope from another root may still exist in Viewer DB;
        # it must not leak into the currently configured root's navigator.
        if os.path.normcase(os.path.dirname(os.path.normpath(directory))) != os.path.normcase(root_directory):
            continue
        member_id = row["member_id"]
        if member_id is None:
            continue
        member_id = int(member_id)
        if member_id in hidden_artist_ids:
            continue
        active_scopes.append({
            "member_id": member_id,
            "directory": directory,
            "folder_name": os.path.basename(os.path.normpath(directory)),
            "artwork_count": 0,
        })

    direct_root_count = 0
    for row in media_rows:
        media_path = row["save_name"]
        if not should_keep_database_media(media_path):
            continue
        if not media_path:
            continue

        normalized_media_path = os.path.normcase(os.path.abspath(str(media_path)))
        for scope in active_scopes:
            normalized_scope = os.path.normcase(
                os.path.abspath(scope["directory"])
            )
            if normalized_media_path == normalized_scope or normalized_media_path.startswith(
                normalized_scope + os.sep
            ):
                scope["artwork_count"] += 1
                break
        if os.path.normcase(os.path.dirname(normalized_media_path)) == os.path.normcase(root_directory):
            direct_root_count += 1

    result: List[Dict[str, Any]] = [
        {
            "member_id": int(scope["member_id"]),
            "name": scope["folder_name"],
            "folder_name": scope["folder_name"],
            "artwork_count": int(scope["artwork_count"]),
        }
        for scope in active_scopes
    ]
    result.sort(key=lambda item: natural_sort_key(item.get("name") or ""))
    if direct_root_count:
        result.insert(0, {
            "member_id": -1,
            "name": "Uncategorized",
            "artwork_count": direct_root_count,
        })
    return result


def get_all_artists() -> List[Dict[str, Any]]:
    return _get_all_artists_from_viewer_snapshot()

    # Legacy disk-derived implementation retained below until all callers have
    # moved to the persistent scope model.
    import configparser
    init_db_schema()
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

    # The root snapshot is shared with the first gallery request. Counting
    # from it avoids one recursive HDD walk per artist during cold start.
    root_snapshot = _get_cached_file_scan(root_dir, recursive=True)
    artwork_counts: Dict[str, int] = {}
    direct_root_count = 0
    for record in root_snapshot["records"]:
        folder_path = _top_level_folder_for_path(root_dir, os.path.dirname(record["path"]))
        if folder_path is None:
            direct_root_count += 1
            continue
        folder_key = os.path.normcase(os.path.abspath(folder_path))
        artwork_counts[folder_key] = artwork_counts.get(folder_key, 0) + 1

    hidden_artist_ids = get_hidden_artist_ids()
    result = []
    with get_db_connection() as conn:
        cursor = conn.cursor()

        for folder_name in disk_folders:
            folder_path = os.path.join(root_dir, folder_name)

            member_row = cursor.execute(
                "SELECT member_id FROM pixiv_master_member WHERE name = ? OR name LIKE ? OR save_folder LIKE ?",
                (folder_name, f"%{folder_name}%", f"%{folder_name}%")
            ).fetchone()

            member_id = get_folder_member_id(
                folder_path,
                int(member_row["member_id"]) if member_row and member_row["member_id"] is not None else None,
            )
            if member_id in hidden_artist_ids:
                continue

            artwork_count = artwork_counts.get(os.path.normcase(os.path.abspath(folder_path)), 0)

            result.append({
                "member_id": member_id,
                "name": folder_name,
                "folder_name": folder_name,
                "artwork_count": artwork_count,
            })

        # The uncategorized bucket represents files directly in rootDirectory.
        if direct_root_count:
            result.insert(0, {
                "member_id": -1,
                "name": "未分類/單張根目錄圖片",
                "artwork_count": direct_root_count
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
            FROM pixiv_master_image image
            WHERE image.created_date IS NOT NULL AND image.created_date != ''
              AND NOT EXISTS (
                  SELECT 1 FROM viewer_hidden_artist hidden
                  WHERE hidden.member_id = image.member_id
                    AND hidden.unhidden_at IS NULL
              )
              AND NOT EXISTS (
                  SELECT 1 FROM pixivutil2_trash_image trash
                  WHERE trash.image_id = image.image_id
              )
            GROUP BY strftime('%Y-%m', image.created_date)
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


def _sort_gallery_items(items: List[Dict[str, Any]], sort_mode: str) -> List[Dict[str, Any]]:
    """Sort a snapshot result without consulting the source filesystem."""
    if sort_mode == "oldest":
        items.sort(key=lambda item: (
            item.get("created_date") or "",
            natural_sort_key(item.get("save_name") or ""),
        ))
        return items
    if sort_mode == "natural_name":
        items.sort(key=lambda item: natural_sort_key(item.get("save_name") or ""))
        return items

    month_groups: Dict[str, List[Dict[str, Any]]] = {}
    for item in items:
        month_key = (item.get("created_date") or "")[:7] or "?"
        month_groups.setdefault(month_key, []).append(item)

    descending_months = sort_mode not in {"oldest_month"}
    sorted_months = sorted(month_groups.keys(), reverse=descending_months)
    result: List[Dict[str, Any]] = []
    for month_key in sorted_months:
        group = month_groups[month_key]
        if sort_mode == "oldest_month":
            date_groups: Dict[str, List[Dict[str, Any]]] = {}
            for item in group:
                date_groups.setdefault((item.get("created_date") or "")[:10], []).append(item)
            for date_key in sorted(date_groups.keys(), reverse=True):
                date_group = date_groups[date_key]
                date_group.sort(key=lambda item: natural_sort_key(item.get("save_name") or ""))
                result.extend(date_group)
        elif sort_mode == "newest_month_oldest_works":
            group.sort(key=lambda item: (
                item.get("created_date") or "",
                natural_sort_key(item.get("save_name") or ""),
            ))
            result.extend(group)
        else:
            date_groups = {}
            for item in group:
                date_groups.setdefault((item.get("created_date") or "")[:10], []).append(item)
            for date_key in sorted(date_groups.keys(), reverse=True):
                date_group = date_groups[date_key]
                date_group.sort(key=lambda item: natural_sort_key(item.get("save_name") or ""))
                result.extend(date_group)
    return result


def _get_images_from_viewer_snapshot(
    month: Optional[str],
    artist_id: Optional[int],
    search: Optional[str],
    limit: int,
    offset: int,
    sort_mode: str,
) -> Tuple[List[Dict[str, Any]], int, List[Dict[str, Any]]]:
    """Read gallery data from Viewer SQLite only.

    This function is deliberately independent of ``os.walk``, ``scandir`` and
    per-file stat calls. An index job may be reconciling the source tree while
    this query is running; the last committed Viewer snapshot remains usable.
    """
    init_db_schema()
    month_list = [value.strip() for value in month.split(",") if value.strip()] if month else []
    hidden_artist_ids = get_hidden_artist_ids()
    artist_scope_directory: Optional[str] = None
    root_directory: Optional[str] = None
    if artist_id is not None and artist_id != -1:
        artist_scope = get_artist_scope(int(artist_id))
        if artist_scope is None:
            return [], 0, []
        artist_scope_directory = str(artist_scope["directory"])
    elif artist_id == -1:
        root_directory = get_configured_root_directory()
    items: List[Dict[str, Any]] = []

    with get_db_connection() as conn:
        conditions = [
            "NOT EXISTS (SELECT 1 FROM pixivutil2_trash_image trash WHERE trash.image_id = i.image_id)",
        ]
        params: List[Any] = []
        if month_list:
            month_conditions = []
            for value in month_list:
                month_conditions.append(
                    "strftime('%Y', i.created_date) = ?"
                    if len(value) == 4
                    else "strftime('%Y-%m', i.created_date) = ?"
                )
                params.append(value)
            conditions.append("(" + " OR ".join(month_conditions) + ")")
        if artist_id is not None:
            if artist_id == -1:
                conditions.append(
                    "(i.member_id IS NULL OR i.save_name LIKE ? COLLATE NOCASE ESCAPE '!')"
                )
                params.append(_sql_path_prefix_like(root_directory or get_configured_root_directory()))
            else:
                conditions.append(
                    "(i.member_id = ? OR i.save_name LIKE ? COLLATE NOCASE ESCAPE '!')"
                )
                params.extend([
                    int(artist_id),
                    _sql_path_prefix_like(artist_scope_directory or ""),
                ])
        if search:
            conditions.append(
                "(i.title LIKE ? OR m.name LIKE ? OR i.save_name LIKE ? OR CAST(i.image_id AS TEXT) LIKE ?)"
            )
            params.extend([f"%{search}%"] * 4)

        rows = conn.execute(
            f"""
            SELECT i.image_id, i.member_id, i.title, i.save_name,
                   i.created_date, i.last_update_date, m.name AS artist_name,
                   CASE WHEN metadata.is_present = 0 THEN 'missing' END AS media_status
            FROM pixiv_master_image i
            LEFT JOIN pixiv_master_member m ON i.member_id = m.member_id
            LEFT JOIN viewer_media_metadata metadata
              ON metadata.normalized_path = i.save_name COLLATE NOCASE
            WHERE {' AND '.join(conditions)}
            """,
            params,
        ).fetchall()
        items.extend(dict(row) for row in rows)

        manga_conditions = [
            "NOT EXISTS (SELECT 1 FROM pixivutil2_trash_image trash WHERE trash.image_id = mg.image_id)",
        ]
        manga_params: List[Any] = []
        if month_list:
            month_conditions = []
            for value in month_list:
                month_conditions.append(
                    "strftime('%Y', mg.created_date) = ?"
                    if len(value) == 4
                    else "strftime('%Y-%m', mg.created_date) = ?"
                )
                manga_params.append(value)
            manga_conditions.append("(" + " OR ".join(month_conditions) + ")")
        if artist_id is not None:
            if artist_id == -1:
                manga_conditions.append(
                    "(i.member_id IS NULL OR mg.save_name LIKE ? COLLATE NOCASE ESCAPE '!')"
                )
                manga_params.append(_sql_path_prefix_like(root_directory or get_configured_root_directory()))
            else:
                manga_conditions.append(
                    "(i.member_id = ? OR mg.save_name LIKE ? COLLATE NOCASE ESCAPE '!')"
                )
                manga_params.extend([
                    int(artist_id),
                    _sql_path_prefix_like(artist_scope_directory or ""),
                ])
        if search:
            manga_conditions.append(
                "(i.title LIKE ? OR m.name LIKE ? OR mg.save_name LIKE ? OR CAST(mg.image_id AS TEXT) LIKE ?)"
            )
            manga_params.extend([f"%{search}%"] * 4)

        try:
            manga_rows = conn.execute(
                f"""
                SELECT mg.image_id, i.member_id, i.title, mg.save_name,
                       mg.created_date, mg.last_update_date, m.name AS artist_name,
                       CASE WHEN metadata.is_present = 0 THEN 'missing' END AS media_status
                FROM pixiv_manga_image mg
                LEFT JOIN pixiv_master_image i ON mg.image_id = i.image_id
                LEFT JOIN pixiv_master_member m ON i.member_id = m.member_id
                LEFT JOIN viewer_media_metadata metadata
                  ON metadata.normalized_path = mg.save_name COLLATE NOCASE
                WHERE {' AND '.join(manga_conditions)}
                """,
                manga_params,
            ).fetchall()
        except sqlite3.OperationalError:
            manga_rows = []
        items.extend(dict(row) for row in manga_rows)

    # Keep the old behavior of hiding internal-tool state and hidden artists,
    # but do it against the stored paths rather than touching those paths.
    visible_items = [
        item for item in items
        if should_keep_database_media(item.get("save_name"))
        and not (artist_id is None and item.get("member_id") in hidden_artist_ids)
    ]
    if artist_scope_directory:
        # The first root path segment is authoritative. The SQL member_id
        # predicate above is only a narrowing hint for old imported rows; it
        # must not allow a row outside the selected artist directory through.
        visible_items = [
            item for item in visible_items
            if _stored_media_path_is_within(item.get("save_name"), artist_scope_directory)
        ]
    elif artist_id == -1 and root_directory:
        visible_items = [
            item for item in visible_items
            if _stored_media_path_is_direct_child(item.get("save_name"), root_directory)
        ]
    deduplicated: Dict[str, Dict[str, Any]] = {}
    for item in visible_items:
        path = item.get("save_name") or ""
        key = _normalise_media_path(path) if path else f"id:{item.get('image_id')}"
        deduplicated.setdefault(key, item)
    all_items = _sort_gallery_items(list(deduplicated.values()), sort_mode)
    _annotate_group_page_numbers(all_items)

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

    page_items = all_items[offset:offset + limit]
    if page_items:
        dominant_colors = get_dominant_colors([
            _normalise_media_path(item.get("save_name", ""))
            for item in page_items
            if item.get("save_name")
        ])
        for item in page_items:
            color = dominant_colors.get(_normalise_media_path(item.get("save_name", "")))
            if color:
                item["dominant_color"] = color
    return page_items, len(all_items), available_months


def get_images(
    month: Optional[str] = None,
    artist_id: Optional[int] = None,
    search: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
    only_show_db_files: bool = False,
    sort_mode: str = "newest"
) -> Tuple[List[Dict[str, Any]], int, List[Dict[str, Any]]]:
    # Gallery reads must never synchronously reconcile the source directory.
    # ``only_show_db_files`` remains in the signature for API compatibility;
    # both modes now use the last committed Viewer snapshot.
    return _get_images_from_viewer_snapshot(
        month,
        artist_id,
        search,
        limit,
        offset,
        sort_mode,
    )

    # Legacy fallback retained below until the snapshot migration is complete.
    db_items = []
    hidden_artist_ids = get_hidden_artist_ids() if os.path.exists(DB_PATH) else set()
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
    db_items = [
        item for item in db_items
        if should_keep_database_media(item.get("save_name"))
        and not (artist_id is None and item.get("member_id") in hidden_artist_ids)
    ]

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
                try:
                    root_entries = sorted(
                        (
                            entry
                            for entry in os.scandir(root_dir)
                            if entry.is_dir()
                            and not entry.name.startswith(".")
                            and not is_internal_directory_name(entry.name)
                        ),
                        key=lambda entry: natural_sort_key(entry.name),
                    )
                except OSError:
                    root_entries = []
                for entry in root_entries:
                    if get_folder_member_id(entry.path) == artist_id:
                        target_scan_dir = entry.path
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
                    artist_folder = _top_level_folder_for_path(root_dir, os.path.dirname(full_path))
                    discovered_member_id = (
                        -1
                        if artist_folder is None
                        else get_folder_member_id(artist_folder)
                    )
                    if artist_id is None and discovered_member_id in hidden_artist_ids:
                        continue
                    art_name = parts[0] if len(parts) > 1 else os.path.basename(target_scan_dir)

                    new_item = {
                        "image_id": item_id,
                        "member_id": artist_id if artist_id is not None else discovered_member_id,
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
    if os.path.exists(DB_PATH) and page_items:
        color_paths = [_normalise_media_path(item.get("save_name", "")) for item in page_items if item.get("save_name")]
        dominant_colors = get_dominant_colors(color_paths)
        for item in page_items:
            color = dominant_colors.get(_normalise_media_path(item.get("save_name", "")))
            if color:
                item["dominant_color"] = color
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
    if not os.path.exists(DB_PATH) or (not unique_ids and not moved_records):
        return 0

    init_db_schema()
    moved_by_record = {
        (int(image_id), _path_key(database_path)): (original_path, trash_path)
        for image_id, database_path, original_path, trash_path in moved_records
    }

    with get_db_connection() as conn:
        cursor = conn.cursor()
        placeholders = ",".join(["?"] * len(unique_ids))
        master_rows = []
        if unique_ids:
            master_rows = cursor.execute(
                f"""
                    SELECT image_id, save_name
                    FROM pixiv_master_image
                    WHERE image_id IN ({placeholders})
                """,
                unique_ids,
            ).fetchall()
        manga_rows = []
        if unique_ids:
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
        already_trashed = set()
        if unique_ids:
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

        paths_by_id: Dict[int, List[str]] = {}
        for row in [*master_rows, *manga_rows]:
            image_id = int(row["image_id"])
            if image_id not in ids_to_mark:
                continue
            path = row["save_name"] or ""
            if path and path not in paths_by_id.setdefault(image_id, []):
                paths_by_id[image_id].append(path)

        trashed_at = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())
        inserted_ids = set()
        inserted_keys = set()
        for image_id in sorted(ids_to_mark):
            paths = paths_by_id.get(image_id) or [""]
            for database_path in paths:
                moved = moved_by_record.get((image_id, _path_key(database_path)))
                original_path = moved[0] if moved else database_path
                trash_path = moved[1] if moved else None
                record_key = (image_id, _path_key(original_path))
                if record_key in inserted_keys:
                    continue
                cursor.execute(
                    """
                        INSERT INTO pixivutil2_trash_image
                        (image_id, original_path, trash_path, trashed_at)
                        VALUES (?, ?, ?, ?)
                    """,
                    (image_id, original_path, trash_path, trashed_at),
                )
                inserted_keys.add(record_key)
                inserted_ids.add(image_id)

        # Disk-only files receive deterministic synthetic IDs and have no
        # pixiv_master_image row. Keep those moved files visible in the
        # recycle page as well, instead of silently losing the recovery record.
        for image_id, _database_path, original_path, trash_path in moved_records:
            image_id = int(image_id)
            record_key = (image_id, _path_key(original_path))
            if record_key in inserted_keys:
                continue
            existing_row = cursor.execute(
                """
                    SELECT 1
                    FROM pixivutil2_trash_image
                    WHERE image_id = ? AND original_path = ?
                    LIMIT 1
                """,
                (image_id, original_path),
            ).fetchone()
            if existing_row:
                continue
            cursor.execute(
                """
                    INSERT INTO pixivutil2_trash_image
                    (image_id, original_path, trash_path, trashed_at)
                    VALUES (?, ?, ?, ?)
                """,
                (image_id, original_path, trash_path, trashed_at),
            )
            inserted_keys.add(record_key)
            inserted_ids.add(image_id)
        conn.commit()
    return len(inserted_ids)
