# Domain Glossary

## Core Concepts

### Stale Image Entry (幽靈檔案)
A record in the Viewer database whose physical file path on disk can no longer be found during a directory scan due to file renaming, relocation, or deletion.

### Stale Image Purge (幽靈檔案清除)
The action during library rescan where missing media records are removed from the active Viewer database snapshot. If a purged file is placed back on disk, a subsequent rescan will discover it anew.

### Rescan Notification (重新掃描完成通知)
The user-facing notification displayed upon library job completion, summarizing added, updated, and purged (missing) media counts using design-compliant toast UI primitives.

### Stale Thumbnail Cleanup (縮圖快取清理)
The automatic removal of cached WebP thumbnails in `cache_thumbs/` corresponding to purged media files during directory rescan.

### Media Relocation & Rename Match (媒體更名與移位匹配)
The automatic association of a newly scanned file path to an existing media record via content fingerprint when its former file path is missing, preserving creation dates, custom IDs, and color analysis caches.
