import asyncio
import io
import json
import os
import tempfile
import unittest
import zipfile
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import db
import main


async def asgi_request(
    method: str,
    path: str,
    *,
    query: str = "",
    body: bytes = b"",
    headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, str], bytes]:
    request_headers = [
        (key.lower().encode("latin-1"), value.encode("latin-1"))
        for key, value in (headers or {}).items()
    ]
    messages: list[dict[str, object]] = []
    request_sent = False

    async def receive() -> dict[str, object]:
        nonlocal request_sent
        if request_sent:
            return {"type": "http.disconnect"}
        request_sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message: dict[str, object]) -> None:
        messages.append(message)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": query.encode("ascii"),
        "root_path": "",
        "headers": request_headers,
        "client": ("testclient", 50000),
        "server": ("testserver", 80),
    }
    await main.app(scope, receive, send)

    start = next(message for message in messages if message["type"] == "http.response.start")
    response_headers = {
        key.decode("latin-1"): value.decode("latin-1")
        for key, value in start.get("headers", [])  # type: ignore[union-attr]
    }
    response_body = b"".join(
        message.get("body", b"")  # type: ignore[union-attr]
        for message in messages
        if message["type"] == "http.response.body"
    )
    return int(start["status"]), response_headers, response_body


def request_json_body(data: dict[str, object]) -> bytes:
    return json.dumps(data).encode("utf-8")


@contextmanager
def installed_runtime_context(**values: object):
    state = main.app.state
    previous = getattr(state, "runtime_context", None)
    state.runtime_context = SimpleNamespace(**values)
    try:
        yield
    finally:
        if previous is None:
            if hasattr(state, "runtime_context"):
                delattr(state, "runtime_context")
        else:
            state.runtime_context = previous


class MainHttpRouteCharacterizationTests(unittest.TestCase):
    def request(self, method: str, path: str, **kwargs: object) -> tuple[int, dict[str, str], bytes]:
        return asyncio.run(asgi_request(method, path, **kwargs))

    def test_web_config_http_boundary_uses_runtime_service(self):
        service = Mock()
        service.read.return_value = {"webTheme": "dark"}
        service.update.return_value = {"webTheme": "light"}

        with installed_runtime_context(web_config_service=service):
            read_status, _, read_body = self.request("GET", "/api/web-config")
            update_status, _, update_body = self.request(
                "POST",
                "/api/web-config",
                body=request_json_body({"webTheme": "light"}),
                headers={"content-type": "application/json"},
            )

        self.assertEqual(read_status, 200)
        self.assertEqual(json.loads(read_body), {"webTheme": "dark"})
        self.assertEqual(update_status, 200)
        self.assertEqual(
            json.loads(update_body),
            {"status": "success", "webConfig": {"webTheme": "light"}},
        )
        service.read.assert_called_once_with()
        service.update.assert_called_once_with({"webTheme": "light"})

    def test_system_session_and_picker_enforce_origin_and_session(self):
        session_status, _, session_body = self.request(
            "GET",
            "/api/system/session",
            headers={"origin": "http://localhost:3000"},
        )
        self.assertEqual(session_status, 200)
        self.assertEqual(json.loads(session_body), {"token": main.VIEWER_SESSION_TOKEN})

        picker = Mock(return_value={"path": "C:/media"})
        with patch.object(main.path_picker, "open_native_picker", picker):
            picker_status, _, picker_body = self.request(
                "POST",
                "/api/system/picker",
                body=request_json_body({"mode": "folder", "purpose": "root-directory"}),
                headers={
                    "content-type": "application/json",
                    "origin": "http://localhost:3000",
                    "x-web-viewer-session": main.VIEWER_SESSION_TOKEN,
                },
            )
            rejected_status, _, _ = self.request(
                "POST",
                "/api/system/picker",
                body=request_json_body({"mode": "folder", "purpose": "root-directory"}),
                headers={
                    "content-type": "application/json",
                    "origin": "https://untrusted.example",
                    "x-web-viewer-session": main.VIEWER_SESSION_TOKEN,
                },
            )

        self.assertEqual(picker_status, 200)
        self.assertEqual(json.loads(picker_body), {"path": "C:/media"})
        self.assertEqual(rejected_status, 403)
        picker.assert_called_once_with("folder", "root-directory")

    def test_file_and_thumbnail_routes_preserve_containment_and_response_contract(self):
        with tempfile.TemporaryDirectory() as temporary:
            media_path = Path(temporary) / "inside.jpg"
            media_path.write_bytes(b"jpeg-bytes")

            with patch.object(main, "resolve_image_path", return_value=str(media_path)), patch.object(
                main.db, "is_usable_media_file", return_value=True
            ):
                file_status, file_headers, file_body = self.request(
                    "GET",
                    "/api/file",
                    query="path=inside.jpg",
                )

            with patch.object(main, "resolve_image_path", return_value=None):
                traversal_status, _, _ = self.request(
                    "GET",
                    "/api/file",
                    query="path=..%2Foutside.jpg",
                )
                thumbnail_status, _, _ = self.request(
                    "GET",
                    "/api/thumbnail",
                    query="path=..%2Foutside.jpg",
                )

        self.assertEqual(file_status, 200)
        self.assertEqual(file_body, b"jpeg-bytes")
        self.assertEqual(file_headers["content-type"], "image/jpeg")
        self.assertIn("private", file_headers["cache-control"])
        self.assertEqual(traversal_status, 404)
        self.assertEqual(thumbnail_status, 404)

    def test_open_media_is_guarded_on_non_windows(self):
        with patch.object(main.os, "name", "posix"):
            response_status, _, response_body = self.request(
                "POST",
                "/api/open-media",
                body=request_json_body({"path": "inside.jpg", "target": "file"}),
                headers={"content-type": "application/json"},
            )

        self.assertEqual(response_status, 501)
        self.assertIn("Windows", json.loads(response_body)["detail"])

    def test_download_zip_excludes_unresolved_paths_and_returns_archive(self):
        with tempfile.TemporaryDirectory() as temporary:
            inside = Path(temporary) / "inside.jpg"
            inside.write_bytes(b"inside")

            def resolve(_image_id: int | None, path: str | None) -> str | None:
                return str(inside) if path == "inside.jpg" else None

            with patch.object(main.db, "get_image_paths_by_ids", return_value=[]), patch.object(
                main, "resolve_image_path", side_effect=resolve
            ):
                response_status, response_headers, response_body = self.request(
                    "POST",
                    "/api/images/download-zip",
                    body=request_json_body({
                        "items": [
                            {"image_id": 7, "path": "inside.jpg"},
                            {"image_id": 8, "path": "../outside.jpg"},
                        ],
                    }),
                    headers={"content-type": "application/json"},
                )

        self.assertEqual(response_status, 200)
        self.assertEqual(response_headers["content-type"], "application/zip")
        with zipfile.ZipFile(io.BytesIO(response_body)) as archive:
            self.assertEqual(archive.namelist(), ["7_inside.jpg"])
            self.assertEqual(archive.read("7_inside.jpg"), b"inside")

    def test_batch_trash_moves_file_to_recoverable_destination(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "source.jpg"
            trash = Path(temporary) / "recycle" / "1_source.jpg"
            source.write_bytes(b"recoverable")

            with patch.object(main.db, "get_image_paths_by_ids", return_value=[]), patch.object(
                main, "resolve_image_path", return_value=str(source)
            ), patch.object(main.db, "get_trash_destination", return_value=str(trash)), patch.object(
                main.db, "mark_images_as_trashed", return_value=1
            ), patch.object(main.db, "invalidate_scan_cache"):
                response_status, _, response_body = self.request(
                    "POST",
                    "/api/images/batch-trash",
                    body=request_json_body({"items": [{"image_id": 1, "path": "source.jpg"}]}),
                    headers={"content-type": "application/json"},
                )

            self.assertEqual(response_status, 200)
            self.assertFalse(source.exists())
            self.assertTrue(trash.exists())
            self.assertEqual(trash.read_bytes(), b"recoverable")

        result = json.loads(response_body)
        self.assertEqual(result["moved_files"], 1)
        self.assertEqual(result["trashed_db_entries"], 1)
        self.assertEqual(result["errors"], [])

    def test_artist_source_link_route_resolves_for_artists(self):
        with patch(
            "db.get_managed_folder",
            return_value={"folder_id": "folder:123", "member_id": 12345, "identity_status": "inferred"},
        ), patch(
            "source_resolver.resolve_artist_source",
            return_value={"verified_member_id": 12345, "pixiv": {"platform": "pixiv", "url": "https://www.pixiv.net/users/12345", "source_id": "12345", "verified": True}, "fanbox": None},
        ):
            status_code, _, body = self.request("GET", "/api/artist-source-link", query="artist_id=12345")
            self.assertEqual(status_code, 200)
            data = json.loads(body)
            self.assertEqual(data["verified_member_id"], 12345)
            self.assertEqual(data["pixiv"]["url"], "https://www.pixiv.net/users/12345")

    def test_artist_and_recycle_bin_routes_keep_response_contract(self):
        rejected_status, _, _ = self.request("POST", "/api/artists/-1/trash")
        self.assertEqual(rejected_status, 422)

        with patch.object(
            main.db,
            "get_images",
            return_value=([{"image_id": 3, "save_name": "artist.jpg"}], 1, []),
        ), patch.object(
            main,
            "_move_media_records_to_app_trash",
            return_value={"moved_files": 1, "errors": []},
        ) as move_records:
            artist_status, _, artist_body = self.request("POST", "/api/artists/42/trash")

        self.assertEqual(artist_status, 200)
        self.assertEqual(json.loads(artist_body), {"moved_files": 1, "errors": [], "artist_id": 42})
        move_records.assert_called_once_with([3], [(3, "artist.jpg")])

        entries = [{"trash_id": 9, "file_name": "old.jpg", "trash_path": "C:/Recycle/old.jpg"}]
        with patch.object(main.db, "get_trash_entries", return_value=entries):
            list_status, _, list_body = self.request("GET", "/api/recycle-bin")
        self.assertEqual(list_status, 200)
        self.assertEqual(json.loads(list_body), {"entries": entries, "total": 1})

        with patch.object(main, "_send_trash_entries_to_system_recycle", return_value={"moved": 1, "errors": []}):
            send_status, _, send_body = self.request("POST", "/api/recycle-bin/9/send-to-system")
        self.assertEqual(send_status, 200)
        self.assertEqual(json.loads(send_body), {"moved": 1, "errors": []})

        with patch.object(main, "_send_trash_entries_to_system_recycle", return_value={"moved": 0, "errors": ["missing"]}):
            conflict_status, _, conflict_body = self.request("POST", "/api/recycle-bin/9/send-to-system")
        self.assertEqual(conflict_status, 409)
        self.assertEqual(json.loads(conflict_body)["detail"], "missing")

    def test_send_all_recycle_bin_uses_current_entry_ids(self):
        entries = [{"trash_id": 2}, {"trash_id": 5}, {"trash_id": 2}]
        with patch.object(main.db, "get_trash_entries", return_value=entries), patch.object(
            main, "_send_trash_entries_to_system_recycle", return_value={"moved": 2, "errors": []}
        ) as send_entries:
            response_status, _, response_body = self.request(
                "POST",
                "/api/recycle-bin/send-all-to-system",
            )

        self.assertEqual(response_status, 200)
        self.assertEqual(json.loads(response_body), {"moved": 2, "errors": []})
        send_entries.assert_called_once_with([2, 5, 2])


if __name__ == "__main__":
    unittest.main()
