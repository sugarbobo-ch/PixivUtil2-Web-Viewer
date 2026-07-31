# -*- coding: utf-8 -*-
import os
import sqlite3
from typing import List, Dict, Any, Optional

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "db.sqlite"))


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
        conn.commit()


def scan_and_index_directory(target_dir: str) -> Dict[str, Any]:
    init_db_schema()
    abs_dir = os.path.abspath(target_dir)
    if not os.path.exists(abs_dir):
        return {"scanned": 0, "indexed": 0, "error": f"Directory does not exist: {abs_dir}"}

    import re, time
    valid_exts = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4"}
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

        for root, _, files in os.walk(abs_dir):
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext not in valid_exts:
                    continue
                scanned_count += 1
                full_path = os.path.join(root, file)

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

    return {"scanned": scanned_count, "indexed": indexed_count, "directory": abs_dir}


def clean_orphaned_records() -> Dict[str, int]:
    """Deletes orphaned DB entries with 0 images or fake filename artist entries."""
    if not os.path.exists(DB_PATH):
        return {"deleted_members": 0}

    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # Delete members with no associated images in DB
        cursor.execute("""
            DELETE FROM pixiv_master_member 
            WHERE member_id NOT IN (SELECT DISTINCT member_id FROM pixiv_master_image WHERE member_id IS NOT NULL)
        """)
        deleted_members = cursor.rowcount

        # Delete fake member names created from filenames (e.g. containing _p0 or raw image filenames)
        cursor.execute("""
            DELETE FROM pixiv_master_member
            WHERE name LIKE '%_p%' OR name LIKE '%.jpg' OR name LIKE '%.png' OR name LIKE '%.jpeg'
        """)
        deleted_members += cursor.rowcount

        conn.commit()
    return {"deleted_members": deleted_members}


import time

_SCAN_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL = 20.0


def get_folder_files_fast(folder_path: str) -> List[str]:
    now = time.time()
    abs_folder = os.path.abspath(folder_path)
    if abs_folder in _SCAN_CACHE:
        cached = _SCAN_CACHE[abs_folder]
        if now - cached["timestamp"] < CACHE_TTL:
            return cached["files"]

    valid_exts = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4"}
    file_list = []
    if os.path.exists(abs_folder):
        try:
            for root, _, files in os.walk(abs_folder):
                for f in files:
                    ext = os.path.splitext(f)[1].lower()
                    if ext in valid_exts:
                        file_list.append(os.path.abspath(os.path.join(root, f)))
        except Exception as ex:
            print(f"Error scanning folder {abs_folder}: {ex}")

    _SCAN_CACHE[abs_folder] = {
        "timestamp": now,
        "files": file_list
    }
    return file_list


def get_all_artists() -> List[Dict[str, Any]]:
    import configparser
    config_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "config.ini"))
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
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
            if os.path.isdir(os.path.join(root_dir, f)) and not f.startswith(".")
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
                "artwork_count": artwork_count
            })

        # Check for unassigned images in root folder
        null_count_row = cursor.execute("SELECT COUNT(*) as count FROM pixiv_master_image WHERE member_id IS NULL").fetchone()
        null_count = null_count_row["count"] if null_count_row else 0
        if null_count > 0:
            result.insert(0, {
                "member_id": -1,
                "name": "未分類/單張根目錄圖片",
                "artwork_count": null_count
            })

    return result


def get_all_months() -> List[Dict[str, Any]]:
    if not os.path.exists(DB_PATH):
        return []
    with get_db_connection() as conn:
        cursor = conn.cursor()
        query = """
            SELECT strftime('%Y-%m', created_date) as month, COUNT(*) as count
            FROM pixiv_master_image
            WHERE created_date IS NOT NULL AND created_date != ''
            GROUP BY month
            ORDER BY month DESC
        """
        rows = cursor.execute(query).fetchall()
        return [dict(r) for r in rows if r["month"]]


def get_images(
    month: Optional[str] = None,
    artist_id: Optional[int] = None,
    search: Optional[str] = None,
    limit: int = 200,
    offset: int = 0,
    only_show_db_files: bool = False
) -> List[Dict[str, Any]]:
    db_items = []
    if os.path.exists(DB_PATH):
        with get_db_connection() as conn:
            cursor = conn.cursor()
            conditions = []
            params = []

            if month:
                if len(month) == 4:
                    conditions.append("strftime('%Y', i.created_date) = ?")
                else:
                    conditions.append("strftime('%Y-%m', i.created_date) = ?")
                params.append(month)
            if artist_id is not None:
                if artist_id == -1:
                    conditions.append("i.member_id IS NULL")
                else:
                    conditions.append("i.member_id = ?")
                    params.append(artist_id)
            if search:
                conditions.append("(i.title LIKE ? OR m.name LIKE ?)")
                params.extend([f"%{search}%", f"%{search}%"])

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
                ORDER BY i.created_date DESC
            """
            rows = cursor.execute(query, params).fetchall()
            db_items = [dict(r) for r in rows]

    if only_show_db_files:
        return db_items[offset:offset+limit]

    # If only_show_db_files is False (default):
    # Recursively scan disk files for the selected folder to merge non-DB files dynamically
    import configparser, time
    config_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "config.ini"))
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    if os.path.exists(config_path):
        try:
            config = configparser.ConfigParser(interpolation=None)
            config.read(config_path, encoding="utf-8")
            cfg_dir = config.get("Settings", "rootDirectory", fallback=".")
            if cfg_dir and cfg_dir != ".":
                root_dir = os.path.abspath(cfg_dir)
        except Exception:
            pass

    target_scan_dir = None
    if artist_id is not None and artist_id != -1:
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
    for item in db_items:
        if item.get("save_name"):
            existing_paths[os.path.abspath(item["save_name"])] = item

    all_items = list(db_items)

    if target_scan_dir and os.path.exists(target_scan_dir):
        fast_files = get_folder_files_fast(target_scan_dir)
        for full_path in fast_files:
            if full_path not in existing_paths:
                file = os.path.basename(full_path)
                mtime = os.path.getmtime(full_path)
                created_date = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(mtime))
                item_id = abs(hash(full_path)) % 1000000000
                new_item = {
                    "image_id": item_id,
                    "member_id": artist_id,
                    "title": os.path.splitext(file)[0],
                    "save_name": full_path,
                    "created_date": created_date,
                    "last_update_date": created_date,
                    "artist_name": os.path.basename(target_scan_dir)
                }
                all_items.append(new_item)
                existing_paths[full_path] = new_item

    if search:
        s_lower = search.lower()
        all_items = [
            it for it in all_items
            if s_lower in (it.get("title") or "").lower() or s_lower in (it.get("artist_name") or "").lower()
        ]

    all_items.sort(key=lambda x: x.get("created_date") or "", reverse=True)
    return all_items[offset:offset+limit]


def delete_image_records(image_ids: List[int]) -> List[str]:
    """Deletes entries from SQLite DB and returns physical file paths to be deleted."""
    if not os.path.exists(DB_PATH) or not image_ids:
        return []
    paths_to_delete = []
    with get_db_connection() as conn:
        cursor = conn.cursor()
        placeholders = ",".join(["?"] * len(image_ids))
        rows = cursor.execute(
            f"SELECT save_name FROM pixiv_master_image WHERE image_id IN ({placeholders})", image_ids
        ).fetchall()
        paths_to_delete = [r["save_name"] for r in rows if r["save_name"]]

        cursor.execute(f"DELETE FROM pixiv_master_image WHERE image_id IN ({placeholders})", image_ids)
        cursor.execute(f"DELETE FROM pixiv_manga_image WHERE image_id IN ({placeholders})", image_ids)
        conn.commit()
    return paths_to_delete
