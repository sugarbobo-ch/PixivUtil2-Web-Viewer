# PixivUtil2 Web Viewer Backend

FastAPI backend service for PixivUtil2 Web Viewer.

## Media library jobs

The media library update runs in one daemon worker and persists its state in
the Viewer-owned `viewer_library_job` table in `db.sqlite`. A restart marks
queued, running, and cancelling jobs as `interrupted`; unfinished work is not
automatically resumed.

```text
POST /api/library/jobs
{ "type": "update-library", "directory": "...", "analyze_colors": false }

POST /api/library/jobs
{ "type": "analyze-missing-colors", "directory": "..." }

POST /api/library/jobs
{ "type": "organize-thumbnail-cache", "directory": "..." }

GET  /api/library/jobs/current
GET  /api/library/jobs/{job_id}
POST /api/library/jobs/{job_id}/cancel
GET  /api/library/stats
POST /api/library/cache/{job_id}/restore
```

Directory updates use a single walk, batch SQLite commits, cooperative
cancellation, and path fingerprints. Artwork-ID conflicts receive a separate
stable database ID so one page cannot replace another. Existing `/api/rescan`
callers remain supported when no background library job is active. Dominant
colors are stored separately with a fingerprint and algorithm version; invalid
or undecodable files increment the job error count without failing the batch.
Thumbnail cache organization moves stale files into a per-job recovery
directory and writes a manifest; restore never overwrites a newer active file.
The active cache limit is controlled by `manageThumbnailCache` and
`thumbnailCacheLimitMiB` in `web_config.json`.

## Native path picker

The local frontend obtains a short-lived-in-process Web Viewer session token
from `GET /api/system/session` and sends it to `POST /api/system/picker`:

```text
{ "mode": "folder", "purpose": "root-directory" }
```

Supported purposes are `root-directory`, `pixiv-config`,
`download-list-directory`, `database-file`, `irfanview-directory`,
`ffmpeg-executable`, and `fanbox-list-file`. The backend validates the
selected path, file type, extension, permissions, and `config.ini` structure
before returning it. Picker requests are restricted to the configured local
origins and one native dialog at a time.
