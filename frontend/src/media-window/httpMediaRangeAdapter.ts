import { apiClient } from '../api/client';
import { normalizeSelectedMonths } from '../utils/timeFilters';
import type { MediaRange, MediaRangeAdapter, MediaQuery, MediaRangeResponse, MonthLayoutItem } from './types';

const toMonthLayout = (item: {
  key: string;
  label: string;
  offset?: number;
  count: number;
  imageCount?: number;
  cardCount?: number;
}): MonthLayoutItem => ({
  key: item.key,
  label: item.label,
  offset: item.offset ?? 0,
  imageCount: item.imageCount ?? item.count,
  cardCount: item.cardCount ?? item.imageCount ?? item.count,
});

export const createHttpMediaRangeAdapter = (): MediaRangeAdapter => ({
  load: async (query: MediaQuery, range: MediaRange, signal: AbortSignal): Promise<MediaRangeResponse> => {
    const params = new URLSearchParams();
    const months = normalizeSelectedMonths(query.selectedMonths);
    if (months.length > 0) params.set('month', months.join(','));
    if (query.selectedArtist !== null) {
      if (query.selectedArtist.startsWith('folder:')) params.set('folder_id', query.selectedArtist.slice(7));
      else params.set('artist_id', query.selectedArtist);
    }
    if (query.searchQuery) params.set('search', query.searchQuery);
    params.set('sort_mode', query.sortMode);
    params.set('grouping', query.grouping);
    params.set('offset', String(range.start));
    params.set('limit', String(Math.max(0, range.end - range.start)));

    const response = await apiClient.images.page(params.toString(), { signal });
    if (!response.revision) throw new Error('Sparse media API response is missing revision.');
    const actualStart = response.offset ?? range.start;
    const actualEnd = actualStart + response.images.length;
    return {
      revision: response.revision,
      total: response.total,
      range: { start: actualStart, end: Math.max(actualEnd, response.limit ? actualStart + response.limit : actualEnd) },
      images: response.images,
      months: response.monthIndexItems.map(toMonthLayout),
    };
  },
});
