# 1. Ghost File Handling and Rescan Purge Strategy

Date: 2026-08-11

## Status

Accepted

## Context

When users rename, relocate, or delete media files on disk after updating the PixivUtil2 database, the Web Viewer database snapshot (`viewer.sqlite`) retains stale entries ("幽靈檔案"). This results in broken images or load failures in the UI.

We need a clean, consistent mechanism during directory rescans to detect missing files, purge stale database entries and orphan thumbnails, match renamed files via content fingerprints, and inform the user via a design-compliant Toast notification.

## Decision

1. **Stale Record Purge**: During a scope rescan, media records in `pixiv_master_image` and `viewer_media_metadata` whose physical file paths no longer exist on disk are removed from the active Viewer database snapshot. If the file reappears later, a rescan re-indexes it.
2. **Fingerprint Matching for Renames**: When a missing file's fingerprint matches a newly scanned candidate file, the existing database record (including created date, custom IDs, and dominant color analysis) is updated with the new path rather than treated as a separate deletion/creation pair.
3. **Orphan Thumbnail Cleanup**: When a stale image entry is purged, its corresponding WebP thumbnail files in `cache_thumbs/` are deleted automatically.
4. **Design-System Compliant Toast Notification**: Rescan completion announcements update `App.tsx` and display a custom Toast component adhering to `AGENTS.md` guidelines (neutral surfaces, semantic tokens, pill/radius rules, no purple tints or box-shadows), reporting added (`新增`), updated (`更新`), and purged (`清除 N 張遺失檔案`) counts.

## Consequences

- Stale records and orphan thumbnail files are thoroughly cleaned up upon rescan.
- File renames/moves seamlessly retain creation timestamps and color metadata.
- Users receive clear feedback on library changes without intrusive modals.
