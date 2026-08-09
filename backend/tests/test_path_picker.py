import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import path_picker
import main


class PathPickerValidationTests(unittest.TestCase):
    def test_library_manager_is_owned_by_application_lifespan(self):
        fake_manager = Mock()

        async def exercise_lifespan():
            self.assertIsNone(main.LIBRARY_JOB_MANAGER)
            with patch.object(main.library_jobs, "LibraryJobManager", return_value=fake_manager):
                async with main.lifespan(main.app):
                    self.assertIs(main.LIBRARY_JOB_MANAGER, fake_manager)
                self.assertIsNone(main.LIBRARY_JOB_MANAGER)

        asyncio.run(exercise_lifespan())
        fake_manager.close.assert_called_once_with()

    def test_default_dev_frontend_origins_can_use_the_picker_session(self):
        self.assertIn("http://localhost:3000", main.ALLOWED_ORIGINS)
        self.assertIn("http://127.0.0.1:3000", main.ALLOWED_ORIGINS)

    def test_inventory_modes_validate_file_folder_and_save_paths(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            media = root / "圖片 資料夾"
            media.mkdir()
            config = root / "config.ini"
            config.write_text("[Settings]\nrootDirectory = .\n", encoding="utf-8")

            self.assertEqual(
                path_picker.validate_selected_path(str(media), "root-directory", "folder"),
                str(media.resolve()),
            )
            self.assertEqual(
                path_picker.validate_selected_path(str(config), "pixiv-config", "existing-file"),
                str(config.resolve()),
            )
            save_path = root / "exports" / "viewer.sqlite"
            save_path.parent.mkdir()
            self.assertEqual(
                path_picker.validate_selected_path(str(save_path), "database-file", "save-file"),
                str(save_path.resolve()),
            )

    def test_invalid_extension_config_and_internal_root_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            invalid_config = root / "config.txt"
            invalid_config.write_text("[Settings]\n", encoding="utf-8")
            with self.assertRaises(path_picker.PathPickerError):
                path_picker.validate_selected_path(str(invalid_config), "pixiv-config", "existing-file")

            valid_file = root / "config.ini"
            valid_file.write_text("[Other]\nvalue = 1\n", encoding="utf-8")
            with self.assertRaises(path_picker.PathPickerError):
                path_picker.validate_selected_path(str(valid_file), "pixiv-config", "existing-file")

            with self.assertRaises(path_picker.PathPickerError):
                path_picker.validate_selected_path(path_picker.VIEWER_CACHE_DIRECTORY, "root-directory", "folder")

    def test_unknown_purpose_and_mode_mismatch_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaises(path_picker.PathPickerError):
                path_picker.validate_selected_path(temporary, "unknown", "folder")
            with self.assertRaises(path_picker.PathPickerError):
                path_picker.validate_selected_path(temporary, "root-directory", "save-file")


if __name__ == "__main__":
    unittest.main()
