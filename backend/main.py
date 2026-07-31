# -*- coding: utf-8 -*-
import io
import os
import re
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from PIL import Image

import db

app = FastAPI(title="PixivUtil2 Web Viewer Backend API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
THUMB_CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache_thumbs")
os.makedirs(THUMB_CACHE_DIR, exist_ok=True)


class BatchDeleteRequest(BaseModel):
    image_ids: List[int]


@app.get("/api/artists")
def read_artists():
    return db.get_all_artists()


@app.get("/api/months")
def read_months():
    return db.get_all_months()


@app.get("/api/images")
def read_images(
    month: Optional[str] = None,
    artist_id: Optional[int] = None,
    search: Optional[str] = None,
    limit: int = 200,
    offset: int = 0
):
    return db.get_images(month=month, artist_id=artist_id, search=search, limit=limit, offset=offset)


@app.get("/api/file")
def get_media_file(path: str, range_header: Optional[str] = None):
    """Serves raw image/video file with Range support for videos."""
    safe_path = os.path.abspath(path)
    if not os.path.isfile(safe_path):
        raise HTTPException(status_code=404, detail="File not found")

    mime_type = "application/octet-stream"
    ext = os.path.splitext(safe_path)[1].lower()
    if ext in [".jpg", ".jpeg"]:
        mime_type = "image/jpeg"
    elif ext == ".png":
        mime_type = "image/png"
    elif ext == ".gif":
        mime_type = "image/gif"
    elif ext == ".webp":
        mime_type = "image/webp"
    elif ext == ".mp4":
        mime_type = "video/mp4"

    return FileResponse(safe_path, media_type=mime_type)


@app.get("/api/thumbnail")
def get_thumbnail(path: str, width: int = 320, height: int = 320):
    """Generates and caches lightweight WebP thumbnails on demand."""
    safe_path = os.path.abspath(path)
    if not os.path.isfile(safe_path):
        raise HTTPException(status_code=404, detail="Original image not found")

    ext = os.path.splitext(safe_path)[1].lower()
    if ext in [".mp4", ".zip"]:
        # Fallback for video/zip without thumbnail
        return FileResponse(safe_path)

    # Hash path for thumb cache name
    thumb_name = f"{hash(safe_path)}_{width}x{height}.webp"
    thumb_path = os.path.join(THUMB_CACHE_DIR, thumb_name)

    if os.path.exists(thumb_path):
        return FileResponse(thumb_path, media_type="image/webp")

    try:
        with Image.open(safe_path) as img:
            img.thumbnail((width, height), Image.Resampling.LANCZOS)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGBA")
            else:
                img = img.convert("RGB")
            img.save(thumb_path, "WEBP", quality=80)
        return FileResponse(thumb_path, media_type="image/webp")
    except Exception as err:
        # Fallback to raw file if PIL fails
        return FileResponse(safe_path)


@app.post("/api/images/batch-delete")
def batch_delete(req: BatchDeleteRequest):
    if not req.image_ids:
        return {"deleted_count": 0, "messages": ["No image IDs provided."]}

    file_paths = db.delete_image_records(req.image_ids)
    deleted_files = 0
    errors = []

    for file_path in file_paths:
        if file_path:
            abs_p = os.path.abspath(file_path)
            if os.path.isfile(abs_p):
                try:
                    os.remove(abs_p)
                    deleted_files += 1
                except Exception as ex:
                    errors.append(f"Failed to delete file {file_path}: {ex}")

    return {
        "deleted_db_entries": len(req.image_ids),
        "deleted_physical_files": deleted_files,
        "errors": errors
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
