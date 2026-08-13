import { ImageItem } from '../types';
import { getItemGroupKey } from './grouping';

export interface FilmstripLayout {
  itemOffsets: number[];
  boundaryOffsets: Array<number | null>;
  totalWidth: number;
}

export interface FilmstripLayoutOptions {
  itemSize: number;
  gap: number;
  edgePadding: number;
  boundaryWidth: number;
  boundaryMargin: number;
}

export const findIndexAtOffset = (offsets: readonly number[], offset: number) => {
  if (offsets.length === 0) return 0;
  let low = 0;
  let high = offsets.length - 1;
  let result = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle] <= offset) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return result;
};

export const buildFilmstripLayout = (
  images: readonly ImageItem[],
  options: FilmstripLayoutOptions,
): FilmstripLayout => {
  const itemOffsets: number[] = [];
  const boundaryOffsets: Array<number | null> = [];
  let offset = options.edgePadding;

  images.forEach((item, index) => {
    if (index > 0) {
      const previousItem = images[index - 1];
      const isWorkBoundary = getItemGroupKey(item) !== getItemGroupKey(previousItem);
      if (isWorkBoundary) {
        offset += options.boundaryMargin;
        boundaryOffsets[index] = offset;
        offset += options.boundaryWidth + options.boundaryMargin;
      } else {
        offset += options.gap;
        boundaryOffsets[index] = null;
      }
    } else {
      boundaryOffsets[index] = null;
    }

    itemOffsets[index] = offset;
    offset += options.itemSize;
  });

  return {
    itemOffsets,
    boundaryOffsets,
    totalWidth: offset + options.edgePadding,
  };
};

export interface WebtoonMetrics {
  offsets: number[];
  heights: number[];
  totalHeight: number;
  estimatedHeight: number;
}

interface GlobalHeightIndexLike {
  getHeight(index: number): number;
  getOffset(index: number): number;
}

export const buildWebtoonMetricsFromHeightIndex = ({
  globalHeightIndex,
  rangeStart,
  imageCount,
  imageGap,
  minItemHeight,
}: {
  globalHeightIndex: GlobalHeightIndexLike;
  rangeStart: number;
  imageCount: number;
  imageGap: number;
  minItemHeight: number;
}): WebtoonMetrics => {
  const safeStart = Math.max(0, Math.floor(rangeStart));
  const count = Math.max(0, Math.floor(imageCount));
  const offsets = Array.from({ length: count }, (_, index) => (
    globalHeightIndex.getOffset(safeStart + index)
      - globalHeightIndex.getOffset(safeStart)
      + index * Math.max(0, imageGap)
  ));
  const heights = Array.from({ length: count }, (_, index) => (
    Math.max(minItemHeight, globalHeightIndex.getHeight(safeStart + index))
  ));
  const totalHeight = count === 0
    ? 0
    : Math.max(
      0,
      globalHeightIndex.getOffset(safeStart + count)
        - globalHeightIndex.getOffset(safeStart)
        + Math.max(0, count - 1) * Math.max(0, imageGap),
    );

  return {
    offsets,
    heights,
    totalHeight,
    estimatedHeight: heights[0] ?? minItemHeight,
  };
};

export const buildWebtoonMetrics = ({
  imageCount,
  estimatedHeight,
  imageGap,
  measuredHeights,
  minItemHeight,
}: {
  imageCount: number;
  estimatedHeight: number;
  imageGap: number;
  measuredHeights: ReadonlyMap<number, number>;
  minItemHeight: number;
}): WebtoonMetrics => {
  const offsets: number[] = [];
  const heights: number[] = [];
  let offset = 0;

  for (let index = 0; index < imageCount; index += 1) {
    const height = Math.max(minItemHeight, measuredHeights.get(index) ?? estimatedHeight);
    offsets.push(offset);
    heights.push(height);
    offset += height + imageGap;
  }

  return {
    offsets,
    heights,
    totalHeight: Math.max(0, offset - (imageCount > 0 ? imageGap : 0)),
    estimatedHeight,
  };
};

export interface WebtoonThumbnailLayout {
  offsets: number[];
  heights: number[];
  boundaryOffsets: Array<number | null>;
  totalHeight: number;
}

export const getThumbnailHeight = (
  railWidth: number,
  aspectRatio: number,
  options: { widthInset: number; minHeight: number },
) => {
  const safeAspectRatio = Math.min(5, Math.max(0.2, aspectRatio));
  const itemWidth = Math.max(1, railWidth - options.widthInset);
  return Math.max(options.minHeight, Math.round(itemWidth / safeAspectRatio));
};

export const buildWebtoonThumbnailLayout = ({
  images,
  railWidth,
  aspectRatios,
  defaultAspectRatio,
  edgePadding,
  gap,
  boundaryWidth,
  boundaryMargin,
  widthInset,
  minHeight,
}: {
  images: readonly ImageItem[];
  railWidth: number;
  aspectRatios: ReadonlyMap<number, number>;
  defaultAspectRatio: number;
  edgePadding: number;
  gap: number;
  boundaryWidth: number;
  boundaryMargin: number;
  widthInset: number;
  minHeight: number;
}): WebtoonThumbnailLayout => {
  const offsets: number[] = [];
  const heights: number[] = [];
  const boundaryOffsets: Array<number | null> = [];
  let offset = edgePadding;

  for (let index = 0; index < images.length; index += 1) {
    if (index > 0) {
      const isWorkBoundary = getItemGroupKey(images[index]) !== getItemGroupKey(images[index - 1]);
      if (isWorkBoundary) {
        offset += boundaryMargin;
        boundaryOffsets[index] = offset;
        offset += boundaryWidth + boundaryMargin;
      } else {
        offset += gap;
        boundaryOffsets[index] = null;
      }
    } else {
      boundaryOffsets[index] = null;
    }

    const aspectRatio = aspectRatios.get(index) ?? defaultAspectRatio;
    const height = getThumbnailHeight(railWidth, aspectRatio, { widthInset, minHeight });
    offsets.push(offset);
    heights.push(height);
    offset += height;
  }

  return {
    offsets,
    heights,
    boundaryOffsets,
    totalHeight: images.length > 0 ? offset + edgePadding : edgePadding * 2,
  };
};

export const getVirtualRange = ({
  offsets,
  itemCount,
  viewportStart,
  viewportEnd,
  overscan,
  extraEnd = 0,
}: {
  offsets: readonly number[];
  itemCount: number;
  viewportStart: number;
  viewportEnd: number;
  overscan: number;
  extraEnd?: number;
}) => {
  if (itemCount === 0) return { start: 0, end: 0 };
  const start = Math.max(0, findIndexAtOffset(offsets, Math.max(0, viewportStart - overscan)));
  const end = Math.min(
    itemCount,
    findIndexAtOffset(offsets, viewportEnd + overscan) + 1 + extraEnd,
  );
  return {
    start,
    end: Math.max(start + 1, end),
  };
};
