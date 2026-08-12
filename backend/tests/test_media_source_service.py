import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import config_paths
from services.media_source_service import MediaSourceService


class MediaSourceServiceTests(unittest.TestCase):
    def test_resolves_only_existing_files_inside_the_configured_root(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as outside_root:
            inside = os.path.join(root, "inside.jpg")
            with open(inside, "wb") as media_file:
                media_file.write(b"media")
            outside = os.path.join(outside_root, "outside.jpg")
            with open(outside, "wb") as media_file:
                media_file.write(b"outside")
            service = MediaSourceService()
            with patch("services.media_source_service.config_paths.get_media_root_directory", return_value=root):
                self.assertEqual(service.resolve_image_path(None, "inside.jpg"), os.path.abspath(inside))
                self.assertIsNone(service.resolve_image_path(None, outside))
                self.assertIsNone(service.resolve_image_path(None, "missing.jpg"))

    def test_root_and_path_resolution_follow_a_folder_source_switch(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            first_root = Path(temp_dir) / "first"
            second_root = Path(temp_dir) / "second"
            first_root.mkdir()
            second_root.mkdir()
            first_file = first_root / "first.jpg"
            second_file = second_root / "second.jpg"
            first_file.write_bytes(b"first")
            second_file.write_bytes(b"second")
            config_path = Path(temp_dir) / "web_config.json"

            def write_source(root: Path) -> None:
                config_path.write_text(
                    json.dumps(
                        {
                            "librarySourceMode": "folder",
                            "mediaRootPath": str(root),
                        }
                    ),
                    encoding="utf-8",
                )

            service = MediaSourceService()
            with patch.object(config_paths, "WEB_CONFIG_PATH", str(config_path)):
                write_source(first_root)
                self.assertEqual(service.root_directory(), os.path.abspath(first_root))
                self.assertEqual(
                    service.resolve_image_path(None, "first.jpg"),
                    os.path.abspath(first_file),
                )

                write_source(second_root)
                self.assertEqual(service.root_directory(), os.path.abspath(second_root))
                self.assertEqual(
                    service.resolve_image_path(None, "second.jpg"),
                    os.path.abspath(second_file),
                )
                self.assertIsNone(service.resolve_image_path(None, "first.jpg"))


if __name__ == "__main__":
    unittest.main()
