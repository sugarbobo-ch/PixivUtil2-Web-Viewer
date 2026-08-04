# -*- coding: utf-8 -*-
"""Resolve source pages for local media without changing PixivUtil2 data.

The viewer receives local paths, not the original FANBOX URL.  This module
uses the existing read-only SQLite relationships when available, and only
uses the numeric identifiers that are already present in a PixivUtil2 folder
name or a recognised FANBOX filename pattern as a fallback.  FANBOX slugs are
never constructed from display names: the official Pixiv redirect is followed
and its final URL is strictly validated before it is returned to the browser.
"""

import os
import re
import sqlite3
import time
from typing import Any, Dict, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen

import db


SOURCE_CACHE_TTL = 10 * 60
REDIRECT_TIMEOUT = 8
_SOURCE_CACHE: Dict[str, Tuple[float, Any]] = {}
_ARTIST_CACHE: Dict[int, Tuple[float, Any]] = {}
_FANBOX_REDIRECT_CACHE: Dict[Tuple[int, Optional[int]], Tuple[float, Any]] = {}

_EXPLICIT_MEMBER_ID_PATTERN = re.compile(r"(?:\((\d{4,12})\)|\[(\d{4,12})\])\s*$")
_FANBOX_POST_FILENAME_PATTERN = re.compile(r"^(\d{5,12})(?:[_-])")


def _normalise_path(path: Optional[str]) -> str:
    if not path:
        return ""
    return os.path.normcase(os.path.normpath(os.path.abspath(str(path).strip())))


def _read_only_connection() -> Optional[sqlite3.Connection]:
    if not os.path.isfile(db.PIXIV_DB_PATH):
        return None

    # SQLite's read-only URI prevents this feature from creating journals or
    # making accidental schema/data changes while PixivUtil2 owns the DB.
    uri_path = os.path.abspath(db.PIXIV_DB_PATH).replace("\\", "/")
    try:
        connection = sqlite3.connect(
            f"file:{quote(uri_path, safe='/:')}?mode=ro",
            uri=True,
        )
        connection.row_factory = sqlite3.Row
        return connection
    except (OSError, sqlite3.Error):
        return None


def _get_cached(
    cache: Dict[Any, Tuple[float, Any]],
    key: Any,
) -> Tuple[bool, Any]:
    cached = cache.get(key)
    if cached and time.monotonic() - cached[0] < SOURCE_CACHE_TTL:
        return True, cached[1]
    if cached:
        cache.pop(key, None)
    return False, None


def _set_cached(
    cache: Dict[Any, Tuple[float, Any]],
    key: Any,
    value: Any,
) -> Any:
    cache[key] = (time.monotonic(), value)
    return value


def _source_link(platform: str, url: str, source_id: int) -> Dict[str, Any]:
    return {
        "platform": platform,
        "url": url,
        "source_id": str(source_id),
        "verified": True,
    }


def _get_explicit_member_id(path: str) -> Optional[int]:
    # Search directories only.  A number in the image title is not a user id.
    normalised = os.path.normpath(os.path.abspath(path))
    for directory in reversed(normalised.split(os.sep)[:-1]):
        match = _EXPLICIT_MEMBER_ID_PATTERN.search(directory)
        if match:
            return int(match.group(1) or match.group(2))
    return None


def _get_fanbox_post_id_from_filename(path: str) -> Optional[int]:
    filename = os.path.basename(os.path.normpath(path))
    match = _FANBOX_POST_FILENAME_PATTERN.match(filename)
    return int(match.group(1)) if match else None


def _find_fanbox_row(connection: sqlite3.Connection, path: str) -> Optional[Dict[str, Any]]:
    normalised = _normalise_path(path)
    try:
        row = connection.execute(
            """
            SELECT i.post_id, p.member_id, i.save_name
            FROM fanbox_post_image i
            LEFT JOIN fanbox_master_post p ON p.post_id = i.post_id
            WHERE i.save_name = ?
            LIMIT 1
            """,
            (path,),
        ).fetchone()
        if row:
            return dict(row)

        # PixivUtil2 may have stored a different slash/case representation of
        # the same Windows path.  Compare normalised values without writing a
        # normalised copy back to SQLite.
        rows = connection.execute(
            """
            SELECT i.post_id, p.member_id, i.save_name
            FROM fanbox_post_image i
            LEFT JOIN fanbox_master_post p ON p.post_id = i.post_id
            """
        ).fetchall()
        for candidate in rows:
            if _normalise_path(candidate["save_name"]) == normalised:
                return dict(candidate)
    except sqlite3.Error:
        return None
    return None


def _find_pixiv_row(connection: sqlite3.Connection, path: str) -> Optional[Dict[str, Any]]:
    normalised = _normalise_path(path)
    try:
        row = connection.execute(
            """
            SELECT image_id, member_id, save_name
            FROM pixiv_master_image
            WHERE save_name = ?
            LIMIT 1
            """,
            (path,),
        ).fetchone()
        if row:
            return dict(row)

        rows = connection.execute(
            "SELECT image_id, member_id, save_name FROM pixiv_master_image"
        ).fetchall()
        for candidate in rows:
            if _normalise_path(candidate["save_name"]) == normalised:
                return dict(candidate)

        row = connection.execute(
            """
            SELECT m.image_id, p.member_id, m.save_name
            FROM pixiv_manga_image m
            LEFT JOIN pixiv_master_image p ON p.image_id = m.image_id
            WHERE m.save_name = ?
            LIMIT 1
            """,
            (path,),
        ).fetchone()
        if row:
            return dict(row)

        rows = connection.execute(
            """
            SELECT m.image_id, p.member_id, m.save_name
            FROM pixiv_manga_image m
            LEFT JOIN pixiv_master_image p ON p.image_id = m.image_id
            """
        ).fetchall()
        for candidate in rows:
            if _normalise_path(candidate["save_name"]) == normalised:
                return dict(candidate)
    except sqlite3.Error:
        return None
    return None


def _validated_fanbox_url(final_url: str, expected_post_id: Optional[int]) -> Optional[str]:
    try:
        parsed = urlsplit(final_url)
    except ValueError:
        return None

    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme.lower() != "https":
        return None
    if host != "fanbox.cc" and not host.endswith(".fanbox.cc"):
        return None

    path = parsed.path or "/"
    if expected_post_id is not None:
        segments = [segment for segment in path.split("/") if segment]
        if len(segments) < 2 or segments[-2].lower() != "posts":
            return None
        if segments[-1] != str(expected_post_id):
            return None
        path = f"/posts/{expected_post_id}"
    elif not path.startswith("/"):
        path = f"/{path}"

    return f"https://{host}{path}"


def _follow_pixiv_fanbox_redirect(user_id: int, post_id: Optional[int]) -> Optional[str]:
    if user_id <= 0 or (post_id is not None and post_id <= 0):
        return None

    key = (user_id, post_id)
    cached, value = _get_cached(_FANBOX_REDIRECT_CACHE, key)
    if cached:
        return value

    suffix = f"/post/{post_id}" if post_id is not None else ""
    redirect_url = f"https://www.pixiv.net/fanbox/creator/{user_id}{suffix}"
    request = Request(
        redirect_url,
        headers={
            "Accept": "text/html,application/xhtml+xml",
            "User-Agent": "Mozilla/5.0 (PixivUtil2 Web Viewer)",
        },
    )
    final_url: Optional[str] = None
    try:
        with urlopen(request, timeout=REDIRECT_TIMEOUT) as response:
            final_url = response.geturl()
    except (HTTPError, URLError, OSError, TimeoutError, ValueError):
        final_url = None

    return _set_cached(
        _FANBOX_REDIRECT_CACHE,
        key,
        _validated_fanbox_url(final_url, post_id) if final_url else None,
    )


def _resolve_fanbox_source(path: str) -> Optional[Dict[str, Any]]:
    connection = _read_only_connection()
    row: Optional[Dict[str, Any]] = None
    try:
        if connection:
            row = _find_fanbox_row(connection, path)
    finally:
        if connection:
            connection.close()

    if row:
        post_id = int(row["post_id"]) if row.get("post_id") else None
        user_id = int(row["member_id"]) if row.get("member_id") else None
    else:
        # This fallback is intentionally narrow: it only applies to a path
        # whose directory is explicitly labelled FANBOX and whose filename
        # follows PixivUtil2's numeric post-id prefix convention.  Custom
        # filename formats without those identifiers simply have no link.
        if "fanbox" not in path.casefold():
            return None
        user_id = _get_explicit_member_id(path)
        post_id = _get_fanbox_post_id_from_filename(path)

    if not user_id:
        user_id = _get_explicit_member_id(path)
    if not post_id:
        post_id = _get_fanbox_post_id_from_filename(path)
    if not user_id or not post_id:
        return None

    verified_url = _follow_pixiv_fanbox_redirect(user_id, post_id)
    return _source_link("fanbox", verified_url, post_id) if verified_url else None


def _resolve_pixiv_source(path: str) -> Optional[Dict[str, Any]]:
    connection = _read_only_connection()
    try:
        if not connection:
            return None
        row = _find_pixiv_row(connection, path)
    finally:
        if connection:
            connection.close()

    if not row or not row.get("image_id"):
        return None
    image_id = int(row["image_id"])
    return _source_link("pixiv", f"https://www.pixiv.net/artworks/{image_id}", image_id)


def resolve_source_link(path: Optional[str]) -> Optional[Dict[str, Any]]:
    """Return one verified source page for a local media path, or ``None``."""
    if not path or db.is_internal_media_path(path):
        return None

    cache_key = _normalise_path(path)
    if not cache_key:
        return None
    cached, value = _get_cached(_SOURCE_CACHE, cache_key)
    if cached:
        return value

    # A FANBOX path can also exist in pixiv_master_image after a directory
    # scan, so FANBOX's explicit post relationship must win.  If that relation
    # cannot be confirmed, do not mislabel the file as a Pixiv artwork.
    result = _resolve_fanbox_source(path)
    if not result and "fanbox" not in path.casefold():
        result = _resolve_pixiv_source(path)
    return _set_cached(_SOURCE_CACHE, cache_key, result)


def _find_artist_identity(artist_id: int) -> Optional[int]:
    if artist_id <= 0:
        return None

    root_dir = db.get_configured_root_directory()
    try:
        folder_names = [
            name
            for name in os.listdir(root_dir)
            if os.path.isdir(os.path.join(root_dir, name))
            and not name.startswith(".")
            and not db.is_internal_directory_name(name)
        ]
    except OSError:
        folder_names = []

    # Resolve the same deterministic folder identity used by the gallery, then
    # trust only an explicit numeric suffix in the folder name.
    stable_matches = [
        name
        for name in folder_names
        if db.get_folder_member_id(os.path.join(root_dir, name)) == artist_id
    ]
    for name in stable_matches:
        explicit_id = _get_explicit_member_id(os.path.join(root_dir, name, "placeholder"))
        if explicit_id:
            return explicit_id

    explicit_matches = []
    for name in folder_names:
        explicit_id = _get_explicit_member_id(os.path.join(root_dir, name, "placeholder"))
        if explicit_id == artist_id:
            explicit_matches.append(explicit_id)
    if explicit_matches:
        return explicit_matches[0]

    connection = _read_only_connection()
    try:
        if not connection:
            return None
        for query in (
            "SELECT member_id FROM pixiv_master_member WHERE member_id = ? LIMIT 1",
            "SELECT member_id FROM fanbox_master_post WHERE member_id = ? LIMIT 1",
        ):
            try:
                row = connection.execute(query, (artist_id,)).fetchone()
            except sqlite3.Error:
                row = None
            if row:
                return int(row["member_id"])
    finally:
        if connection:
            connection.close()
    return None


def resolve_artist_source(artist_id: int) -> Optional[Dict[str, Any]]:
    """Resolve verified Pixiv/FANBOX artist links for the selected artist."""
    cached, value = _get_cached(_ARTIST_CACHE, artist_id)
    if cached:
        return value

    verified_member_id = _find_artist_identity(artist_id)
    if not verified_member_id:
        return _set_cached(_ARTIST_CACHE, artist_id, None)

    fanbox_url = _follow_pixiv_fanbox_redirect(verified_member_id, None)
    result: Dict[str, Any] = {
        "verified_member_id": verified_member_id,
        "pixiv": _source_link(
            "pixiv",
            f"https://www.pixiv.net/users/{verified_member_id}",
            verified_member_id,
        ),
        "fanbox": (
            _source_link("fanbox", fanbox_url, verified_member_id)
            if fanbox_url
            else None
        ),
    }
    return _set_cached(_ARTIST_CACHE, artist_id, result)
