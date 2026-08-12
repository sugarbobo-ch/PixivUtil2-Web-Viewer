import { describe, expect, it } from 'vitest';
import {
  ImageItem,
  LibraryJob,
  ThumbnailCacheRecoveryDetails,
  ThumbnailCacheRecoveryEntry,
  ThumbnailCacheRecoveryJob,
  ThumbnailCacheStats,
} from '../types';
import {
  parseArtistsResponse,
  parseHiddenArtistsResponse,
  parseImagePageResponse,
  parseLibrarySourceInspection,
  parseLibraryJobResponse,
  parseMonthsResponse,
  parseThumbnailCacheRecoveryDetailsResponse,
  parseThumbnailCacheRecycleResponse,
  parseThumbnailCacheRestoreResponse,
  parseThumbnailCacheStatsResponse,
  parseWebConfigResponse,
} from './parsers';

const image = (imageId: number): ImageItem => ({
  image_id: imageId,
  member_id: 8,
  title: `Image ${imageId}`,
  save_name: `artist/${imageId}.jpg`,
  created_date: '2026-08-10',
  last_update_date: '2026-08-10',
});

const job = (overrides: Partial<LibraryJob> = {}): LibraryJob => ({
  job_id: 'job-1',
  job_type: 'update-library',
  status: 'interrupted',
  phase: 'interrupted',
  directory: 'D:/media',
  analyze_colors: true,
  discovered: 2,
  total: 2,
  processed: 2,
  added: 1,
  updated: 0,
  unchanged: 1,
  conflicts: 0,
  errors: 0,
  colors_created: 0,
  colors_reused: 0,
  cache_moved: 0,
  current_file: null,
  error_message: 'backend restarted',
  cancel_requested: false,
  created_at: '2026-08-10T00:00:00Z',
  started_at: '2026-08-10T00:00:01Z',
  finished_at: '2026-08-10T00:00:02Z',
  updated_at: '2026-08-10T00:00:03Z',
  ...overrides,
});

const recoveryJob = (overrides: Partial<ThumbnailCacheRecoveryJob> = {}): ThumbnailCacheRecoveryJob => ({
  job_id: 'cache-job-1',
  created_at: '2026-08-10T00:00:00Z',
  moved: 2,
  recoverable_files: 2,
  recoverable_bytes: 2048,
  restorable: true,
  ...overrides,
});

const recoveryEntry = (overrides: Partial<ThumbnailCacheRecoveryEntry> = {}): ThumbnailCacheRecoveryEntry => ({
  recovery_name: 'thumbnail.webp',
  cache_name: 'cache-key',
  cache_bytes: 1024,
  width: 320,
  height: 240,
  reason: 'stale-source',
  moved_at: '2026-08-10T00:00:00Z',
  source_path: 'D:/media/image.jpg',
  source_file_size: 4096,
  source_mtime_ns: 123456789,
  generated_at: '2026-08-09T00:00:00Z',
  last_accessed_at: '2026-08-09T12:00:00Z',
  ...overrides,
});

const thumbnailCacheStats = (): ThumbnailCacheStats => ({
  active_files: 5,
  active_bytes: 8192,
  tracked_files: 4,
  recoverable_files: 2,
  recoverable_bytes: 2048,
  recovery_jobs: [recoveryJob()],
});

const thumbnailCacheDetails = (): ThumbnailCacheRecoveryDetails => ({
  job_id: 'cache-job-1',
  created_at: '2026-08-10T00:00:00Z',
  moved: 2,
  total: 2,
  total_bytes: 2048,
  offset: 0,
  limit: 24,
  has_more: false,
  entries: [recoveryEntry()],
});

describe('API runtime parsers', () => {
  it('supports the legacy image array and derives its month index', () => {
    const result = parseImagePageResponse([image(1), image(2)]);

    expect(result.images).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.monthIndexItems).toEqual([
      { key: '2026-08', label: '2026 年 08 月', count: 2 },
    ]);
  });

  it('validates the current image page shape and preserves API month offsets', () => {
    const result = parseImagePageResponse({
      images: [image(3)],
      total: 7,
      months: [{ month: '2026-08', count: 7, offset: 4 }],
    });

    expect(result.total).toBe(7);
    expect(result.monthIndexItems[0]).toEqual({
      key: '2026-08',
      label: '2026 年 08 月',
      count: 7,
      offset: 4,
    });
  });

  it('rejects malformed image records instead of asserting their shape', () => {
    expect(() => parseImagePageResponse({ images: [{ image_id: 'wrong' }] })).toThrow(/image_id/);
  });

  it('parses interrupted library jobs for backend restart recovery', () => {
    expect(parseLibraryJobResponse({ job: job() })).toEqual({ job: job() });
    expect(parseLibraryJobResponse({ job: null })).toEqual({ job: null });
  });

  it('normalizes config responses at the API boundary', () => {
    const result = parseWebConfigResponse({
      mosaicEnabled: 'false',
      thumbnailWidth: 99999,
      itemsPerPage: 0,
      pixivConfigPath: 'D:/Pixiv/config.ini',
    });

    expect(result.blurEnabled).toBe(false);
    expect(result.thumbnailSize).toBe(4096);
    expect(result.itemsPerPage).toBe(1);
    expect(result.pixivConfigPath).toBe('D:/Pixiv/config.ini');
  });

  it('validates directory metadata before it reaches gallery state', () => {
    expect(parseArtistsResponse([
      {
        folder_id: 'folder:550e8400-e29b-41d4-a716-446655440000',
        scope_key: 'folder:550e8400-e29b-41d4-a716-446655440000',
        index_scope_key: 'artist-scope:legacy-hash',
        member_id: 8,
        name: 'artist',
        display_name: 'artist',
        artwork_count: 3,
        folder_name: 'FANBOX artist',
        source_kind: 'fanbox',
        identity_status: 'inferred',
      },
    ])).toEqual([
      {
        folder_id: 'folder:550e8400-e29b-41d4-a716-446655440000',
        scope_key: 'folder:550e8400-e29b-41d4-a716-446655440000',
        index_scope_key: 'artist-scope:legacy-hash',
        member_id: 8,
        name: 'artist',
        display_name: 'artist',
        artwork_count: 3,
        folder_name: 'FANBOX artist',
        source_kind: 'fanbox',
        identity_status: 'inferred',
      },
    ]);
    expect(parseMonthsResponse([{ month: '2026-08', count: 3 }])).toEqual([
      { month: '2026-08', count: 3 },
    ]);
    expect(() => parseMonthsResponse([{ month: '2026-08', count: -1 }])).toThrow(/non-negative/);
  });

  it('validates source inspection and hidden artist responses', () => {
    expect(parseLibrarySourceInspection({
      mode: 'folder',
      rootDirectory: 'D:/media',
      databaseDetected: false,
      databasePath: null,
    }).rootDirectory).toBe('D:/media');
    expect(parseHiddenArtistsResponse([
      { member_id: 8, folder_name: 'artist', hidden_at: '2026-08-10T00:00:00Z' },
    ])).toHaveLength(1);
    expect(() => parseLibrarySourceInspection({ mode: 'folder' })).toThrow(/rootDirectory/);
  });

  it('parses thumbnail cache stats and paginated entries', () => {
    expect(parseThumbnailCacheStatsResponse(thumbnailCacheStats())).toEqual(thumbnailCacheStats());
    expect(parseThumbnailCacheRecoveryDetailsResponse(thumbnailCacheDetails())).toEqual(thumbnailCacheDetails());
  });

  it('rejects malformed thumbnail cache responses', () => {
    expect(() => parseThumbnailCacheStatsResponse({
      ...thumbnailCacheStats(),
      recovery_jobs: [{ ...recoveryJob(), recoverable_bytes: '2048' }],
    })).toThrow(/recoverable_bytes/);
    expect(() => parseThumbnailCacheRecoveryDetailsResponse({
      ...thumbnailCacheDetails(),
      entries: [{ ...recoveryEntry(), cache_bytes: null }],
    })).toThrow(/cache_bytes/);
  });

  it('parses thumbnail cache mutation responses', () => {
    expect(parseThumbnailCacheRestoreResponse({
      status: 'success',
      restored: 2,
      conflicts: 1,
      errors: [],
    })).toEqual({ status: 'success', restored: 2, conflicts: 1, errors: [] });
    expect(parseThumbnailCacheRecycleResponse({
      status: 'success',
      moved: 2,
      bytes_freed: 2048,
      metadata_removed: 2,
      remaining: 0,
      errors: [],
    })).toEqual({
      status: 'success',
      moved: 2,
      bytes_freed: 2048,
      metadata_removed: 2,
      remaining: 0,
      errors: [],
    });
  });
});
