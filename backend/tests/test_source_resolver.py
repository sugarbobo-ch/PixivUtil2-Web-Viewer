import unittest
import json
import os
import sqlite3
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import source_resolver


class ArtistSourceResolverTests(unittest.TestCase):
    def setUp(self):
        source_resolver._ARTIST_CACHE.clear()
        source_resolver._FANBOX_REDIRECT_CACHE.clear()
        source_resolver._FANBOX_CREATOR_CACHE.clear()

    def test_does_not_treat_unverified_gallery_identity_as_pixiv_member_id(self):
        with patch("source_resolver._find_artist_identity", return_value=None), patch(
            "source_resolver._follow_pixiv_fanbox_redirect", return_value=None
        ):
            self.assertIsNone(source_resolver.resolve_artist_source(9_000_000_123))

    def test_does_not_treat_synthetic_verified_folder_id_as_pixiv_member_id(self):
        folder = {
            "folder_id": "folder:synthetic",
            "current_path": r"F:\Pixiv\Unknown creator",
            "folder_name": "Unknown creator",
            "member_id": 923456789,
            "identity_status": "verified",
            "fanbox_id": None,
        }
        with patch("source_resolver.db.get_managed_folder", return_value=folder), patch(
            "source_resolver._find_artist_identity", return_value=None
        ):
            self.assertIsNone(source_resolver.resolve_artist_source(923456789, "folder:synthetic"))

    def test_does_not_fabricate_fanbox_link_when_creator_redirect_is_missing(self):
        with patch("source_resolver._find_artist_identity", return_value=12345), patch(
            "source_resolver._follow_pixiv_fanbox_redirect", return_value=None
        ):
            result = source_resolver.resolve_artist_source(12345)

        self.assertIsNotNone(result)
        self.assertEqual(result["pixiv"]["url"], "https://www.pixiv.net/users/12345")
        self.assertIsNone(result["fanbox"])

    def test_resolves_pixiv_member_id_from_folder_name_suffix(self):
        folder = {
            "folder_id": "folder:explicit",
            "current_path": os.path.join("library", "Example (24680)"),
            "folder_name": "Example (24680)",
            "member_id": 9_000_000_123,
            "identity_status": "inferred",
            "fanbox_id": None,
        }
        with patch("source_resolver.db.get_managed_folder", return_value=folder), patch(
            "source_resolver._follow_pixiv_fanbox_redirect", return_value=None
        ):
            result = source_resolver.resolve_artist_source(9_000_000_123, "folder:explicit")

        self.assertEqual(result["verified_member_id"], 24680)
        self.assertEqual(result["pixiv"]["url"], "https://www.pixiv.net/users/24680")

    def test_resolves_pixiv_member_id_from_artwork_relationship(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            folder_path = os.path.join(temp_dir, "Example")
            os.makedirs(folder_path)
            artwork_path = os.path.join(folder_path, "987654_p0.jpg")
            database_path = os.path.join(temp_dir, "pixiv.sqlite")
            connection = sqlite3.connect(database_path)
            connection.execute(
                "CREATE TABLE pixiv_master_image (image_id INTEGER, member_id INTEGER, save_name TEXT)"
            )
            connection.execute(
                "INSERT INTO pixiv_master_image VALUES (?, ?, ?)",
                (987654, 13579, artwork_path),
            )
            connection.commit()
            connection.close()
            folder = {
                "folder_id": "folder:artwork",
                "current_path": folder_path,
                "folder_name": "Example",
                "member_id": 9_000_000_456,
                "identity_status": "unknown",
                "fanbox_id": None,
            }

            with patch.object(source_resolver.db, "PIXIV_DB_PATH", database_path), patch(
                "source_resolver.db.get_managed_folder", return_value=folder
            ), patch("source_resolver._follow_pixiv_fanbox_redirect", return_value=None):
                result = source_resolver.resolve_artist_source(9_000_000_456, "folder:artwork")

        self.assertEqual(result["verified_member_id"], 13579)
        self.assertEqual(result["pixiv"]["url"], "https://www.pixiv.net/users/13579")

    def test_fanbox_creator_profile_overrides_stale_synthetic_member_id(self):
        folder = {
            "folder_id": "folder:fanbox-creator-fixture",
            "current_path": r"F:\Pixiv\Synthetic Fanbox Creator",
            "folder_name": "Synthetic Fanbox Creator",
            "member_id": 912345678,
            "identity_status": "verified",
            "fanbox_id": "https://test-creator-42.fanbox.cc/",
        }
        response = MagicMock()
        response.read.return_value = json.dumps({
            "body": {
                "user": {"userId": "7654321", "name": "Synthetic Test Creator"},
                "creatorId": "test-creator-42",
            },
        }).encode("utf-8")
        response.__enter__.return_value = response
        response.__exit__.return_value = None

        with patch("source_resolver.db.get_managed_folder", return_value=folder), patch(
            "source_resolver.urlopen", return_value=response
        ), patch("source_resolver._follow_pixiv_fanbox_redirect", return_value=None):
            result = source_resolver.resolve_artist_source(912345678, "folder:fanbox-creator-fixture")

        self.assertEqual(result["verified_member_id"], 7654321)
        self.assertEqual(result["pixiv"]["url"], "https://www.pixiv.net/users/7654321")


if __name__ == "__main__":
    unittest.main()
