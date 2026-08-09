"""Native path picker and authoritative validation for the local Web Viewer."""

from __future__ import annotations

import configparser
import os
import threading
from typing import Any, Dict, Optional


PICKER_TIMEOUT_SECONDS = 90.0
VIEWER_CACHE_DIRECTORY = os.path.abspath(os.path.join(os.path.dirname(__file__), "cache_thumbs"))
VIEWER_INTERNAL_DIRECTORY = os.path.abspath(os.path.join(os.path.dirname(__file__), "_state"))

PICKER_PURPOSES: Dict[str, Dict[str, Any]] = {
    "root-directory": {
        "mode": "folder",
        "access": "read",
    },
    "pixiv-config": {
        "mode": "existing-file",
        "access": "read",
        "extensions": (".ini",),
        "parse_config": True,
    },
    "download-list-directory": {
        "mode": "folder",
        "access": "write",
    },
    "database-file": {
        "mode": "save-file",
        "access": "read-write",
        "extensions": (".db", ".sqlite", ".sqlite3"),
    },
    "irfanview-directory": {
        "mode": "folder",
        "access": "read",
    },
    "ffmpeg-executable": {
        "mode": "existing-file",
        "access": "read",
        "extensions": (".exe", ".bat", ".cmd"),
    },
    "fanbox-list-file": {
        "mode": "existing-file",
        "access": "read",
        "extensions": (".txt", ".csv"),
    },
}


class PathPickerError(Exception):
    """Base class for recoverable picker and validation errors."""


class PickerBusyError(PathPickerError):
    pass


class PickerUnavailableError(PathPickerError):
    pass


class PickerTimeoutError(PathPickerError):
    pass


_PICKER_LOCK = threading.Lock()


def get_picker_purposes() -> Dict[str, Dict[str, Any]]:
    """Return a copy suitable for diagnostics without exposing mutable state."""
    return {key: dict(value) for key, value in PICKER_PURPOSES.items()}


def _normalise_path(value: str) -> str:
    expanded = os.path.expandvars(os.path.expanduser(str(value).strip()))
    if not os.path.isabs(expanded):
        expanded = os.path.abspath(expanded)
    # Resolve Windows 8.3 aliases (for example, RUNNER~1) so returned paths
    # are stable across native picker, Path.resolve(), and persisted config.
    return os.path.normpath(os.path.realpath(expanded))


def _is_within(path: str, directory: str) -> bool:
    try:
        return os.path.commonpath([
            os.path.normcase(os.path.abspath(path)),
            os.path.normcase(os.path.abspath(directory)),
        ]) == os.path.normcase(os.path.abspath(directory))
    except ValueError:
        return False


def _is_internal_directory(path: str) -> bool:
    parts = {
        part.casefold()
        for part in os.path.normpath(os.path.abspath(path)).split(os.sep)
    }
    return bool(parts & {"_state", ".pixivutil2-trash", ".viewer-trash"})


def _validate_folder(path: str, access: str) -> None:
    if not os.path.isdir(path):
        raise PathPickerError("選取的資料夾不存在或不是資料夾。")
    if not os.access(path, os.R_OK | os.X_OK):
        raise PathPickerError("選取的資料夾沒有讀取權限。")
    if access in {"write", "read-write"} and not os.access(path, os.W_OK):
        raise PathPickerError("選取的資料夾沒有寫入權限。")


def _validate_extension(path: str, extensions: tuple[str, ...]) -> None:
    if extensions and os.path.splitext(path)[1].casefold() not in extensions:
        labels = ", ".join(extensions)
        raise PathPickerError(f"檔案類型不符合要求（允許：{labels}）。")


def _validate_file(path: str, metadata: Dict[str, Any]) -> None:
    if not os.path.isfile(path):
        raise PathPickerError("選取的檔案不存在或不是檔案。")
    _validate_extension(path, tuple(metadata.get("extensions", ())))
    access = metadata.get("access")
    if access in {"read", "read-write"} and not os.access(path, os.R_OK):
        raise PathPickerError("選取的檔案沒有讀取權限。")
    if access == "read-write" and not os.access(path, os.W_OK):
        raise PathPickerError("選取的檔案沒有寫入權限。")


def _validate_save_file(path: str, metadata: Dict[str, Any]) -> None:
    _validate_extension(path, tuple(metadata.get("extensions", ())))
    parent = os.path.dirname(path) or os.getcwd()
    if not os.path.isdir(parent) or not os.access(parent, os.W_OK):
        raise PathPickerError("儲存位置的資料夾不存在或沒有寫入權限。")
    if os.path.exists(path):
        if not os.path.isfile(path):
            raise PathPickerError("儲存位置不是檔案。")
        if not os.access(path, os.W_OK):
            raise PathPickerError("既有檔案沒有寫入權限。")


def _validate_pixiv_config(path: str) -> None:
    parser = configparser.ConfigParser(interpolation=None)
    try:
        with open(path, "r", encoding="utf-8") as handle:
            parser.read_file(handle)
    except (OSError, UnicodeError, configparser.Error) as error:
        raise PathPickerError("config.ini 無法讀取或解析。") from error
    if not parser.has_section("Settings"):
        raise PathPickerError("config.ini 缺少預期的 Settings 區段。")


def validate_selected_path(path: str, purpose: str, mode: str) -> str:
    metadata = PICKER_PURPOSES.get(purpose)
    if metadata is None:
        raise PathPickerError("不支援這個路徑用途。")
    if mode != metadata["mode"]:
        raise PathPickerError("路徑選擇模式與欄位用途不符。")

    normalized = _normalise_path(path)
    if purpose == "root-directory":
        if _is_internal_directory(normalized) or _is_within(normalized, VIEWER_CACHE_DIRECTORY) or _is_within(normalized, VIEWER_INTERNAL_DIRECTORY):
            raise PathPickerError("圖片根目錄不可位於 Web Viewer 快取或內部工作目錄。")

    if mode == "folder":
        _validate_folder(normalized, metadata["access"])
    elif mode == "existing-file":
        _validate_file(normalized, metadata)
    elif mode == "save-file":
        _validate_save_file(normalized, metadata)
    else:
        raise PathPickerError("不支援這個選擇模式。")

    if metadata.get("parse_config"):
        _validate_pixiv_config(normalized)
    return normalized


def _show_native_picker(mode: str, purpose: str) -> Optional[str]:
    metadata = PICKER_PURPOSES[purpose]
    try:
        import tkinter as tk
        from tkinter import filedialog
    except Exception as error:
        raise PickerUnavailableError("目前環境沒有可用的桌面路徑選擇器。") from error

    root = None
    try:
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        extensions = tuple(metadata.get("extensions", ()))
        filetypes = [("允許的檔案", " ".join(f"*{extension}" for extension in extensions))] if extensions else [("所有檔案", "*.*")]
        if mode == "folder":
            return filedialog.askdirectory(title="選擇資料夾", mustexist=True, parent=root) or None
        if mode == "existing-file":
            return filedialog.askopenfilename(title="選擇檔案", filetypes=filetypes, parent=root) or None
        if mode == "save-file":
            default_extension = extensions[0] if extensions else ""
            return filedialog.asksaveasfilename(title="選擇儲存位置", filetypes=filetypes, defaultextension=default_extension, parent=root) or None
        raise PathPickerError("不支援這個選擇模式。")
    except PathPickerError:
        raise
    except Exception as error:
        raise PickerUnavailableError("無法開啟桌面路徑選擇器。") from error
    finally:
        if root is not None:
            try:
                root.destroy()
            except Exception:
                pass


def open_native_picker(mode: str, purpose: str) -> Dict[str, str]:
    """Open one native picker on a dedicated worker and validate its result."""
    metadata = PICKER_PURPOSES.get(purpose)
    if metadata is None or metadata.get("mode") != mode:
        raise PathPickerError("不支援這個路徑選擇用途或模式。")
    if not _PICKER_LOCK.acquire(blocking=False):
        raise PickerBusyError("已有選擇視窗開啟中。")

    result: Dict[str, Any] = {}
    completed = threading.Event()

    def worker() -> None:
        try:
            result["path"] = _show_native_picker(mode, purpose)
        except Exception as error:
            result["error"] = error
        finally:
            completed.set()
            _PICKER_LOCK.release()

    try:
        threading.Thread(target=worker, name="web-viewer-native-picker", daemon=True).start()
    except Exception:
        _PICKER_LOCK.release()
        raise

    if not completed.wait(PICKER_TIMEOUT_SECONDS):
        raise PickerTimeoutError("路徑選擇器逾時，請確認桌面工作階段仍可用。")
    error = result.get("error")
    if error is not None:
        if isinstance(error, PathPickerError):
            raise error
        raise PickerUnavailableError("無法開啟桌面路徑選擇器。") from error
    selected_path = result.get("path")
    if not selected_path:
        return {"status": "cancelled"}
    validated = validate_selected_path(str(selected_path), purpose, mode)
    return {"status": "selected", "path": validated}
