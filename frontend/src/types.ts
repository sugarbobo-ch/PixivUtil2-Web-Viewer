import { SIDEBAR_DEFAULT_WIDTH } from './utils/sidebarLayout';

export interface Artist {
  folder_id?: string;
  scope_key?: string;
  index_scope_key?: string;
  member_id: number;
  name: string;
  artwork_count: number;
  folder_name?: string;
  display_name?: string;
  source_kind?: 'pixiv' | 'fanbox' | 'discord' | 'unknown';
  identity_status?: 'inferred' | 'verified' | 'rejected' | 'unknown';
}

export interface HiddenArtist {
  folder_id?: string;
  scope_key?: string;
  member_id: number;
  folder_name: string;
  name?: string;
  display_name?: string;
  hidden_at: string;
}

export interface RecycleEntry {
  folder_id?: string;
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

export interface MonthIndexItem {
  key: string;
  label: string;
  count: number;
  offset?: number;
}

export interface ImageItem {
  folder_id?: string;
  image_id: number;
  member_id: number;
  title: string;
  save_name: string;
  created_date: string;
  last_update_date: string;
  artist_name?: string;
  dominant_color?: string;
  /** 1-based page position within the current work group. */
  group_page_index?: number;
  /** Total number of pages in the current work group. */
  group_page_total?: number;
  media_status?: 'invalid' | 'missing' | 'internal';
  media_error?: string;
}

export type ViewerMode = 'fullscreen' | 'webtoon';
export type ViewMode = 'grid' | ViewerMode;
export type ThemeMode = 'dark' | 'light';
export type FullscreenZoomMode = 'auto' | 'lock' | 'width' | 'height' | 'fit' | 'fill';
export type SortMode =
  | 'newest_month'
  | 'newest_works_pages_ascending'
  | 'newest_month_oldest_works'
  | 'oldest_month'
  | 'oldest'
  | 'natural_name';

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
  defaultViewMode: ViewerMode;
  thumbnailSize: number;
  itemsPerPage: number;
  sidebarWidth: number;
  autoOpenBrowser: boolean;
  groupMangaPosts: boolean;
  blurEnabled: boolean;
  demoMode: boolean;
  preloadImageCount: number;
  fullscreenToolbarSimpleMode: boolean;
  fullscreenShowToolbar: boolean;
  fullscreenShowThumbnails: boolean;
  fullscreenShowCheckerboard: boolean;
  fullscreenZoomMode: FullscreenZoomMode;
  fullscreenVideoSeekSeconds: number;
  fullscreenVideoHoldPlaybackRate: number;
  /** Shared video playback preference used by fullscreen and webtoon modes. */
  videoMuted: boolean;
  videoVolume: number;
  videoAutoplay: boolean;
  webtoonImageScale: number;
  webtoonImageGap: number;
  webtoonShowInfo: boolean;
  webtoonShowPageNumber: boolean;
  webtoonShowThumbnails: boolean;
  analyzeColorsAfterLibraryUpdate: boolean;
  manageThumbnailCache: boolean;
  thumbnailCacheLimitMiB: number;
  pixivConfigPath?: string;
  librarySourceMode: 'unconfigured' | 'pixiv' | 'folder';
  mediaRootPath: string;
  onboardingCompleted: boolean;
}

export type WebConfigDraft = Omit<WebConfig, 'pixivConfigPath'> & {
  pixivConfigPath: string;
};

export const DEFAULT_WEB_CONFIG: WebConfig = {
  webTheme: 'dark',
  defaultViewMode: 'fullscreen',
  thumbnailSize: 320,
  itemsPerPage: 200,
  sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
  autoOpenBrowser: true,
  groupMangaPosts: false,
  blurEnabled: false,
  demoMode: false,
  preloadImageCount: 3,
  fullscreenToolbarSimpleMode: true,
  fullscreenShowToolbar: true,
  fullscreenShowThumbnails: true,
  fullscreenShowCheckerboard: true,
  fullscreenZoomMode: 'auto',
  fullscreenVideoSeekSeconds: 5,
  fullscreenVideoHoldPlaybackRate: 2,
  videoMuted: false,
  videoVolume: 1,
  videoAutoplay: true,
  webtoonImageScale: 100,
  webtoonImageGap: 24,
  webtoonShowInfo: true,
  webtoonShowPageNumber: true,
  webtoonShowThumbnails: true,
  analyzeColorsAfterLibraryUpdate: true,
  manageThumbnailCache: true,
  thumbnailCacheLimitMiB: 1024,
  librarySourceMode: 'unconfigured',
  mediaRootPath: '',
  onboardingCompleted: false,
};

export type VideoPreferencePatch = Partial<Pick<WebConfig, 'videoMuted' | 'videoVolume'>>;

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
    folder_id?: string;
  }>;
  priority?: number;
  automatic?: boolean;
  analyze_colors: boolean;
  discovered: number;
  total: number | null;
  processed: number;
  added: number;
  updated: number;
  removed?: number;
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

export interface LibraryJobRequest {
  type: LibraryJob['job_type'];
  directory?: string;
  directories?: string[];
  member_id?: number;
  member_ids?: number[];
  scope_key?: string;
  scope_keys?: string[];
  folder_id?: string;
  folder_ids?: string[];
  all_artists?: boolean;
  analyze_colors?: boolean;
  priority?: number;
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
