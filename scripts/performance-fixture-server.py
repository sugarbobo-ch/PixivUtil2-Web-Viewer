"""Serve a deterministic local HTTP fixture for the performance gate."""

from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse


class PerformanceFixtureHandler(BaseHTTPRequestHandler):
    server_version = "WebViewerPerformanceFixture/1.0"

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def _send(self, status_code: int, content_type: str, body: bytes) -> None:
        self.send_response(status_code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        route = urlparse(self.path).path
        if route == "/api/images":
            body = json.dumps({
                "images": [{"image_id": 1, "save_name": "performance-fixture.jpg"}],
            }).encode("utf-8")
            self._send(200, "application/json", body)
            return
        if route == "/api/thumbnail":
            self._send(200, "image/webp", b"performance-fixture-thumbnail")
            return
        self._send(404, "application/json", b'{"detail":"Not found"}')


def positive_port(raw: str) -> int:
    value = int(raw)
    if not 1 <= value <= 65535:
        raise argparse.ArgumentTypeError("must be a valid TCP port")
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=positive_port, default=8765)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), PerformanceFixtureHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
