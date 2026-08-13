import {
  FullscreenPageLayout,
  FullscreenReadingDirection,
  FullscreenSpreadPairing,
  ImageItem,
} from '../types';
import { getItemGroupKey } from './grouping';

export interface ReaderSpread {
  /** The first progression index represented by this spread. */
  anchorIndex: number;
  /** Physical media indexes in book order, never crossing a work boundary. */
  progressionIndexes: number[];
  /** The first page encountered in the book's reading progression. */
  leadingIndex: number | null;
  /** The second page encountered in the book's reading progression. */
  trailingIndex: number | null;
  /** True for single-page mode, covers, or an incomplete pair. */
  isSinglePageFallback: boolean;
}

export interface ReaderSpreadOptions {
  pageLayout: FullscreenPageLayout;
  readingDirection: FullscreenReadingDirection;
  spreadPairing: FullscreenSpreadPairing;
  /** Optional result-set coordinates used when images is a bounded range. */
  globalOffset?: number;
  globalTotal?: number;
}

const emptySpread = (): ReaderSpread => ({
  anchorIndex: 0,
  progressionIndexes: [],
  leadingIndex: null,
  trailingIndex: null,
  isSinglePageFallback: true,
});

const clampIndex = (images: readonly ImageItem[], index: number) => (
  images.length === 0 ? 0 : Math.min(images.length - 1, Math.max(0, Math.trunc(index)))
);

const getWorkRange = (images: readonly ImageItem[], index: number) => {
  const safeIndex = clampIndex(images, index);
  const groupKey = getItemGroupKey(images[safeIndex]);
  let start = safeIndex;
  let end = safeIndex;
  while (start > 0 && getItemGroupKey(images[start - 1]) === groupKey) start -= 1;
  while (end + 1 < images.length && getItemGroupKey(images[end + 1]) === groupKey) end += 1;
  return { start, end };
};

/** Build a deterministic single/spread model without reading the DOM. */
export const buildReaderSpread = (
  images: readonly ImageItem[],
  anchorIndex: number,
  options: ReaderSpreadOptions,
): ReaderSpread => {
  if (images.length === 0) return emptySpread();

  const { pageLayout, spreadPairing } = options;

  const safeIndex = clampIndex(images, anchorIndex);
  const { start: workStart, end: workEnd } = getWorkRange(images, safeIndex);
  const offset = safeIndex - workStart;

  // Pairing always resets at a work boundary, so a partial API page never
  // borrows media from the neighboring work.
  const keepCoverSingle = spreadPairing === 'cover-single';
  const item = images[safeIndex];
  const hasGlobalPageNumber = options.globalOffset !== undefined && Number.isInteger(item.group_page_index);
  const pageNumber = hasGlobalPageNumber
    ? item.group_page_index!
    : offset + 1;
  const isCover = keepCoverSingle && pageNumber === 1;
  const pairOffset = keepCoverSingle
    ? Math.max(0, (pageNumber - 2) % 2)
    : Math.max(0, (pageNumber - 1) % 2);
  const spreadStart = isCover
    ? safeIndex
    : Math.max(workStart, safeIndex - pairOffset);
  let progressionIndexes = [spreadStart];
  const canPair = pageLayout === 'spread'
    && !isCover
    && spreadStart + 1 <= workEnd;

  if (canPair) progressionIndexes = [spreadStart, spreadStart + 1];

  const leadingIndex = progressionIndexes[0] ?? null;
  const trailingIndex = progressionIndexes[1] ?? null;

  return {
    anchorIndex: spreadStart,
    progressionIndexes,
    leadingIndex,
    trailingIndex,
    isSinglePageFallback: progressionIndexes.length < 2,
  };
};

export const getReaderSpreadProgression = (
  images: readonly ImageItem[],
  options: ReaderSpreadOptions,
): number[] => {
  if (images.length === 0) return [];
  if (options.pageLayout === 'single') return images.map((_, index) => index);

  if (options.globalOffset !== undefined) {
    const anchors: number[] = [];
    let index = 0;
    while (index < images.length) {
      const spread = buildReaderSpread(images, index, options);
      const anchor = Math.max(index, spread.anchorIndex);
      anchors.push(anchor);
      const nextIndex = (spread.progressionIndexes[spread.progressionIndexes.length - 1] ?? anchor) + 1;
      index = Math.max(index + 1, nextIndex);
    }
    return Array.from(new Set(anchors));
  }

  const anchors: number[] = [];
  let index = 0;
  while (index < images.length) {
    const { end } = getWorkRange(images, index);
    const keepCoverSingle = options.spreadPairing === 'cover-single';
    if (keepCoverSingle) anchors.push(index);
    let pageIndex = keepCoverSingle ? index + 1 : index;
    while (pageIndex <= end) {
      anchors.push(pageIndex);
      const canPair = pageIndex + 1 <= end;
      pageIndex += canPair ? 2 : 1;
    }
    index = end + 1;
  }
  return anchors;
};

export const getNextReaderSpreadAnchor = (
  images: readonly ImageItem[],
  currentIndex: number,
  options: ReaderSpreadOptions,
): number | null => {
  const progression = getReaderSpreadProgression(images, options);
  const currentAnchor = buildReaderSpread(images, currentIndex, options).anchorIndex;
  const next = progression.find(anchor => anchor > currentAnchor);
  return next ?? null;
};

export const getPreviousReaderSpreadAnchor = (
  images: readonly ImageItem[],
  currentIndex: number,
  options: ReaderSpreadOptions,
): number | null => {
  const progression = getReaderSpreadProgression(images, options);
  const currentAnchor = buildReaderSpread(images, currentIndex, options).anchorIndex;
  const previous = progression.filter(anchor => anchor < currentAnchor).pop();
  return previous ?? null;
};

export const getPhysicalSpreadIndexes = (
  spread: ReaderSpread,
  readingDirection: FullscreenReadingDirection,
): number[] => {
  if (readingDirection === 'rtl' && spread.progressionIndexes.length > 1) {
    return [...spread.progressionIndexes].reverse();
  }
  return spread.progressionIndexes;
};
