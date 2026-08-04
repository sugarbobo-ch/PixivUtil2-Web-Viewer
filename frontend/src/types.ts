export interface Artist {
  member_id: number;
  name: string;
  artwork_count: number;
  folder_name?: string;
}

export interface HiddenArtist {
  member_id: number;
  folder_name: string;
  hidden_at: string;
}

export interface RecycleEntry {
  trash_id: number;
  image_id: number;
  original_path: string;
  trash_path: string | null;
  trashed_at: string;
  member_id: number | null;
  artist_name: string;
  file_name: string;
  file_size: number | null;
  available: boolean;
}

export type SourcePlatform = 'pixiv' | 'fanbox';

export interface SourceLink {
  platform: SourcePlatform;
  url: string;
  source_id: string;
  verified: boolean;
}

export interface ArtistSourceLinks {
  verified_member_id: number;
  pixiv?: SourceLink | null;
  fanbox?: SourceLink | null;
}

export interface MonthItem {
  month: string;
  count: number;
}

export interface ImageItem {
  image_id: number;
  member_id: number;
  title: string;
  save_name: string;
  created_date: string;
  last_update_date: string;
  artist_name?: string;
  dominant_color?: string;
  media_status?: 'invalid' | 'missing' | 'internal';
  media_error?: string;
}

export type ViewMode = 'grid' | 'fullscreen' | 'webtoon';
export type ThemeMode = 'dark' | 'light';
export type SortMode = 'newest_month' | 'oldest_month' | 'oldest' | 'natural_name';

export interface WorkGroup {
  group_id: string;
  image_id: number;
  member_id: number;
  title: string;
  artist_name?: string;
  created_date: string;
  cover: ImageItem;
  items: ImageItem[];
}

export interface WebConfig {
  webTheme: ThemeMode;
  defaultViewMode: ViewMode;
  thumbnailSize: number;
  itemsPerPage: number;
  autoOpenBrowser: boolean;
  groupMangaPosts: boolean;
  blurEnabled: boolean;
  preloadImageCount: number;
  analyzeColorsAfterLibraryUpdate: boolean;
  manageThumbnailCache: boolean;
  thumbnailCacheLimitMiB: number;
  pixivConfigPath?: string;
}

export const DEFAULT_WEB_CONFIG: WebConfig = {
  webTheme: 'dark',
  defaultViewMode: 'grid',
  thumbnailSize: 320,
  itemsPerPage: 200,
  autoOpenBrowser: true,
  groupMangaPosts: false,
  blurEnabled: false,
  preloadImageCount: 3,
  analyzeColorsAfterLibraryUpdate: true,
  manageThumbnailCache: true,
  thumbnailCacheLimitMiB: 1024,
};

export type LibraryJobStatus =
  | 'queued'
  | 'running'
  | 'cancelling'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'interrupted';

export type LibraryJobPhase =
  | 'queued'
  | 'discovering'
  | 'indexing'
  | 'analyzing_colors'
  | 'organizing_cache'
  | 'cancelling'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'interrupted';

export interface LibraryJob {
  job_id: string;
  job_type: 'update-library' | 'analyze-missing-colors' | 'organize-thumbnail-cache';
  status: LibraryJobStatus;
  phase: LibraryJobPhase;
  directory: string;
  scopes?: Array<{
    scope_key: string;
    scope_type: 'root' | 'artist' | 'directory';
    member_id: number | null;
    directory: string;
  }>;
  priority?: number;
  automatic?: boolean;
  analyze_colors: boolean;
  discovered: number;
  total: number | null;
  processed: number;
  added: number;
  updated: number;
  unchanged: number;
  conflicts: number;
  errors: number;
  colors_created: number;
  colors_reused: number;
  cache_moved: number;
  current_file: string | null;
  error_message: string | null;
  cancel_requested: boolean;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

export interface ThumbnailCacheRecoveryJob {
  job_id: string;
  created_at: string | null;
  moved: number;
  recoverable_files: number;
  recoverable_bytes: number;
  restorable: boolean;
}

export interface ThumbnailCacheRecoveryEntry {
  recovery_name: string;
  cache_name: string | null;
  cache_bytes: number;
  width: number | null;
  height: number | null;
  reason: string;
  moved_at: string | null;
  source_path: string | null;
  source_file_size: number | null;
  source_mtime_ns: number | null;
  generated_at: string | null;
  last_accessed_at: string | null;
}

export interface ThumbnailCacheRecoveryDetails {
  job_id: string;
  created_at: string | null;
  moved: number;
  total: number;
  total_bytes: number;
  offset: number;
  limit: number;
  has_more: boolean;
  entries: ThumbnailCacheRecoveryEntry[];
}

export interface ThumbnailCacheStats {
  active_files: number;
  active_bytes: number;
  tracked_files: number;
  recoverable_files: number;
  recoverable_bytes: number;
  recovery_jobs: ThumbnailCacheRecoveryJob[];
}
