import os
import gc
import sqlite3
import shutil
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import db
import config_paths
import library_jobs
from library_jobs import LibraryJobManager
from PIL import Image


class MediaLibraryTests(unittest.TestCase):
    def setUp(self):
        self.original_db_path = db.DB_PATH
        self.original_pixiv_db_path = db.PIXIV_DB_PATH
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name) / "media"
        self.root.mkdir()
        self.original_media_root_reader = config_paths.get_media_root_directory
        config_paths.get_media_root_directory = lambda config=None: (
            self.original_media_root_reader(config) if config is not None else str(self.root)
        )
        self.original_thumb_cache_dir = library_jobs.THUMB_CACHE_DIR
        self.original_thumb_recovery_dir = library_jobs.THUMB_CACHE_RECOVERY_DIR
        library_jobs.THUMB_CACHE_DIR = str(Path(self.temp_dir.name) / "cache_thumbs")
        library_jobs.THUMB_CACHE_RECOVERY_DIR = str(Path(library_jobs.THUMB_CACHE_DIR) / ".viewer-trash")
        library_jobs._CACHE_ACCESS_LAST_TOUCH.clear()
        db.DB_PATH = str(Path(self.temp_dir.name) / "viewer.sqlite")
        # Tests must never import or inspect the real PixivUtil2 database.
        db.PIXIV_DB_PATH = str(Path(self.temp_dir.name) / "missing-pixiv.sqlite")
        db.invalidate_scan_cache()
        db.init_db_schema()
        self.manager = None

    def tearDown(self):
        if self.manager is not None:
            self.manager.close(timeout=10.0)
        db.invalidate_scan_cache()
        db.DB_PATH = self.original_db_path
        db.PIXIV_DB_PATH = self.original_pixiv_db_path
        config_paths.get_media_root_directory = self.original_media_root_reader
        library_jobs.THUMB_CACHE_DIR = self.original_thumb_cache_dir
        library_jobs.THUMB_CACHE_RECOVERY_DIR = self.original_thumb_recovery_dir
        library_jobs._CACHE_ACCESS_LAST_TOUCH.clear()
        gc.collect()
        temp_path = Path(self.temp_dir.name)
        cleanup_error = None
        try:
            self.temp_dir.cleanup()
        except OSError as error:
            cleanup_error = error

        # SQLite WAL files can be released a few milliseconds after the last
        # connection closes on Windows. Retry only this test-owned temp path;
        # a persistent failure still fails teardown instead of being hidden.
        for _attempt in range(20):
            if not temp_path.exists():
                break
            try:
                shutil.rmtree(temp_path)
            except OSError as error:
                cleanup_error = error
                gc.collect()
                time.sleep(0.05)
            else:
                cleanup_error = None
                break

        if cleanup_error is not None and temp_path.exists():
            raise cleanup_error

    def _write_media(self, name: str, content: bytes = b"media") -> Path:
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path

    def test_scan_preserves_conflicting_artwork_ids(self):
        first = self._write_media("12345678_p0.jpg", b"first")
        second = self._write_media("12345678_p1.jpg", b"second")

        result = db.scan_and_index_directory(str(self.root))

        self.assertEqual(result["added"], 2)
        self.assertEqual(result["conflicts"], 1)
        conn = db.get_db_connection()
        try:
            rows = conn.execute(
                "SELECT image_id, save_name FROM pixiv_master_image ORDER BY save_name"
            ).fetchall()
        finally:
            conn.close()
        self.assertEqual({row["save_name"] for row in rows}, {str(first), str(second)})
        self.assertEqual(len({row["image_id"] for row in rows}), 2)

    def test_pixiv_database_is_read_only_during_snapshot_import(self):
        source_path = Path(self.temp_dir.name) / "pixiv-source.sqlite"
        with sqlite3.connect(source_path) as source_conn:
            source_conn.executescript(
                """
                CREATE TABLE pixiv_master_member (
                    member_id INTEGER PRIMARY KEY,
                    name TEXT,
                    save_folder TEXT,
                    created_date DATE,
                    last_update_date DATE
                );
                CREATE TABLE pixiv_master_image (
                    image_id INTEGER PRIMARY KEY,
                    member_id INTEGER,
                    title TEXT,
                    save_name TEXT,
                    created_date DATE,
                    last_update_date DATE
                );
                INSERT INTO pixiv_master_member
                    (member_id, name, save_folder)
                VALUES (4252792, 'Read-only Artist', 'Read-only Artist');
                INSERT INTO pixiv_master_image
                    (image_id, member_id, title, save_name)
                VALUES (12345678, 4252792, 'Existing', 'F:/Pixiv/Read-only Artist/12345678.jpg');
                """
            )

        before = source_path.read_bytes()
        db.PIXIV_DB_PATH = str(source_path)
        db.sync_pixiv_snapshot()
        after = source_path.read_bytes()

        self.assertEqual(before, after)
        with db.get_db_connection() as viewer_conn:
            row = viewer_conn.execute(
                "SELECT title FROM pixiv_master_image WHERE image_id = ?",
                (12345678,),
            ).fetchone()
        self.assertEqual(row["title"], "Existing")

    def test_scan_classifies_unchanged_and_updated_files(self):
        path = self._write_media("87654321.jpg", b"original")

        first = db.scan_and_index_directory(str(self.root))
        second = db.scan_and_index_directory(str(self.root))
        path.write_bytes(b"changed-size")
        os.utime(path, None)
        third = db.scan_and_index_directory(str(self.root))

        self.assertEqual(first["added"], 1)
        self.assertEqual(second["unchanged"], 1)
        self.assertEqual(third["updated"], 1)

    def test_newest_month_oldest_images_uses_created_date(self):
        items = [
            {
                "image_id": 1,
                "save_name": "new-month-new-image.jpg",
                "created_date": "2026-08-20 12:00:00",
                "last_update_date": "2020-01-01 00:00:00",
            },
            {
                "image_id": 2,
                "save_name": "old-month.jpg",
                "created_date": "2026-07-31 12:00:00",
                "last_update_date": "2030-01-01 00:00:00",
            },
            {
                "image_id": 3,
                "save_name": "new-month-old-image.jpg",
                "created_date": "2026-08-01 12:00:00",
                "last_update_date": "2031-01-01 00:00:00",
            },
        ]

        sorted_items = db._sort_gallery_items(items, "newest_month_oldest_works")

        self.assertEqual([item["image_id"] for item in sorted_items], [3, 1, 2])

    def test_newest_works_keep_pages_in_natural_order(self):
        items = [
            {
                "image_id": 12,
                "save_name": "F:/Pixiv/artist/20000002_p2.png",
                "created_date": "2026-08-20 12:00:00",
            },
            {
                "image_id": 3,
                "save_name": "F:/Pixiv/artist/10000001_p3.png",
                "created_date": "2026-08-19 12:00:00",
            },
            {
                "image_id": 11,
                "save_name": "F:/Pixiv/artist/20000002_p1.png",
                "created_date": "2026-08-21 12:00:00",
            },
            {
                "image_id": 1,
                "save_name": "F:/Pixiv/artist/10000001_p1.png",
                "created_date": "2026-08-19 12:00:00",
            },
            {
                "image_id": 10,
                "save_name": "F:/Pixiv/artist/20000002_p10.png",
                "created_date": "2026-08-18 12:00:00",
            },
            {
                "image_id": 2,
                "save_name": "F:/Pixiv/artist/10000001_p2.png",
                "created_date": "2026-08-19 12:00:00",
            },
            {
                "image_id": 99,
                "save_name": "F:/Pixiv/artist/99999999_p1.png",
                "created_date": "2026-07-31 12:00:00",
            },
        ]

        sorted_items = db._sort_gallery_items(items, "newest_works_pages_ascending")

        self.assertEqual(
            [item["image_id"] for item in sorted_items],
            [11, 12, 10, 1, 2, 3, 99],
        )

    def test_pixiv_media_root_ignores_folder_only_path(self):
        pixiv_root = Path(self.temp_dir.name) / "pixiv-root"
        pixiv_root.mkdir()
        folder_only_root = Path(self.temp_dir.name) / "folder-only-root"
        folder_only_root.mkdir()
        config_path = Path(self.temp_dir.name) / "config.ini"
        config_path.write_text(
            f"[Settings]\nrootDirectory = {pixiv_root}\n",
            encoding="utf-8",
        )

        resolved = config_paths.get_media_root_directory({
            "librarySourceMode": "pixiv",
            "pixivConfigPath": str(config_path),
            "mediaRootPath": str(folder_only_root),
        })

        self.assertTrue(os.path.samefile(resolved, pixiv_root))

    def test_indexing_does_not_modify_source_media_bytes(self):
        path = self._write_media("65432109.jpg", b"source-bytes")
        before = path.read_bytes()

        db.scan_and_index_directory(str(self.root))

        self.assertEqual(path.read_bytes(), before)

    def test_nested_media_uses_stable_top_level_folder_identity(self):
        archive = self.root / "Discord FANBOX Archive comodox [4252792]"
        image = self._write_media(
            str(Path(archive.name) / "extracted" / "12345678.jpg"),
            b"nested-image",
        )

        result = db.scan_and_index_directory(str(self.root))

        self.assertEqual(result["scanned"], 1)
        expected_member_id = db.get_folder_member_id(str(archive))
        self.assertGreaterEqual(expected_member_id, db.SYNTHETIC_MEMBER_ID_BASE)
        self.assertEqual(
            db._member_for_media_path(str(self.root), str(image.parent)),
            (expected_member_id, archive.name),
        )
        conn = db.get_db_connection()
        try:
            image_row = conn.execute(
                "SELECT member_id FROM pixiv_master_image WHERE save_name = ?",
                (str(image),),
            ).fetchone()
            member_row = conn.execute(
                "SELECT name FROM pixiv_master_member WHERE member_id = ?",
                (expected_member_id,),
            ).fetchone()
        finally:
            conn.close()
        self.assertEqual(image_row["member_id"], expected_member_id)
        self.assertEqual(member_row["name"], archive.name)

    def test_artist_list_uses_root_first_level_scopes_only(self):
        self._write_media("Artist A/extracted/001.jpg", b"nested-a")
        self._write_media("Artist A/Manga 01/002.jpg", b"nested-a-2")
        self._write_media("Artist B/003.jpg", b"artist-b")
        db.scan_and_index_directory(str(self.root))

        # This row represents a member imported from PixivUtil2, but it has
        # no corresponding first-level directory under the configured root.
        conn = db.get_db_connection()
        try:
            conn.execute(
                """
                INSERT INTO pixiv_master_member
                    (member_id, name, save_folder, created_date, last_update_date)
                VALUES (?, ?, ?, ?, ?)
                """,
                (4252792, "Source-only member", "Source-only member", "2026-01-01", "2026-01-01"),
            )
            conn.commit()
        finally:
            conn.close()

        original_workspace_root = config_paths.WORKSPACE_ROOT
        original_config_path_reader = config_paths.get_pixiv_config_path
        config_paths.WORKSPACE_ROOT = str(self.root)
        config_paths.get_pixiv_config_path = lambda: str(self.root / "missing-config.ini")
        try:
            artists = db.get_all_artists()
        finally:
            config_paths.WORKSPACE_ROOT = original_workspace_root
            config_paths.get_pixiv_config_path = original_config_path_reader

        self.assertEqual(
            [artist["name"] for artist in artists],
            ["Artist A", "Artist B"],
        )
        self.assertEqual(artists[0]["artwork_count"], 2)
        self.assertEqual(artists[1]["artwork_count"], 1)

    def test_artist_filter_uses_first_level_path_for_imported_rows(self):
        artist_directory = self.root / "Path Artist"
        artist_directory.mkdir()
        db.discover_root_scopes(str(self.root))
        artist_id = db.get_folder_member_id(str(artist_directory))
        imported_path = artist_directory / "nested" / "imported.jpg"

        conn = db.get_db_connection()
        try:
            conn.execute(
                """
                INSERT INTO pixiv_master_image
                    (image_id, member_id, title, save_name, created_date, last_update_date)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (76543210, 1234567, "Imported path row", str(imported_path), "2026-02-01", "2026-02-01"),
            )
            conn.commit()
        finally:
            conn.close()

        images, total, _months = db.get_images(artist_id=artist_id)

        self.assertEqual(total, 1)
        self.assertEqual(images[0]["save_name"], str(imported_path))

    def test_same_member_id_folders_have_independent_artist_scopes(self):
        discord_folder = self._write_media(
            "Discord FANBOX comodox (4252792)/discord.jpg",
            b"discord",
        )
        fanbox_folder = self._write_media(
            "FANBOX comodox (4252792)/fanbox.jpg",
            b"fanbox",
        )

        db.scan_and_index_directory(str(self.root))

        artists = [artist for artist in db.get_all_artists() if artist["member_id"] == 4252792]
        self.assertEqual(len(artists), 2)
        self.assertEqual(len({artist["folder_id"] for artist in artists}), 2)
        self.assertTrue(all(artist["folder_id"].startswith("folder:") for artist in artists))
        self.assertEqual({artist["artwork_count"] for artist in artists}, {1})

        with self.assertRaises(db.AmbiguousArtistIdentifier):
            db.get_images(artist_id=4252792)

        images_by_scope = {
            artist["folder_name"]: db.get_images(artist_id=artist["scope_key"])[0]
            for artist in artists
        }
        self.assertEqual(images_by_scope["Discord FANBOX comodox (4252792)"][0]["save_name"], str(discord_folder))
        self.assertEqual(images_by_scope["FANBOX comodox (4252792)"][0]["save_name"], str(fanbox_folder))

        discord_scope_key = next(
            artist["scope_key"]
            for artist in artists
            if artist["folder_name"] == "Discord FANBOX comodox (4252792)"
        )
        db.hide_artist(discord_scope_key, "Discord FANBOX comodox (4252792)")
        self.assertEqual(
            [artist["folder_name"] for artist in db.get_all_artists() if artist["member_id"] == 4252792],
            ["FANBOX comodox (4252792)"],
        )
        self.assertTrue(db.unhide_artist(discord_scope_key))

    def test_root_discovery_deactivates_removed_first_level_scope(self):
        artist_directory = self.root / "Temporary Artist"
        artist_directory.mkdir()
        db.discover_root_scopes(str(self.root))

        moved_directory = self.root.parent / "Temporary Artist moved out"
        artist_directory.rename(moved_directory)
        try:
            db.discover_root_scopes(str(self.root))

            original_workspace_root = config_paths.WORKSPACE_ROOT
            original_config_path_reader = config_paths.get_pixiv_config_path
            config_paths.WORKSPACE_ROOT = str(self.root)
            config_paths.get_pixiv_config_path = lambda: str(self.root / "missing-config.ini")
            try:
                self.assertEqual(db.get_all_artists(), [])
            finally:
                config_paths.WORKSPACE_ROOT = original_workspace_root
                config_paths.get_pixiv_config_path = original_config_path_reader
        finally:
            moved_directory.rename(artist_directory)

    def test_managed_folder_identity_survives_same_volume_rename(self):
        original_directory = self.root / "FANBOX Example (4252792)"
        original_directory.mkdir()
        db.discover_root_scopes(str(self.root))
        original = next(
            artist for artist in db.get_all_artists()
            if artist["folder_name"] == original_directory.name
        )
        db.set_managed_folder_identity(original["folder_id"], "verified")
        db.hide_artist(original["folder_id"])

        renamed_directory = self.root / "Renamed archive (4252792)"
        original_directory.rename(renamed_directory)
        db.discover_root_scopes(str(self.root))

        renamed = db.get_managed_folder(original["folder_id"])
        self.assertIsNotNone(renamed)
        self.assertEqual(renamed["folder_id"], original["folder_id"])
        self.assertEqual(renamed["current_path"], str(renamed_directory))
        self.assertEqual(renamed["identity_status"], "verified")
        self.assertEqual(renamed["is_hidden"], 1)

    def test_root_discovery_deactivates_scopes_from_another_root(self):
        old_root = Path(self.temp_dir.name) / "old-media"
        old_artist = old_root / "Old Artist"
        old_artist.mkdir(parents=True)
        old_scopes = db.discover_root_scopes(str(old_root))

        db.discover_root_scopes(str(self.root))

        with db.get_db_connection() as conn:
            old_scope = conn.execute(
                "SELECT is_active, status FROM viewer_index_scope WHERE scope_key = ?",
                (old_scopes[0]["scope_key"],),
            ).fetchone()
            old_root_scope = conn.execute(
                "SELECT is_active, status FROM viewer_index_scope WHERE scope_key = ?",
                (db.get_root_scope_key(str(old_root)),),
            ).fetchone()
        self.assertEqual((old_scope["is_active"], old_scope["status"]), (0, "stale"))
        self.assertEqual((old_root_scope["is_active"], old_root_scope["status"]), (0, "stale"))

    def test_gallery_only_returns_media_inside_configured_root(self):
        inside = self._write_media("Inside Artist/12345678.jpg", b"inside")
        db.scan_and_index_directory(str(self.root))
        outside = Path(self.temp_dir.name) / "cache_thumbs" / "outside.webp"
        outside.parent.mkdir()
        outside.write_bytes(b"outside")
        with db.get_db_connection() as conn:
            conn.execute(
                """
                INSERT INTO pixiv_master_image
                    (image_id, member_id, title, save_name, created_date, last_update_date)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (876543210, None, "Viewer cache", str(outside), "2026-08-01", "2026-08-01"),
            )
            conn.commit()

        images, total, _months = db.get_images(limit=100)

        self.assertEqual(total, 1)
        self.assertEqual(images[0]["save_name"], str(inside))

    def test_folder_member_id_is_not_process_local(self):
        folder = self.root / "Archive without Pixiv id"

        first = db.get_folder_member_id(str(folder))
        second = db.get_folder_member_id(str(folder))

        self.assertEqual(first, second)
        self.assertNotEqual(first, abs(hash(folder.name)) % 100000000)

    def test_concurrent_folder_scans_share_one_snapshot(self):
        for index in range(4):
            self._write_media(f"artist/{index}.jpg", str(index).encode("ascii"))

        original_walk = db.os.walk
        walk_count = 0
        walk_count_lock = threading.Lock()

        def counted_walk(*args, **kwargs):
            nonlocal walk_count
            with walk_count_lock:
                walk_count += 1
            time.sleep(0.05)
            yield from original_walk(*args, **kwargs)

        db.invalidate_scan_cache(str(self.root))
        db.os.walk = counted_walk
        try:
            results = []

            def read_snapshot():
                results.append(db.get_folder_files_fast(str(self.root)))

            first = threading.Thread(target=read_snapshot)
            second = threading.Thread(target=read_snapshot)
            first.start()
            second.start()
            first.join()
            second.join()
        finally:
            db.os.walk = original_walk

        self.assertEqual(walk_count, 1)
        self.assertEqual(len(results), 2)
        self.assertEqual(len(results[0]), 4)
        self.assertEqual(results[0], results[1])

    def test_artist_counts_are_derived_from_shared_root_snapshot(self):
        self._write_media("Artist folder/123.jpg", b"image")
        db.scan_and_index_directory(str(self.root))
        original_workspace_root = config_paths.WORKSPACE_ROOT
        original_config_path_reader = config_paths.get_pixiv_config_path
        config_paths.WORKSPACE_ROOT = str(self.root)
        config_paths.get_pixiv_config_path = lambda: str(self.root / "missing-config.ini")
        try:
            artists = db.get_all_artists()
        finally:
            config_paths.WORKSPACE_ROOT = original_workspace_root
            config_paths.get_pixiv_config_path = original_config_path_reader

        artist = next(item for item in artists if item.get("name") == "Artist folder")
        self.assertEqual(artist["artwork_count"], 1)

    def test_gallery_navigation_uses_viewer_snapshot_without_hdd_walk(self):
        self._write_media("Snapshot Artist/123.jpg", b"image")
        db.scan_and_index_directory(str(self.root))
        original_walk = db.os.walk
        original_workspace_root = config_paths.WORKSPACE_ROOT
        original_config_path_reader = config_paths.get_pixiv_config_path
        config_paths.WORKSPACE_ROOT = str(self.root)
        config_paths.get_pixiv_config_path = lambda: str(self.root / "missing-config.ini")

        def fail_walk(*_args, **_kwargs):
            raise AssertionError("gallery navigation must not walk the source tree")

        db.os.walk = fail_walk
        try:
            artists = db.get_all_artists()
            images, total, _months = db.get_images(artist_id=next(
                artist["member_id"]
                for artist in artists
                if artist.get("name") == "Snapshot Artist"
            ))
        finally:
            db.os.walk = original_walk
            config_paths.WORKSPACE_ROOT = original_workspace_root
            config_paths.get_pixiv_config_path = original_config_path_reader

        self.assertEqual(total, 1)
        self.assertEqual(images[0]["save_name"], str(self.root / "Snapshot Artist" / "123.jpg"))

    def test_multiple_artist_scopes_share_one_cancellable_job(self):
        first = self._write_media("First Artist/10000001.jpg", b"first")
        second = self._write_media("Second Artist/10000002.jpg", b"second")
        scopes = db.discover_root_scopes(str(self.root))
        self.assertEqual(len(scopes), 2)

        self.manager = LibraryJobManager()
        created = self.manager.start(
            "update-library",
            str(self.root),
            scopes=scopes,
            analyze_colors=False,
            priority=20,
        )
        self.assertEqual(len(created["scopes"]), 2)
        final = self._wait_for_terminal(created["job_id"])

        self.assertEqual(final["status"], "completed")
        self.assertEqual(final["added"], 2)
        self.assertEqual(
            {row["save_name"] for row in db.get_images()[0]},
            {str(first), str(second)},
        )

    def test_manager_close_cancels_active_scan_before_joining_worker(self):
        started = threading.Event()
        cancelled = threading.Event()
        original_scan = db.scan_and_index_directory

        def blocking_scan(*_args, cancel_event=None, **_kwargs):
            started.set()
            if cancel_event is not None:
                cancel_event.wait(timeout=5)
                cancelled.set()
            return {
                "scanned": 0,
                "indexed": 0,
                "added": 0,
                "updated": 0,
                "unchanged": 0,
                "conflicts": 0,
                "errors": 0,
                "error_details": [],
                "cancelled": True,
                "processed": 0,
                "total": 0,
            }

        db.scan_and_index_directory = blocking_scan
        try:
            self.manager = LibraryJobManager()
            self.manager.start(
                "update-library",
                str(self.root),
                scopes=[{
                    "scope_key": db.get_index_scope_key(str(self.root)),
                    "scope_type": "directory",
                    "member_id": None,
                    "directory": str(self.root),
                }],
                analyze_colors=False,
                priority=20,
            )
            self.assertTrue(started.wait(timeout=5))
            self.manager.close(timeout=5.0)
            self.assertTrue(cancelled.is_set())
        finally:
            db.scan_and_index_directory = original_scan

    def test_hidden_artist_and_recycle_metadata_are_reversible(self):
        artist_id = 4252792
        db.hide_artist(artist_id, "Example Artist")
        self.assertIn(artist_id, db.get_hidden_artist_ids())
        self.assertEqual(db.get_hidden_artists()[0]["folder_name"], "Example Artist")

        self.assertTrue(db.unhide_artist(artist_id))
        self.assertNotIn(artist_id, db.get_hidden_artist_ids())
        conn = db.get_db_connection()
        try:
            self.assertIsNotNone(conn.execute(
                "SELECT unhidden_at FROM viewer_hidden_artist WHERE member_id = ?",
                (artist_id,),
            ).fetchone()["unhidden_at"])
        finally:
            conn.close()

        source = self._write_media("Example Artist/123.jpg", b"image")
        trash = self.root / db.RECYCLE_DIRECTORY_NAME / "123-trash.jpg"
        trash.parent.mkdir(parents=True, exist_ok=True)
        source.rename(trash)
        image_id = db._stable_synthetic_image_id(str(source))
        self.assertEqual(
            db.mark_images_as_trashed(
                [image_id],
                [(image_id, str(source), str(source), str(trash))],
            ),
            1,
        )
        entries = db.get_trash_entries()
        self.assertEqual(len(entries), 1)
        self.assertTrue(entries[0]["available"])
        self.assertEqual(db.mark_trash_entries_sent_to_system_recycle([entries[0]["trash_id"]]), 1)
        self.assertEqual(db.get_trash_entries(), [])
        conn = db.get_db_connection()
        try:
            self.assertIsNotNone(conn.execute(
                "SELECT sent_to_system_recycle_at FROM pixivutil2_trash_image WHERE trash_id = ?",
                (entries[0]["trash_id"],),
            ).fetchone()["sent_to_system_recycle_at"])
        finally:
            conn.close()

    def test_cancel_keeps_completed_index_rows(self):
        for index in range(12):
            self._write_media(f"{10000000 + index}.jpg", str(index).encode("ascii"))
        cancel_event = threading.Event()

        def stop_after_first_file(progress):
            if progress.get("phase") == "indexing" and progress.get("processed", 0) >= 1:
                cancel_event.set()

        result = db.scan_and_index_directory(
            str(self.root),
            cancel_event=cancel_event,
            progress_callback=stop_after_first_file,
        )

        self.assertTrue(result["cancelled"])
        self.assertEqual(result["processed"], 1)
        conn = db.get_db_connection()
        try:
            indexed_count = conn.execute("SELECT COUNT(*) FROM pixiv_master_image").fetchone()[0]
        finally:
            conn.close()
        self.assertEqual(indexed_count, 1)

    def test_library_job_persists_terminal_state(self):
        self._write_media("24681357.jpg")
        self.manager = LibraryJobManager()
        created = self.manager.start("update-library", str(self.root))

        deadline = time.time() + 5
        final = None
        while time.time() < deadline:
            final = self.manager.get(created["job_id"])
            if final and final["status"] not in db.LIBRARY_JOB_ACTIVE_STATUSES:
                break
            time.sleep(0.02)

        self.assertIsNotNone(final)
        self.assertEqual(final["status"], "completed")
        self.assertEqual(final["added"], 1)
        self.assertEqual(final["processed"], final["total"])
        self.assertIsNotNone(final["finished_at"])

    def test_library_job_progress_does_not_lock_indexing_transaction(self):
        for index in range(60):
            self._write_media(f"{11000000 + index}.jpg", str(index).encode("ascii"))

        original_wait = library_jobs.wait_for_interactive_quiet
        library_jobs.wait_for_interactive_quiet = lambda _cancel_event=None: time.sleep(0.01)
        self.manager = LibraryJobManager()
        try:
            created = self.manager.start("update-library", str(self.root))
            final = self._wait_for_terminal(created["job_id"])
        finally:
            library_jobs.wait_for_interactive_quiet = original_wait

        self.assertEqual(final["status"], "completed")
        self.assertEqual(final["added"], 60)
        self.assertEqual(final["errors"], 0)

    def test_parallel_viewer_writes_use_wal_and_busy_timeout(self):
        connection = db.get_db_connection()
        try:
            connection.execute(
                "CREATE TABLE lock_probe (worker TEXT NOT NULL, sequence INTEGER NOT NULL)"
            )
            connection.commit()
        finally:
            connection.close()

        barrier = threading.Barrier(2)
        errors = []

        def write_rows(worker: str) -> None:
            connection = db.get_db_connection()
            try:
                barrier.wait(timeout=5)
                for sequence in range(12):
                    connection.execute(
                        "INSERT INTO lock_probe(worker, sequence) VALUES (?, ?)",
                        (worker, sequence),
                    )
                    connection.commit()
                    time.sleep(0.005)
            except Exception as error:  # pragma: no cover - assertion reports the real error
                errors.append(error)
            finally:
                connection.close()

        threads = [
            threading.Thread(target=write_rows, args=("first",)),
            threading.Thread(target=write_rows, args=("second",)),
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=10)

        self.assertFalse(errors, errors)
        connection = db.get_db_connection()
        try:
            row_count = connection.execute("SELECT COUNT(*) FROM lock_probe").fetchone()[0]
            journal_mode = connection.execute("PRAGMA journal_mode").fetchone()[0]
        finally:
            connection.close()
        self.assertEqual(row_count, 24)
        self.assertEqual(str(journal_mode).lower(), "wal")

    def test_startup_marks_active_job_interrupted(self):
        job_id = "interrupted-test-job"
        db.create_library_job(job_id, "update-library", str(self.root), False)
        db.update_library_job(job_id, status="running", phase="indexing")

        manager = LibraryJobManager(auto_start=False)
        try:
            recovered = db.get_library_job(job_id)
        finally:
            manager.close()

        self.assertEqual(recovered["status"], "interrupted")
        self.assertEqual(recovered["phase"], "interrupted")

    def test_dominant_color_is_reused_and_invalidated_by_file_change(self):
        image_path = self.root / "31415926.png"
        Image.new("RGB", (24, 24), (240, 32, 32)).save(image_path, "PNG")
        db.scan_and_index_directory(str(self.root))
        self.manager = LibraryJobManager()

        first = self.manager.start("analyze-missing-colors", str(self.root))
        first_final = self._wait_for_terminal(first["job_id"])
        self.assertEqual(first_final["colors_created"], 1)
        self.assertEqual(
            db.get_dominant_colors([db._normalise_media_path(str(image_path))])[
                db._normalise_media_path(str(image_path))
            ],
            "#F82828",
        )

        second = self.manager.start("analyze-missing-colors", str(self.root))
        second_final = self._wait_for_terminal(second["job_id"])
        self.assertEqual(second_final["colors_created"], 0)
        self.assertEqual(second_final["colors_reused"], 1)

        Image.new("RGB", (24, 24), (32, 32, 240)).save(image_path, "PNG")
        db.scan_and_index_directory(str(self.root))
        third = self.manager.start("analyze-missing-colors", str(self.root))
        third_final = self._wait_for_terminal(third["job_id"])
        self.assertEqual(third_final["colors_created"], 1)

    def test_video_without_thumbnail_is_not_reanalyzed_as_a_created_color(self):
        video_path = self._write_media("27182818.mp4", b"video")
        db.scan_and_index_directory(str(self.root))
        self.manager = LibraryJobManager()

        first = self.manager.start("analyze-missing-colors", str(self.root))
        first_final = self._wait_for_terminal(first["job_id"])
        second = self.manager.start("analyze-missing-colors", str(self.root))
        second_final = self._wait_for_terminal(second["job_id"])

        normalized_path = db._normalise_media_path(str(video_path))
        self.assertEqual(first_final["colors_created"], 0)
        self.assertEqual(second_final["colors_created"], 0)
        self.assertIn(
            normalized_path,
            db.get_dominant_color_analysis_results([normalized_path]),
        )
        self.assertIsNone(
            db.get_dominant_color_analysis_results([normalized_path])[normalized_path]
        )

    def test_thumbnail_cache_organization_is_recoverable(self):
        source = self._write_media("11223344.jpg", b"source")
        source_stat = source.stat()
        cache_name = library_jobs.thumbnail_cache_name(str(source), 320, 320, source_stat)
        cache_path = Path(library_jobs.THUMB_CACHE_DIR) / cache_name
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(b"thumbnail")
        db.upsert_thumbnail_cache_entry(
            cache_name,
            str(source),
            source_stat.st_size,
            source_stat.st_mtime_ns,
            320,
            320,
            cache_bytes=cache_path.stat().st_size,
        )
        source.unlink()

        self.manager = LibraryJobManager()
        created = self.manager.start("organize-thumbnail-cache", str(self.root))
        final = self._wait_for_terminal(created["job_id"])

        self.assertEqual(final["status"], "completed")
        self.assertEqual(final["cache_moved"], 1)
        self.assertFalse(cache_path.exists())
        stats = library_jobs.get_thumbnail_cache_stats()
        self.assertEqual(stats["active_files"], 0)
        self.assertEqual(stats["recoverable_files"], 1)

        restored = library_jobs.restore_thumbnail_cache(created["job_id"])
        self.assertEqual(restored["restored"], 1)
        self.assertTrue(cache_path.exists())
        self.assertEqual(library_jobs.get_thumbnail_cache_stats()["active_files"], 1)

    def test_thumbnail_cache_recovery_details_and_recycle_bin_move(self):
        source = self._write_media("55667788.jpg", b"source")
        source_stat = source.stat()
        cache_name = library_jobs.thumbnail_cache_name(str(source), 320, 320, source_stat)
        cache_path = Path(library_jobs.THUMB_CACHE_DIR) / cache_name
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(b"thumbnail-content")
        db.upsert_thumbnail_cache_entry(
            cache_name,
            str(source),
            source_stat.st_size,
            source_stat.st_mtime_ns,
            320,
            320,
            cache_bytes=cache_path.stat().st_size,
        )
        source.unlink()

        self.manager = LibraryJobManager()
        created = self.manager.start("organize-thumbnail-cache", str(self.root))
        final = self._wait_for_terminal(created["job_id"])
        self.assertEqual(final["status"], "completed")

        details = library_jobs.get_thumbnail_cache_recovery_entries(created["job_id"])
        self.assertEqual(details["total"], 1)
        self.assertEqual(details["entries"][0]["cache_bytes"], len(b"thumbnail-content"))
        self.assertEqual(details["entries"][0]["width"], 320)
        self.assertEqual(details["entries"][0]["source_path"], os.path.normcase(str(source)))
        recovery_path = Path(library_jobs.THUMB_CACHE_RECOVERY_DIR) / created["job_id"] / details["entries"][0]["recovery_name"]
        self.assertTrue(recovery_path.exists())

        original_send_to_recycle_bin = library_jobs.recycle_bin.send_path_to_system_recycle_bin
        library_jobs.recycle_bin.send_path_to_system_recycle_bin = lambda path: Path(path).rename(
            Path(path).with_suffix(".recycled")
        )
        try:
            recycled = library_jobs.move_thumbnail_cache_recovery_to_recycle_bin(created["job_id"])
        finally:
            library_jobs.recycle_bin.send_path_to_system_recycle_bin = original_send_to_recycle_bin
        self.assertEqual(recycled["moved"], 1)
        self.assertEqual(recycled["errors"], [])
        self.assertFalse(recovery_path.exists())
        self.assertEqual(library_jobs.get_thumbnail_cache_stats()["recoverable_files"], 0)
        self.assertEqual(db.get_thumbnail_cache_entries([cache_name]), [])

    def test_ghost_file_purge_on_rescan(self):
        first = self._write_media("ghost_test_1.jpg", b"image-content-1")
        result1 = db.scan_and_index_directory(str(self.root))
        self.assertEqual(result1["added"], 1)

        conn = db.get_db_connection()
        rows = conn.execute("SELECT image_id FROM pixiv_master_image").fetchall()
        self.assertEqual(len(rows), 1)

        first.unlink()
        result2 = db.scan_and_index_directory(str(self.root))
        self.assertEqual(result2["removed"], 1)

        rows_after = conn.execute("SELECT image_id FROM pixiv_master_image").fetchall()
        self.assertEqual(len(rows_after), 0)

    def test_rename_file_fingerprint_matching(self):
        content = b"unique-image-content-for-fingerprint-test"
        old_file = self._write_media("old_name.jpg", content)
        result1 = db.scan_and_index_directory(str(self.root))
        self.assertEqual(result1["added"], 1)

        conn = db.get_db_connection()
        initial_row = conn.execute("SELECT image_id, save_name FROM pixiv_master_image").fetchone()
        orig_id = initial_row["image_id"]

        new_file = self.root / "new_name.jpg"
        old_file.rename(new_file)

        result2 = db.scan_and_index_directory(str(self.root))
        self.assertEqual(result2["updated"], 1)
        self.assertEqual(result2["added"], 0)
        self.assertEqual(result2["removed"], 0)

        updated_row = conn.execute("SELECT image_id, save_name FROM pixiv_master_image").fetchone()
        self.assertEqual(updated_row["image_id"], orig_id)
        self.assertTrue(updated_row["save_name"].endswith("new_name.jpg"))

    def test_ghost_file_thumbnail_cleanup(self):
        source = self._write_media("thumb_ghost.jpg", b"thumb-source-bytes")
        result1 = db.scan_and_index_directory(str(self.root))
        self.assertEqual(result1["added"], 1)

        source_stat = source.stat()
        cache_name = library_jobs.thumbnail_cache_name(str(source), 320, 320, source_stat)
        cache_path = Path(library_jobs.THUMB_CACHE_DIR) / cache_name
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(b"webp-thumbnail-data")
        self.assertTrue(cache_path.exists())

        source.unlink()
        result2 = db.scan_and_index_directory(str(self.root))
        self.assertEqual(result2["removed"], 1)
        self.assertFalse(cache_path.exists())

    def _wait_for_terminal(self, job_id: str):
        deadline = time.time() + 5
        final = None
        while time.time() < deadline:
            final = self.manager.get(job_id)
            if final and final["status"] not in db.LIBRARY_JOB_ACTIVE_STATUSES:
                return final
            time.sleep(0.02)
        self.fail(f"job did not finish: {final}")


if __name__ == "__main__":
    unittest.main()
