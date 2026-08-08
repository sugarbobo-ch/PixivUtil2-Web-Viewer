export interface GridMetrics {
  columns: number;
  cardSize: number;
  columnGap: number;
  rowGap: number;
  rowStride: number;
}

export interface RowRange {
  start: number;
  end: number;
}

export interface VirtualRange extends RowRange {
  startIndex: number;
  endIndex: number;
}

const finiteNonNegative = (value: number, fallback = 0) => (
  Number.isFinite(value) && value >= 0 ? value : fallback
);

export const getTargetPageAndLocalIndex = (offset: number, itemsPerPage: number) => {
  const safeOffset = Math.floor(finiteNonNegative(offset));
  const safePageSize = Math.max(1, Math.floor(finiteNonNegative(itemsPerPage, 1)));
  return {
    page: Math.floor(safeOffset / safePageSize) + 1,
    localIndex: safeOffset % safePageSize,
  };
};

export const getRowCount = (itemCount: number, columns: number) => (
  Math.ceil(Math.max(0, itemCount) / Math.max(1, Math.floor(columns)))
);

export const getSectionContentHeight = (rowCount: number, metrics: GridMetrics) => {
  const rows = Math.max(0, Math.ceil(rowCount));
  if (rows === 0) return 0;
  return rows * metrics.cardSize + Math.max(0, rows - 1) * metrics.rowGap;
};

export const getRowRangeForViewport = ({
  gridTop,
  rowStride,
  rowCount,
  viewportTop,
  viewportBottom,
  overscan = 0,
}: {
  gridTop: number;
  rowStride: number;
  rowCount: number;
  viewportTop: number;
  viewportBottom: number;
  overscan?: number;
}): RowRange => {
  const safeStride = Math.max(1, rowStride);
  const safeCount = Math.max(0, Math.ceil(rowCount));
  if (safeCount === 0) return { start: 0, end: 0 };

  const overscanRows = Math.max(0, Math.ceil(overscan));
  const rawStart = Math.floor((viewportTop - gridTop) / safeStride) - overscanRows;
  const rawEnd = Math.ceil((viewportBottom - gridTop) / safeStride) + overscanRows;
  const start = Math.max(0, Math.min(safeCount, rawStart));
  const end = Math.max(start, Math.min(safeCount, rawEnd));
  return { start, end };
};

export const getVirtualRange = ({
  itemCount,
  metrics,
  gridTop,
  viewportTop,
  viewportBottom,
  overscanRows = 0,
  forcedIndex,
}: {
  itemCount: number;
  metrics: GridMetrics;
  gridTop: number;
  viewportTop: number;
  viewportBottom: number;
  overscanRows?: number;
  forcedIndex?: number;
}): VirtualRange => {
  const safeCount = Math.max(0, Math.floor(itemCount));
  const rowCount = getRowCount(safeCount, metrics.columns);
  const viewportRows = getRowRangeForViewport({
    gridTop,
    rowStride: metrics.rowStride,
    rowCount,
    viewportTop,
    viewportBottom,
    overscan: overscanRows,
  });

  let startRow = viewportRows.start;
  let endRow = viewportRows.end;
  if (forcedIndex !== undefined && forcedIndex >= 0 && forcedIndex < safeCount) {
    const forcedRow = Math.floor(forcedIndex / metrics.columns);
    const forcedWindow = Math.max(1, Math.ceil(overscanRows));
    startRow = Math.min(startRow, Math.max(0, forcedRow - forcedWindow));
    endRow = Math.max(endRow, Math.min(rowCount, forcedRow + forcedWindow + 1));
  }

  const startIndex = Math.min(safeCount, startRow * metrics.columns);
  const endIndex = Math.min(safeCount, endRow * metrics.columns);
  return { start: startRow, end: endRow, startIndex, endIndex };
};

export const parseGridMetrics = (element: HTMLElement): GridMetrics | null => {
  const style = window.getComputedStyle(element);
  const width = element.getBoundingClientRect().width;
  const columns = Math.max(1, style.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length);
  const columnGap = Number.parseFloat(style.columnGap) || 0;
  const rowGap = Number.parseFloat(style.rowGap) || 0;
  const cardSize = (width - Math.max(0, columns - 1) * columnGap) / columns;
  if (!Number.isFinite(cardSize) || cardSize <= 0) return null;

  return {
    columns,
    cardSize,
    columnGap,
    rowGap,
    rowStride: cardSize + rowGap,
  };
};

export const MIN_VISIBLE_AREA_RATIO = 0.5;

interface RectEdges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface VisibleAreaMetrics {
  area: number;
  visibleArea: number;
  visibleRatio: number;
}

/**
 * Measure the part of an element that remains inside the effective viewport.
 * This is intentionally area-based so a tall image with only a small strip
 * visible cannot become the mode-switch anchor.
 */
export const getVisibleAreaMetrics = (
  rect: Pick<DOMRect, 'top' | 'right' | 'bottom' | 'left' | 'width' | 'height'>,
  viewport: RectEdges,
): VisibleAreaMetrics => {
  const visibleWidth = Math.max(
    0,
    Math.min(rect.right, viewport.right) - Math.max(rect.left, viewport.left),
  );
  const visibleHeight = Math.max(
    0,
    Math.min(rect.bottom, viewport.bottom) - Math.max(rect.top, viewport.top),
  );
  const area = Math.max(0, rect.width * rect.height);
  const visibleArea = visibleWidth * visibleHeight;

  return {
    area,
    visibleArea,
    visibleRatio: area > 0 ? visibleArea / area : 0,
  };
};

/**
 * Return the scrollTop that places an element's top edge at the scroll
 * container's top edge.  Using the two rectangles directly is important here:
 * the gallery is a nested scroller below the sticky toolbar, so
 * Element.scrollIntoView() may align against the outer <main> on mobile.
 */
export const getScrollTopForElement = (container: HTMLElement, element: HTMLElement) => {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const requestedTop = container.scrollTop + elementRect.top - containerRect.top;
  return Math.max(0, Math.min(maxScrollTop, requestedTop));
};

export const scrollElementToContainerStart = (
  container: HTMLElement,
  element: HTMLElement,
  behavior: ScrollBehavior = 'auto',
) => {
  const top = getScrollTopForElement(container, element);
  container.scrollTo({ top, behavior });
  return top;
};

/**
 * Return the first card in the uppermost visible grid row.
 *
 * The gallery is virtualized, so this intentionally works from the mounted
 * cards instead of deriving an index from scrollTop. The upper-left card is
 * used only when at least half of its visible area remains; this prevents a
 * card with a small sliver below the sticky month header from becoming the
 * transition anchor.
 */
export const getFirstVisibleGridCardIndex = (container: HTMLElement) => {
  const containerRect = container.getBoundingClientRect();
  const stickyHeaderBottom = Array.from(
    container.querySelectorAll<HTMLElement>('.gallery-month-header'),
  )
    .map(header => header.getBoundingClientRect())
    .filter(rect => rect.top <= containerRect.top + 1 && rect.bottom > containerRect.top + 1)
    .reduce((bottom, rect) => Math.max(bottom, rect.bottom), containerRect.top);
  const viewport = {
    top: Math.min(containerRect.bottom, Math.max(containerRect.top, stickyHeaderBottom)),
    right: containerRect.right,
    bottom: containerRect.bottom,
    left: containerRect.left,
  };
  const cards = Array.from(
    container.querySelectorAll<HTMLElement>('[data-selection-card="true"][data-gallery-index]'),
  );
  const visibleCards = cards
    .map(card => {
      const rect = card.getBoundingClientRect();
      return {
        card,
        rect,
        ...getVisibleAreaMetrics(rect, viewport),
      };
    })
    .filter(({ visibleArea, area }) => visibleArea > 0 && area > 0);
  const mostlyVisibleCards = visibleCards.filter(
    ({ visibleRatio }) => visibleRatio >= MIN_VISIBLE_AREA_RATIO,
  );
  const candidates = mostlyVisibleCards.length > 0
    ? mostlyVisibleCards
    : visibleCards;
  if (candidates.length === 0) return null;

  const uppermostTop = Math.min(...candidates.map(({ rect }) => rect.top));
  const uppermostRow = candidates
    .filter(({ rect }) => Math.abs(rect.top - uppermostTop) <= 1)
    .sort((left, right) => left.rect.left - right.rect.left);
  const index = Number(uppermostRow[0]?.card.dataset.galleryIndex);
  return Number.isInteger(index) && index >= 0 ? index : null;
};

/**
 * Align a grid card's row below its sticky month header.  Aligning the card
 * itself to the container edge would leave it hidden behind that header.
 */
export const getGridRowScrollTop = (container: HTMLElement, card: HTMLElement) => {
  const sectionHeader = card
    .closest<HTMLElement>('.gallery-month-section')
    ?.querySelector<HTMLElement>('.gallery-month-header');
  const headerHeight = sectionHeader?.getBoundingClientRect().height ?? 0;
  const sectionGap = 12;
  return Math.max(0, getScrollTopForElement(container, card) - headerHeight - sectionGap);
};
