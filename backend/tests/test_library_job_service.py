import unittest
from unittest.mock import Mock

from services.library_job_service import LibraryJobService


class LibraryJobServiceTests(unittest.TestCase):
    def test_forwards_job_lifecycle_to_the_runtime_manager(self):
        manager = Mock()
        manager.start.return_value = {"job_id": "job-1"}
        manager.current.return_value = {"job_id": "job-1"}
        service = LibraryJobService(manager)

        self.assertEqual(
            service.start("update-library", "C:/media", analyze_colors=True, priority=20),
            {"job_id": "job-1"},
        )
        self.assertEqual(service.current(), {"job_id": "job-1"})
        self.assertEqual(service.get("job-1"), manager.get.return_value)
        self.assertEqual(service.cancel("job-1"), manager.cancel.return_value)
        manager.start.assert_called_once_with(
            "update-library",
            "C:/media",
            analyze_colors=True,
            scopes=None,
            priority=20,
        )


if __name__ == "__main__":
    unittest.main()
