# PixivUtil2 Web Viewer Backend

FastAPI backend service for PixivUtil2 Web Viewer.

## Runtime and route boundaries

Application-owned dependencies are created by the ASGI lifespan in
`runtime_context.py`. The current route modules are intentionally grouped by
domain and call services rather than constructing workers or mutating the
source configuration themselves:

- `routes/web_config.py` → `WebConfigService`
- `routes/pixiv_config.py` → PixivUtil2 config.ini backup/update boundary
- `routes/directory.py` → source inspection, artists, months, and source links
- `routes/gallery.py` → gallery page queries and filter metadata
- `routes/library_jobs.py` → `LibraryJobService` and recoverable thumbnail cache

`main.py` remains the compatibility host for the media file, batch trash, and
Windows integration routes while those domain services are migrated. The
gallery read route now uses the explicit `GalleryService` boundary. This keeps
the route split incremental and preserves existing test fixtures.

## Media library jobs

The media library update runs in one daemon worker and persists its state in
the Viewer-owned `viewer_library_job` table in `backend/viewer.sqlite`. PixivUtil2's
`db.sqlite` is an optional read-only import source and is never used for Viewer
writes. A restart marks
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

## Media source boundary

The viewer accepts exactly one active source:

- `pixiv`: `pixivConfigPath` identifies a PixivUtil2 `config.ini`; its
  `[Settings] rootDirectory` is the media root and a neighboring `db.sqlite`
  may be imported read-only.
- `folder`: `mediaRootPath` is the media root; PixivUtil2 configuration and
  database files are not required or consulted.

There is no fallback to the repository or workspace directory. Source changes
must be saved before a library update, and gallery queries only expose rows
inside the currently configured root.
