import React from 'react';
import { Artist, ImageItem, WorkGroup } from '../types';
import { getItemGroupKey } from '../utils/grouping';
import { ArtistStickyNav } from './ArtistStickyNav';
import { CustomSelect } from './CustomSelect';
import { MonthJumpItem, MonthJumpNavigationOptions, MonthNavigationPhase, MonthQuickNav } from './MonthQuickNav';
import { getTimeFilterLabel } from '../utils/timeFilterLabels';
import { CheckSquare, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, Search, Filter, X, RotateCcw, List } from 'lucide-react';
import { GalleryMonthSection } from './GalleryMonthSection';
import { GalleryThumbnail } from './GalleryThumbnail';

interface GalleryGridProps {
  images: ImageItem[];
  totalImages: number;
  currentPage: number;
  itemsPerPage: number;
  thumbnailSize: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (num: number) => void;
  sortMode: 'newest_month' | 'oldest_month' | 'oldest' | 'natural_name';
  onSortModeChange: (mode: 'newest_month' | 'oldest_month' | 'oldest' | 'natural_name') => void;
  isEditMode: boolean;
  onToggleEditMode?: () => void;
  selectedIds: Set<number>;
  onToggleSelect: (imageId: number) => void;
  onSetSelection: (imageIds: number[], selected: boolean) => void;
  onReplaceSelection: (imageIds: number[]) => void;
  onOpenFullscreen: (index: number) => void;
  searchQuery?: string;
  onClearSearch?: () => void;
  selectedArtist?: number | null;
  onClearArtist?: () => void;
  onOpenFilters?: () => void;
  selectedMonths?: string[];
  onClearMonth?: (month: string) => void;
  onResetAllFilters?: () => void;
  groupMangaPosts?: boolean;
  onOpenWorkGroup?: (group: WorkGroup) => void;
  artists?: Artist[];
  monthIndexItems?: MonthJumpItem[];
  onJumpToMonth?: (item: MonthJumpItem, options?: MonthJumpNavigationOptions) => void;
  onPrefetchMonth?: (item: MonthJumpItem) => void;
  onNavigationChange?: (phase: MonthNavigationPhase, item?: MonthJumpItem) => void;
  navigationMode?: 'idle' | 'click-scrolling' | 'scrubbing-preview' | 'scrubbing-settle' | 'scrubbing-commit';
  destinationMonthKey?: string | null;
  destinationGlobalIndex?: number | null;
  isLoading?: boolean;
  isArtistLoading?: boolean;
  isArtistUpdating?: boolean;
  onRequestArtistUpdate?: () => void;
  onOpenArtistSettings?: () => void;
  blurEnabled?: boolean;
}

interface SelectionGesture {
  pointerId: number;
  startX: number;
  startY: number;
  anchorKey: string;
  select: boolean;
  active: boolean;
  moved: boolean;
  timer: number | null;
  initiallySelectedIds: Set<number>;
  lastClientX: number;
  lastClientY: number;
  lastRangeKey: string | null;
  autoScrollFrame: number | null;
  autoScrollVelocity: number;
}

interface SelectionModelCard {
  key: string;
  ids: number[];
}

const SELECTION_AUTO_SCROLL_EDGE = 72;
const SELECTION_MAX_SCROLL_SPEED = 24;

const getMonthKeyForLayout = (dateStr?: string) => {
  if (!dateStr) return '未指定月份';
  const value = dateStr.trim();
  const hyphenMatch = value.match(/^(\d{4})[\-/](\d{1,2})/);
  if (hyphenMatch) return `${hyphenMatch[1]}-${hyphenMatch[2].padStart(2, '0')}`;
  const compactMatch = value.match(/^(\d{4})(\d{2})/);
  if (compactMatch) return `${compactMatch[1]}-${compactMatch[2]}`;
  return '未指定月份';
};

const sortOptions = [
  { value: 'newest_month', label: '最新月份', description: '月份新到舊・作品正序 1-1 → 1-10' },
  { value: 'oldest_month', label: '舊月份在前', description: '月份舊到新・作品正序 1-1 → 1-10' },
  { value: 'oldest', label: '舊作品在前', description: '時間與作品舊到新' },
  { value: 'natural_name', label: '檔名自然排序', description: '1-1、1-2 … 1-10' },
] as const;

const itemsPerPageOptions = [
  { value: 100, label: '100 張' },
  { value: 200, label: '200 張' },
  { value: 500, label: '500 張' },
  { value: 1000, label: '1000 張' },
  { value: 5000, label: '全部 (5000)' },
] as const;

export const GalleryGrid: React.FC<GalleryGridProps> = ({
  images,
  totalImages,
  currentPage,
  itemsPerPage,
  thumbnailSize,
  onPageChange,
  onItemsPerPageChange,
  sortMode,
  onSortModeChange,
  isEditMode,
  onToggleEditMode,
  selectedIds,
  onToggleSelect,
  onSetSelection,
  onReplaceSelection,
  onOpenFullscreen,
  searchQuery = '',
  onClearSearch,
  selectedArtist = null,
  onClearArtist,
  onOpenFilters,
  selectedMonths = [],
  onClearMonth,
  onResetAllFilters,
  groupMangaPosts = false,
  onOpenWorkGroup,
  artists = [],
  monthIndexItems,
  onJumpToMonth,
  onPrefetchMonth,
  onNavigationChange,
  navigationMode = 'idle',
  destinationMonthKey = null,
  destinationGlobalIndex = null,
  isLoading = false,
  isArtistLoading = false,
  isArtistUpdating = false,
  onRequestArtistUpdate,
  onOpenArtistSettings,
  blurEnabled = false,
}) => {
  const galleryRootRef = React.useRef<HTMLDivElement | null>(null);
  const filterChromeRef = React.useRef<HTMLDivElement | null>(null);
  const selectionGestureRef = React.useRef<SelectionGesture | null>(null);
  const scrollContainerRef = React.useRef<HTMLElement | null>(null);
  const suppressClickRef = React.useRef(false);
  const [isDragSelecting, setIsDragSelecting] = React.useState(false);
  const [filterChromeHeight, setFilterChromeHeight] = React.useState<number | null>(null);
  const [pageInput, setPageInput] = React.useState(String(currentPage));
  const [scrollTick, setScrollTick] = React.useState(0);

  const selectionModel = React.useMemo<SelectionModelCard[]>(() => {
    const monthRank = new Map((monthIndexItems ?? []).map((item, index) => [item.key, index]));
    const sortedImages = images
      .map((item, index) => ({ item, index, monthKey: getMonthKeyForLayout(item.created_date) }))
      .sort((left, right) => {
        const leftRank = monthRank.get(left.monthKey);
        const rightRank = monthRank.get(right.monthKey);
        if (leftRank !== undefined || rightRank !== undefined) {
          return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER)
            || left.index - right.index;
        }
        const monthOrder = sortMode === 'newest_month' ? -1 : 1;
        return monthOrder * left.monthKey.localeCompare(right.monthKey) || left.index - right.index;
      });

    if (!groupMangaPosts) {
      return sortedImages.map(({ item, index }) => ({ key: `image:${index}`, ids: [item.image_id] }));
    }

    const grouped = new Map<string, SelectionModelCard>();
    sortedImages
      .forEach(({ item, index, monthKey }) => {
        const groupKey = getItemGroupKey(item);
        const selectionKey = `${monthKey}|${groupKey}`;
        const existing = grouped.get(selectionKey);
        if (existing) {
          if (!existing.ids.includes(item.image_id)) existing.ids.push(item.image_id);
        } else {
          grouped.set(selectionKey, { key: `work:${groupKey}:${index}`, ids: [item.image_id] });
        }
      });
    return Array.from(grouped.values());
  }, [groupMangaPosts, images, monthIndexItems, sortMode]);

  React.useLayoutEffect(() => {
    const chrome = filterChromeRef.current;
    if (!chrome) return;

    const updateChromeHeight = () => {
      const nextHeight = chrome.getBoundingClientRect().height;
      if (nextHeight > 0) {
        chrome.parentElement?.style.setProperty('--gallery-filter-chrome-height', `${nextHeight}px`);
        setFilterChromeHeight(current => current !== null && Math.abs(current - nextHeight) < 0.01 ? current : nextHeight);
      }
    };

    updateChromeHeight();
    const settleTimer = window.setTimeout(updateChromeHeight, 0);

    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(updateChromeHeight);
      resizeObserver.observe(chrome);
      return () => {
        window.clearTimeout(settleTimer);
        resizeObserver.disconnect();
      };
    }

    window.addEventListener('resize', updateChromeHeight);
    window.addEventListener('load', updateChromeHeight);
    const mutationObserver = typeof MutationObserver !== 'undefined'
      ? new MutationObserver(updateChromeHeight)
      : null;
    mutationObserver?.observe(chrome, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });

    return () => {
      window.clearTimeout(settleTimer);
      window.removeEventListener('resize', updateChromeHeight);
      window.removeEventListener('load', updateChromeHeight);
      mutationObserver?.disconnect();
    };
  }, [artists.length, images.length, isEditMode, isLoading, searchQuery, selectedArtist, selectedMonths.join('|')]);

  const getSelectionCards = React.useCallback(() => {
    const root = galleryRootRef.current;
    return root
      ? Array.from(root.querySelectorAll<HTMLElement>('[data-selection-card="true"]'))
      : [];
  }, []);

  const findSelectionCardAtPoint = React.useCallback((clientX: number, clientY: number) => {
    const root = galleryRootRef.current;
    if (!root) return null;

    const pointElements = typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(clientX, clientY)
      : [document.elementFromPoint(clientX, clientY)].filter((element): element is Element => element !== null);

    for (const element of pointElements) {
      const card = element.closest<HTMLElement>('[data-selection-card="true"]');
      if (card && root.contains(card)) return card;
    }

    // Sticky headers and the batch toolbar can cover the card under the
    // pointer while the scroll loop is running. Resolve the nearest card in
    // the same horizontal area so the range keeps advancing at either edge.
    const rootRect = root.getBoundingClientRect();
    if (clientX < rootRect.left || clientX > rootRect.right) return null;

    let nearestCard: HTMLElement | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    getSelectionCards().forEach(card => {
      const rect = card.getBoundingClientRect();
      const horizontalDistance = clientX < rect.left
        ? rect.left - clientX
        : clientX > rect.right
          ? clientX - rect.right
          : 0;
      const verticalDistance = clientY < rect.top
        ? rect.top - clientY
        : clientY > rect.bottom
          ? clientY - rect.bottom
          : 0;
      const distance = horizontalDistance * 2 + verticalDistance;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestCard = card;
      }
    });

    return nearestCard;
  }, [getSelectionCards]);

  const applySelectionRangeToCard = React.useCallback((cardKey: string) => {
    const gesture = selectionGestureRef.current;
    if (!gesture?.active) return;

    const anchorIndex = selectionModel.findIndex(card => card.key === gesture.anchorKey);
    const targetIndex = selectionModel.findIndex(card => card.key === cardKey);
    if (anchorIndex < 0 || targetIndex < 0) return;

    const rangeStart = Math.min(anchorIndex, targetIndex);
    const rangeEnd = Math.max(anchorIndex, targetIndex);
    const rangeKey = `${rangeStart}:${rangeEnd}`;
    if (gesture.lastRangeKey === rangeKey) return;

    const rangeIds = new Set<number>();
    selectionModel.slice(rangeStart, rangeEnd + 1).forEach(card => {
      card.ids.forEach(imageId => rangeIds.add(imageId));
    });

    const nextSelectedIds = new Set(gesture.initiallySelectedIds);
    rangeIds.forEach(imageId => {
      if (gesture.select) nextSelectedIds.add(imageId);
      else nextSelectedIds.delete(imageId);
    });

    gesture.lastRangeKey = rangeKey;
    onReplaceSelection(Array.from(nextSelectedIds));
  }, [onReplaceSelection, selectionModel]);

  const selectCardAtPoint = React.useCallback((clientX: number, clientY: number) => {
    const gesture = selectionGestureRef.current;
    if (!gesture?.active) return;

    const target = findSelectionCardAtPoint(clientX, clientY);
    if (!target) return;

    const cardKey = target.dataset.selectionKey;
    if (!cardKey) return;

    applySelectionRangeToCard(cardKey);
  }, [applySelectionRangeToCard, findSelectionCardAtPoint]);

  const stopAutoScroll = React.useCallback((gesture: SelectionGesture | null) => {
    if (!gesture) return;
    if (gesture.autoScrollFrame !== null) {
      window.cancelAnimationFrame(gesture.autoScrollFrame);
      gesture.autoScrollFrame = null;
    }
    gesture.autoScrollVelocity = 0;
  }, []);

  const getScrollContainer = React.useCallback(() => {
    const root = galleryRootRef.current;
    return root?.querySelector<HTMLElement>('[data-gallery-scroll-container="true"]')
      ?? (root?.closest('main') as HTMLElement | null)
      ?? document.scrollingElement as HTMLElement | null;
  }, []);

  React.useLayoutEffect(() => {
    const container = getScrollContainer();
    scrollContainerRef.current = container;
    setScrollTick(tick => tick + 1);
  }, [getScrollContainer, images.length, groupMangaPosts]);

  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return undefined;
    const onScroll = () => {
      // The month ruler uses auto scroll while the pointer is held down. Keep
      // the virtual window in the same event turn as that scroll instead of
      // waiting for the next animation frame, otherwise the new viewport can
      // briefly contain only stale skeletons.
      setScrollTick(tick => tick + 1);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
    };
  }, [images.length, groupMangaPosts]);

  const getAutoScrollVelocity = React.useCallback((clientY: number) => {
    const container = getScrollContainer();
    if (!container || container.scrollHeight <= container.clientHeight) return 0;

    const rect = container.getBoundingClientRect();
    const topDistance = rect.top + SELECTION_AUTO_SCROLL_EDGE - clientY;
    if (topDistance > 0 && container.scrollTop > 0) {
      const intensity = Math.min(1, topDistance / SELECTION_AUTO_SCROLL_EDGE);
      return -Math.max(2, Math.ceil(intensity * SELECTION_MAX_SCROLL_SPEED));
    }

    const bottomDistance = clientY - (rect.bottom - SELECTION_AUTO_SCROLL_EDGE);
    const canScrollDown = container.scrollTop + container.clientHeight < container.scrollHeight - 1;
    if (bottomDistance > 0 && canScrollDown) {
      const intensity = Math.min(1, bottomDistance / SELECTION_AUTO_SCROLL_EDGE);
      return Math.max(2, Math.ceil(intensity * SELECTION_MAX_SCROLL_SPEED));
    }

    return 0;
  }, [getScrollContainer]);

  const updateAutoScroll = React.useCallback((clientX: number, clientY: number) => {
    const gesture = selectionGestureRef.current;
    if (!gesture?.active) return;

    gesture.lastClientX = clientX;
    gesture.lastClientY = clientY;
    gesture.autoScrollVelocity = getAutoScrollVelocity(clientY);

    if (gesture.autoScrollVelocity === 0) {
      stopAutoScroll(gesture);
      return;
    }

    if (gesture.autoScrollFrame !== null) return;

    const tick = () => {
      const currentGesture = selectionGestureRef.current;
      if (!currentGesture?.active || currentGesture.autoScrollVelocity === 0) {
        if (currentGesture) currentGesture.autoScrollFrame = null;
        return;
      }

      const container = getScrollContainer();
      if (!container) {
        stopAutoScroll(currentGesture);
        return;
      }

      const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const nextScrollTop = Math.min(
        maxScrollTop,
        Math.max(0, container.scrollTop + currentGesture.autoScrollVelocity),
      );
      if (nextScrollTop === container.scrollTop) {
        stopAutoScroll(currentGesture);
        return;
      }

      container.scrollTop = nextScrollTop;
      selectCardAtPoint(currentGesture.lastClientX, currentGesture.lastClientY);
      currentGesture.autoScrollVelocity = getAutoScrollVelocity(currentGesture.lastClientY);

      if (currentGesture.autoScrollVelocity === 0) {
        currentGesture.autoScrollFrame = null;
        return;
      }

      currentGesture.autoScrollFrame = window.requestAnimationFrame(tick);
    };

    gesture.autoScrollFrame = window.requestAnimationFrame(tick);
  }, [getAutoScrollVelocity, getScrollContainer, selectCardAtPoint, stopAutoScroll]);

  const handlePointerMove = React.useCallback((event: PointerEvent) => {
    const gesture = selectionGestureRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    if (!gesture.active) {
      const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
      if (distance > 8) {
        gesture.moved = true;
        if (gesture.timer !== null) window.clearTimeout(gesture.timer);
        gesture.timer = null;
      }
      return;
    }

    event.preventDefault();
    gesture.lastClientX = event.clientX;
    gesture.lastClientY = event.clientY;
    selectCardAtPoint(event.clientX, event.clientY);
    updateAutoScroll(event.clientX, event.clientY);
  }, [selectCardAtPoint, updateAutoScroll]);

  const finishPointerGesture = React.useCallback((event: PointerEvent, cancelled = false) => {
    const gesture = selectionGestureRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    if (gesture.timer !== null) window.clearTimeout(gesture.timer);
    if (gesture.active) {
      stopAutoScroll(gesture);
      if (cancelled) {
        onReplaceSelection(Array.from(gesture.initiallySelectedIds));
      } else {
        gesture.lastClientX = event.clientX;
        gesture.lastClientY = event.clientY;
        selectCardAtPoint(event.clientX, event.clientY);
        suppressClickRef.current = true;
      }
    }
    selectionGestureRef.current = null;
    setIsDragSelecting(false);
  }, [onReplaceSelection, selectCardAtPoint, stopAutoScroll]);

  React.useEffect(() => {
    const handlePointerUp = (event: PointerEvent) => finishPointerGesture(event);
    const handlePointerCancel = (event: PointerEvent) => finishPointerGesture(event, true);

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      const gesture = selectionGestureRef.current;
      if (gesture && gesture.timer !== null) window.clearTimeout(gesture.timer);
      stopAutoScroll(gesture);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [finishPointerGesture, handlePointerMove, stopAutoScroll]);

  const beginPointerGesture = React.useCallback((event: React.PointerEvent<HTMLElement>, cardKey: string, cardIds: number[]) => {
    if (!isEditMode || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;

    const uniqueIds = Array.from(new Set(cardIds));
    if (uniqueIds.length === 0) return;

    suppressClickRef.current = false;
    const previousGesture = selectionGestureRef.current;
    if (previousGesture) {
      if (previousGesture.timer !== null) window.clearTimeout(previousGesture.timer);
      stopAutoScroll(previousGesture);
    }

    const gesture: SelectionGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      anchorKey: cardKey,
      select: !uniqueIds.every(imageId => selectedIds.has(imageId)),
      active: false,
      moved: false,
      timer: null,
      initiallySelectedIds: new Set(selectedIds),
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      lastRangeKey: null,
      autoScrollFrame: null,
      autoScrollVelocity: 0,
    };
    selectionGestureRef.current = gesture;
    gesture.timer = window.setTimeout(() => {
      const currentGesture = selectionGestureRef.current;
      if (!currentGesture || currentGesture.pointerId !== event.pointerId || currentGesture.moved) return;

      currentGesture.active = true;
      applySelectionRangeToCard(cardKey);
      setIsDragSelecting(true);
    }, 360);
  }, [applySelectionRangeToCard, isEditMode, selectedIds, stopAutoScroll]);

  const activateCard = React.useCallback((cardIds: number[], openCard: () => void) => {
    if (isEditMode) {
      const uniqueIds = Array.from(new Set(cardIds));
      if (uniqueIds.length === 1) {
        onToggleSelect(uniqueIds[0]);
      } else {
        const allSelected = uniqueIds.every(imageId => selectedIds.has(imageId));
        onSetSelection(uniqueIds, !allSelected);
      }
      return;
    }

    openCard();
  }, [isEditMode, onSetSelection, onToggleSelect, selectedIds]);

  const handleCardClick = React.useCallback((event: React.MouseEvent<HTMLElement>, cardIds: number[], openCard: () => void) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event.preventDefault();
      return;
    }
    activateCard(cardIds, openCard);
  }, [activateCard]);

  const handleCardKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLElement>, cardIds: number[], openCard: () => void) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    activateCard(cardIds, openCard);
  }, [activateCard]);

  const totalPages = Math.max(1, Math.ceil(totalImages / itemsPerPage));
  const startOffset = (currentPage - 1) * itemsPerPage;
  const endOffset = Math.min(startOffset + images.length, totalImages);

  React.useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage, totalPages]);

  const hasActiveFilters = searchQuery !== '' || selectedArtist !== null || selectedMonths.length > 0;
  const hasActiveFilterSummary = searchQuery !== '' || selectedMonths.length > 0;
  const selectedArtistObj = selectedArtist === null
    ? null
    : artists.find(artist => artist.member_id === selectedArtist) || null;
  const monthNavResetKey = [
    selectedArtist ?? 'all-artists',
    searchQuery,
    selectedMonths.join(','),
    sortMode,
    itemsPerPage,
  ].join('|');

  // Group images by Month
  const groupedByMonth: Record<string, { label: string; items: { item: ImageItem; globalIndex: number }[] }> = {};

  images.forEach((item, globalIndex) => {
    const monthKey = getMonthKeyForLayout(item.created_date);
    const monthLabel = monthKey === '未指定月份'
      ? monthKey
      : `${monthKey.slice(0, 4)} 年 ${monthKey.slice(5)} 月`;
    if (!groupedByMonth[monthKey]) {
      groupedByMonth[monthKey] = { label: monthLabel, items: [] };
    }
    groupedByMonth[monthKey].items.push({ item, globalIndex });
  });

  const monthKeys = Object.keys(groupedByMonth);
  if (sortMode === 'oldest' || sortMode === 'oldest_month') {
    monthKeys.sort((a, b) => a.localeCompare(b));
  } else if (sortMode === 'natural_name') {
    monthKeys.sort((a, b) => a.localeCompare(b));
  } else {
    monthKeys.sort((a, b) => b.localeCompare(a));
  }

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxButtons = 7;
    if (totalPages <= maxButtons) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  const goToPageFromInput = () => {
    const requestedPage = Number(pageInput);
    if (!Number.isInteger(requestedPage)) {
      setPageInput(String(currentPage));
      return;
    }

    const nextPage = Math.min(totalPages, Math.max(1, requestedPage));
    setPageInput(String(nextPage));
    if (nextPage !== currentPage) onPageChange(nextPage);
  };

  const handlePageInputSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    goToPageFromInput();
  };

  const monthNavigationItems = monthIndexItems ?? monthKeys.map(mKey => ({
    key: mKey,
    label: groupedByMonth[mKey].label,
    count: groupedByMonth[mKey].items.length,
  }));

  return (
    <div
      ref={galleryRootRef}
      className={`gallery-grid-root min-w-0${isDragSelecting ? ' is-drag-selecting' : ''}${images.length === 0 ? ' is-empty' : ''}`}
      style={filterChromeHeight === null
        ? undefined
        : { '--gallery-filter-chrome-height': `${filterChromeHeight}px` } as React.CSSProperties}
    >
      <MonthQuickNav
        key={monthNavResetKey}
        items={monthNavigationItems}
        sectionKeys={monthKeys.join('|')}
        onJumpToMonth={onJumpToMonth}
        onPrefetchMonth={onPrefetchMonth}
        onNavigationChange={onNavigationChange}
        isLoading={isLoading}
      />

      <div
        ref={filterChromeRef}
        data-viewer-sticky-toolbar="true"
        className="gallery-context-shell sticky top-0 z-20"
      >
      {/* Active Search & Filter Banner */}
      {hasActiveFilterSummary && (
        <div className="filter-summary filter-summary__layout rounded-xl p-3 mx-4 mt-3 flex flex-wrap items-center justify-between gap-3 shadow-md backdrop-blur-sm">
          <div className="filter-summary__main flex items-center gap-2 flex-wrap">
            <span className="filter-summary__label text-xs font-bold text-indigo-300 flex items-center gap-1.5 mr-1">
              <Filter className="w-4 h-4 text-indigo-400" />
              目前篩選中:
            </span>

            {searchQuery && (
              <span className="filter-summary__badge filter-summary__badge--search inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-xs">
                <Search className="w-3.5 h-3.5 text-indigo-400" />
                關鍵字: 「{searchQuery}」
                {onClearSearch && (
                  <button
                    type="button"
                    onClick={onClearSearch}
                    className="filter-summary__clear hover:bg-indigo-500/40 transition-colors ml-0.5"
                    aria-label={`清除搜尋條件：${searchQuery}`}
                    title="清除關鍵字搜尋"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
            )}

            {selectedMonths.map((m) => (
              <span
                key={m}
                className="filter-summary__badge filter-summary__badge--month inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-xs"
              >
                📅 {getTimeFilterLabel(m)}: {m}
                {onClearMonth && (
                  <button
                    type="button"
                    onClick={() => onClearMonth(m)}
                    className="filter-summary__clear hover:bg-emerald-500/40 transition-colors ml-0.5"
                    aria-label={`清除月份條件：${m}`}
                    title={`取消 ${m} ${getTimeFilterLabel(m)}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
            ))}
          </div>

          <div className="filter-summary__meta flex items-center gap-3">
            <span className="text-xs font-medium text-zinc-400">
              找到 <strong className="text-zinc-100 font-bold">{totalImages}</strong> 筆相符作品
            </span>
            {onResetAllFilters && (
              <button
                onClick={onResetAllFilters}
                className="filter-summary__reset text-xs font-medium px-2.5 py-1 rounded-lg flex items-center gap-1 transition-[background-color,color,border-color] shadow-xs"
              >
                <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                重設所有條件
              </button>
            )}
          </div>
        </div>
      )}

      {/* Context controls stay in one row and collapse to icon buttons on mobile. */}
      <div
        className={`gallery-filter-toolbar ${selectedArtistObj ? 'has-artist' : 'is-empty'} flex items-center gap-2 px-4 select-none sm:gap-3`}
      >
        {onOpenFilters && (
          <button
            type="button"
            onClick={onOpenFilters}
            className={`gallery-filter-toolbar__filter-trigger ${hasActiveFilters ? 'is-active' : ''}`}
            aria-label="開啟篩選條件"
            aria-controls="gallery-filter-sidebar"
            title="開啟篩選條件"
          >
            <Filter className="h-5 w-5" aria-hidden="true" />
            <span className="gallery-filter-toolbar__filter-label">篩選</span>
            {hasActiveFilters && <span className="gallery-filter-toolbar__filter-indicator" aria-hidden="true" />}
          </button>
        )}
        <ArtistStickyNav
          artist={selectedArtistObj}
          onClearArtist={onClearArtist}
          isLoading={isArtistLoading}
          isUpdating={isArtistUpdating}
          onRequestUpdate={onRequestArtistUpdate}
          onOpenSettings={onOpenArtistSettings}
          isEditMode={isEditMode}
          onToggleEditMode={onToggleEditMode}
          sortMode={sortMode}
          sortOptions={sortOptions}
          onSortModeChange={onSortModeChange}
          itemsPerPage={itemsPerPage}
          itemsPerPageOptions={itemsPerPageOptions}
          onItemsPerPageChange={onItemsPerPageChange}
          onPageChange={onPageChange}
        />
          <div className="gallery-filter-toolbar__actions">
            <div className="gallery-filter-toolbar__sort ml-auto flex min-h-9 shrink-0 items-center gap-2">
            <span className="gallery-filter-toolbar__label text-xs font-medium text-zinc-400">排序:</span>
            <CustomSelect
              value={sortMode}
              options={sortOptions}
              onChange={onSortModeChange}
              ariaLabel="排序方式"
              className="gallery-filter-toolbar__sort-select"
              leadingContent={<ArrowUpDown className="gallery-filter-toolbar__sort-icon h-5 w-5" />}
              buttonClassName="gallery-filter-toolbar__sort-control"
              menuPlacement="end"
              style={{ '--select-icon-color': 'var(--header-control-muted)', '--select-icon-focus-color': 'var(--header-accent)' } as React.CSSProperties}
            />
          </div>
          <div className="gallery-filter-toolbar__page-size">
            <span className="gallery-filter-toolbar__label gallery-filter-toolbar__page-size-label text-xs font-medium text-zinc-400">每頁:</span>
            <CustomSelect
              value={itemsPerPage}
              options={itemsPerPageOptions}
              onChange={nextItemsPerPage => {
                onItemsPerPageChange(nextItemsPerPage);
                onPageChange(1);
              }}
              ariaLabel="每頁顯示數量"
              className="gallery-filter-toolbar__page-size-select"
              leadingContent={<List className="gallery-filter-toolbar__page-size-icon h-5 w-5" />}
              buttonClassName="gallery-filter-toolbar__page-size-control"
              menuPlacement="end"
              style={{ '--select-icon-color': 'var(--header-control-muted)', '--select-icon-focus-color': 'var(--header-accent)' } as React.CSSProperties}
            />
          </div>
          {onToggleEditMode && (
            <button
              type="button"
              onClick={onToggleEditMode}
              aria-pressed={isEditMode}
              aria-label={isEditMode ? '結束編輯模式' : '開啟編輯模式'}
              title={isEditMode ? '結束編輯模式' : '開啟編輯模式'}
              className={`gallery-filter-toolbar__edit-trigger ${isEditMode ? 'is-active' : ''}`}
            >
              <CheckSquare className="h-5 w-5" aria-hidden="true" />
              <span className="gallery-filter-toolbar__edit-label">{isEditMode ? '編輯中' : '編輯'}</span>
            </button>
          )}
        </div>
      </div>
      </div>

      {/* Main Grid View - Grouped by Month Sections */}
      <div className="gallery-month-content p-4 space-y-6" data-gallery-scroll-container="true">
        {isLoading && images.length === 0 ? (
          <div className="gallery-empty-state gallery-empty-state--loading" role="status" aria-live="polite" aria-busy="true">
            <div className="gallery-empty-state__icon" aria-hidden="true">
              <RotateCcw className="h-7 w-7 gallery-empty-state__spinner" />
            </div>
            <div className="gallery-empty-state__copy">
              <p className="gallery-empty-state__title">正在載入作品</p>
              <p className="gallery-empty-state__description">正在讀取圖片資料夾，第一次載入可能需要一點時間。</p>
            </div>
          </div>
        ) : images.length === 0 ? (
          <div className="gallery-empty-state" role="status" aria-live="polite">
            <div className="gallery-empty-state__icon" aria-hidden="true">
              <Search className="h-7 w-7" />
            </div>
            <div className="gallery-empty-state__copy">
              <p className="gallery-empty-state__title">沒有相符的結果</p>
              {searchQuery ? (
                <p className="gallery-empty-state__description">
                  找不到「<span className="gallery-empty-state__query">{searchQuery}</span>」相關作品
                </p>
              ) : (
                <p className="gallery-empty-state__description">請調整篩選條件或搜尋關鍵字</p>
              )}
            </div>
            {hasActiveFilters && onResetAllFilters && (
              <button
                type="button"
                onClick={onResetAllFilters}
                className="gallery-empty-state__reset"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                清除條件
              </button>
            )}
          </div>
        ) : (
          <>
            {monthKeys.map(mKey => (
              <GalleryMonthSection
                key={mKey}
                group={{ key: mKey, ...groupedByMonth[mKey] }}
                groupMangaPosts={groupMangaPosts}
                thumbnailSize={thumbnailSize}
                isEditMode={isEditMode}
                selectedIds={selectedIds}
                onSetSelection={onSetSelection}
                onOpenFullscreen={onOpenFullscreen}
                onOpenWorkGroup={onOpenWorkGroup}
                beginPointerGesture={beginPointerGesture}
                handleCardClick={handleCardClick}
                handleCardKeyDown={handleCardKeyDown}
                blurEnabled={blurEnabled}
                scrollContainerRef={scrollContainerRef}
                scrollTick={scrollTick}
                navigationMode={navigationMode}
                destinationMonthKey={destinationMonthKey}
                destinationGlobalIndex={destinationGlobalIndex}
              />
            ))}

            {/* Pagination Bar */}
            <div className="gallery-pagination flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-zinc-800 text-xs text-zinc-400">
          <div className="gallery-pagination__summary">
            顯示第 <span className="font-semibold text-zinc-200">{startOffset + 1}</span> - <span className="font-semibold text-zinc-200">{endOffset}</span> 張，共 <span className="font-semibold text-indigo-400">{totalImages}</span> 張作品
          </div>

          {/* Page Buttons */}
          <div className="gallery-pagination__controls flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onPageChange(1)}
              aria-label="第一頁"
              disabled={currentPage === 1}
              className="gallery-pagination__button gallery-pagination__button--icon rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-zinc-900"
              title="第一頁"
            >
              <ChevronsLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="gallery-pagination__button p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-zinc-900 flex items-center gap-1 px-2.5"
            >
              <ChevronLeft className="w-4 h-4" /> 上一頁
            </button>

            {getPageNumbers().map((p, idx) => {
              if (typeof p === 'string') {
                return <span key={idx} className="px-2 text-zinc-500">...</span>;
              }
                return (
                <button
                  key={`${p}-${idx}`}
                  type="button"
                  onClick={() => onPageChange(p)}
                  className={`gallery-pagination__button ${currentPage === p ? 'is-current' : ''} rounded-lg text-xs font-semibold transition-colors ${
                    currentPage === p
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {p}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="gallery-pagination__button p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-zinc-900 flex items-center gap-1 px-2.5"
            >
              下一頁 <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onPageChange(totalPages)}
              aria-label="最後一頁"
              disabled={currentPage === totalPages}
              className="gallery-pagination__button gallery-pagination__button--icon rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-zinc-900"
              title="最後一頁"
            >
              <ChevronsRight className="h-5 w-5" />
            </button>
          </div>

          <form className="gallery-pagination__jump" onSubmit={handlePageInputSubmit}>
            <label className="gallery-pagination__jump-label" htmlFor="gallery-page-input">前往頁面</label>
            <input
              id="gallery-page-input"
              name="page"
              type="number"
              min={1}
              max={totalPages}
              step={1}
              inputMode="numeric"
              value={pageInput}
              onChange={event => setPageInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  goToPageFromInput();
                }
              }}
              aria-describedby="gallery-page-input-hint"
            />
            <span id="gallery-page-input-hint" className="gallery-pagination__jump-total">/ {totalPages}</span>
            <button type="submit" className="gallery-pagination__button gallery-pagination__jump-submit">前往</button>
          </form>

            </div>
          </>
        )}
      </div>
    </div>
  );
};
