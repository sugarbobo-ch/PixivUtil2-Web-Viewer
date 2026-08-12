# -*- coding: utf-8 -*-
import io
import json
import hashlib
import hmac
import os
import re
import secrets
import shutil
import tempfile
import zipfile
import threading
import time
from contextlib import asynccontextmanager
from typing import List, Dict, Any, Optional, Literal
from fastapi import FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from starlette.background import BackgroundTask
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from PIL import Image

import db
import config_paths
import library_jobs
import path_picker
import recycle_bin
from runtime_context import RuntimeContext
from services.media_source_service import MediaSourceService
from services.library_job_service import LibraryJobService
from services.gallery_service import GalleryService
from services.web_config_service import WebConfigService
from routes.library_jobs import router as library_jobs_router
from routes.directory import router as directory_router
from routes.gallery import router as gallery_router
from routes.pixiv_config import router as pixiv_config_router
from routes.web_config import router as web_config_router

LIBRARY_JOB_MANAGER: Optional[library_jobs.LibraryJobManager] = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Own background workers for exactly one ASGI application lifespan."""
    global LIBRARY_JOB_MANAGER
    manager = library_jobs.LibraryJobManager(auto_reconcile=True)
    web_config_service = WebConfigService(
        config_paths.WEB_CONFIG_PATH,
        DEFAULT_WEB_CONFIG,
        normalize_web_config_file,
    )
    media_source_service = MediaSourceService()
    library_job_service = LibraryJobService(manager)
    gallery_service = GalleryService()
    runtime_context = RuntimeContext.create(
        manager,
        web_config_service,
        media_source_service,
        library_job_service,
        gallery_service,
    )
    LIBRARY_JOB_MANAGER = manager
    _app.state.runtime_context = runtime_context
    try:
        yield
    finally:
        runtime_context.close()
        if getattr(_app.state, "runtime_context", None) is runtime_context:
            delattr(_app.state, "runtime_context")
        if LIBRARY_JOB_MANAGER is manager:
            LIBRARY_JOB_MANAGER = None


def get_library_job_manager() -> library_jobs.LibraryJobManager:
    runtime_context = getattr(app.state, "runtime_context", None)
    manager = runtime_context.library_job_manager if runtime_context is not None else LIBRARY_JOB_MANAGER
    if manager is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Media library service is not ready.",
        )
    return manager


def get_library_job_service() -> LibraryJobService:
    runtime_context = getattr(app.state, "runtime_context", None)
    service = runtime_context.library_job_service if runtime_context is not None else None
    if service is not None:
        return service
    return LibraryJobService(get_library_job_manager())


app = FastAPI(
    title="PixivUtil2 Web Viewer Backend API",
    version="1.0.0",
    lifespan=lifespan,
)

_default_allowed_origins = {
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
}
_configured_allowed_origins = os.getenv("WEB_VIEWER_ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in (_configured_allowed_origins.split(",") if _configured_allowed_origins else _default_allowed_origins)
    if origin.strip()
]
VIEWER_SESSION_TOKEN = secrets.token_urlsafe(32)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(web_config_router)
app.include_router(library_jobs_router)
app.include_router(directory_router)
app.include_router(gallery_router)
app.include_router(pixiv_config_router)

WORKSPACE_ROOT = config_paths.WORKSPACE_ROOT
THUMB_CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache_thumbs")
os.makedirs(THUMB_CACHE_DIR, exist_ok=True)
# The cache key is based on the source fingerprint, but the browser URL also
# needs to be revalidated because it intentionally stays human-readable. A
# stale immutable response would keep showing a failed thumbnail after a file
# has been completed or repaired on disk.
THUMB_CACHE_HEADERS = {"Cache-Control": "public, no-cache, must-revalidate"}
MEDIA_CACHE_HEADERS = {"Cache-Control": "private, max-age=300, stale-while-revalidate=60"}
THUMB_GENERATION_LIMIT = 2
THUMB_GENERATION_SEMAPHORE = threading.BoundedSemaphore(THUMB_GENERATION_LIMIT)
THUMB_GENERATION_LOCK = threading.Lock()
THUMB_GENERATION_INFLIGHT: dict[str, threading.Event] = {}

def get_media_source_service() -> MediaSourceService:
    runtime_context = getattr(app.state, "runtime_context", None)
    if runtime_context is not None and runtime_context.media_source_service is not None:
        return runtime_context.media_source_service
    return MediaSourceService()


def is_valid_thumbnail_file(thumb_path: str) -> bool:
    """Check that a generated WebP can be decoded before serving it."""
    if not os.path.isfile(thumb_path):
        return False
    try:
        with Image.open(thumb_path) as image:
            image.verify()
        return True
    except Exception:
        return False


def generate_thumbnail_once(thumb_path: str, generator, validator=None) -> bool:
    """Coordinate one thumbnail key and bound CPU/disk-heavy generation.

    FastAPI executes this synchronous route in a worker pool.  Without a
    single-flight guard, two requests for the same uncached image can both
    decode and write it.  The temporary output also prevents another request
    from observing a partially written WebP.
    """
    with THUMB_GENERATION_LOCK:
        if os.path.exists(thumb_path) and (validator is None or validator(thumb_path)):
            return True
        event = THUMB_GENERATION_INFLIGHT.get(thumb_path)
        if event is None:
            event = threading.Event()
            THUMB_GENERATION_INFLIGHT[thumb_path] = event
            owner = True
        else:
            owner = False

    if not owner:
        event.wait()
        return os.path.exists(thumb_path) and (validator is None or validator(thumb_path))

    temporary_path = ""
    started = time.perf_counter()
    try:
        file_descriptor, temporary_path = tempfile.mkstemp(
            prefix=".thumb-",
            suffix=".tmp",
            dir=THUMB_CACHE_DIR,
        )
        os.close(file_descriptor)
        try:
            with THUMB_GENERATION_SEMAPHORE:
                generated = bool(generator(temporary_path))
        except Exception as error:
            print(f"thumbnail generation failed for {os.path.basename(thumb_path)}: {error}")
            generated = False
        if generated and os.path.exists(temporary_path):
            os.replace(temporary_path, thumb_path)
            temporary_path = ""
        return generated and os.path.exists(thumb_path) and (
            validator is None or validator(thumb_path)
        )
    finally:
        if temporary_path:
            try:
                os.remove(temporary_path)
            except OSError:
                pass
        with THUMB_GENERATION_LOCK:
            THUMB_GENERATION_INFLIGHT.pop(thumb_path, None)
            event.set()
        elapsed_ms = (time.perf_counter() - started) * 1000
        if elapsed_ms > 250:
            print(f"thumbnail generation {elapsed_ms:.0f}ms: {os.path.basename(thumb_path)}")

LEGACY_SIDEBAR_DEFAULT_WIDTHS = {300, 500, "300", "500"}

DEFAULT_WEB_CONFIG = {
    "webTheme": "dark",
    "defaultViewMode": "fullscreen",
    "thumbnailSize": 320,
    "itemsPerPage": 200,
    "sidebarWidth": 320,
    "autoOpenBrowser": True,
    "pixivConfigPath": "",
    "librarySourceMode": "unconfigured",
    "mediaRootPath": "",
    "onboardingCompleted": False,
    "groupMangaPosts": False,
    "blurEnabled": False,
    "demoMode": False,
    "preloadImageCount": 3,
    "fullscreenToolbarSimpleMode": True,
    "fullscreenShowToolbar": True,
    "fullscreenShowThumbnails": True,
    "fullscreenShowCheckerboard": True,
    "fullscreenZoomMode": "auto",
    "fullscreenVideoSeekSeconds": 5,
    "fullscreenVideoHoldPlaybackRate": 2,
    "videoMuted": True,
    "videoVolume": 1,
    "videoAutoplay": True,
    "webtoonImageScale": 100,
    "webtoonImageGap": 24,
    "webtoonShowInfo": True,
    "webtoonShowPageNumber": True,
    "webtoonShowThumbnails": True,
    "analyzeColorsAfterLibraryUpdate": True,
    "manageThumbnailCache": True,
    "thumbnailCacheLimitMiB": 1024,
}


def normalize_web_config_file(data: Any) -> Dict[str, Any]:
    """Fill in settings introduced after older web_config.json versions."""
    current = dict(data) if isinstance(data, dict) else {}

    # Older resizable-sidebar releases used 300px and 500px as their defaults.
    # Upgrade those legacy defaults so existing installs get the compact
    # two-chip base width while explicitly resized values remain unchanged.
    if current.get("sidebarWidth") in LEGACY_SIDEBAR_DEFAULT_WIDTHS:
        current["sidebarWidth"] = DEFAULT_WEB_CONFIG["sidebarWidth"]

    # Migrate the old mosaic name to the canonical blur name while keeping old
    # config files and API clients readable.
    if "blurEnabled" not in current and "mosaicEnabled" in current:
        current["blurEnabled"] = current["mosaicEnabled"]
    current.pop("mosaicEnabled", None)

    # The old mute preference was fullscreen-only. Keep existing users' choice
    # while moving it to the shared video preference contract.
    if "videoMuted" not in current and "fullscreenVideoMuted" in current:
        current["videoMuted"] = current["fullscreenVideoMuted"]
    current.pop("fullscreenVideoMuted", None)

    normalized = {**DEFAULT_WEB_CONFIG, **current}
    if "onboardingCompleted" not in current:
        legacy_config_exists = os.path.isfile(config_paths.get_pixiv_config_path(current))
        legacy_viewer_exists = os.path.isfile(config_paths.VIEWER_DB_PATH)
        normalized["onboardingCompleted"] = legacy_config_exists or legacy_viewer_exists
    if "librarySourceMode" not in current and normalized["onboardingCompleted"]:
        normalized["librarySourceMode"] = "pixiv"
    # The preferred browsing mode is a reader mode only. Older configs used
    # ``grid`` for the library entry screen; migrate that value to fullscreen.
    normalized["defaultViewMode"] = (
        "webtoon" if normalized.get("defaultViewMode") == "webtoon" else "fullscreen"
    )
    normalized["webTheme"] = "light" if normalized.get("webTheme") == "light" else "dark"
    if normalized.get("fullscreenZoomMode") not in {"auto", "lock", "width", "height", "fit", "fill"}:
        normalized["fullscreenZoomMode"] = DEFAULT_WEB_CONFIG["fullscreenZoomMode"]
    if normalized.get("librarySourceMode") not in {"unconfigured", "pixiv", "folder"}:
        normalized["librarySourceMode"] = DEFAULT_WEB_CONFIG["librarySourceMode"]
    normalized["pixivConfigPath"] = str(normalized.get("pixivConfigPath") or "")
    normalized["mediaRootPath"] = str(normalized.get("mediaRootPath") or "")

    # Preserve the old thumbnailWidth/thumbnailHeight settings during migration.
    if "thumbnailSize" not in current:
        normalized["thumbnailSize"] = current.get(
            "thumbnailWidth",
            current.get("thumbnailHeight", DEFAULT_WEB_CONFIG["thumbnailSize"]),
        )
    normalized.pop("thumbnailWidth", None)
    normalized.pop("thumbnailHeight", None)

    for key in (
        "autoOpenBrowser",
        "groupMangaPosts",
        "blurEnabled",
        "demoMode",
        "analyzeColorsAfterLibraryUpdate",
        "manageThumbnailCache",
        "fullscreenToolbarSimpleMode",
        "fullscreenShowToolbar",
        "fullscreenShowThumbnails",
        "fullscreenShowCheckerboard",
        "videoMuted",
        "videoAutoplay",
        "onboardingCompleted",
    ):
        value = normalized.get(key)
        if isinstance(value, str):
            normalized[key] = value.strip().lower() not in {"", "0", "false", "no", "off"}
        else:
            normalized[key] = bool(value)
    for key, fallback, minimum, maximum in (
        ("thumbnailSize", 320, 16, 4096),
        ("itemsPerPage", 200, 1, 5000),
        ("sidebarWidth", 320, 224, 560),
        ("preloadImageCount", 3, 0, 10),
        ("fullscreenVideoSeekSeconds", 5, 1, 60),
        ("webtoonImageScale", 100, 30, 100),
        ("webtoonImageGap", 24, 0, 300),
    ):
        try:
            normalized[key] = max(minimum, min(maximum, int(normalized.get(key, fallback))))
        except (TypeError, ValueError):
            normalized[key] = fallback
    try:
        normalized["fullscreenVideoHoldPlaybackRate"] = round(
            max(1.25, min(4, float(normalized.get("fullscreenVideoHoldPlaybackRate", 2)))),
            2,
        )
    except (TypeError, ValueError):
        normalized["fullscreenVideoHoldPlaybackRate"] = DEFAULT_WEB_CONFIG["fullscreenVideoHoldPlaybackRate"]
    try:
        normalized["videoVolume"] = round(
            max(0, min(1, float(normalized.get("videoVolume", 1)))),
            2,
        )
    except (TypeError, ValueError):
        normalized["videoVolume"] = DEFAULT_WEB_CONFIG["videoVolume"]
    for key in ("webtoonShowInfo", "webtoonShowPageNumber", "webtoonShowThumbnails"):
        value = normalized.get(key)
        if isinstance(value, str):
            normalized[key] = value.strip().lower() not in {"", "0", "false", "no", "off"}
        else:
            normalized[key] = bool(value)
    try:
        normalized["thumbnailCacheLimitMiB"] = max(
            128,
            min(102400, int(normalized.get("thumbnailCacheLimitMiB", 1024))),
        )
    except (TypeError, ValueError):
        normalized["thumbnailCacheLimitMiB"] = DEFAULT_WEB_CONFIG["thumbnailCacheLimitMiB"]

    return normalized


def get_root_directory() -> str:
    return get_media_source_service().root_directory()


def resolve_image_path(image_id: Optional[int], save_name: Optional[str]) -> Optional[str]:
    """Resolve a local media path through the runtime source boundary."""
    try:
        root_directory = get_root_directory()
    except config_paths.MediaSourceConfigurationError:
        return None
    return get_media_source_service().resolve_image_path(image_id, save_name, root_directory)


class BatchDeleteItem(BaseModel):
    image_id: int
    path: str


class BatchDeleteRequest(BaseModel):
    image_ids: List[int] = Field(default_factory=list)
    items: List[BatchDeleteItem] = Field(default_factory=list)


class BatchDownloadItem(BaseModel):
    image_id: int
    path: str


class BatchDownloadRequest(BaseModel):
    image_ids: List[int] = Field(default_factory=list)
    items: List[BatchDownloadItem] = Field(default_factory=list)


class OpenMediaRequest(BaseModel):
    path: str
    image_id: Optional[int] = None
    target: Literal["file", "folder"]


class SystemPickerRequest(BaseModel):
    mode: Literal["folder", "existing-file", "save-file"]
    purpose: Literal[
        "root-directory",
        "pixiv-config",
        "download-list-directory",
        "database-file",
        "irfanview-directory",
        "ffmpeg-executable",
        "fanbox-list-file",
    ]


def _validate_picker_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if origin and origin not in ALLOWED_ORIGINS:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="不允許的 Web Viewer 來源。")


def _require_picker_session(request: Request) -> None:
    _validate_picker_origin(request)
    token = request.headers.get("x-web-viewer-session", "")
    if not hmac.compare_digest(token, VIEWER_SESSION_TOKEN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="無效的 Web Viewer 工作階段。")


@app.get("/api/system/session")
def get_system_session(request: Request):
    _validate_picker_origin(request)
    return {"token": VIEWER_SESSION_TOKEN}


@app.post("/api/system/picker")
def open_system_picker(req: SystemPickerRequest, request: Request):
    _require_picker_session(request)
    try:
        return path_picker.open_native_picker(req.mode, req.purpose)
    except path_picker.PickerBusyError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except path_picker.PickerTimeoutError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    except path_picker.PickerUnavailableError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    except path_picker.PathPickerError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error


@app.get("/api/file")
def get_media_file(path: str, image_id: Optional[int] = None):
    library_jobs.note_interactive_media_activity()
    resolved = resolve_image_path(image_id, path)
    if not resolved or not os.path.isfile(resolved):
        raise HTTPException(status_code=404, detail="File not found")

    mime_type = "application/octet-stream"
    ext = os.path.splitext(resolved)[1].lower()
    if ext in {".jpg", ".jpeg", ".png", ".gif", ".webp"} and not db.is_usable_media_file(resolved):
        raise HTTPException(status_code=422, detail="Image file is invalid or incomplete")
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

    return FileResponse(resolved, media_type=mime_type, headers=MEDIA_CACHE_HEADERS)


@app.post("/api/open-media")
def open_media_with_windows_default(req: OpenMediaRequest):
    """Open a verified media file or its containing folder through Windows."""
    if os.name != "nt":
        raise HTTPException(status_code=501, detail="Windows default open is only available on Windows")

    resolved = resolve_image_path(req.image_id, req.path)
    if not resolved or not os.path.isfile(resolved):
        raise HTTPException(status_code=404, detail="File not found")

    if os.path.splitext(resolved)[1].lower() not in db.MEDIA_EXTENSIONS:
        raise HTTPException(status_code=422, detail="Only media files can be opened")

    target_path = resolved if req.target == "file" else os.path.dirname(resolved)
    start_file = getattr(os, "startfile", None)
    if start_file is None:
        raise HTTPException(status_code=501, detail="Windows default open is unavailable")

    try:
        start_file(target_path)
    except OSError as err:
        raise HTTPException(status_code=500, detail=f"Failed to open path: {err}") from err

    return {"status": "success", "target": req.target}


def generate_fallback_svg(filename: str) -> str:
    import html
    safe_title = html.escape(os.path.basename(filename))
    display_title = safe_title if len(safe_title) <= 26 else safe_title[:12] + "..." + safe_title[-10:]
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
  <rect width="320" height="320" fill="#18181b"/>
  <rect x="20" y="20" width="280" height="280" rx="16" fill="#27272a" stroke="#3f3f46" stroke-width="2"/>
  <circle cx="160" cy="140" r="40" fill="#0096fa" fill-opacity="0.9"/>
  <polygon points="152,124 176,140 152,156" fill="#ffffff"/>
  <text x="160" y="225" font-family="sans-serif" font-size="12" font-weight="600" fill="#e4e4e7" text-anchor="middle">{display_title}</text>
</svg>"""


def generate_media_error_svg(filename: str) -> str:
    import html
    safe_title = html.escape(os.path.basename(filename))
    display_title = safe_title if len(safe_title) <= 34 else safe_title[:16] + "..." + safe_title[-14:]
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
  <rect width="640" height="480" fill="#18181b"/>
  <rect x="24" y="24" width="592" height="432" rx="24" fill="#27272a" stroke="#f59e0b" stroke-opacity="0.55" stroke-width="3"/>
  <path d="M320 112 392 240h-144z" fill="#f59e0b"/>
  <rect x="314" y="168" width="12" height="44" rx="6" fill="#18181b"/>
  <circle cx="320" cy="230" r="6" fill="#18181b"/>
  <text x="320" y="300" font-family="sans-serif" font-size="24" font-weight="700" fill="#fef3c7" text-anchor="middle">圖片檔案有問題</text>
  <text x="320" y="336" font-family="sans-serif" font-size="15" fill="#a1a1aa" text-anchor="middle">檔案可能未完成或已損壞</text>
  <text x="320" y="386" font-family="sans-serif" font-size="13" fill="#71717a" text-anchor="middle">{display_title}</text>
</svg>"""


def extract_video_frame(video_path: str, thumb_path: str, width: int = 320, height: int = 320) -> bool:
    try:
        import cv2
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return False

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # Sample candidates: 15% into video, 5% into video, frame 30, frame 5, frame 0
        candidates = []
        if total_frames > 0:
            candidates = [
                min(int(total_frames * 0.15), total_frames - 1),
                min(int(total_frames * 0.05), total_frames - 1),
                min(30, total_frames - 1),
                min(5, total_frames - 1),
                0
            ]
        else:
            candidates = [60, 30, 15, 5, 0]

        frame = None
        ret = False
        for f_pos in candidates:
            if f_pos < 0:
                continue
            cap.set(cv2.CAP_PROP_POS_FRAMES, f_pos)
            ret, frame = cap.read()
            if ret and frame is not None:
                # Ensure frame is not completely pitch black
                if frame.any() and frame.mean() > 5.0:
                    break

        cap.release()

        if ret and frame is not None:
            color_converted = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(color_converted)
            pil_img.thumbnail((width, height), Image.Resampling.LANCZOS)
            pil_img.save(thumb_path, "WEBP", quality=80)
            return True
    except Exception as ex:
        print(f"Error extracting video frame from {video_path}: {ex}")
    return False


@app.get("/api/thumbnail")
def get_thumbnail(
    path: str,
    image_id: Optional[int] = None,
    size: Optional[int] = Query(None, ge=16, le=4096),
    width: int = Query(320, ge=16, le=4096),
    height: int = Query(320, ge=16, le=4096),
):
    library_jobs.note_interactive_media_activity()
    if size is not None:
        width = size
        height = size
    resolved = resolve_image_path(image_id, path)
    if not resolved or not os.path.isfile(resolved):
        raise HTTPException(status_code=404, detail="Original image not found")

    ext = os.path.splitext(resolved)[1].lower()
    filename = os.path.basename(resolved)
    if ext in {".jpg", ".jpeg", ".png", ".gif", ".webp"} and not db.is_usable_media_file(resolved):
        return Response(
            content=generate_media_error_svg(filename),
            media_type="image/svg+xml",
            headers=THUMB_CACHE_HEADERS,
        )

    # Use a stable, content-aware key so generated thumbnails remain reusable
    # after a backend restart while changed source files get a fresh cache
    # entry. Python's built-in hash() is intentionally randomized per process.
    try:
        source_stat = os.stat(resolved)
        thumb_name = library_jobs.thumbnail_cache_name(resolved, width, height, source_stat)
    except OSError:
        source_stat = None
        source_key = f"{os.path.normcase(resolved)}:{width}x{height}"
        thumb_key = hashlib.sha1(source_key.encode("utf-8")).hexdigest()
        thumb_name = f"{thumb_key}_{width}x{height}.webp"
    thumb_path = os.path.join(THUMB_CACHE_DIR, thumb_name)

    if is_valid_thumbnail_file(thumb_path):
        if source_stat is not None:
            library_jobs.record_thumbnail_cache_access(
                thumb_name,
                resolved,
                source_stat,
                width,
                height,
            )
        return FileResponse(thumb_path, media_type="image/webp", headers=THUMB_CACHE_HEADERS)

    if ext in [".mp4", ".mkv", ".webm", ".avi", ".mov"]:
        if generate_thumbnail_once(
            thumb_path,
            lambda temporary_path: extract_video_frame(resolved, temporary_path, width, height),
            is_valid_thumbnail_file,
        ):
            if source_stat is not None:
                library_jobs.record_thumbnail_cache_access(
                    thumb_name,
                    resolved,
                    source_stat,
                    width,
                    height,
                )
            return FileResponse(thumb_path, media_type="image/webp", headers=THUMB_CACHE_HEADERS)
        return Response(content=generate_fallback_svg(filename), media_type="image/svg+xml")

    if ext == ".zip":
        return Response(content=generate_fallback_svg(filename), media_type="image/svg+xml")

    def generate_raster_thumbnail(temporary_path: str) -> bool:
        try:
            with Image.open(resolved) as img:
                img.thumbnail((width, height), Image.Resampling.LANCZOS)
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGBA")
                else:
                    img = img.convert("RGB")
                img.save(temporary_path, "WEBP", quality=80)
            return True
        except Exception:
            return False

    try:
        if not generate_thumbnail_once(thumb_path, generate_raster_thumbnail, is_valid_thumbnail_file):
            return Response(
                content=generate_media_error_svg(filename),
                media_type="image/svg+xml",
                headers=THUMB_CACHE_HEADERS,
            )
        if source_stat is not None:
            library_jobs.record_thumbnail_cache_access(
                thumb_name,
                resolved,
                source_stat,
                width,
                height,
            )
        return FileResponse(thumb_path, media_type="image/webp", headers=THUMB_CACHE_HEADERS)
    except Exception:
        return Response(
            content=generate_media_error_svg(filename),
            media_type="image/svg+xml",
            headers=THUMB_CACHE_HEADERS,
        )


def cleanup_temporary_file(path: str) -> None:
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
    except OSError:
        pass


@app.post("/api/images/download-zip")
def download_selected_images(req: BatchDownloadRequest):
    """Create a ZIP containing the selected local media files."""
    selected_records = db.get_image_paths_by_ids(req.image_ids)
    selected_records.extend((item.image_id, item.path) for item in req.items)

    resolved_files = []
    seen_paths = set()
    for image_id, path in selected_records:
        resolved = resolve_image_path(image_id, path)
        if not resolved or not os.path.isfile(resolved):
            continue
        if db.is_internal_media_path(resolved):
            continue
        if os.path.splitext(resolved)[1].lower() not in db.MEDIA_EXTENSIONS:
            continue

        normalized_path = os.path.normcase(os.path.abspath(resolved))
        if normalized_path in seen_paths:
            continue
        seen_paths.add(normalized_path)
        resolved_files.append((image_id, resolved))

    if not resolved_files:
        raise HTTPException(status_code=404, detail="找不到可下載的選取作品")

    temporary_path = ""
    try:
        with tempfile.NamedTemporaryFile(prefix="pixivutil2-selected-", suffix=".zip", delete=False) as temporary_file:
            temporary_path = temporary_file.name

        archive_names = set()
        with zipfile.ZipFile(temporary_path, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
            for image_id, resolved in resolved_files:
                filename = os.path.basename(resolved) or f"image-{image_id}"
                archive_name = f"{image_id}_{filename}"
                stem, extension = os.path.splitext(archive_name)
                suffix = 2
                while archive_name.casefold() in archive_names:
                    archive_name = f"{stem}_{suffix}{extension}"
                    suffix += 1
                archive_names.add(archive_name.casefold())
                archive.write(resolved, arcname=archive_name)

        return FileResponse(
            temporary_path,
            media_type="application/zip",
            filename="pixivutil2-selected-works.zip",
            background=BackgroundTask(cleanup_temporary_file, temporary_path),
        )
    except Exception as err:
        if temporary_path:
            cleanup_temporary_file(temporary_path)
        raise HTTPException(status_code=500, detail=f"建立 ZIP 下載檔失敗：{err}") from err


def _move_media_records_to_app_trash(
    requested_ids: List[int],
    selected_records: List[tuple[int, str]],
) -> Dict[str, Any]:
    """Move source files into the app recycle area and record every move."""
    if not requested_ids and not selected_records:
        return {
            "trashed_items": 0,
            "moved_files": 0,
            "missing_files": 0,
            "errors": [],
        }

    moved_records = []
    moved_paths = []
    seen_records = set()
    seen_sources = set()
    missing_files = 0

    def rollback_moves() -> None:
        for original_path, trash_path in reversed(moved_paths):
            if not os.path.exists(trash_path):
                continue
            try:
                os.makedirs(os.path.dirname(original_path), exist_ok=True)
                shutil.move(trash_path, original_path)
            except OSError as rollback_error:
                print(f"Failed to restore {original_path} after trash error: {rollback_error}")

    try:
        for image_id, database_path in selected_records:
            record_key = (
                int(image_id),
                os.path.normcase(os.path.normpath(str(database_path or ""))),
            )
            if record_key in seen_records:
                continue
            seen_records.add(record_key)

            # Do not fall back to an image-ID filename search here. A missing
            # DB path must never cause an unrelated file to be moved.
            resolved = resolve_image_path(None, database_path)
            if not resolved or not os.path.isfile(resolved):
                missing_files += 1
                continue
            if db.is_internal_media_path(resolved):
                continue

            normalized_source = os.path.normcase(os.path.abspath(resolved))
            if normalized_source in seen_sources:
                continue
            seen_sources.add(normalized_source)

            trash_path = db.get_trash_destination(resolved, int(image_id))
            os.makedirs(os.path.dirname(trash_path), exist_ok=True)
            shutil.move(resolved, trash_path)
            moved_paths.append((resolved, trash_path))
            moved_records.append((int(image_id), database_path, resolved, trash_path))
    except OSError as err:
        rollback_moves()
        raise HTTPException(status_code=500, detail=f"移至回收區失敗：{err}") from err

    try:
        trashed_db_entries = db.mark_images_as_trashed(requested_ids, moved_records)
    except Exception as err:
        rollback_moves()
        raise HTTPException(status_code=500, detail=f"記錄回收區項目失敗：{err}") from err

    # Trashed files must not remain in the in-memory gallery/index cache.
    db.invalidate_scan_cache()

    moved_ids = {image_id for image_id, *_ in moved_records}
    return {
        "trashed_items": max(len(moved_ids), trashed_db_entries),
        "trashed_db_entries": trashed_db_entries,
        "moved_files": len(moved_records),
        "missing_files": missing_files,
        "errors": [],
    }


@app.post("/api/images/batch-trash")
@app.post("/api/images/batch-delete")
def batch_trash(req: BatchDeleteRequest):
    """Move selected media to a recoverable trash directory.

    ``batch-delete`` remains as a safe compatibility alias for older clients;
    neither route permanently deletes a file or database record.
    """
    requested_ids = list(dict.fromkeys(
        [*req.image_ids, *(item.image_id for item in req.items)]
    ))
    selected_records = db.get_image_paths_by_ids(requested_ids)
    selected_records.extend((item.image_id, item.path) for item in req.items)
    return _move_media_records_to_app_trash(requested_ids, selected_records)


@app.post("/api/artists/{artist_id}/trash")
def trash_artist(artist_id: str):
    """Move all currently discoverable works for one artist to app trash."""
    artist_key = str(artist_id).strip()
    if artist_key == "-1":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="未分類圖片請用批次操作")

    try:
        artist_items, _total, _months = db.get_images(
            artist_id=artist_key,
            limit=10_000_000,
            offset=0,
        )
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
    selected_records = [
        (int(item["image_id"]), str(item.get("save_name") or ""))
        for item in artist_items
        if item.get("save_name")
    ]
    requested_ids = list(dict.fromkeys(int(item["image_id"]) for item in artist_items))
    result = _move_media_records_to_app_trash(requested_ids, selected_records)
    response_artist_id: object = int(artist_key) if artist_key.lstrip("-").isdigit() else artist_key
    return {**result, "artist_id": response_artist_id}


def _send_trash_entries_to_system_recycle(trash_ids: List[int]) -> Dict[str, Any]:
    requested_ids = list(dict.fromkeys(int(trash_id) for trash_id in trash_ids))
    if not requested_ids:
        return {"moved": 0, "errors": []}

    entries_by_id = {
        int(entry["trash_id"]): entry
        for entry in db.get_trash_entries()
        if entry.get("trash_id") is not None
    }
    moved_ids: List[int] = []
    errors: List[str] = []
    for trash_id in requested_ids:
        entry = entries_by_id.get(trash_id)
        if not entry:
            errors.append(f"找不到回收區項目 #{trash_id}")
            continue
        trash_path = str(entry.get("trash_path") or "")
        if not trash_path or not os.path.isfile(trash_path):
            errors.append(f"{entry.get('file_name') or trash_id}：找不到回收區檔案")
            continue
        trash_parent = os.path.basename(os.path.dirname(os.path.abspath(trash_path)))
        if trash_parent.casefold() != db.RECYCLE_DIRECTORY_NAME.casefold():
            errors.append(f"{entry.get('file_name') or trash_id}：回收區路徑無效")
            continue
        try:
            recycle_bin.send_path_to_system_recycle_bin(trash_path)
            moved_ids.append(trash_id)
        except (OSError, ValueError) as error:
            errors.append(f"{entry.get('file_name') or trash_id}：{error}")

    if moved_ids:
        try:
            db.mark_trash_entries_sent_to_system_recycle(moved_ids)
        except Exception as error:
            # The file has already been handed to Windows. Surface the DB
            # error instead of pretending the app recycle list is in sync.
            errors.append(f"更新回收區記錄失敗：{error}")

    return {"moved": len(moved_ids), "errors": errors}


@app.get("/api/recycle-bin")
def read_recycle_bin():
    entries = db.get_trash_entries()
    return {
        "entries": entries,
        "total": len(entries),
    }


@app.post("/api/recycle-bin/{trash_id}/send-to-system")
def send_trash_entry_to_system(trash_id: int):
    result = _send_trash_entries_to_system_recycle([trash_id])
    if result["moved"] == 0 and result["errors"]:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=result["errors"][0])
    return result


@app.post("/api/recycle-bin/send-all-to-system")
def send_all_trash_to_system():
    result = _send_trash_entries_to_system_recycle(
        [int(entry["trash_id"]) for entry in db.get_trash_entries()]
    )
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
