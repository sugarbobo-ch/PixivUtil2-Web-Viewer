from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional

import config_paths

if TYPE_CHECKING:
    import library_jobs
    from services.gallery_service import GalleryService
    from services.library_job_service import LibraryJobService
    from services.media_source_service import MediaSourceService
    from services.web_config_service import WebConfigService


@dataclass
class RuntimeContext:
    """Application-owned dependencies shared by backend services.

    The context is deliberately small while the route migration is in
    progress.  Keeping the manager and resolved paths together gives new
    services an explicit dependency boundary without breaking the existing
    db facade and its test fixtures.
    """

    library_job_manager: library_jobs.LibraryJobManager
    library_job_service: Optional[LibraryJobService]
    web_config_service: Optional[WebConfigService]
    media_source_service: Optional[MediaSourceService]
    gallery_service: Optional[GalleryService]
    workspace_root: str
    web_config_path: str

    @classmethod
    def create(
        cls,
        library_job_manager: library_jobs.LibraryJobManager,
        web_config_service: Optional[WebConfigService] = None,
        media_source_service: Optional[MediaSourceService] = None,
        library_job_service: Optional[LibraryJobService] = None,
        gallery_service: Optional[GalleryService] = None,
    ) -> "RuntimeContext":
        return cls(
            library_job_manager=library_job_manager,
            library_job_service=library_job_service,
            web_config_service=web_config_service,
            media_source_service=media_source_service,
            gallery_service=gallery_service,
            workspace_root=config_paths.WORKSPACE_ROOT,
            web_config_path=config_paths.WEB_CONFIG_PATH,
        )

    def close(self) -> None:
        self.library_job_manager.close()
