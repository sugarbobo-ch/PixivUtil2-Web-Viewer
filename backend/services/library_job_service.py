"""Application boundary around the single media-library job worker."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import library_jobs


class LibraryJobService:
    def __init__(self, manager: library_jobs.LibraryJobManager) -> None:
        self.manager = manager

    def start(
        self,
        job_type: str,
        target_dir: str,
        *,
        analyze_colors: bool = False,
        scopes: Optional[List[Dict[str, Any]]] = None,
        priority: int = 50,
    ) -> Dict[str, Any]:
        return self.manager.start(
            job_type,
            target_dir,
            analyze_colors=analyze_colors,
            scopes=scopes,
            priority=priority,
        )

    def current(self) -> Optional[Dict[str, Any]]:
        return self.manager.current()

    def get(self, job_id: str) -> Optional[Dict[str, Any]]:
        return self.manager.get(job_id)

    def cancel(self, job_id: str) -> Optional[Dict[str, Any]]:
        return self.manager.cancel(job_id)

    def thumbnail_cache_stats(self) -> Dict[str, Any]:
        return library_jobs.get_thumbnail_cache_stats()

    def thumbnail_cache_entries(self, job_id: str, *, offset: int = 0, limit: int = 24) -> Dict[str, Any]:
        return library_jobs.get_thumbnail_cache_recovery_entries(job_id, offset=offset, limit=limit)

    def thumbnail_cache_preview_path(self, job_id: str, recovery_name: str) -> str:
        return library_jobs.get_thumbnail_cache_recovery_path(job_id, recovery_name)

    def recycle_thumbnail_cache(self, job_id: str) -> Dict[str, Any]:
        return library_jobs.move_thumbnail_cache_recovery_to_recycle_bin(job_id)

    def restore_thumbnail_cache(self, job_id: str) -> Dict[str, Any]:
        return library_jobs.restore_thumbnail_cache(job_id)
