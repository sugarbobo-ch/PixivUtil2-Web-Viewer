export interface Artist {
  member_id: number;
  name: string;
  artwork_count: number;
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
}

export type ViewMode = 'grid' | 'fullscreen' | 'webtoon';
export type ThemeMode = 'dark' | 'light';
