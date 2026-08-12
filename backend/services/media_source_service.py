"""Explicit media-source boundary for interactive and library requests."""

from __future__ import annotations

import os
from typing import Optional

import config_paths
import db


class MediaSourceService:
    """Resolve the configured source without falling back to the workspace."""

    def root_directory(self) -> str:
        return config_paths.get_media_root_directory()

    def resolve_image_path(
        self,
        image_id: Optional[int],
        save_name: Optional[str],
        root_directory: Optional[str] = None,
    ) -> Optional[str]:
        del image_id  # Kept in the interface for the API contract.
        try:
            root_dir = os.path.abspath(root_directory or self.root_directory())
        except config_paths.MediaSourceConfigurationError:
            return None

        if not save_name:
            return None

        candidate = os.path.abspath(
            save_name if os.path.isabs(save_name) else os.path.join(root_dir, save_name)
        )
        if (
            db._is_path_within(candidate, root_dir)
            and not db.is_internal_media_path(candidate)
            and os.path.isfile(candidate)
        ):
            return candidate
        return None
