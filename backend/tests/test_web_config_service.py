import json
import os
import tempfile
import unittest

import config_paths
import db
from services.web_config_service import WebConfigService, WebConfigServiceError


class WebConfigServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.temp_dir.name, "web_config.json")
        self.default = {
            "librarySourceMode": "unconfigured",
            "mediaRootPath": "",
            "pixivConfigPath": "",
            "thumbnailSize": 320,
        }
        self.service = WebConfigService(self.path, self.default, lambda value: {
            **self.default,
            **(value if isinstance(value, dict) else {}),
        })
        self.original_db_path = db.PIXIV_DB_PATH

    def tearDown(self):
        db.PIXIV_DB_PATH = self.original_db_path
        self.temp_dir.cleanup()

    def test_read_creates_normalized_default(self):
        self.assertEqual(self.service.read(), self.default)
        with open(self.path, "r", encoding="utf-8") as config_file:
            self.assertEqual(json.load(config_file), self.default)

    def test_update_rejects_unknown_source_mode(self):
        with self.assertRaises(WebConfigServiceError) as context:
            self.service.update({"librarySourceMode": "invalid"})
        self.assertEqual(context.exception.status_code, 422)

    def test_update_clears_folder_path_when_switching_to_pixiv(self):
        self.service.update({"librarySourceMode": "folder", "mediaRootPath": ""})
        result = self.service.update({"librarySourceMode": "pixiv", "mediaRootPath": "C:/stale"})
        self.assertEqual(result["mediaRootPath"], "")
        self.assertEqual(result["librarySourceMode"], "pixiv")


if __name__ == "__main__":
    unittest.main()
