import importlib.util
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "measure-web-viewer-performance.py"
SPEC = importlib.util.spec_from_file_location("measure_web_viewer_performance", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
PERFORMANCE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PERFORMANCE)


class PerformanceGateTests(unittest.TestCase):
    def test_thresholds_accept_baseline_and_skip_optional_metrics(self):
        result = {
            "api_images": {"p95_ms": 749.9},
            "thumbnail": None,
        }

        failures = PERFORMANCE.evaluate_thresholds(
            result,
            api_p95_threshold_ms=750,
            thumbnail_p95_threshold_ms=500,
            library_job_threshold_ms=10000,
        )

        self.assertEqual(failures, [])

    def test_thresholds_report_each_metric_that_exceeds_configured_limit(self):
        result = {
            "api_images": {"p95_ms": 750},
            "thumbnail": {"p95_ms": 501},
            "library_job": {"elapsed_ms": 10001},
        }

        failures = PERFORMANCE.evaluate_thresholds(
            result,
            api_p95_threshold_ms=750,
            thumbnail_p95_threshold_ms=500,
            library_job_threshold_ms=10000,
        )

        self.assertEqual(len(failures), 3)
        self.assertIn("api_images p95", failures[0])
        self.assertIn("thumbnail p95", failures[1])
        self.assertIn("library_job elapsed", failures[2])


if __name__ == "__main__":
    unittest.main()
