"""HTTP adapter for the Web Viewer config service."""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

from services.web_config_service import WebConfigService, WebConfigServiceError


router = APIRouter()


def _get_service(request: Request) -> WebConfigService:
    runtime_context = getattr(request.app.state, "runtime_context", None)
    service = runtime_context.web_config_service if runtime_context is not None else None
    if service is None:
        raise HTTPException(status_code=503, detail="Web config service is not ready.")
    return service


@router.get("/api/web-config")
def get_web_config(request: Request):
    try:
        return _get_service(request).read()
    except WebConfigServiceError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error

@router.post("/api/web-config")
def update_web_config(data: Dict[str, Any], request: Request):
    try:
        return {"status": "success", "webConfig": _get_service(request).update(data)}
    except WebConfigServiceError as error:
        raise HTTPException(status_code=error.status_code, detail=error.detail) from error
