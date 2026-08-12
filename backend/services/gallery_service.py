"""Read-side boundary for Viewer gallery metadata and filters."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple, Union

import db


class GalleryService:
    """Keep route handlers independent from the database facade during migration."""

    def images(
        self,
        *,
        month: Optional[str] = None,
        artist_id: Optional[Union[int, str]] = None,
        search: Optional[str] = None,
        limit: int = 200,
        offset: int = 0,
        only_db: bool = False,
        sort_mode: str = "newest",
    ) -> Tuple[List[Dict[str, Any]], int, List[Dict[str, Any]]]:
        return db.get_images(
            month=month,
            artist_id=artist_id,
            search=search,
            limit=limit,
            offset=offset,
            only_show_db_files=only_db,
            sort_mode=sort_mode,
        )

    def artists(self) -> List[Dict[str, Any]]:
        return db.get_all_artists()

    def hidden_artists(self) -> List[Dict[str, Any]]:
        return db.get_hidden_artists()

    def months(self) -> List[Dict[str, Any]]:
        return db.get_all_months()

    def hide_artist(
        self,
        artist_key: Union[int, str],
        folder_name: str = "",
        member_id: Optional[int] = None,
    ) -> None:
        db.hide_artist(artist_key, folder_name, member_id)
        db.invalidate_scan_cache()

    def unhide_artist(self, artist_key: Union[int, str]) -> bool:
        changed = db.unhide_artist(artist_key)
        db.invalidate_scan_cache()
        return changed
