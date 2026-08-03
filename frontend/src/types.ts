export interface Artist {
  member_id: number;
  name: string;
  artwork_count: number;
  folder_name?: string;
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
};
