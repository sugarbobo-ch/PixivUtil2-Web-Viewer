"""HTTP boundary for media-library jobs and recoverable thumbnail cache."""

from __future__ import annotations

import os
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

import config_paths
import db
import library_jobs
from services.library_job_service import LibraryJobService
from services.media_source_service import MediaSourceService


router = APIRouter()
UNPROCESSABLE_STATUS = getattr(status, "HTTP_422_UNPROCESSABLE_CONTENT", 422)


class RescanRequest(BaseModel):
    directory: Optional[str] = None


class LibraryJobRequest(BaseModel):
    type: Literal["update-library", "analyze-missing-colors", "organize-thumbnail-cache"] = "update-library"
    directory: Optional[str] = None
    directories: List[str] = Field(default_factory=list)
    member_id: Optional[int] = None
    member_ids: List[int] = Field(default_factory=list)
    scope_key: Optional[str] = None
    scope_keys: List[str] = Field(default_factory=list)
    folder_id: Optional[str] = None
    folder_ids: List[str] = Field(default_factory=list)
    all_artists: bool = False
    analyze_colors: bool = True
    priority: Optional[int] = None


def _services(request: Request) -> tuple[LibraryJobService, MediaSourceService]:
    context = getattr(request.app.state, "runtime_context", None)
    if context is None or context.library_job_service is None or context.media_source_service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Media library service is not ready.",
        )
    return context.library_job_service, context.media_source_service


def _configured_root(source_service: MediaSourceService) -> str:
    try:
        return os.path.abspath(source_service.root_directory())
    except config_paths.MediaSourceConfigurationError as error:
        raise HTTPException(status_code=UNPROCESSABLE_STATUS, detail=str(error)) from error


def _ensure_requested_root(requested_directory: Optional[str], configured_root: str) -> None:
    if requested_directory and os.path.normcase(os.path.abspath(requested_directory)) != os.path.normcase(configured_root):
        raise HTTPException(
            status_code=UNPROCESSABLE_STATUS,
            detail="只能更新目前設定的媒體來源根目錄。",
        )


def _start_or_conflict(service: LibraryJobService, *args: Any, **kwargs: Any) -> Dict[str, Any]:
    try:
        return service.start(*args, **kwargs)
    except library_jobs.LibraryJobAlreadyRunning as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "A media library job is already running.", "job": error.job},
        ) from error
    except ValueError as error:
        raise HTTPException(status_code=UNPROCESSABLE_STATUS, detail=str(error)) from error


@router.post("/api/rescan", status_code=status.HTTP_202_ACCEPTED)
def rescan_directory(req: RescanRequest, request: Request):
    service, source_service = _services(request)
    target_dir = _configured_root(source_service)
    _ensure_requested_root(req.directory, target_dir)
    if not os.path.isdir(target_dir):
        raise HTTPException(
            status_code=UNPROCESSABLE_STATUS,
            detail=f"Directory does not exist: {target_dir}",
        )
    return {
        "job": _start_or_conflict(
            service,
            "update-library",
            target_dir,
            analyze_colors=True,
            scopes=[{
                "scope_key": db.get_root_scope_key(target_dir),
                "scope_type": "root",
                "member_id": None,
                "directory": target_dir,
            }],
            priority=20,
        ),
    }


@router.post("/api/library/jobs", status_code=status.HTTP_202_ACCEPTED)
def start_library_job(req: LibraryJobRequest, request: Request):
    service, source_service = _services(request)
    configured_root = _configured_root(source_service)
    target_dir = configured_root
    _ensure_requested_root(req.directory, configured_root)
    if req.type not in {"update-library", "analyze-missing-colors", "organize-thumbnail-cache"}:
        raise HTTPException(status_code=UNPROCESSABLE_STATUS, detail="Unsupported library job type")
    if req.type != "organize-thumbnail-cache" and not os.path.isdir(target_dir):
        raise HTTPException(
            status_code=UNPROCESSABLE_STATUS,
            detail=f"Directory does not exist: {target_dir}",
        )

    scopes: List[Dict[str, Any]] = []
    if req.type == "update-library":
        requested_member_ids = list(dict.fromkeys([
            *([req.member_id] if req.member_id is not None else []),
            *[int(member_id) for member_id in req.member_ids],
        ]))
        requested_scope_keys = list(dict.fromkeys([
            *([req.scope_key] if req.scope_key else []),
            *[str(scope_key).strip() for scope_key in req.scope_keys if str(scope_key).strip()],
            *([req.folder_id] if req.folder_id else []),
            *[str(folder_id).strip() for folder_id in req.folder_ids if str(folder_id).strip()],
        ]))
        if req.all_artists:
            requested_scope_keys.extend(
                str(scope["folder_id"])
                for scope in db.get_index_scopes(scope_type="artist")
                if scope.get("folder_id")
            )
            requested_scope_keys = list(dict.fromkeys(requested_scope_keys))

        requested_identifiers = [*requested_scope_keys, *requested_member_ids]
        seen_scope_keys: set[str] = set()
        for identifier in requested_identifiers:
            try:
                scope = db.get_artist_scope(identifier)
            except db.AmbiguousArtistIdentifier as error:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "ambiguous_artist_id",
                        "artist_id": error.identifier,
                        "candidates": [
                            {
                                "folder_id": candidate.get("folder_id"),
                                "folder_name": candidate.get("folder_name"),
                            }
                            for candidate in error.candidates
                        ],
                    },
                ) from error
            if scope is None:
                raise HTTPException(
                    status_code=UNPROCESSABLE_STATUS,
                    detail=f"Artist scope not discovered: {identifier}",
                )
            scope_directory = os.path.abspath(scope["directory"])
            if (
                not db._is_path_within(scope_directory, configured_root)
                or os.path.normcase(os.path.dirname(scope_directory)) != os.path.normcase(configured_root)
            ):
                raise HTTPException(
                    status_code=UNPROCESSABLE_STATUS,
                    detail=f"Artist scope is outside the configured media source: {identifier}",
                )
            scope_key = str(scope["scope_key"])
            if scope_key in seen_scope_keys:
                continue
            seen_scope_keys.add(scope_key)
            scopes.append({
                "scope_key": scope_key,
                "scope_type": "artist",
                "member_id": int(scope["member_id"]) if scope.get("member_id") is not None else None,
                "directory": scope_directory,
                "folder_id": scope.get("folder_id"),
            })

        for directory in req.directories:
            resolved_directory = os.path.abspath(directory)
            if not db._is_path_within(resolved_directory, configured_root):
                raise HTTPException(
                    status_code=UNPROCESSABLE_STATUS,
                    detail=f"Directory is outside the configured media source: {resolved_directory}",
                )
            if not os.path.isdir(resolved_directory):
                raise HTTPException(
                    status_code=UNPROCESSABLE_STATUS,
                    detail=f"Directory does not exist: {resolved_directory}",
                )
            scopes.append({
                "scope_key": db.get_index_scope_key(resolved_directory),
                "scope_type": "directory",
                "member_id": None,
                "directory": resolved_directory,
            })

        if not scopes:
            scopes = [{
                "scope_key": db.get_root_scope_key(target_dir),
                "scope_type": "root",
                "member_id": None,
                "directory": target_dir,
            }]

    priority = req.priority
    if priority is None:
        priority = 0 if (req.member_id is not None or req.scope_key or req.folder_id) else 20 if (req.member_ids or req.scope_keys or req.folder_ids) else 50
    priority = max(0, min(100, int(priority)))
    return {
        "job": _start_or_conflict(
            service,
            req.type,
            target_dir,
            analyze_colors=req.analyze_colors,
            scopes=scopes or None,
            priority=priority,
        ),
    }


@router.get("/api/library/jobs/current")
def read_current_library_job(request: Request):
    service, _source_service = _services(request)
    return {"job": service.current()}


@router.get("/api/library/jobs/{job_id}")
def read_library_job(job_id: str, request: Request):
    service, _source_service = _services(request)
    job = service.get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Library job not found")
    return {"job": job}


@router.post("/api/library/jobs/{job_id}/cancel")
def cancel_library_job(job_id: str, request: Request):
    service, _source_service = _services(request)
    job = service.cancel(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Library job not found")
    return {"job": job}


@router.get("/api/library/stats")
def read_library_stats(request: Request):
    service, _source_service = _services(request)
    return service.thumbnail_cache_stats()


@router.get("/api/library/cache/{job_id}/entries")
def read_library_cache_entries(
    job_id: str,
    request: Request,
    offset: int = Query(0, ge=0),
    limit: int = Query(24, ge=1, le=100),
):
    service, _source_service = _services(request)
    try:
        return service.thumbnail_cache_entries(job_id, offset=offset, limit=limit)
    except FileNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=UNPROCESSABLE_STATUS, detail=str(error)) from error


@router.get("/api/library/cache/{job_id}/preview/{recovery_name}")
def read_library_cache_preview(job_id: str, recovery_name: str, request: Request):
    service, _source_service = _services(request)
    try:
        preview_path = service.thumbnail_cache_preview_path(job_id, recovery_name)
    except FileNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=UNPROCESSABLE_STATUS, detail=str(error)) from error
    return FileResponse(
        preview_path,
        media_type="image/webp",
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.delete("/api/library/cache/{job_id}")
def move_library_cache_to_recycle_bin(job_id: str, request: Request):
    service, _source_service = _services(request)
    active_job = service.current()
    if active_job and active_job.get("status") in db.LIBRARY_JOB_ACTIVE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="請先等待目前的縮圖整理或還原工作完成。",
        )
    try:
        result = service.recycle_thumbnail_cache(job_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=UNPROCESSABLE_STATUS, detail=str(error)) from error
    return {"status": "success", **result}


@router.post("/api/library/cache/{job_id}/restore")
def restore_library_cache(job_id: str, request: Request):
    service, _source_service = _services(request)
    active_job = service.current()
    if active_job and active_job.get("status") in db.LIBRARY_JOB_ACTIVE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="請先等待目前的媒體資料庫工作完成。",
        )
    try:
        result = service.restore_thumbnail_cache(job_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=UNPROCESSABLE_STATUS, detail=str(error)) from error
    return {"status": "success", **result}
