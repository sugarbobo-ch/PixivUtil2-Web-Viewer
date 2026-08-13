"""HTTP boundary for directory metadata, source inspection, and artist visibility."""

from __future__ import annotations

import configparser
import os
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel

import path_picker
import source_resolver
import db
from services.gallery_service import GalleryService


router = APIRouter()
UNPROCESSABLE_STATUS = getattr(status, "HTTP_422_UNPROCESSABLE_CONTENT", 422)


class LibrarySourceInspectRequest(BaseModel):
    mode: Literal["pixiv", "folder"]
    path: str


class ArtistVisibilityRequest(BaseModel):
    folder_name: str = ""


class FolderIdentityRequest(BaseModel):
    status: Literal["verified", "rejected", "inferred", "unknown"]
    member_id: Optional[int] = None
    fanbox_id: Optional[str] = None


def _ambiguous_artist_error(error: db.AmbiguousArtistIdentifier) -> HTTPException:
    return HTTPException(
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
    )


def _gallery_service(request: Request) -> GalleryService:
    context = getattr(request.app.state, "runtime_context", None)
    service = getattr(context, "gallery_service", None)
    if service is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Gallery service is not ready.")
    return service


@router.post("/api/library/source/inspect")
def inspect_library_source(req: LibrarySourceInspectRequest):
    try:
        if req.mode == "folder":
            root_directory = path_picker.validate_selected_path(req.path, "root-directory", "folder")
            return {
                "mode": "folder",
                "rootDirectory": root_directory,
                "databaseDetected": False,
                "databasePath": None,
            }

        config_path = path_picker.validate_selected_path(req.path, "pixiv-config", "existing-file")
        parser = configparser.ConfigParser(interpolation=None)
        try:
            parser.read(config_path, encoding="utf-8")
        except (OSError, configparser.Error) as error:
            raise HTTPException(status_code=422, detail=f"無法讀取 config.ini：{error}") from error
        root_directory = parser.get("Settings", "rootDirectory", fallback="").strip()
        if not root_directory:
            raise HTTPException(status_code=422, detail="config.ini 缺少 Settings.rootDirectory。")
        root_directory = os.path.abspath(os.path.expandvars(os.path.expanduser(root_directory)))
        if not os.path.isdir(root_directory):
            raise HTTPException(status_code=422, detail=f"config.ini 指向的圖片資料夾不存在：{root_directory}")
        database_path = os.path.join(os.path.dirname(config_path), "db.sqlite")
        return {
            "mode": "pixiv",
            "configPath": config_path,
            "rootDirectory": root_directory,
            "databaseDetected": os.path.isfile(database_path),
            "databasePath": database_path,
        }
    except path_picker.PathPickerError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.get("/api/artists")
def read_artists(request: Request):
    return _gallery_service(request).artists()


@router.get("/api/hidden-artists")
def read_hidden_artists(request: Request):
    return _gallery_service(request).hidden_artists()


@router.post("/api/artists/{artist_id}/hide")
def hide_artist(artist_id: str, request: Request, req: ArtistVisibilityRequest = ArtistVisibilityRequest()):
    service = _gallery_service(request)
    artist_key = str(artist_id).strip()
    if artist_key == "-1":
        raise HTTPException(status_code=UNPROCESSABLE_STATUS, detail="未分類圖片無法隱藏")
    folder_name = req.folder_name.strip()
    artist = next(
        (
            candidate
            for candidate in service.artists()
            if str(candidate.get("scope_key") or candidate.get("member_id")) == artist_key
        ),
        None,
    )
    if not folder_name:
        folder_name = str((artist or {}).get("folder_name") or (artist or {}).get("name") or "")
    member_id = int(artist["member_id"]) if artist and artist.get("member_id") is not None else None
    try:
        service.hide_artist(artist_key, folder_name, member_id)
    except db.AmbiguousArtistIdentifier as error:
        raise _ambiguous_artist_error(error) from error
    return {
        "status": "hidden",
        "member_id": member_id if member_id is not None else artist_key,
        "scope_key": artist_key,
        "folder_id": str((artist or {}).get("folder_id") or artist_key),
        "folder_name": folder_name,
    }


@router.post("/api/artists/{artist_id}/unhide")
def unhide_artist(artist_id: str, request: Request):
    artist_key = str(artist_id).strip()
    try:
        changed = _gallery_service(request).unhide_artist(artist_key)
    except db.AmbiguousArtistIdentifier as error:
        raise _ambiguous_artist_error(error) from error
    return {
        "status": "visible",
        "member_id": artist_key,
        "scope_key": artist_key,
        "folder_id": artist_key,
        "changed": changed,
    }


@router.put("/api/folders/{folder_id}/identity")
def update_folder_identity(folder_id: str, req: FolderIdentityRequest):
    folder = db.set_managed_folder_identity(folder_id, req.status, req.member_id, req.fanbox_id)
    if folder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Managed folder not found.")
    return folder


@router.get("/api/source-link")
def read_source_link(path: str = Query(..., min_length=1)):
    """Resolve a verified Pixiv/FANBOX source page for one local file."""
    return source_resolver.resolve_source_link(path)


@router.get("/api/artist-source-link")
def read_artist_source_link(
    folder_id: Optional[str] = Query(None),
    artist_id: Optional[int] = Query(None),
):
    """Resolve source pages only for the currently selected artist."""
    if folder_id:
        folder = db.get_managed_folder(folder_id)
        if folder is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Managed folder not found.")
        if folder.get("identity_status") == "rejected":
            return None
        member_id = int(folder.get("member_id") or 0)
        if member_id <= 0:
            explicit_id = source_resolver._get_explicit_member_id(
                folder.get("current_path") or folder.get("folder_name") or ""
            )
            if explicit_id:
                member_id = explicit_id
        if member_id > 0:
            return source_resolver.resolve_artist_source(member_id, folder_id)
        return None
    if artist_id is None:
        raise HTTPException(status_code=UNPROCESSABLE_STATUS, detail="folder_id is required.")
    try:
        folder = db.get_managed_folder(artist_id)
    except db.AmbiguousArtistIdentifier as error:
        raise _ambiguous_artist_error(error) from error
    if folder and folder.get("identity_status") == "rejected":
        return None
    target_member_id = artist_id
    target_folder_id = folder.get("folder_id") if folder else None
    if folder and folder.get("member_id"):
        try:
            target_member_id = int(folder["member_id"])
        except (TypeError, ValueError):
            pass
    return source_resolver.resolve_artist_source(target_member_id, target_folder_id)


@router.get("/api/months")
def read_months(request: Request):
    return _gallery_service(request).months()
