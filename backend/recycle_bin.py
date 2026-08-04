"""Small Windows shell integration for recoverable source-file deletion."""

import ctypes
import os
from ctypes import wintypes


FO_DELETE = 0x0003
FOF_SILENT = 0x0004
FOF_NOCONFIRMATION = 0x0010
FOF_ALLOWUNDO = 0x0040
FOF_NOERRORUI = 0x0400


class _SHFileOperation(ctypes.Structure):
    _fields_ = [
        ("hwnd", wintypes.HWND),
        ("wFunc", wintypes.UINT),
        ("pFrom", wintypes.LPCWSTR),
        ("pTo", wintypes.LPCWSTR),
        ("fFlags", wintypes.UINT),
        ("fAnyOperationsAborted", wintypes.BOOL),
        ("hNameMappings", wintypes.LPVOID),
        ("lpszProgressTitle", wintypes.LPCWSTR),
    ]


def send_path_to_system_recycle_bin(file_path: str) -> None:
    """Move one app-trash path to the Windows Recycle Bin.

    ``FOF_ALLOWUNDO`` is intentionally required: the shell owns the final
    move and can restore the file later. We never call ``os.remove`` here.
    """
    absolute_path = os.path.abspath(file_path)
    if not os.path.isfile(absolute_path) and not os.path.isdir(absolute_path):
        raise FileNotFoundError(absolute_path)
    if os.name != "nt":
        raise OSError("將檔案移至系統資源回收筒目前只支援 Windows")

    # SHFileOperation expects a double-NUL-terminated list of paths.
    source_buffer = ctypes.create_unicode_buffer(absolute_path + "\0\0")
    operation = _SHFileOperation(
        hwnd=None,
        wFunc=FO_DELETE,
        pFrom=ctypes.cast(source_buffer, wintypes.LPCWSTR),
        pTo=None,
        fFlags=FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI,
        fAnyOperationsAborted=False,
        hNameMappings=None,
        lpszProgressTitle=None,
    )
    result = ctypes.windll.shell32.SHFileOperationW(ctypes.byref(operation))
    if result != 0:
        raise OSError(f"Windows Shell 回收操作失敗（錯誤碼 {result}）")
    if operation.fAnyOperationsAborted:
        raise OSError("Windows Shell 回收操作被取消")

