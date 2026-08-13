import type { ImageItem, MonthIndexItem, SortMode } from '../types';

export type GlobalIndex = number;

export interface MediaRange {
  start: GlobalIndex;
  end: GlobalIndex;
}

export type LoadIntent =
  | 'viewport'
  | 'month-jump'
  | 'reader-neighbor'
  | 'scrub-preview';

export type MediaSlotStatus = 'unloaded' | 'loading' | 'ready' | 'error';

export interface MediaSlot {
  index: GlobalIndex;
  status: MediaSlotStatus;
  item?: ImageItem;
}

export interface MonthLayoutItem {
  key: string;
  label: string;
  offset: GlobalIndex;
  imageCount: number;
  cardCount: number;
}

export interface MediaQuery {
  selectedMonths: string[];
  selectedArtist: string | null;
  searchQuery: string;
  sortMode: SortMode;
  grouping: 'grouped' | 'ungrouped';
}

export interface MediaRangeResponse {
  revision: string;
  total: number;
  range: MediaRange;
  images: ImageItem[];
  months: MonthLayoutItem[];
}

export interface MediaRangeAdapter {
  load(query: MediaQuery, range: MediaRange, signal: AbortSignal): Promise<MediaRangeResponse>;
}

export interface MediaWindowSnapshot {
  revision: string;
  total: number;
  months: MonthLayoutItem[];
  get(index: GlobalIndex): MediaSlot;
  getPlaceholderColor?(index: GlobalIndex): string | undefined;
  getLoaded?(range?: MediaRange): MediaSlot[];
  isRangeReady(range: MediaRange): boolean;
}

export interface MediaWindowController {
  getSnapshot(): MediaWindowSnapshot;
  subscribe(listener: () => void): () => void;
  ensure(range: MediaRange, intent: LoadIntent): Promise<void>;
  pin(owner: string, range: MediaRange): () => void;
  reset(query: MediaQuery): void;
}

export interface MediaWindowDebugState {
  chunkStarts: number[];
  pinnedChunkStarts: number[];
  maxChunks: number;
  generation: number;
}

export const monthLayoutFromIndex = (item: MonthIndexItem): MonthLayoutItem => ({
  key: item.key,
  label: item.label,
  offset: item.offset ?? 0,
  imageCount: item.imageCount ?? item.count,
  cardCount: item.cardCount ?? item.imageCount ?? item.count,
});
