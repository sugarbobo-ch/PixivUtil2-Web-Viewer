import unittest
from unittest.mock import patch

from services.gallery_service import GalleryService


class GalleryServiceTests(unittest.TestCase):
    def test_gallery_queries_are_forwarded_with_explicit_filters(self):
        service = GalleryService()
        expected = ([{"image_id": 1}], 1, [{"month": "2026-08", "count": 1}])
        with patch("services.gallery_service.db.get_images", return_value=expected) as get_images:
            self.assertEqual(
                service.images(
                    month="2026-08",
                    artist_id=8,
                    search="title",
                    limit=24,
                    offset=48,
                    only_db=True,
                    sort_mode="oldest",
                ),
                expected,
            )
        get_images.assert_called_once_with(
            month="2026-08",
            artist_id=8,
            search="title",
            limit=24,
            offset=48,
            only_show_db_files=True,
            sort_mode="oldest",
        )


if __name__ == "__main__":
    unittest.main()
