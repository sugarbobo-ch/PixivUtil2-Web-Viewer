"""Web Viewer configuration application service.

Routes should translate HTTP concerns; this service owns the config file
contract, source validation and persistence rules so the same behavior can be
tested without booting FastAPI.
"""

from __future__ import annotations

import json
import os
from typing import Any, Callable, Dict, Mapping

import config_paths
import db
import path_picker


class WebConfigServiceError(ValueError):
    """A user-correctable configuration error with an HTTP-facing status."""

    def __init__(self, detail: str, status_code: int = 422) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class WebConfigService:
    def __init__(
        self,
        path: str,
        default_config: Mapping[str, Any],
        normalize: Callable[[Any], Dict[str, Any]],
    ) -> None:
        self.path = os.path.abspath(path)
        self.default_config = dict(default_config)
        self.normalize = normalize

    def read(self) -> Dict[str, Any]:
        if not os.path.exists(self.path):
            default_config = dict(self.default_config)
            self._write(default_config)
            return default_config

        try:
            with open(self.path, "r", encoding="utf-8") as config_file:
                current = json.load(config_file)
            normalized = self.normalize(current)
            if normalized != current:
                self._write(normalized)
            return normalized
        except Exception as error:
            raise WebConfigServiceError(
                f"Failed to read web_config.json: {error}",
                status_code=500,
            ) from error

    def update(self, data: Mapping[str, Any]) -> Dict[str, Any]:
        try:
            current = self.read()
            incoming = dict(data)
            if "blurEnabled" not in incoming and "mosaicEnabled" in incoming:
                incoming["blurEnabled"] = incoming["mosaicEnabled"]
            incoming.pop("mosaicEnabled", None)

            if "pixivConfigPath" in data:
                configured_path = data.get("pixivConfigPath")
                if configured_path:
                    try:
                        incoming["pixivConfigPath"] = path_picker.validate_selected_path(
                            str(configured_path),
                            "pixiv-config",
                            "existing-file",
                        )
                    except path_picker.PathPickerError as error:
                        raise WebConfigServiceError(str(error)) from error

            if "librarySourceMode" in data and data.get("librarySourceMode") not in {
                "unconfigured", "pixiv", "folder",
            }:
                raise WebConfigServiceError("不支援的媒體來源模式。")

            effective_source_mode = incoming.get("librarySourceMode", current.get("librarySourceMode"))
            if "mediaRootPath" in data:
                configured_root = data.get("mediaRootPath")
                if effective_source_mode == "pixiv":
                    incoming["mediaRootPath"] = ""
                elif configured_root:
                    try:
                        incoming["mediaRootPath"] = path_picker.validate_selected_path(
                            str(configured_root),
                            "root-directory",
                            "folder",
                        )
                    except path_picker.PathPickerError as error:
                        raise WebConfigServiceError(str(error)) from error

            current.update(incoming)
            normalized = self.normalize(current)
            if normalized.get("librarySourceMode") == "pixiv":
                normalized["mediaRootPath"] = ""
            if "thumbnailSize" in incoming:
                normalized.pop("thumbnailWidth", None)
                normalized.pop("thumbnailHeight", None)

            # Keep the legacy db facade synchronized until its repository
            # boundary is migrated to RuntimeContext in the backend batch.
            db.PIXIV_DB_PATH = config_paths.get_pixiv_database_path(normalized)
            self._write(normalized)
            return normalized
        except WebConfigServiceError:
            raise
        except Exception as error:
            raise WebConfigServiceError(
                f"Failed to save web_config.json: {error}",
                status_code=500,
            ) from error

    def _write(self, data: Mapping[str, Any]) -> None:
        with open(self.path, "w", encoding="utf-8") as config_file:
            json.dump(dict(data), config_file, indent=2)
