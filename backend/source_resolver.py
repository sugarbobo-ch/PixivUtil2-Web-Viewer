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
import json
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
_ARTIST_CACHE: Dict[str, Tuple[float, Any]] = {}
_FANBOX_REDIRECT_CACHE: Dict[Tuple[int, Optional[int]], Tuple[float, Any]] = {}
_FANBOX_CREATOR_CACHE: Dict[str, Tuple[float, Any]] = {}

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
    if not verified_url and user_id > 0 and post_id > 0:
        verified_url = f"https://www.pixiv.net/fanbox/creator/{user_id}/post/{post_id}"
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


def _path_is_in_folder(path: Optional[str], folder_path: str) -> bool:
    if not path:
        return False
    try:
        normalised_path = _normalise_path(path)
        normalised_folder = _normalise_path(folder_path)
        return os.path.commonpath((normalised_path, normalised_folder)) == normalised_folder
    except (OSError, TypeError, ValueError):
        return False


def _find_folder_artwork_member_id(folder_path: str) -> Optional[int]:
    """Return a member ID only when the folder's source rows agree on one.

    Folder scans may assign a synthetic gallery identity.  The PixivUtil2
    artwork/post relationship is the authoritative fallback for the real
    Pixiv member ID; ambiguous folders deliberately produce no link.
    """
    connection = _read_only_connection()
    if not connection:
        return None

    absolute_folder = os.path.abspath(folder_path).rstrip("/\\")

    def like_pattern(path_prefix: str) -> str:
        escaped = path_prefix.replace("!", "!!").replace("%", "!%").replace("_", "!_")
        return f"{escaped}%"

    windows_prefix = like_pattern(f"{absolute_folder}\\")
    slash_prefix = like_pattern(f"{absolute_folder.replace(os.sep, '/').rstrip('/')}/")
    member_ids: set[int] = set()
    try:
        queries = (
            (
                """
                SELECT member_id, save_name
                FROM pixiv_master_image
                WHERE member_id IS NOT NULL
                  AND (save_name LIKE ? ESCAPE '!' OR save_name LIKE ? ESCAPE '!')
                """,
                (windows_prefix, slash_prefix),
            ),
            (
                """
            SELECT p.member_id, i.save_name
            FROM fanbox_post_image i
            JOIN fanbox_master_post p ON p.post_id = i.post_id
            WHERE p.member_id IS NOT NULL
              AND (i.save_name LIKE ? ESCAPE '!' OR i.save_name LIKE ? ESCAPE '!')
                """,
                (windows_prefix, slash_prefix),
            ),
        )
        for query, params in queries:
            try:
                rows = connection.execute(query, params).fetchall()
            except sqlite3.Error:
                continue
            for row in rows:
                if _path_is_in_folder(row["save_name"], folder_path):
                    member_id = int(row["member_id"] or 0)
                    if member_id > 0:
                        member_ids.add(member_id)
                    if len(member_ids) > 1:
                        return None
    finally:
        connection.close()
    return next(iter(member_ids), None)


def _normalise_custom_fanbox_url(value: Optional[str]) -> Optional[str]:
    clean_value = str(value or "").strip()
    if not clean_value:
        return None
    if clean_value.isdigit():
        return f"https://www.pixiv.net/fanbox/creator/{clean_value}"
    if "://" not in clean_value:
        clean_value = f"https://{clean_value}.fanbox.cc"
    try:
        parsed = urlsplit(clean_value)
    except ValueError:
        return None
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme.lower() != "https":
        return None
    if host == "www.pixiv.net" and parsed.path.startswith("/fanbox/creator/"):
        return clean_value
    if host == "fanbox.cc" or host.endswith(".fanbox.cc"):
        return clean_value
    return None


def _fanbox_creator_key(value: Optional[str]) -> Optional[str]:
    """Extract a FANBOX creator slug from a configured creator URL."""
    normalised_url = _normalise_custom_fanbox_url(value)
    if not normalised_url:
        return None
    try:
        parsed = urlsplit(normalised_url)
    except ValueError:
        return None

    host = (parsed.hostname or "").lower().rstrip(".")
    segments = [segment for segment in parsed.path.split("/") if segment]
    if host == "www.pixiv.net" and len(segments) >= 3 and segments[:2] == ["fanbox", "creator"]:
        creator_id = segments[2]
        return creator_id if creator_id.isdigit() else None
    if host == "fanbox.cc" or host == "www.fanbox.cc":
        if segments and segments[0].startswith("@"):
            return segments[0][1:] or None
        return None
    if host.endswith(".fanbox.cc"):
        return host[: -len(".fanbox.cc")]
    return None


def _resolve_fanbox_creator_member_id(value: Optional[str]) -> Optional[int]:
    """Resolve a FANBOX creator slug to its linked Pixiv user ID.

    A FANBOX subdomain is not a Pixiv member ID.  Use FANBOX's public creator
    endpoint to obtain the linked ``body.user.userId`` instead of guessing
    from a local synthetic gallery ID.
    """
    creator_key = _fanbox_creator_key(value)
    if not creator_key:
        return None
    if creator_key.isdigit():
        return int(creator_key)

    cached, cached_value = _get_cached(_FANBOX_CREATOR_CACHE, creator_key)
    if cached:
        return cached_value

    request = Request(
        "https://api.fanbox.cc/creator.get?creatorId=" + quote(creator_key, safe=""),
        headers={
            "Accept": "application/json",
            "Origin": "https://fanbox.cc",
            "Referer": "https://fanbox.cc/",
            "User-Agent": "Mozilla/5.0 (PixivUtil2 Web Viewer)",
        },
    )
    member_id: Optional[int] = None
    try:
        with urlopen(request, timeout=REDIRECT_TIMEOUT) as response:
            raw_payload = response.read()
        if isinstance(raw_payload, bytes):
            raw_payload = raw_payload.decode("utf-8")
        payload = json.loads(raw_payload)
        raw_member_id = payload.get("body", {}).get("user", {}).get("userId")
        candidate = int(raw_member_id or 0)
        if candidate > 0:
            member_id = candidate
    except (HTTPError, URLError, OSError, TimeoutError, ValueError, TypeError, AttributeError, json.JSONDecodeError):
        member_id = None

    return _set_cached(_FANBOX_CREATOR_CACHE, creator_key, member_id)


def _is_synthetic_member_id(value: Optional[int]) -> bool:
    if value is None:
        return False
    return db.SYNTHETIC_MEMBER_ID_BASE <= value < (
        db.SYNTHETIC_MEMBER_ID_BASE + db.SYNTHETIC_MEMBER_ID_RANGE
    )


def resolve_artist_source(artist_id: int, folder_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Resolve independently verified Pixiv and FANBOX artist links."""
    if artist_id <= 0:
        return None

    folder = db.get_managed_folder(folder_id) if folder_id else None
    cache_key = ":".join((
        str(artist_id),
        str(folder_id or ""),
        str(folder.get("identity_status") or "") if folder else "",
        str(folder.get("member_id") or "") if folder else "",
        str(folder.get("fanbox_id") or "") if folder else "",
        str(folder.get("current_path") or "") if folder else "",
    ))
    cached, value = _get_cached(_ARTIST_CACHE, cache_key)
    if cached:
        return value

    custom_fanbox: Optional[str] = None
    verified_member_id: Optional[int] = None
    explicit_folder_member_id: Optional[int] = None
    artwork_member_id: Optional[int] = None
    if folder:
        if folder.get("identity_status") == "rejected":
            return _set_cached(_ARTIST_CACHE, cache_key, None)
        custom_fanbox = folder.get("fanbox_id")
        current_path = folder.get("current_path") or folder.get("folder_name") or ""
        explicit_folder_member_id = _get_explicit_member_id(
            os.path.join(str(current_path), "placeholder")
        )
        if explicit_folder_member_id is None and folder.get("current_path"):
            artwork_member_id = _find_folder_artwork_member_id(str(folder["current_path"]))

    fanbox_url = _normalise_custom_fanbox_url(custom_fanbox)
    fanbox_member_id = _resolve_fanbox_creator_member_id(custom_fanbox)
    if fanbox_member_id is not None:
        verified_member_id = fanbox_member_id
    elif explicit_folder_member_id is not None:
        verified_member_id = explicit_folder_member_id
    elif artwork_member_id is not None:
        verified_member_id = artwork_member_id
    elif not custom_fanbox and folder and folder.get("identity_status") == "verified":
        candidate = int(folder.get("member_id") or 0)
        verified_member_id = candidate if candidate > 0 and not _is_synthetic_member_id(candidate) else None
    elif not folder:
        verified_member_id = _find_artist_identity(artist_id)

    pixiv_link = (
        _source_link(
            "pixiv",
            f"https://www.pixiv.net/users/{verified_member_id}",
            verified_member_id,
        )
        if verified_member_id and verified_member_id > 0
        else None
    )

    if not fanbox_url and verified_member_id:
        fanbox_url = _follow_pixiv_fanbox_redirect(verified_member_id, None)
    fanbox_source_id = verified_member_id or artist_id
    fanbox_link = (
        _source_link("fanbox", fanbox_url, fanbox_source_id)
        if fanbox_url and fanbox_source_id > 0
        else None
    )

    if not pixiv_link and not fanbox_link:
        return _set_cached(_ARTIST_CACHE, cache_key, None)

    result: Dict[str, Any] = {
        "verified_member_id": verified_member_id,
        "pixiv": pixiv_link,
        "fanbox": fanbox_link,
    }
    return _set_cached(_ARTIST_CACHE, cache_key, result)
