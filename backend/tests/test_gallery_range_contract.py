import unittest
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import db
from routes.gallery import read_images
from services.gallery_service import GalleryService


def make_request(service):
    return SimpleNamespace(
        app=SimpleNamespace(
            state=SimpleNamespace(
                runtime_context=SimpleNamespace(gallery_service=service),
            ),
        ),
    )


class GalleryRangeContractTests(unittest.TestCase):
    def test_hydration_marks_untracked_missing_files_before_thumbnail_requests(self):
        with tempfile.TemporaryDirectory() as temporary:
            missing_path = str(Path(temporary) / "missing-gallery-image.png")
            items = [{
                "image_id": 9927907,
                "save_name": missing_path,
            }]

            with patch.object(db, "get_dominant_colors", return_value={}):
                db._hydrate_gallery_page_items(items)

        self.assertEqual(items[0]["media_status"], "missing")
        self.assertTrue(items[0]["media_error"])

    def test_route_exposes_revision_and_layout_index_without_removing_legacy_months(self):
        expected = {
            "images": [{"image_id": 501}],
            "total": 1_004,
            "offset": 500,
            "limit": 200,
            "revision": "gallery-snapshot-42",
            "months": [{"month": "2026-08", "count": 318, "offset": 500}],
            "month_index": [{
                "key": "2026-08",
                "month": "2026-08",
                "label": "2026-08",
                "offset": 500,
                "image_count": 318,
                "card_count": 201,
            }],
        }
        with patch(
            "services.gallery_service.db.get_images_range",
            return_value=expected,
        ) as get_images_range:
            result = read_images(
                make_request(GalleryService()),
                sort_mode="oldest",
                limit=200,
                offset=500,
                grouping="grouped",
            )

        self.assertEqual(result, expected)
        get_images_range.assert_called_once_with(
            month=None,
            artist_id=None,
            search=None,
            limit=200,
            offset=500,
            only_show_db_files=False,
            sort_mode="oldest",
            grouping="grouped",
        )

    def test_range_query_preserves_empty_and_tail_ranges(self):
        service = GalleryService()
        responses = [
            {
                "images": [],
                "total": 3,
                "offset": 3,
                "limit": 200,
                "revision": "empty-tail",
                "months": [],
                "month_index": [],
            },
            {
                "images": [{"image_id": 2}],
                "total": 3,
                "offset": 2,
                "limit": 1,
                "revision": "reverse-sort",
                "months": [{"month": "2024-01", "count": 1, "offset": 2}],
                "month_index": [{
                    "key": "2024-01",
                    "month": "2024-01",
                    "label": "2024-01",
                    "offset": 2,
                    "image_count": 1,
                    "card_count": 1,
                }],
            },
        ]
        with patch(
            "services.gallery_service.db.get_images_range",
            side_effect=responses,
        ) as get_images_range:
            empty = service.media_range(limit=200, offset=3)
            tail = service.media_range(limit=200, offset=2, sort_mode="oldest")

        self.assertEqual(empty["images"], [])
        self.assertEqual(tail["images"], [{"image_id": 2}])
        self.assertEqual(get_images_range.call_count, 2)


if __name__ == "__main__":
    unittest.main()
