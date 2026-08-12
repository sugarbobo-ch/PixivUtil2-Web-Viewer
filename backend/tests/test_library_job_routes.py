import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

from fastapi import HTTPException

from routes import library_jobs as library_job_routes


class LibraryJobRouteTests(unittest.TestCase):
    def _request(self, root: str, service: Mock):
        source_service = Mock()
        source_service.root_directory.return_value = root
        context = SimpleNamespace(
            library_job_service=service,
            media_source_service=source_service,
        )
        return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(runtime_context=context)))

    def test_start_route_validates_root_and_maps_service_result(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            service = Mock()
            service.start.return_value = {"job_id": "job-1", "status": "queued"}
            request = self._request(str(root), service)

            result = library_job_routes.start_library_job(
                library_job_routes.LibraryJobRequest(directory=str(root)),
                request,
            )

            self.assertEqual(result, {"job": {"job_id": "job-1", "status": "queued"}})
            service.start.assert_called_once()
            self.assertEqual(service.start.call_args.args[:2], ("update-library", str(root.resolve())))

    def test_start_route_rejects_a_directory_outside_the_configured_source(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "root"
            outside = Path(temporary) / "outside"
            root.mkdir()
            outside.mkdir()
            service = Mock()
            request = self._request(str(root), service)

            with self.assertRaises(HTTPException) as raised:
                library_job_routes.start_library_job(
                    library_job_routes.LibraryJobRequest(directory=str(outside)),
                    request,
                )

            self.assertEqual(raised.exception.status_code, 422)
            service.start.assert_not_called()


if __name__ == "__main__":
    unittest.main()
