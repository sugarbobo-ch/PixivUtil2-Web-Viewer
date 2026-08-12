"""Measure repeatable local Web Viewer API and thumbnail baselines.

The script is intentionally standard-library-only so it can run from the
repository checkout without changing the backend or frontend environments.
It does not start a library job unless ``--include-library-job`` is passed.
"""

from __future__ import annotations

import argparse
import json
import math
import platform
import statistics
import time
import urllib.parse
import urllib.request
from typing import Any, Callable, Dict, List


def positive_int(raw: str) -> int:
    value = int(raw)
    if value <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return value


def positive_float(raw: str) -> float:
    value = float(raw)
    if value <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return value


def percentile(samples: List[float], fraction: float) -> float:
    ordered = sorted(samples)
    index = max(0, min(len(ordered) - 1, math.ceil(len(ordered) * fraction) - 1))
    return ordered[index]


def measure(samples: int, request: Callable[[], Any]) -> Dict[str, float]:
    durations: List[float] = []
    for _ in range(samples):
        started = time.perf_counter()
        request()
        durations.append((time.perf_counter() - started) * 1000)
    return {
        "samples": float(len(durations)),
        "min_ms": min(durations),
        "p50_ms": percentile(durations, 0.50),
        "p95_ms": percentile(durations, 0.95),
        "max_ms": max(durations),
        "mean_ms": statistics.fmean(durations),
    }


def read_json(url: str) -> Any:
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def request_bytes(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=30) as response:
        return response.read()


def start_library_job(base_url: str) -> Dict[str, Any]:
    payload = json.dumps({
        "type": "update-library",
        "analyze_colors": True,
    }).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}/api/library/jobs",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))["job"]


def wait_for_library_job(base_url: str, job_id: str, timeout_seconds: float) -> Dict[str, Any]:
    deadline = time.monotonic() + timeout_seconds
    latest: Dict[str, Any] = {}
    while time.monotonic() < deadline:
        latest = read_json(f"{base_url}/api/library/jobs/{urllib.parse.quote(job_id)}")["job"]
        if latest["status"] not in {"queued", "running", "cancelling"}:
            return latest
        time.sleep(0.5)
    raise TimeoutError(f"Library job {job_id} did not finish within {timeout_seconds:g}s")


def build_thumbnail_url(base_url: str, image: Dict[str, Any], size: int) -> str:
    query = urllib.parse.urlencode({
        "path": image.get("save_name", ""),
        "image_id": image.get("image_id"),
        "size": size,
    })
    return f"{base_url}/api/thumbnail?{query}"


def evaluate_thresholds(
    result: Dict[str, Any],
    *,
    api_p95_threshold_ms: float,
    thumbnail_p95_threshold_ms: float,
    library_job_threshold_ms: float,
) -> List[str]:
    failures: List[str] = []
    api_images = result.get("api_images")
    if isinstance(api_images, dict) and float(api_images.get("p95_ms", math.inf)) >= api_p95_threshold_ms:
        failures.append(
            f"api_images p95 {float(api_images['p95_ms']):.1f} ms >= {api_p95_threshold_ms:.1f} ms"
        )

    thumbnail = result.get("thumbnail")
    if isinstance(thumbnail, dict) and float(thumbnail.get("p95_ms", math.inf)) >= thumbnail_p95_threshold_ms:
        failures.append(
            f"thumbnail p95 {float(thumbnail['p95_ms']):.1f} ms >= {thumbnail_p95_threshold_ms:.1f} ms"
        )

    library_job = result.get("library_job")
    if isinstance(library_job, dict) and float(library_job.get("elapsed_ms", math.inf)) >= library_job_threshold_ms:
        failures.append(
            f"library_job elapsed {float(library_job['elapsed_ms']):.1f} ms >= {library_job_threshold_ms:.1f} ms"
        )

    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--page-size", type=positive_int, default=200)
    parser.add_argument("--api-samples", type=positive_int, default=20)
    parser.add_argument("--thumbnail-samples", type=positive_int, default=20)
    parser.add_argument("--thumbnail-size", type=positive_int, default=320)
    parser.add_argument("--include-library-job", action="store_true")
    parser.add_argument("--library-job-timeout", type=positive_float, default=120)
    parser.add_argument("--api-p95-threshold-ms", type=positive_float, default=750.0)
    parser.add_argument("--thumbnail-p95-threshold-ms", type=positive_float, default=500.0)
    parser.add_argument("--library-job-threshold-ms", type=positive_float, default=10000.0)
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    page_url = f"{base_url}/api/images?{urllib.parse.urlencode({'limit': args.page_size, 'offset': 0})}"
    page = read_json(page_url)
    images = page.get("images", [])
    thumbnail_urls = [build_thumbnail_url(base_url, image, args.thumbnail_size) for image in images[:args.thumbnail_samples]]
    thumbnail_iterator = iter(thumbnail_urls)

    result: Dict[str, Any] = {
        "environment": {
            "platform": platform.platform(),
            "machine": platform.machine(),
            "processor": platform.processor(),
            "python": platform.python_version(),
            "base_url": base_url,
        },
        "dataset": {
            "page_size": args.page_size,
            "images_returned": len(images),
            "thumbnail_samples": len(thumbnail_urls),
            "thumbnail_size": args.thumbnail_size,
        },
        "api_images": measure(args.api_samples, lambda: read_json(page_url)),
        "thumbnail": measure(len(thumbnail_urls), lambda: request_bytes(next(thumbnail_iterator))) if thumbnail_urls else None,
        "scroll": {
            "status": "manual-browser-gate",
            "note": "Open the Vite dev URL with ?qa-scroll-performance=1 and perform three viewport scrolls; the page-owned probe reports image loading and long-task results.",
        },
    }

    if args.include_library_job:
        job = start_library_job(base_url)
        started = time.perf_counter()
        terminal = wait_for_library_job(base_url, job["job_id"], args.library_job_timeout)
        result["library_job"] = {
            "job_id": job["job_id"],
            "elapsed_ms": (time.perf_counter() - started) * 1000,
            "status": terminal["status"],
            "processed": terminal["processed"],
            "total": terminal["total"],
            "errors": terminal["errors"],
        }

    threshold_failures = evaluate_thresholds(
        result,
        api_p95_threshold_ms=args.api_p95_threshold_ms,
        thumbnail_p95_threshold_ms=args.thumbnail_p95_threshold_ms,
        library_job_threshold_ms=args.library_job_threshold_ms,
    )
    result["thresholds"] = {
        "api_p95_ms": args.api_p95_threshold_ms,
        "thumbnail_p95_ms": args.thumbnail_p95_threshold_ms,
        "library_job_ms": args.library_job_threshold_ms,
    }
    result["threshold_failures"] = threshold_failures
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if threshold_failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
