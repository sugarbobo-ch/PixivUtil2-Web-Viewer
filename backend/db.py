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


def get_all_artists() -> List[Dict[str, Any]]:
    if not os.path.exists(DB_PATH):
        return []
    with get_db_connection() as conn:
        cursor = conn.cursor()
        query = """
            SELECT m.member_id, m.name, COUNT(i.image_id) as artwork_count
            FROM pixiv_master_member m
            LEFT JOIN pixiv_master_image i ON m.member_id = i.member_id
            GROUP BY m.member_id
            ORDER BY m.name ASC
        """
        rows = cursor.execute(query).fetchall()
        return [dict(r) for r in rows]


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
    offset: int = 0
) -> List[Dict[str, Any]]:
    if not os.path.exists(DB_PATH):
        return []
    with get_db_connection() as conn:
        cursor = conn.cursor()
        conditions = []
        params = []

        if month:
            conditions.append("strftime('%Y-%m', i.created_date) = ?")
            params.append(month)
        if artist_id:
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
            LIMIT ? OFFSET ?
        """
        params.extend([limit, offset])
        rows = cursor.execute(query, params).fetchall()
        return [dict(r) for r in rows]


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
