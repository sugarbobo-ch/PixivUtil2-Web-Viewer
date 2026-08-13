import React from 'react';
import { Artist, ImageItem, SortMode, WorkGroup } from '../types';
import { useI18n } from '../i18n';
import { getItemGroupKey } from '../utils/grouping';
import { ArtistStickyNav } from './ArtistStickyNav';
import { CustomSelect } from './CustomSelect';
import { MonthJumpItem, MonthJumpNavigationOptions, MonthNavigationPhase, MonthQuickNav } from './MonthQuickNav';
import { ChevronLeft, ChevronsLeft, ChevronsRight, ArrowUpDown, Search, Filter, RotateCcw, List } from 'lucide-react';
import { GalleryMonthSection } from './GalleryMonthSection';
import { getGridRowScrollTop } from '../utils/galleryLayout';
import { getArtistScopeKey } from '../utils/artistIdentity';
import {
  GallerySelectionCard,
  getImageSelectionKey,
  getWorkSelectionKey,
  replaceSelectionForRange,
} from '../utils/gallerySelection';
import { Badge, Button, IconButton, Input } from './ui';
import { GalleryGlobalTrack } from './GalleryGlobalTrack';
import type { GalleryLayoutIndex, MediaWindowController, MediaWindowSnapshot } from '../media-window';

export interface GalleryPageChangeOptions {
  preserveScroll?: boolean;
  selectionDirection?: -1 | 1;
}

interface GalleryGridProps {
  images: ImageItem[];
  totalImages: number;
  currentPage: number;
  itemsPerPage: number;
  thumbnailSize: number;
  onPageChange: (page: number, options?: GalleryPageChangeOptions) => void;
  onLoadPage?: (page: number) => Promise<unknown>;
  onItemsPerPageChange: (num: number) => void;
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
  isEditMode: boolean;
  onToggleEditMode?: () => void;
  selectedIds: Set<number>;
  onToggleSelect: (imageId: number) => void;
  onSetSelection: (imageIds: number[], selected: boolean) => void;
  onReplaceSelection: (imageIds: number[]) => void;
  onOpenFullscreen: (index: number) => void;
  onPrefetchReader?: () => void;
  searchQuery?: string;
  selectedArtist?: string | null;
  onClearArtist?: () => void;
  onOpenFilters?: () => void;
  isFilterSidebarOpen?: boolean;
  selectedMonths?: string[];
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
  restoreGlobalIndex?: number | null;
  restoreRequestId?: number;
  loadedPage?: number | null;
  isLoading?: boolean;
  isArtistLoading?: boolean;
  isArtistUpdating?: boolean;
  onRequestArtistUpdate?: () => void;
  onOpenArtistSettings?: () => void;
  blurEnabled?: boolean;
  demoMode?: boolean;
  globalMediaWindow?: MediaWindowController;
  globalMediaSnapshot?: MediaWindowSnapshot;
  globalLayout?: GalleryLayoutIndex;
}

interface SelectionGesture {
  pointerId: number;
  startX: number;
  startY: number;
  anchorKey: string;
  anchorIndex: number;
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
  page: number;
  pageModels: Map<number, GallerySelectionCard[]>;
  pageTransitionPromise: Promise<void> | null;
  pendingPageTransitionDirection: -1 | 0 | 1;
}

const SELECTION_AUTO_SCROLL_EDGE = 72;
const SELECTION_MAX_SCROLL_SPEED = 24;
const UNSPECIFIED_MONTH_KEY = '__unspecified-month__';

const getMonthKeyForLayout = (dateStr?: string) => {
  if (!dateStr) return UNSPECIFIED_MONTH_KEY;
  const value = dateStr.trim();
  const hyphenMatch = value.match(/^(\d{4})[\-/](\d{1,2})/);
  if (hyphenMatch) return `${hyphenMatch[1]}-${hyphenMatch[2].padStart(2, '0')}`;
  const compactMatch = value.match(/^(\d{4})(\d{2})/);
  if (compactMatch) return `${compactMatch[1]}-${compactMatch[2]}`;
  return UNSPECIFIED_MONTH_KEY;
};

const sortOptions = [
  { value: 'newest_month' },
  { value: 'newest_works_pages_ascending' },
  { value: 'newest_month_oldest_works' },
  { value: 'oldest_month' },
  { value: 'oldest' },
  { value: 'natural_name' },
] as const;

const itemsPerPageOptions = [
  { value: 100 },
  { value: 200 },
  { value: 500 },
  { value: 1000 },
  { value: 5000 },
] as const;

export const GalleryGrid: React.FC<GalleryGridProps> = ({
  images,
  totalImages,
  currentPage,
  itemsPerPage,
  thumbnailSize,
  onPageChange,
  onLoadPage,
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
  onPrefetchReader,
  searchQuery = '',
  selectedArtist = null,
  onClearArtist,
  onOpenFilters,
  isFilterSidebarOpen = false,
  selectedMonths = [],
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
  restoreGlobalIndex = null,
  restoreRequestId = 0,
  loadedPage,
  isLoading = false,
  isArtistLoading = false,
  isArtistUpdating = false,
  onRequestArtistUpdate,
  onOpenArtistSettings,
  blurEnabled = false,
  demoMode = false,
  globalMediaWindow,
  globalMediaSnapshot,
  globalLayout,
}) => {
  const { t, formatNumber } = useI18n();
  const galleryRootRef = React.useRef<HTMLDivElement | null>(null);
  const filterChromeRef = React.useRef<HTMLDivElement | null>(null);
  const selectionGestureRef = React.useRef<SelectionGesture | null>(null);
  const scrollContainerRef = React.useRef<HTMLElement | null>(null);
  const suppressClickRef = React.useRef(false);
  const [isDragSelecting, setIsDragSelecting] = React.useState(false);
  const [filterChromeHeight, setFilterChromeHeight] = React.useState<number | null>(null);
  const [pageInput, setPageInput] = React.useState(String(currentPage));
  const [scrollTick, setScrollTick] = React.useState(0);
  const pageOffset = Math.max(0, (currentPage - 1) * itemsPerPage);
  const isGlobalMode = Boolean(globalMediaWindow && globalMediaSnapshot && globalLayout);
  const globalActiveMonthKey = React.useMemo(() => {
    if (!isGlobalMode || !globalLayout) return undefined;
    const scrollTop = scrollContainerRef.current?.scrollTop ?? 0;
    return globalLayout.getMonthAtOffset(scrollTop + 96)?.key
      ?? globalLayout.months[0]?.key
      ?? null;
  }, [globalLayout, isGlobalMode, scrollTick]);
  const totalPages = Math.max(1, Math.ceil(totalImages / Math.max(1, itemsPerPage)));
  const localizedSortOptions = React.useMemo(() => sortOptions.map(option => ({
    ...option,
    label: t(({
      newest_month: 'gallery.sortNewestMonth',
      newest_works_pages_ascending: 'gallery.sortNewestWorks',
      newest_month_oldest_works: 'gallery.sortOldestImages',
      oldest_month: 'gallery.sortOldestMonth',
      oldest: 'gallery.sortOldest',
      natural_name: 'gallery.sortNatural',
    } satisfies Record<SortMode, string>)[option.value]),
    description: t(({
      newest_month: 'gallery.sortNewestMonthDescription',
      newest_works_pages_ascending: 'gallery.sortNewestWorksDescription',
      newest_month_oldest_works: 'gallery.sortOldestImagesDescription',
      oldest_month: 'gallery.sortOldestMonthDescription',
      oldest: 'gallery.sortOldestDescription',
      natural_name: 'gallery.sortNaturalDescription',
    } satisfies Record<SortMode, string>)[option.value]),
  })), [t]);
  const localizedItemsPerPageOptions = React.useMemo(() => itemsPerPageOptions.map(option => ({
    ...option,
    label: option.value === 5000
      ? t('gallery.allCount', { count: formatNumber(option.value) })
      : t('gallery.countUnit', { count: formatNumber(option.value) }),
  })), [formatNumber, t]);

  const selectionModel = React.useMemo<GallerySelectionCard[]>(() => {
    const monthKeys = Array.from(new Set(images.map(item => getMonthKeyForLayout(item.created_date))));
    const ascendingMonths = sortMode === 'oldest'
      || sortMode === 'oldest_month'
      || sortMode === 'natural_name';
    monthKeys.sort((left, right) => ascendingMonths
      ? left.localeCompare(right)
      : right.localeCompare(left));
    const monthRank = new Map(monthKeys.map((key, index) => [key, index]));
    const sortedImages = images
      .map((item, index) => ({ item, index, monthKey: getMonthKeyForLayout(item.created_date) }))
      .sort((left, right) => {
        const leftRank = monthRank.get(left.monthKey);
        const rightRank = monthRank.get(right.monthKey);
        if (leftRank !== undefined || rightRank !== undefined) {
          return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER)
            || left.index - right.index;
        }
        const monthOrder = sortMode === 'oldest' || sortMode === 'oldest_month' || sortMode === 'natural_name' ? 1 : -1;
        return monthOrder * left.monthKey.localeCompare(right.monthKey) || left.index - right.index;
      });

    if (!groupMangaPosts) {
      return sortedImages.map(({ item }, displayIndex) => ({
        key: getImageSelectionKey(item),
        ids: [item.image_id],
        startIndex: pageOffset + displayIndex,
        endIndex: pageOffset + displayIndex,
      }));
    }

    const grouped = new Map<string, GallerySelectionCard>();
    sortedImages
      .forEach(({ item, monthKey }, displayIndex) => {
        const groupKey = getItemGroupKey(item);
        const selectionKey = `${monthKey}|${groupKey}`;
        const existing = grouped.get(selectionKey);
        if (existing) {
          if (!existing.ids.includes(item.image_id)) existing.ids.push(item.image_id);
          existing.endIndex = pageOffset + displayIndex;
        } else {
          grouped.set(selectionKey, {
            key: getWorkSelectionKey(monthKey, groupKey, item),
            ids: [item.image_id],
            startIndex: pageOffset + displayIndex,
            endIndex: pageOffset + displayIndex,
          });
        }
      });
    return Array.from(grouped.values());
  }, [groupMangaPosts, images, pageOffset, sortMode]);

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

    gesture.pageModels.set(currentPage, selectionModel);
    const targetCard = selectionModel.find(card => card.key === cardKey);
    if (!targetCard) return;

    const rangeStart = Math.min(gesture.anchorIndex, targetCard.startIndex);
    const rangeEnd = Math.max(gesture.anchorIndex, targetCard.startIndex);
    const rangeKey = `${rangeStart}:${rangeEnd}`;
    if (gesture.lastRangeKey === rangeKey) return;

    const cards = Array.from(gesture.pageModels.values()).flat();
    const nextSelectedIds = replaceSelectionForRange(
      gesture.initiallySelectedIds,
      cards,
      rangeStart,
      rangeEnd,
      gesture.select,
    );

    gesture.lastRangeKey = rangeKey;
    onReplaceSelection(Array.from(nextSelectedIds));
  }, [currentPage, onReplaceSelection, selectionModel]);

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

  // A mode switch should reopen the grid with the active image's row at the
  // top of the reading area.  The target may be outside the first virtual
  // window, so GalleryMonthSection forces that row into the mounted range and
  // this effect retries until the card is available.
  React.useLayoutEffect(() => {
    if (restoreGlobalIndex === null || restoreRequestId === 0) return undefined;

    let frameId: number | null = null;
    let attempts = 0;
    let cancelled = false;

    const restore = () => {
      if (cancelled) return;

      const root = galleryRootRef.current;
      const container = getScrollContainer();
      const target = root?.querySelector<HTMLElement>(
        `[data-selection-card="true"][data-gallery-index="${restoreGlobalIndex}"],`
        + `[data-selection-card="true"][data-gallery-indices~="${restoreGlobalIndex}"]`,
      );

      if (container && target) {
        const top = getGridRowScrollTop(container, target);
        if (Math.abs(container.scrollTop - top) > 0.5) {
          container.scrollTo({ top, behavior: 'auto' });
        }
      }

      attempts += 1;
      if (attempts < 12) frameId = window.requestAnimationFrame(restore);
    };

    frameId = window.requestAnimationFrame(restore);
    return () => {
      cancelled = true;
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [getScrollContainer, restoreGlobalIndex, restoreRequestId]);

  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return undefined;
    let frameId: number | null = null;
    const onScroll = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        setScrollTick(tick => tick + 1);
      });
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
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

  const getPageTransitionDirection = React.useCallback((clientY: number): -1 | 0 | 1 => {
    const container = getScrollContainer();
    if (!container) return 0;

    const gesture = selectionGestureRef.current;
    const page = gesture?.page ?? currentPage;
    const rect = container.getBoundingClientRect();
    const atTop = container.scrollTop <= 1
      && clientY <= rect.top + SELECTION_AUTO_SCROLL_EDGE
      && page > 1;
    if (atTop) return -1;

    const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 1
      && clientY >= rect.bottom - SELECTION_AUTO_SCROLL_EDGE
      && page < totalPages;
    return atBottom ? 1 : 0;
  }, [currentPage, getScrollContainer, totalPages]);

  const requestAdjacentPage = React.useCallback((direction: -1 | 1) => {
    const gesture = selectionGestureRef.current;
    if (!gesture?.active || gesture.pageTransitionPromise !== null) return;

    const nextPage = gesture.page + direction;
    if (nextPage < 1 || nextPage > totalPages) return;

    const pageRequest = onLoadPage ? onLoadPage(nextPage) : Promise.resolve();
    const transition = Promise.resolve(pageRequest)
      .then(() => {
        const currentGesture = selectionGestureRef.current;
        if (!currentGesture || currentGesture !== gesture || !currentGesture.active) return;
        if (getPageTransitionDirection(currentGesture.lastClientY) !== direction) return;

        currentGesture.page = nextPage;
        currentGesture.pendingPageTransitionDirection = direction;
        onPageChange(nextPage, {
          preserveScroll: true,
          selectionDirection: direction,
        });
      })
      .catch(error => {
        console.error('Failed to load adjacent gallery page during selection:', error);
      })
      .finally(() => {
        const currentGesture = selectionGestureRef.current;
        if (currentGesture === gesture) currentGesture.pageTransitionPromise = null;
      });

    gesture.pageTransitionPromise = transition;
  }, [getPageTransitionDirection, onLoadPage, onPageChange, totalPages]);

  const updateAutoScroll = React.useCallback((clientX: number, clientY: number) => {
    const gesture = selectionGestureRef.current;
    if (!gesture?.active) return;

    gesture.lastClientX = clientX;
    gesture.lastClientY = clientY;
    gesture.autoScrollVelocity = getAutoScrollVelocity(clientY);

    if (gesture.autoScrollVelocity === 0) {
      const direction = getPageTransitionDirection(clientY);
      if (direction !== 0) requestAdjacentPage(direction);
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
        const direction = getPageTransitionDirection(currentGesture.lastClientY);
        if (direction !== 0) requestAdjacentPage(direction);
        stopAutoScroll(currentGesture);
        return;
      }

      container.scrollTop = nextScrollTop;
      selectCardAtPoint(currentGesture.lastClientX, currentGesture.lastClientY);
      currentGesture.autoScrollVelocity = getAutoScrollVelocity(currentGesture.lastClientY);

      if (currentGesture.autoScrollVelocity === 0) {
        const direction = getPageTransitionDirection(currentGesture.lastClientY);
        if (direction !== 0) requestAdjacentPage(direction);
        currentGesture.autoScrollFrame = null;
        return;
      }

      currentGesture.autoScrollFrame = window.requestAnimationFrame(tick);
    };

    gesture.autoScrollFrame = window.requestAnimationFrame(tick);
  }, [getAutoScrollVelocity, getPageTransitionDirection, getScrollContainer, requestAdjacentPage, selectCardAtPoint, stopAutoScroll]);

  const handlePointerMove = React.useCallback((event: PointerEvent) => {
    const gesture = selectionGestureRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    if (!gesture.active) {
      const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
      if (distance > 8) {
        gesture.moved = true;
        if (gesture.timer !== null) window.clearTimeout(gesture.timer);
        gesture.timer = null;
        gesture.active = true;
        gesture.lastClientX = event.clientX;
        gesture.lastClientY = event.clientY;
        event.preventDefault();
        setIsDragSelecting(true);
        applySelectionRangeToCard(gesture.anchorKey);
      }
      return;
    }

    event.preventDefault();
    gesture.lastClientX = event.clientX;
    gesture.lastClientY = event.clientY;
    selectCardAtPoint(event.clientX, event.clientY);
    updateAutoScroll(event.clientX, event.clientY);
  }, [applySelectionRangeToCard, selectCardAtPoint, updateAutoScroll]);

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

  React.useLayoutEffect(() => {
    const gesture = selectionGestureRef.current;
    const direction = gesture?.pendingPageTransitionDirection ?? 0;
    if (
      !gesture
      || !gesture.active
      || gesture.page !== currentPage
      || direction === 0
      || isLoading
      || (loadedPage !== undefined && loadedPage !== currentPage)
    ) return undefined;

    gesture.pageModels.set(currentPage, selectionModel);
    gesture.pendingPageTransitionDirection = 0;

    const container = getScrollContainer();
    if (container) {
      container.scrollTop = direction > 0
        ? 0
        : Math.max(0, container.scrollHeight - container.clientHeight);
      setScrollTick(tick => tick + 1);
    }

    const frameId = window.requestAnimationFrame(() => {
      const currentGesture = selectionGestureRef.current;
      if (!currentGesture?.active || currentGesture.page !== currentPage) return;
      selectCardAtPoint(currentGesture.lastClientX, currentGesture.lastClientY);
      updateAutoScroll(currentGesture.lastClientX, currentGesture.lastClientY);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [currentPage, getScrollContainer, isLoading, loadedPage, selectCardAtPoint, selectionModel, updateAutoScroll]);

  const beginPointerGesture = React.useCallback((event: React.PointerEvent<HTMLElement>, cardKey: string, cardIds: number[]) => {
    if (!isEditMode || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;

    const uniqueIds = Array.from(new Set(cardIds));
    if (uniqueIds.length === 0) return;

    const anchorCard = selectionModel.find(card => card.key === cardKey);
    if (!anchorCard) return;

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
      anchorIndex: anchorCard.startIndex,
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
      page: currentPage,
      pageModels: new Map([[currentPage, selectionModel]]),
      pageTransitionPromise: null,
      pendingPageTransitionDirection: 0,
    };
    selectionGestureRef.current = gesture;
    gesture.timer = window.setTimeout(() => {
      const currentGesture = selectionGestureRef.current;
      if (!currentGesture || currentGesture.pointerId !== event.pointerId || currentGesture.moved) return;

      currentGesture.active = true;
      applySelectionRangeToCard(cardKey);
      setIsDragSelecting(true);
    }, 360);
  }, [applySelectionRangeToCard, currentPage, isEditMode, selectedIds, selectionModel, stopAutoScroll]);

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

  const startOffset = (currentPage - 1) * itemsPerPage;
  const endOffset = Math.min(startOffset + images.length, totalImages);

  React.useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage, totalPages]);

const hasActiveFilters = searchQuery !== '' || selectedArtist !== null || selectedMonths.length > 0;
  const activeFilterCount =
    selectedMonths.length +
    (selectedArtist !== null ? 1 : 0) +
    (searchQuery !== '' ? 1 : 0);
const selectedArtistObj = selectedArtist === null
    ? null
    : artists.find(artist => getArtistScopeKey(artist) === selectedArtist) || null;
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
    const monthLabel = monthKey === UNSPECIFIED_MONTH_KEY
      ? t('gallery.unspecifiedMonth')
      : t('gallery.monthLabel', { year: monthKey.slice(0, 4), month: monthKey.slice(5) });
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

  const monthNavigationItems = globalLayout
    ? globalLayout.months.map(month => ({
      key: month.key,
      label: month.label,
      count: month.imageCount,
      offset: month.offset,
    }))
    : monthIndexItems ?? monthKeys.map(mKey => ({
    key: mKey,
    label: groupedByMonth[mKey].label,
    count: groupedByMonth[mKey].items.length,
  }));
  const restoreMonthKey = globalLayout && restoreGlobalIndex !== null
    ? globalLayout.getMonthForGlobalIndex(restoreGlobalIndex)?.key ?? null
    : restoreGlobalIndex !== null
      ? getMonthKeyForLayout(images[restoreGlobalIndex]?.created_date)
      : null;

  return (
    <div
      ref={galleryRootRef}
      className={`gallery-grid-root min-w-0${isDragSelecting ? ' is-drag-selecting' : ''}${images.length === 0 && !isGlobalMode ? ' is-empty' : ''}`}
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
        activeMonthKey={globalActiveMonthKey}
        isLoading={isLoading}
      />

      <div
        ref={filterChromeRef}
        data-viewer-sticky-toolbar="true"
        className="gallery-context-shell sticky top-0 z-20"
      >
      {/* Keep the result count visible without repeating every active filter. */}
      {hasActiveFilters && (
        <div className="filter-summary filter-summary__layout filter-summary--compact mx-4 mt-2">
          <span className="filter-summary__meta-copy" role="status" aria-live="polite">
            {t('gallery.found', { count: formatNumber(totalImages) })}
          </span>
          {onResetAllFilters && (
            <Button
              type="button"
              onClick={onResetAllFilters}
              variant="secondary"
              size="md"
              className="filter-summary__reset"
            >
              <RotateCcw className="filter-summary__reset-icon" aria-hidden="true" />
              {t('gallery.resetAll')}
            </Button>
          )}
        </div>
      )}

      {/* Context controls stay in one row and collapse to icon buttons on mobile. */}
      <div
        className={`gallery-filter-toolbar ${selectedArtistObj ? 'has-artist' : 'is-empty'} flex items-center gap-2 px-4 select-none sm:gap-3`}
      >
        {onOpenFilters && (
          <span className="gallery-filter-toolbar__filter-trigger-wrap">
            <IconButton
              type="button"
              onClick={onOpenFilters}
              variant={hasActiveFilters ? 'primary' : 'secondary'}
              size="md"
              className="gallery-filter-toolbar__filter-trigger"
              aria-label={activeFilterCount > 0
                ? t('gallery.activeFilterCount', { count: formatNumber(activeFilterCount) })
                : t('gallery.openFilters')}
              aria-expanded={isFilterSidebarOpen}
              aria-controls="gallery-filter-sidebar"
              title={t('gallery.openFilters')}
            >
              <Filter className="h-5 w-5" aria-hidden="true" />
            </IconButton>
            {activeFilterCount > 0 && (
              <Badge
                variant="surface"
                size="xs"
                className="gallery-filter-toolbar__filter-badge"
                aria-hidden="true"
              >
                {activeFilterCount}
              </Badge>
            )}
          </span>
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
          sortOptions={localizedSortOptions}
          onSortModeChange={onSortModeChange}
          itemsPerPage={isGlobalMode ? undefined : itemsPerPage}
          itemsPerPageOptions={isGlobalMode ? undefined : localizedItemsPerPageOptions}
          onItemsPerPageChange={isGlobalMode ? undefined : onItemsPerPageChange}
          onPageChange={onPageChange}
          boundaryRef={filterChromeRef}
        />
          <div className="gallery-filter-toolbar__actions">
            <div className="gallery-filter-toolbar__sort ml-auto flex min-h-9 shrink-0 items-center gap-2">
            <span className="gallery-filter-toolbar__label text-xs font-medium">{t('gallery.sortLabel')}</span>
            <CustomSelect
              value={sortMode}
              options={localizedSortOptions}
              onChange={onSortModeChange}
              ariaLabel={t('gallery.sortAria')}
              className="gallery-filter-toolbar__sort-select"
              leadingContent={<ArrowUpDown className="gallery-filter-toolbar__sort-icon h-5 w-5" />}
              buttonClassName="gallery-filter-toolbar__sort-control"
              menuPlacement="end"
              boundaryRef={filterChromeRef}
            />
          </div>
          {!isGlobalMode && <div className="gallery-filter-toolbar__page-size">
            <span className="gallery-filter-toolbar__label gallery-filter-toolbar__page-size-label text-xs font-medium">{t('gallery.pageSizeLabel')}</span>
            <CustomSelect
              value={itemsPerPage}
              options={localizedItemsPerPageOptions}
              onChange={nextItemsPerPage => {
                onItemsPerPageChange(nextItemsPerPage);
                onPageChange(1);
              }}
              ariaLabel={t('gallery.pageSizeAria')}
              className="gallery-filter-toolbar__page-size-select"
              leadingContent={<List className="gallery-filter-toolbar__page-size-icon h-5 w-5" />}
              buttonClassName="gallery-filter-toolbar__page-size-control"
              menuPlacement="end"
              boundaryRef={filterChromeRef}
            />
          </div>}
        </div>
      </div>
      </div>

      {/* Main Grid View - Grouped by Month Sections */}
      <div className="gallery-month-content p-4 space-y-6" data-gallery-scroll-container="true">
        {isLoading && images.length === 0 && !isGlobalMode ? (
          <div className="gallery-empty-state gallery-empty-state--loading" role="status" aria-live="polite" aria-busy="true">
            <div className="gallery-empty-state__icon" aria-hidden="true">
              <RotateCcw className="h-7 w-7 gallery-empty-state__spinner" />
            </div>
            <div className="gallery-empty-state__copy">
              <p className="gallery-empty-state__title">{t('gallery.loadingWorks')}</p>
              <p className="gallery-empty-state__description">{t('gallery.loadingDescription')}</p>
            </div>
          </div>
        ) : images.length === 0 && !isGlobalMode ? (
          <div className="gallery-empty-state" role="status" aria-live="polite">
            <div className="gallery-empty-state__icon" aria-hidden="true">
              <Search className="h-7 w-7" />
            </div>
            <div className="gallery-empty-state__copy">
              <p className="gallery-empty-state__title">{t('gallery.noResultsTitle')}</p>
              {searchQuery ? (
                <p className="gallery-empty-state__description">
                  {t('gallery.noResultsForQuery', { query: searchQuery })}
                </p>
              ) : (
                <p className="gallery-empty-state__description">{t('gallery.adjustFilters')}</p>
              )}
            </div>
            {hasActiveFilters && onResetAllFilters && (
              <Button
                type="button"
                onClick={onResetAllFilters}
                variant="plain"
                size="sm"
                className="gallery-empty-state__reset"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {t('gallery.clearFilters')}
              </Button>
            )}
          </div>
        ) : (
          <>
            {isGlobalMode && globalMediaWindow && globalMediaSnapshot && globalLayout ? (
              <GalleryGlobalTrack
                mediaWindow={globalMediaWindow}
                snapshot={globalMediaSnapshot}
                layout={globalLayout}
                thumbnailSize={thumbnailSize}
                groupMangaPosts={groupMangaPosts}
                isEditMode={isEditMode}
                selectedIds={selectedIds}
                onSetSelection={onSetSelection}
                onOpenFullscreen={onOpenFullscreen}
                onPrefetchReader={onPrefetchReader}
                onOpenWorkGroup={onOpenWorkGroup}
                blurEnabled={blurEnabled}
                demoMode={demoMode}
                navigationMode={navigationMode}
                scrollContainerRef={scrollContainerRef}
              />
            ) : monthKeys.map(mKey => (
              <GalleryMonthSection
                key={mKey}
                group={{ key: mKey, ...groupedByMonth[mKey] }}
                groupMangaPosts={groupMangaPosts}
                thumbnailSize={thumbnailSize}
                isEditMode={isEditMode}
                selectedIds={selectedIds}
                onSetSelection={onSetSelection}
                onOpenFullscreen={onOpenFullscreen}
                onPrefetchReader={onPrefetchReader}
                onOpenWorkGroup={onOpenWorkGroup}
                beginPointerGesture={beginPointerGesture}
                handleCardClick={handleCardClick}
                handleCardKeyDown={handleCardKeyDown}
                blurEnabled={blurEnabled}
                demoMode={demoMode}
                scrollContainerRef={scrollContainerRef}
                scrollTick={scrollTick}
                navigationMode={navigationMode}
                destinationMonthKey={destinationMonthKey}
                destinationGlobalIndex={destinationGlobalIndex}
                restoreGlobalIndex={restoreMonthKey === mKey ? restoreGlobalIndex : null}
              />
            ))}

            {/* Pagination Bar */}
            {!isGlobalMode && <div className="gallery-pagination flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 text-xs">
          <div className="gallery-pagination__summary">
            {t('gallery.range', {
              start: formatNumber(startOffset + 1),
              end: formatNumber(endOffset),
              total: formatNumber(totalImages),
            })}
          </div>

          {/* Page Buttons */}
          <div className="gallery-pagination__controls flex items-center gap-1.5">
            <IconButton
              type="button"
              onClick={() => onPageChange(1)}
              variant="secondary"
              aria-label={t('gallery.firstPage')}
              disabled={currentPage === 1}
              className="gallery-pagination__button gallery-pagination__button--icon"
              title={t('gallery.firstPage')}
            >
              <ChevronsLeft className="h-5 w-5" />
            </IconButton>
            <Button
              type="button"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              variant="secondary"
              className="gallery-pagination__button flex items-center gap-1 px-2.5"
            >
              <ChevronLeft className="w-4 h-4" /> {t('gallery.previousPage')}
            </Button>

            {getPageNumbers().map((p, idx) => {
              if (typeof p === 'string') {
                return <span key={idx} className="gallery-pagination__ellipsis px-2">...</span>;
              }
                return (
                <Button
                  key={`${p}-${idx}`}
                  type="button"
                  onClick={() => onPageChange(p)}
                  variant={currentPage === p ? 'primary' : 'secondary'}
                  aria-current={currentPage === p ? 'page' : undefined}
                  className={`gallery-pagination__button ${currentPage === p ? 'is-current gallery-pagination__button--current' : ''}`}
                >
                  {p}
                </Button>
              );
            })}

            <Button
              type="button"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              variant="secondary"
              className="gallery-pagination__button flex items-center gap-1 px-2.5"
            >
              {t('gallery.nextPage')} <span aria-hidden="true">&gt;</span>
            </Button>
            <IconButton
              type="button"
              onClick={() => onPageChange(totalPages)}
              variant="secondary"
              aria-label={t('gallery.lastPage')}
              disabled={currentPage === totalPages}
              className="gallery-pagination__button gallery-pagination__button--icon"
              title={t('gallery.lastPage')}
            >
              <ChevronsRight className="h-5 w-5" />
            </IconButton>
          </div>

          <form className="gallery-pagination__jump" onSubmit={handlePageInputSubmit}>
            <label className="gallery-pagination__jump-label" htmlFor="gallery-page-input">{t('gallery.pageJump')}</label>
            <Input
              controlSize="sm"
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
            <Button type="submit" variant="secondary" className="gallery-pagination__button gallery-pagination__jump-submit">{t('gallery.go')}</Button>
          </form>

            </div>}
          </>
        )}
      </div>
    </div>
  );
};
