import { ImageItem, WorkGroup } from '../types';

/**
 * Extract group key for an ImageItem.
 * Supports:
 * 1. Standard Pixiv filename PID pattern: {PID}_p{PAGE} (e.g. 9693995_p1_Movie.mp4 -> pixiv_9693995)
 * 2. Post ID prefix pattern: {POST_ID}_{variant} (e.g. 10419414_Ibuki10_K.png -> pixiv_10419414)
 * 3. General title pattern: {title}_p{PAGE} (e.g. Manga_p0.png -> group_manga)
 * 4. Subfolder manga set: files in a subfolder under artist dir (e.g. Artist/MangaVol1/01.jpg -> dir_artist/mangavol1)
 * 5. Fallback: single file key
 */
export const getItemGroupKey = (item: ImageItem): string => {
  if (!item || !item.save_name) {
    return `item_${item?.image_id || Math.random()}`;
  }

  // Normalize backslashes to forward slashes
  const normPath = item.save_name.replace(/\\/g, '/');
  const filename = normPath.substring(normPath.lastIndexOf('/') + 1);
  const dirPath = normPath.substring(0, normPath.lastIndexOf('/'));

  // 1. Pixiv standard filename pattern: {PID}_p{PAGE}
  const pixivMatch = filename.match(/^(\d{5,12})_p\d+/i);
  if (pixivMatch) {
    return `pixiv_${pixivMatch[1]}`;
  }

  // 2. A leading numeric POST ID identifies the same work even without _pN.
  // Examples: 10419414_Ibuki10_K.png, 10419414_Ibuki10_L.png
  const postIdMatch = filename.match(/^(\d{5,12})[_-]/i);
  if (postIdMatch) {
    return `pixiv_${postIdMatch[1]}`;
  }

  // 3. Title with _p0, _p1, -p0, -p1 pattern (e.g. ArtworkName_p1.jpg)
  const pMatch = filename.match(/^(.+?)[_-]p\d+/i);
  if (pMatch) {
    return `title_${dirPath.toLowerCase()}_${pMatch[1].toLowerCase()}`;
  }

  // 4. Sub-directory manga set check:
  // If file is inside a subfolder (e.g. /ArtistName/SubFolder/01.jpg)
  const parts = dirPath.split('/').filter(Boolean);
  // If path has at least 3 parts (e.g. "F:", "Pixiv", "Artist", "SubFolder" or "web-viewer", "Artist", "SubFolder")
  // and the last directory is a subfolder below the artist root
  if (parts.length >= 3) {
    return `dir_${dirPath.toLowerCase()}`;
  }

  // 5. Standalone file
  return `file_${normPath.toLowerCase()}`;
};

export interface GroupPageNumberState {
  pageNumbers: number[];
  pageTotals: number[];
  /** Largest group size, used as a safe fallback for shared counters. */
  totalPages: number;
}

const isPositiveGroupNumber = (value: number | undefined): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
);

/**
 * Resolve the 1-based page number used by group-aware viewers.
 * The API supplies the position and total for each work group; the local
 * fallback keeps older API responses usable without changing grouping.
 */
export const getGroupPageNumbers = (images: ImageItem[]): GroupPageNumberState => {
  const fallbackGroupTotals = new Map<string, number>();
  images.forEach(item => {
    const groupKey = getItemGroupKey(item);
    fallbackGroupTotals.set(groupKey, (fallbackGroupTotals.get(groupKey) ?? 0) + 1);
  });

  const fallbackGroupPositions = new Map<string, number>();

  const pageNumbers = images.map(item => {
    if (isPositiveGroupNumber(item.group_page_index)) return item.group_page_index;

    const groupKey = getItemGroupKey(item);
    const nextPosition = (fallbackGroupPositions.get(groupKey) ?? 0) + 1;
    fallbackGroupPositions.set(groupKey, nextPosition);
    return nextPosition;
  });

  const pageTotals = images.map(item => {
    if (isPositiveGroupNumber(item.group_page_total)) return item.group_page_total;
    return fallbackGroupTotals.get(getItemGroupKey(item)) ?? 1;
  });

  return {
    pageNumbers,
    pageTotals,
    totalPages: Math.max(1, ...pageTotals),
  };
};

/**
 * Group ImageItem[] into WorkGroup[]
 */
export const groupImagesIntoWorkGroups = (images: ImageItem[]): WorkGroup[] => {
  const map = new Map<string, { group_id: string; cover: ImageItem; items: ImageItem[] }>();

  images.forEach(it => {
    const key = getItemGroupKey(it);
    if (!map.has(key)) {
      map.set(key, { group_id: key, cover: it, items: [it] });
    } else {
      map.get(key)!.items.push(it);
    }
  });

  return Array.from(map.values()).map(val => ({
    group_id: val.group_id,
    image_id: val.cover.image_id,
    member_id: val.cover.member_id,
    title: val.cover.title,
    artist_name: val.cover.artist_name,
    created_date: val.cover.created_date,
    cover: val.cover,
    items: val.items,
  }));
};
