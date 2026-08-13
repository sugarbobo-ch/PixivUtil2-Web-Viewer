import type { ImagePageResponse } from '../api/parsers';
import type { MediaRange, MediaRangeAdapter, MediaQuery, MediaRangeResponse } from './types';

export interface LegacyPageAdapterOptions {
  itemsPerPage: number;
  loadPage: (page: number, query: MediaQuery, signal: AbortSignal) => Promise<ImagePageResponse>;
}

/**
 * Compatibility adapter for the existing page owner. It deliberately keeps
 * page arithmetic inside the adapter so migrated readers only see ranges.
 */
export const createLegacyPageRangeAdapter = ({ itemsPerPage, loadPage }: LegacyPageAdapterOptions): MediaRangeAdapter => ({
  load: async (query: MediaQuery, range: MediaRange, signal: AbortSignal): Promise<MediaRangeResponse> => {
    const pageSize = Math.max(1, Math.floor(itemsPerPage));
    const page = Math.floor(range.start / pageSize) + 1;
    const response = await loadPage(page, query, signal);
    const start = response.offset ?? (page - 1) * pageSize;
    const revision = response.revision ?? `legacy-page:${query.sortMode}:${response.total}`;
    return {
      revision,
      total: response.total,
      range: {
        start,
        end: start + (response.limit ?? response.images.length),
      },
      images: response.images,
      months: response.monthIndexItems.map(item => ({
        key: item.key,
        label: item.label,
        offset: item.offset ?? 0,
        imageCount: item.imageCount ?? item.count,
        cardCount: item.cardCount ?? item.imageCount ?? item.count,
      })),
    };
  },
});
