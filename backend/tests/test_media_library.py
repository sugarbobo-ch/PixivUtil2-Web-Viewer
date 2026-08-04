import os
import gc
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
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name) / "media"
        self.root.mkdir()
        self.original_thumb_cache_dir = library_jobs.THUMB_CACHE_DIR
        self.original_thumb_recovery_dir = library_jobs.THUMB_CACHE_RECOVERY_DIR
        library_jobs.THUMB_CACHE_DIR = str(Path(self.temp_dir.name) / "cache_thumbs")
        library_jobs.THUMB_CACHE_RECOVERY_DIR = str(Path(library_jobs.THUMB_CACHE_DIR) / ".viewer-trash")
        library_jobs._CACHE_ACCESS_LAST_TOUCH.clear()
        db.DB_PATH = str(Path(self.temp_dir.name) / "viewer.sqlite")
        db.invalidate_scan_cache()
        db.init_db_schema()
        self.manager = None

    def tearDown(self):
        if self.manager is not None:
            self.manager.close()
        db.invalidate_scan_cache()
        db.DB_PATH = self.original_db_path
        library_jobs.THUMB_CACHE_DIR = self.original_thumb_cache_dir
        library_jobs.THUMB_CACHE_RECOVERY_DIR = self.original_thumb_recovery_dir
        library_jobs._CACHE_ACCESS_LAST_TOUCH.clear()
        gc.collect()
        self.temp_dir.cleanup()

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

    def test_thumbnail_cache_recovery_details_and_hard_delete(self):
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

        deleted = library_jobs.permanently_delete_thumbnail_cache(created["job_id"])
        self.assertEqual(deleted["deleted"], 1)
        self.assertEqual(deleted["errors"], [])
        self.assertFalse(recovery_path.exists())
        self.assertEqual(library_jobs.get_thumbnail_cache_stats()["recoverable_files"], 0)
        self.assertEqual(db.get_thumbnail_cache_entries([cache_name]), [])

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
