import type { MediaRange } from './types';
import type { MonthLayoutItem } from './types';

export interface GalleryLayoutMetrics {
  columns: number;
  cardSize: number;
  rowGap: number;
  headerHeight: number;
  /** Gap between the month header and its card grid in the global track. */
  contentGap?: number;
  sectionGap?: number;
}

export interface GalleryMonthLayout extends MonthLayoutItem {
  top: number;
  height: number;
  rows: number;
}

export interface GalleryLayoutIndex {
  metrics: Required<GalleryLayoutMetrics>;
  months: GalleryMonthLayout[];
  totalHeight: number;
  getMonth(key: string): GalleryMonthLayout | undefined;
  getMonthTop(key: string): number | null;
  getMonthAtOffset(offset: number): GalleryMonthLayout | undefined;
  getMonthForGlobalIndex(index: number): GalleryMonthLayout | undefined;
  getViewportRange(
    viewportTop: number,
    viewportBottom: number,
    overscanRows?: number,
    grouped?: boolean,
  ): MediaRange;
}

const safePositive = (value: number, fallback = 1) => (
  Number.isFinite(value) && value > 0 ? value : fallback
);

export const buildGlobalGalleryLayoutIndex = (
  months: readonly MonthLayoutItem[],
  metrics: GalleryLayoutMetrics,
): GalleryLayoutIndex => {
  const columns = Math.max(1, Math.floor(safePositive(metrics.columns)));
  const cardSize = safePositive(metrics.cardSize);
  const rowGap = Math.max(0, Number.isFinite(metrics.rowGap) ? metrics.rowGap : 0);
  const headerHeight = Math.max(0, Number.isFinite(metrics.headerHeight) ? metrics.headerHeight : 0);
  const contentGap = Math.max(0, Number.isFinite(metrics.contentGap) ? metrics.contentGap ?? 0 : 0);
  const sectionGap = Math.max(0, Number.isFinite(metrics.sectionGap) ? metrics.sectionGap ?? 0 : 0);
  const normalizedMetrics = { columns, cardSize, rowGap, headerHeight, contentGap, sectionGap };
  let top = 0;
  const layouts = months.map(month => {
    const rows = Math.ceil(Math.max(0, month.cardCount) / columns);
    const contentHeight = rows === 0
      ? 0
      : rows * cardSize + Math.max(0, rows - 1) * rowGap;
    const height = headerHeight + (rows > 0 ? contentGap : 0) + contentHeight;
    const layout: GalleryMonthLayout = { ...month, top, height, rows };
    top += height + sectionGap;
    return layout;
  });
  const byKey = new Map(layouts.map(month => [month.key, month]));

  const getMonthAtOffset = (offset: number) => {
    const safeOffset = Math.max(0, Number.isFinite(offset) ? offset : 0);
    return layouts.find((month, index) => (
      safeOffset >= month.top
      && (safeOffset < month.top + month.height + sectionGap || index === layouts.length - 1)
    ));
  };
  const getMonthForGlobalIndex = (index: number) => {
    const safeIndex = Math.max(0, Number.isFinite(index) ? Math.floor(index) : 0);
    return layouts.find(month => (
      safeIndex >= month.offset && safeIndex < month.offset + month.imageCount
    ));
  };

  return {
    metrics: normalizedMetrics,
    months: layouts,
    totalHeight: Math.max(0, top - sectionGap),
    getMonth: key => byKey.get(key),
    getMonthTop: key => byKey.get(key)?.top ?? null,
    getMonthAtOffset,
    getMonthForGlobalIndex,
    getViewportRange: (viewportTop, viewportBottom, overscanRows = 2, grouped = false) => {
      if (layouts.length === 0) return { start: 0, end: 0 };
      const overscan = Math.max(0, Math.ceil(overscanRows));
      const visibleIndexes = layouts
        .map((month, index) => ({ month, index }))
        .filter(({ month }) => (
          month.top < Math.max(viewportTop, viewportBottom)
          && month.top + month.height > Math.min(viewportTop, viewportBottom)
        ))
        .map(({ index }) => index);
      const topIndex = Math.max(0, (visibleIndexes[0] ?? 0) - overscan);
      const bottomIndex = Math.min(
        layouts.length - 1,
        (visibleIndexes[visibleIndexes.length - 1] ?? layouts.length - 1) + overscan,
      );

      let start = Number.POSITIVE_INFINITY;
      let end = 0;
      const rowStride = normalizedMetrics.cardSize + normalizedMetrics.rowGap;
      for (let index = topIndex; index <= bottomIndex; index += 1) {
        const month = layouts[index];
        const contentTop = month.top + normalizedMetrics.headerHeight + normalizedMetrics.contentGap;
        const intersectsViewport = month.top < Math.max(viewportTop, viewportBottom)
          && month.top + month.height > Math.min(viewportTop, viewportBottom);
        const visibleTop = intersectsViewport
          ? Math.max(viewportTop, contentTop)
          : index < (visibleIndexes[0] ?? 0)
            ? month.top + Math.max(normalizedMetrics.headerHeight + normalizedMetrics.contentGap, month.height - rowStride)
            : contentTop;
        const visibleBottom = intersectsViewport
          ? Math.min(viewportBottom, month.top + month.height)
          : index < (visibleIndexes[0] ?? 0)
            ? month.top + month.height
            : month.top + Math.min(month.height, normalizedMetrics.headerHeight + normalizedMetrics.contentGap + rowStride);
        const firstRow = Math.max(
          0,
          Math.floor((visibleTop - contentTop) / rowStride) - overscan,
        );
        const lastRow = Math.min(
          month.rows,
          Math.ceil((visibleBottom - contentTop) / rowStride) + overscan,
        );
        const cardStart = Math.max(0, firstRow * normalizedMetrics.columns);
        const cardEnd = Math.min(
          month.cardCount,
          Math.max(cardStart + normalizedMetrics.columns, lastRow * normalizedMetrics.columns),
        );
        if (month.cardCount <= 0 || month.imageCount <= 0) continue;

        if (!grouped) {
          start = Math.min(start, month.offset + Math.min(month.imageCount, cardStart));
          end = Math.max(end, month.offset + Math.min(month.imageCount, cardEnd));
        } else {
          // Grouped cards do not have a separate range endpoint in the API.
          // Map their visible card window to the image interval and include a
          // one-card look-behind/ahead so a large work remains discoverable.
          const cardCount = Math.max(1, month.cardCount);
          const imageStart = Math.max(0, Math.floor((cardStart / cardCount) * month.imageCount) - normalizedMetrics.columns);
          const imageEnd = Math.min(
            month.imageCount,
            Math.ceil((cardEnd / cardCount) * month.imageCount) + normalizedMetrics.columns,
          );
          start = Math.min(start, month.offset + imageStart);
          end = Math.max(end, month.offset + imageEnd);
        }
      }

      if (!Number.isFinite(start) || end <= start) {
        const first = layouts[topIndex];
        return { start: first.offset, end: first.offset + Math.min(first.imageCount, 1) };
      }
      return {
        start,
        end,
      };
    },
  };
};

export const getGalleryLayoutMetrics = (
  viewportWidth: number,
  sidebarWidth: number,
): GalleryLayoutMetrics => {
  const safeViewportWidth = Math.max(320, Number.isFinite(viewportWidth) ? viewportWidth : 320);
  const safeSidebarWidth = Math.max(0, Number.isFinite(sidebarWidth) ? sidebarWidth : 0);
  const mobile = safeViewportWidth <= 768;
  const contentWidth = Math.max(280, safeViewportWidth - safeSidebarWidth - (mobile ? 16 : 32));
  const columns = safeViewportWidth >= 1280
    ? 6
    : safeViewportWidth >= 1024
      ? 5
      : safeViewportWidth >= 768
        ? 4
        : safeViewportWidth >= 640
          ? 3
          : 2;
  const rowGap = mobile ? 8 : 12;
  const cardSize = Math.max(96, (contentWidth - Math.max(0, columns - 1) * rowGap) / columns);
  return {
    columns,
    cardSize,
    rowGap,
    contentGap: 12,
    headerHeight: mobile ? 44 : 48,
    sectionGap: mobile ? 16 : 24,
  };
};

export class FenwickTree {
  private readonly tree: number[];

  constructor(values: readonly number[]) {
    this.tree = Array(values.length + 1).fill(0);
    values.forEach((value, index) => this.add(index, value));
  }

  get length() {
    return this.tree.length - 1;
  }

  add(index: number, delta: number) {
    for (let cursor = Math.max(0, Math.floor(index)) + 1; cursor < this.tree.length; cursor += cursor & -cursor) {
      this.tree[cursor] += delta;
    }
  }

  sum(endExclusive: number) {
    let result = 0;
    for (let cursor = Math.min(this.length, Math.max(0, Math.floor(endExclusive))); cursor > 0; cursor -= cursor & -cursor) {
      result += this.tree[cursor];
    }
    return result;
  }

  total() {
    return this.sum(this.length);
  }

  findIndexAtOffset(offset: number) {
    if (this.length === 0) return 0;
    const target = Math.max(0, Math.min(this.total(), Number.isFinite(offset) ? offset : 0));
    let index = 0;
    let accumulated = 0;
    let bit = 1;
    while (bit * 2 <= this.length) bit *= 2;
    for (; bit > 0; bit >>= 1) {
      const next = index + bit;
      if (next <= this.length && accumulated + this.tree[next] <= target) {
        index = next;
        accumulated += this.tree[next];
      }
    }
    return Math.min(this.length - 1, index);
  }
}

export interface GlobalHeightIndex {
  getHeight(index: number): number;
  getOffset(index: number): number;
  getIndexAtOffset(offset: number): number;
  updateMeasuredHeight(index: number, height: number, anchorIndex?: number): { deltaAboveAnchor: number; changed: boolean };
  totalHeight(): number;
}

export const createGlobalHeightIndex = (
  total: number,
  estimatedHeight: number,
): GlobalHeightIndex => {
  const count = Math.max(0, Math.floor(total));
  const estimate = Math.max(1, Number.isFinite(estimatedHeight) ? estimatedHeight : 1);
  const heights = Array.from({ length: count }, () => estimate);
  const measured = new Set<number>();
  const tree = new FenwickTree(heights);

  return {
    getHeight: index => heights[Math.max(0, Math.min(count - 1, Math.floor(index)))] ?? estimate,
    getOffset: index => tree.sum(Math.max(0, Math.min(count, Math.floor(index)))),
    getIndexAtOffset: offset => tree.findIndexAtOffset(offset),
    updateMeasuredHeight: (index, height, anchorIndex) => {
      const safeIndex = Math.floor(index);
      if (safeIndex < 0 || safeIndex >= count || measured.has(safeIndex)) {
        return { deltaAboveAnchor: 0, changed: false };
      }
      const nextHeight = Math.max(1, Number.isFinite(height) ? height : estimate);
      const delta = nextHeight - heights[safeIndex];
      heights[safeIndex] = nextHeight;
      measured.add(safeIndex);
      tree.add(safeIndex, delta);
      return {
        deltaAboveAnchor: anchorIndex !== undefined && safeIndex < anchorIndex ? delta : 0,
        changed: Math.abs(delta) > 0.01,
      };
    },
    totalHeight: () => tree.total(),
  };
};
