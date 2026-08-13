"""HTTP boundary for gallery pages and their filter metadata."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Request

import db
from services.gallery_service import GalleryService


router = APIRouter()


def _gallery_service(request: Request) -> GalleryService:
    runtime_context = getattr(request.app.state, "runtime_context", None)
    service = runtime_context.gallery_service if runtime_context is not None else None
    if service is None:
        raise HTTPException(status_code=503, detail="Gallery service is not ready.")
    return service


@router.get("/api/images")
def read_images(
    request: Request,
    month: Optional[str] = None,
    artist_id: Optional[str] = None,
    folder_id: Optional[str] = None,
    search: Optional[str] = None,
    only_db: Optional[bool] = None,
    sort_mode: str = "newest",
    limit: int = 200,
    offset: int = 0,
    grouping: str = "ungrouped",
):
    service = _gallery_service(request)

    # Keep the legacy triple-returning service seam usable for old callers and
    # tests while production routes opt into the richer sparse-range contract.
    # Looking up the method on the concrete type avoids treating unittest
    # mocks' dynamic attributes as an implementation of the new seam.
    range_method = getattr(type(service), "media_range", None)
    if callable(range_method):
        return service.media_range(
            month=month,
            artist_id=artist_id,
            folder_id=folder_id,
            search=search,
            limit=limit,
            offset=offset,
            only_db=bool(only_db),
            sort_mode=sort_mode,
            grouping=grouping,
        )

    try:
        kwargs = {
            "month": month,
            "artist_id": artist_id,
            "search": search,
            "limit": limit,
            "offset": offset,
            "only_db": bool(only_db),
            "sort_mode": sort_mode,
        }
        if folder_id is not None:
            kwargs["folder_id"] = folder_id
        images, total_count, available_months = service.images(**kwargs)
    except db.AmbiguousArtistIdentifier as error:
        raise HTTPException(
            status_code=409,
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
    return {
        "images": images,
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "months": available_months,
    }
