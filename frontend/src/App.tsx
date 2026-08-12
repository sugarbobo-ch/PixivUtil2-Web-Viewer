import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Artist, LibraryJob, MonthItem, ImageItem, SortMode, ViewMode, ViewerMode, ThemeMode, WorkGroup, WebConfig, VideoPreferencePatch, DEFAULT_WEB_CONFIG } from './types';
import { ArrowUp } from 'lucide-react';
import { groupImagesIntoWorkGroups } from './utils/grouping';
import { buildThumbnailUrl, normalizeWebConfig } from './utils/webConfig';
import { Header } from './components/Header';
import { WebtoonMobileHeader } from './components/WebtoonMobileHeader';
import { MobileMenuDrawer } from './components/MobileMenuDrawer';
import { Sidebar } from './components/Sidebar';
import { GalleryGrid } from './components/GalleryGrid';
import type { GalleryPageChangeOptions } from './components/GalleryGrid';
import { FullscreenViewer } from './components/FullscreenViewer';
import { WebtoonFeed } from './components/WebtoonFeed';
import { BatchEditToolbar } from './components/BatchEditToolbar';
import { ConfirmModal } from './components/ConfirmModal';
import { SettingsModal } from './components/SettingsModal';
import { FirstUseOnboarding } from './components/FirstUseOnboarding';
import { ArtistSettingsModal } from './components/ArtistSettingsModal';
import { RecycleBinModal } from './components/RecycleBinModal';
import { MangaGroupModal } from './components/MangaGroupModal';
import { IconButton, Toast, ToastVariant } from './components/ui';
import { MonthJumpItem, MonthJumpNavigationOptions, MonthNavigationPhase } from './components/MonthQuickNav';
import {
  getFirstVisibleGridCardIndex,
  getVisibleAreaMetrics,
  MIN_VISIBLE_AREA_RATIO,
  getScrollTopForElement,
  scrollElementToContainerStart,
} from './utils/galleryLayout';
import { imageLoadScheduler, ImagePreloadHandle } from './utils/imageLoadScheduler';
import { parseFilterUrl, syncFilterUrl } from './utils/filterWorkflow';
import { resolveMonthTarget as resolveMonthTargetForItem, sortMonthIndexItems } from './utils/monthNavigation';
import { getMotionAwareScrollBehavior } from './utils/motion';
import { useImagePageLoader } from './hooks/useImagePageLoader';
import { isLibraryJobActive, useLibraryJobStore } from './hooks/useLibraryJobStore';
import { useWebConfigLifecycle } from './hooks/useWebConfigLifecycle';
import { useSelectionWorkflow } from './hooks/useSelectionWorkflow';
import { apiClient } from './api/client';
import { isScrollPerformanceProbeRequested, startScrollPerformanceProbe } from './utils/scrollPerformance';
import { getArtistScopeKey } from './utils/artistIdentity';
import {
  clampSidebarWidth,
  getSidebarMaxWidth,
} from './utils/sidebarLayout';

const getDynamicThumbnailPrefetchCount = (thumbnailSize: number) => {
  if (typeof window === 'undefined') return 1;

  const scrollContainer = document.querySelector<HTMLElement>('[data-gallery-scroll-container="true"]');
  const grid = document.querySelector<HTMLElement>('.gallery-month-virtual-grid');
  const gridStyle = grid ? window.getComputedStyle(grid) : null;
  const columns = Math.max(1, gridStyle?.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length ?? 1);
  const rowGap = Number.parseFloat(gridStyle?.rowGap ?? '') || 12;
  const firstCard = grid?.querySelector<HTMLElement>('[data-selection-card="true"]');
  const cardHeight = firstCard?.getBoundingClientRect().height
    || Math.max(96, Math.min(480, thumbnailSize));
  const viewportHeight = scrollContainer?.clientHeight || window.innerHeight;
  const rows = Math.max(1, Math.ceil(viewportHeight / Math.max(1, cardHeight + rowGap)) + 1);
  return rows * columns;
};

const getLibraryUpdateAnnouncement = (job: LibraryJob) => {
  const changes: string[] = [];
  if (job.added > 0) changes.push(`新增 ${job.added} 張`);
  if (job.updated > 0) changes.push(`更新 ${job.updated} 張`);
  if ((job.removed ?? 0) > 0) changes.push(`清除 ${job.removed} 張遺失檔案`);
  if (job.colors_created > 0) changes.push(`建立 ${job.colors_created} 筆圖片色彩資料`);
  return changes.length > 0
    ? `圖片資料庫更新完成：${changes.join('、')}。`
    : '圖片資料庫更新完成，沒有新增或遺失的圖片。';
};

const getLibraryJobAnnouncement = (job: LibraryJob) => {
  if (job.status === 'completed') {
    return job.job_type === 'organize-thumbnail-cache'
      ? `縮圖整理完成，移出 ${job.cache_moved} 個縮圖。`
      : getLibraryUpdateAnnouncement(job);
  }
  if (job.status === 'cancelled') return '媒體資料庫工作已取消，已完成的資料仍會保留。';
  if (job.status === 'interrupted') return '媒體資料庫工作已中斷，請從設定重新執行。';
  return '媒體資料庫工作失敗，請從設定查看錯誤。';
};

interface ViewAnchorRequest {
  index: number;
  requestId: number;
}

export const App: React.FC = () => {
  const [theme, setTheme] = useState<ThemeMode>(DEFAULT_WEB_CONFIG.webTheme);
  const initialIsMobileViewport = typeof window !== 'undefined' && window.innerWidth <= 640;
  const [isMobileViewport, setIsMobileViewport] = useState(initialIsMobileViewport);
  const isMobileViewportRef = useRef(initialIsMobileViewport);
  const preferredViewerModeRef = useRef<ViewerMode>(DEFAULT_WEB_CONFIG.defaultViewMode);
  const [preferredViewerMode, setPreferredViewerMode] = useState<ViewerMode>(DEFAULT_WEB_CONFIG.defaultViewMode);
  // Entering or reloading the site always starts at the work list. The
  // persisted preferred browsing mode is applied only when opening a work.
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => (
    typeof window === 'undefined' ? true : window.innerWidth > 640
  ));
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WEB_CONFIG.sidebarWidth);
  const [viewportWidth, setViewportWidth] = useState(() => (
    typeof window === 'undefined' ? 1024 : window.innerWidth
  ));
  const sidebarWidthSaveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isArtistSettingsOpen, setIsArtistSettingsOpen] = useState(false);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  const [isArtistUpdateNoticeOpen, setIsArtistUpdateNoticeOpen] = useState(false);

  // Group Mode & Manga Modal States
  const [groupMangaPosts, setGroupMangaPosts] = useState(DEFAULT_WEB_CONFIG.groupMangaPosts);
  const [preloadImageCount, setPreloadImageCount] = useState(DEFAULT_WEB_CONFIG.preloadImageCount);
  const [fullscreenToolbarSimpleMode, setFullscreenToolbarSimpleMode] = useState(DEFAULT_WEB_CONFIG.fullscreenToolbarSimpleMode);
  const [fullscreenShowToolbar, setFullscreenShowToolbar] = useState(DEFAULT_WEB_CONFIG.fullscreenShowToolbar);
  const [fullscreenShowThumbnails, setFullscreenShowThumbnails] = useState(DEFAULT_WEB_CONFIG.fullscreenShowThumbnails);
  const [thumbnailSize, setThumbnailSize] = useState(DEFAULT_WEB_CONFIG.thumbnailSize);
  const [webtoonImageScale, setWebtoonImageScale] = useState(DEFAULT_WEB_CONFIG.webtoonImageScale);
  const [webtoonImageGap, setWebtoonImageGap] = useState(DEFAULT_WEB_CONFIG.webtoonImageGap);
  const [webtoonShowInfo, setWebtoonShowInfo] = useState(DEFAULT_WEB_CONFIG.webtoonShowInfo);
  const [webtoonShowPageNumber, setWebtoonShowPageNumber] = useState(DEFAULT_WEB_CONFIG.webtoonShowPageNumber);
  const [webtoonShowThumbnails, setWebtoonShowThumbnails] = useState(DEFAULT_WEB_CONFIG.webtoonShowThumbnails);
  const [activeWorkGroup, setActiveWorkGroup] = useState<WorkGroup | null>(null);
  const [isMangaModalOpen, setIsMangaModalOpen] = useState(false);
  const [blurEnabled, setBlurEnabled] = useState(DEFAULT_WEB_CONFIG.blurEnabled);
  const [demoMode, setDemoMode] = useState(DEFAULT_WEB_CONFIG.demoMode);
  const [webConfigSnapshot, setWebConfigSnapshot] = useState<WebConfig>(DEFAULT_WEB_CONFIG);
  const [libraryAnnouncement, setLibraryAnnouncement] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<ToastVariant>('info');

  const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    setToastMessage(message);
    setToastVariant(variant);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 640px)');
    const updateViewportMode = () => {
      const isMobile = mediaQuery.matches;
      isMobileViewportRef.current = isMobile;
      setViewportWidth(window.innerWidth);
      setIsMobileViewport(current => current === isMobile ? current : isMobile);
      if (isMobile) {
        setIsMobileMenuOpen(false);
        setIsSidebarOpen(false);
      }
    };

    updateViewportMode();
    mediaQuery.addEventListener?.('change', updateViewportMode);
    return () => mediaQuery.removeEventListener?.('change', updateViewportMode);
  }, []);

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', updateViewportWidth);
    return () => window.removeEventListener('resize', updateViewportWidth);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV || !isScrollPerformanceProbeRequested()) return undefined;
    return startScrollPerformanceProbe();
  }, []);

  // Data States
  const [artists, setArtists] = useState<Artist[]>([]);
  const [isLoadingArtists, setIsLoadingArtists] = useState(false);
  const [months, setMonths] = useState<MonthItem[]>([]);

  // Filter States
  const [selectedMonths, setSelectedMonths] = useState<string[]>(() => parseFilterUrl().selectedMonths);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(() => parseFilterUrl().selectedArtist);
  const [searchQuery, setSearchQuery] = useState(() => parseFilterUrl().searchQuery);

  // Pagination & Sort States
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_WEB_CONFIG.itemsPerPage);
  const [sortMode, setSortMode] = useState<SortMode>('newest_month');
  const {
    images,
    totalImages,
    availableMonthIndexItems,
    isLoadingImages,
    loadedPage,
    buildImageRequestParams,
    loadImagePage,
    fetchImages,
    clearCache: clearImagePageCache,
    hasCachedPage,
    cancelSpeculativePageRequests: cancelImagePageRequests,
    supersedeNavigationPageRequests,
  } = useImagePageLoader({
    selectedMonths,
    selectedArtist,
    searchQuery,
    sortMode,
    itemsPerPage,
    currentPage,
  });

  const applyArtistList = useCallback((data: unknown) => {
    const nextArtists = Array.isArray(data) ? data as Artist[] : [];
    setArtists(nextArtists);
    setSelectedArtist(current => {
      if (current === null || nextArtists.length === 0) return current;
      if (nextArtists.some(artist => getArtistScopeKey(artist) === current)) return current;

      const legacyScopeMatch = nextArtists.find(artist => artist.index_scope_key === current);
      if (legacyScopeMatch) return getArtistScopeKey(legacyScopeMatch);

      if (/^\d+$/.test(current)) {
        const memberMatches = nextArtists.filter(artist => String(artist.member_id) === current);
        if (memberMatches.length === 1) return getArtistScopeKey(memberMatches[0]);
      }
      return null;
    });
  }, []);

  const refreshDirectoryMetadata = useCallback(async () => {
    setIsLoadingArtists(true);
    try {
      const [artistsData, monthsData] = await Promise.all([
        apiClient.directory.artists(),
        apiClient.directory.months(),
      ]);
      applyArtistList(artistsData);
      setMonths(monthsData);
    } finally {
      setIsLoadingArtists(false);
    }
  }, [applyArtistList]);

  // Selection & Modal States
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isGridAtBottom, setIsGridAtBottom] = useState(false);
  const [gridScrollTopBottom, setGridScrollTopBottom] = useState<number | null>(null);
  const [gridScrollTopInlineEnd, setGridScrollTopInlineEnd] = useState<number | null>(null);
  const [isWebtoonHeaderHidden, setIsWebtoonHeaderHidden] = useState(false);
  const [isWebtoonToolbarOpen, setIsWebtoonToolbarOpen] = useState(false);
  const [gridRestoreAnchor, setGridRestoreAnchor] = useState<ViewAnchorRequest | null>(null);
  const [webtoonStartAnchor, setWebtoonStartAnchor] = useState<ViewAnchorRequest | null>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const gridRestoreRequestIdRef = useRef(0);
  const webtoonStartRequestIdRef = useRef(0);
  const previousMainScrollTopRef = useRef(0);
  const webtoonUserScrollIntentRef = useRef(false);
  const thumbnailPreloadRequestsRef = useRef(new Map<string, ImagePreloadHandle>());
  const blurSaveRequestRef = useRef(0);
  const groupSaveRequestRef = useRef(0);
  const fullscreenToolbarModeSaveRequestRef = useRef(0);
  const fullscreenShowToolbarSaveRequestRef = useRef(0);
  const fullscreenShowThumbnailsSaveRequestRef = useRef(0);
  const fullscreenCheckerboardSaveRequestRef = useRef(0);
  const fullscreenZoomModeSaveRequestRef = useRef(0);
  const [pendingMonthKey, setPendingMonthKey] = useState<string | null>(null);
  const pendingMonthScrollBehaviorRef = useRef<ScrollBehavior>('smooth');
  const [navigationMode, setNavigationMode] = useState<'idle' | 'click-scrolling' | 'scrubbing-preview' | 'scrubbing-settle' | 'scrubbing-commit'>('idle');
  const [destinationMonthKey, setDestinationMonthKey] = useState<string | null>(null);
  const [destinationGlobalIndex, setDestinationGlobalIndex] = useState<number | null>(null);
  const scrubSettleRef = useRef<{
    timer: number | null;
    cacheKey: string | null;
    active: boolean;
    targetKey: string | null;
    targetPage: number | null;
  }>({ timer: null, cacheKey: null, active: false, targetKey: null, targetPage: null });
  const paginationScrollResetRef = useRef<number | null>(null);
  const libraryAnnouncementTimerRef = useRef<number | null>(null);

  const selectionWorkflow = useSelectionWorkflow({
    images,
    fullscreenImageId: fullscreenIndex === null ? null : images[fullscreenIndex]?.image_id ?? null,
    onFullscreenSelectionDeleted: () => setFullscreenIndex(null),
    refreshImages: fetchImages,
  });
  const {
    selectedIds,
    showConfirmModal,
    setShowConfirmModal,
    deleteTargets,
    isDownloadingSelection,
    downloadSelectionError,
    toggleSelectImage,
    setSelectedImages,
    replaceSelectedImages,
    handleDownloadSelected,
    handleSelectAll,
    handleDeselectAll,
    clearSelectionError,
    promptDeleteSelected,
    promptDeleteSingle,
    confirmExecuteDelete,
  } = selectionWorkflow;

  const handleLibraryJobFinished = useCallback((job: LibraryJob) => {
    if (libraryAnnouncementTimerRef.current !== null) {
      window.clearTimeout(libraryAnnouncementTimerRef.current);
    }
    const announcement = getLibraryJobAnnouncement(job);
    setLibraryAnnouncement(announcement);
    const variant: ToastVariant = job.status === 'completed'
      ? 'success'
      : job.status === 'cancelled'
      ? 'warning'
      : 'error';
    showToast(announcement, variant);
    libraryAnnouncementTimerRef.current = window.setTimeout(() => setLibraryAnnouncement(''), 8000);
  }, [showToast]);

  const handleLibraryPollingError = useCallback((error: unknown) => {
    console.error('Failed to poll library job:', error);
  }, []);

  const {
    libraryJob,
    startLibraryJob,
  } = useLibraryJobStore({
    onJobFinished: handleLibraryJobFinished,
    onPollingError: handleLibraryPollingError,
  });

  const applyWebConfig = useCallback((data: Partial<WebConfig>) => {
    const config = normalizeWebConfig(data);
    setWebConfigSnapshot(config);
    preferredViewerModeRef.current = config.defaultViewMode;
    setPreferredViewerMode(config.defaultViewMode);
    setTheme(config.webTheme);
    setThumbnailSize(config.thumbnailSize);
    setItemsPerPage(config.itemsPerPage);
    setSidebarWidth(config.sidebarWidth);
    setGroupMangaPosts(config.groupMangaPosts);
    setBlurEnabled(config.blurEnabled);
    setDemoMode(config.demoMode);
    setPreloadImageCount(config.preloadImageCount);
    setFullscreenToolbarSimpleMode(config.fullscreenToolbarSimpleMode);
    setFullscreenShowToolbar(config.fullscreenShowToolbar);
    setFullscreenShowThumbnails(config.fullscreenShowThumbnails);
    setWebtoonImageScale(config.webtoonImageScale);
    setWebtoonImageGap(config.webtoonImageGap);
    setWebtoonShowInfo(config.webtoonShowInfo);
    setWebtoonShowPageNumber(config.webtoonShowPageNumber);
    setWebtoonShowThumbnails(config.webtoonShowThumbnails);
    setCurrentPage(1);
  }, []);

  const handleWebConfigError = useCallback((error: unknown) => {
    console.error('Failed to fetch web-config:', error);
  }, []);

  const {
    isReady: isWebConfigReady,
    loadWebConfig,
    persistWebConfigPatch,
  } = useWebConfigLifecycle({
    onConfigLoaded: applyWebConfig,
    onError: handleWebConfigError,
  });

  const maxSidebarWidth = getSidebarMaxWidth(viewportWidth);
  const effectiveSidebarWidth = clampSidebarWidth(sidebarWidth, maxSidebarWidth);

  const handleSidebarWidthChange = useCallback((nextWidth: number) => {
    setSidebarWidth(clampSidebarWidth(nextWidth, maxSidebarWidth));
  }, [maxSidebarWidth]);

  const handleSidebarWidthCommit = useCallback((nextWidth: number) => {
    const normalizedWidth = clampSidebarWidth(nextWidth, maxSidebarWidth);
    setSidebarWidth(normalizedWidth);
    sidebarWidthSaveQueueRef.current = sidebarWidthSaveQueueRef.current
      .catch(() => undefined)
      .then(() => persistWebConfigPatch({ sidebarWidth: normalizedWidth }))
      .catch(error => {
        console.error('Failed to save sidebarWidth setting:', error);
      });
  }, [maxSidebarWidth, persistWebConfigPatch]);

  const handleEditModeChange = useCallback((edit: boolean) => {
    const nextEditMode = edit && viewMode !== 'webtoon';
    setIsEditMode(nextEditMode);
    clearSelectionError();
    if (!nextEditMode) handleDeselectAll();
  }, [clearSelectionError, handleDeselectAll, viewMode]);

  const handleToggleEditMode = useCallback(() => {
    setIsEditMode(current => {
      const next = viewMode !== 'webtoon' && !current;
      clearSelectionError();
      if (!next) handleDeselectAll();
      return next;
    });
  }, [clearSelectionError, handleDeselectAll, viewMode]);

  const handleNavigateFullscreen = useCallback((index: number) => {
    setFullscreenIndex(index);
  }, []);

  const updateGridScrollTopPosition = useCallback((scrollTarget: HTMLElement | null) => {
    const isGalleryScrollTarget = viewMode === 'grid'
      && scrollTarget?.matches('[data-gallery-scroll-container="true"]');

    if (!isGalleryScrollTarget || !scrollTarget) {
      setIsGridAtBottom(false);
      setGridScrollTopBottom(null);
      setGridScrollTopInlineEnd(null);
      return;
    }

    const distanceFromBottom = scrollTarget.scrollHeight
      - scrollTarget.clientHeight
      - scrollTarget.scrollTop;
    const atBottom = distanceFromBottom <= 1;

    setIsGridAtBottom(atBottom);

    if (!atBottom) {
      setGridScrollTopBottom(null);
      setGridScrollTopInlineEnd(null);
      return;
    }

    const gridSections = scrollTarget.querySelectorAll<HTMLElement>('.gallery-month-section');
    const lastGridSection = gridSections.item(gridSections.length - 1);
    const gridRect = lastGridSection?.getBoundingClientRect()
      ?? scrollTarget.getBoundingClientRect();
    const bottomOffset = Math.max(
      20,
      Math.ceil(window.innerHeight - gridRect.bottom + 12),
    );
    const isRtl = getComputedStyle(scrollTarget).direction === 'rtl';
    const inlineEndOffset = Math.max(
      20,
      Math.ceil((isRtl ? gridRect.left : window.innerWidth - gridRect.right) + 12),
    );

    setGridScrollTopBottom(bottomOffset);
    setGridScrollTopInlineEnd(inlineEndOffset);
  }, [viewMode]);

  const handleMainScroll = (event: React.UIEvent<HTMLElement>) => {
    const scrollTarget = event.target as HTMLElement;
    const nextScrollTop = scrollTarget.scrollTop;
    setShowScrollTop(nextScrollTop > 240);
    updateGridScrollTopPosition(scrollTarget);

    const isMobileWebtoon = viewMode === 'webtoon' && isMobileViewportRef.current;
    const activeElement = document.activeElement;
    const headerHasFocus = activeElement instanceof Element
      && activeElement.closest('.webtoon-mobile-header') !== null;
    if (!isMobileWebtoon || isWebtoonToolbarOpen || headerHasFocus) {
      setIsWebtoonHeaderHidden(false);
    } else {
      const delta = nextScrollTop - previousMainScrollTopRef.current;
      if (!webtoonUserScrollIntentRef.current || nextScrollTop <= 8 || delta < -8) {
        setIsWebtoonHeaderHidden(false);
      } else if (delta > 8) {
        setIsWebtoonHeaderHidden(true);
      }
    }
    previousMainScrollTopRef.current = nextScrollTop;
  };

  useEffect(() => {
    setIsWebtoonToolbarOpen(false);
    setIsWebtoonHeaderHidden(false);
    setShowScrollTop(false);
    setIsGridAtBottom(false);
    setGridScrollTopBottom(null);
    setGridScrollTopInlineEnd(null);
    previousMainScrollTopRef.current = 0;
    webtoonUserScrollIntentRef.current = false;
  }, [isMobileViewport, viewMode]);

  useEffect(() => {
    if (!isWebtoonToolbarOpen || !isMobileViewport || viewMode !== 'webtoon') return undefined;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest('.webtoon-mobile-header')
        || target.closest('#webtoon-mobile-quick-settings')
      ) return;
      setIsWebtoonToolbarOpen(false);
    };

    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, [isMobileViewport, isWebtoonToolbarOpen, viewMode]);

  const getGalleryScrollContainer = useCallback(() => (
    mainScrollRef.current?.querySelector<HTMLElement>('[data-gallery-scroll-container="true"]')
      ?? mainScrollRef.current
  ), []);

  React.useLayoutEffect(() => {
    if (viewMode !== 'grid') return undefined;

    const updateOnViewportResize = () => {
      updateGridScrollTopPosition(getGalleryScrollContainer());
    };

    updateOnViewportResize();
    const scrollTarget = getGalleryScrollContainer();
    const resizeObserver = typeof ResizeObserver === 'undefined' || !scrollTarget
      ? null
      : new ResizeObserver(updateOnViewportResize);
    if (resizeObserver && scrollTarget) {
      resizeObserver.observe(scrollTarget);
      scrollTarget.querySelectorAll<HTMLElement>('.gallery-month-section, .gallery-pagination').forEach(element => {
        resizeObserver.observe(element);
      });
    }
    window.addEventListener('resize', updateOnViewportResize);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateOnViewportResize);
    };
  }, [getGalleryScrollContainer, images.length, updateGridScrollTopPosition, viewMode]);

  const getFirstVisibleWebtoonIndex = useCallback(() => {
    const main = mainScrollRef.current;
    if (!main) return null;

    const mainRect = main.getBoundingClientRect();
    const viewport = {
      top: mainRect.top,
      right: mainRect.right,
      bottom: mainRect.bottom,
      left: mainRect.left,
    };
    const visibleItems = Array.from(
      main.querySelectorAll<HTMLElement>('[data-webtoon-index]'),
    )
      .map(item => {
        const image = item.querySelector<HTMLElement>('.webtoon-feed__media-frame') ?? item;
        const rect = image.getBoundingClientRect();
        return {
          item,
          rect,
          ...getVisibleAreaMetrics(rect, viewport),
        };
      })
      .filter(({ visibleArea, area }) => visibleArea > 0 && area > 0)
      .sort((left, right) => left.rect.top - right.rect.top || left.rect.left - right.rect.left);
    // Read from the upper-left edge. Prefer a mounted image with at least half
    // of its area visible; if none qualifies, use the topmost visible image.
    // Never fall back to an offscreen overscan item because it is not part of
    // the user's current reading position.
    const mostlyVisibleItems = visibleItems.filter(
      ({ visibleRatio }) => visibleRatio >= MIN_VISIBLE_AREA_RATIO,
    );
    const selectedItem = (mostlyVisibleItems.length > 0 ? mostlyVisibleItems : visibleItems)[0];
    const index = Number(selectedItem?.item.dataset.webtoonIndex);
    return Number.isInteger(index) && index >= 0 ? index : null;
  }, []);

  const getCurrentViewAnchorIndex = useCallback(() => {
    if (fullscreenIndex !== null) return fullscreenIndex;
    if (viewMode === 'grid') {
      return getFirstVisibleGridCardIndex(getGalleryScrollContainer() ?? document.body);
    }
    if (viewMode === 'webtoon') return getFirstVisibleWebtoonIndex();
    return null;
  }, [fullscreenIndex, getFirstVisibleWebtoonIndex, getGalleryScrollContainer, viewMode]);

  const normalizeViewAnchorIndex = useCallback((index: number | null) => {
    if (images.length === 0 || index === null || !Number.isFinite(index)) return null;
    return Math.max(0, Math.min(images.length - 1, Math.floor(index)));
  }, [images.length]);

  const requestGridRestore = useCallback((index: number | null) => {
    const safeIndex = normalizeViewAnchorIndex(index);
    if (safeIndex === null) return;
    const requestId = ++gridRestoreRequestIdRef.current;
    setGridRestoreAnchor({ index: safeIndex, requestId });
  }, [normalizeViewAnchorIndex]);

  const requestWebtoonStart = useCallback((index: number | null) => {
    const safeIndex = normalizeViewAnchorIndex(index);
    if (safeIndex === null) return;
    const requestId = ++webtoonStartRequestIdRef.current;
    setWebtoonStartAnchor({ index: safeIndex, requestId });
  }, [normalizeViewAnchorIndex]);

  const cancelMonthNavigation = useCallback(() => {
    const scrub = scrubSettleRef.current;
    if (scrub.timer !== null) window.clearTimeout(scrub.timer);
    scrub.timer = null;
    scrub.cacheKey = null;
    scrub.active = false;
    scrub.targetKey = null;
    scrub.targetPage = null;
    setPendingMonthKey(null);
    setDestinationMonthKey(null);
    setDestinationGlobalIndex(null);
    setNavigationMode('idle');
  }, []);

  const handleCloseFullscreen = useCallback(() => {
    requestGridRestore(fullscreenIndex);
    setFullscreenIndex(null);
    setViewMode('grid');
    cancelMonthNavigation();
  }, [cancelMonthNavigation, fullscreenIndex, requestGridRestore]);

  const handleScrollToTop = () => {
    const scrollContainer = getGalleryScrollContainer();
    setIsWebtoonHeaderHidden(false);
    scrollContainer?.scrollTo({
      top: 0,
      behavior: getMotionAwareScrollBehavior(),
    });
  };

  // Sync Theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.style.colorScheme = 'light';
    }
  }, [theme]);

  // Fetch Artists & Months
  useEffect(() => {
    void refreshDirectoryMetadata().catch(err => console.error('Failed to fetch directory metadata:', err));
  }, [refreshDirectoryMetadata]);

  // Keep filter state shareable and restore it when the browser navigates to a
  // URL that already contains filter parameters.
  useEffect(() => {
    syncFilterUrl({ selectedMonths, selectedArtist, searchQuery });
  }, [selectedMonths, selectedArtist, searchQuery]);

  useEffect(() => {
    const handlePopState = () => {
      const nextState = parseFilterUrl();
      setSelectedMonths(previous => (
        previous.length === nextState.selectedMonths.length
        && previous.every((month, index) => month === nextState.selectedMonths[index])
          ? previous
          : nextState.selectedMonths
      ));
      setSelectedArtist(previous => previous === nextState.selectedArtist ? previous : nextState.selectedArtist);
      setSearchQuery(previous => previous === nextState.searchQuery ? previous : nextState.searchQuery);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Reset the page, gallery scroll position, and any pending month jump when
  // the result set changes. A new artist must start from that artist's first
  // available month instead of inheriting the previous artist's viewport.
  useEffect(() => {
    setCurrentPage(1);
    setPendingMonthKey(null);
    pendingMonthScrollBehaviorRef.current = 'smooth';
    const scrollContainer = getGalleryScrollContainer();
    scrollContainer?.scrollTo({ top: 0, behavior: 'auto' });
  }, [getGalleryScrollContainer, selectedMonths, selectedArtist, searchQuery, sortMode]);

  useEffect(() => {
    if (!isWebConfigReady) return;
    fetchImages();
  }, [fetchImages, isWebConfigReady]);

  const monthIndexItems = useMemo<MonthJumpItem[]>(() => {
    return sortMonthIndexItems(availableMonthIndexItems, sortMode);
  }, [availableMonthIndexItems, sortMode]);

  useEffect(() => {
    const handleLibraryDataChanged = () => {
      clearImagePageCache();
      void refreshDirectoryMetadata().catch(err => console.error('Failed to refresh directory metadata:', err));
      fetchImages();
    };

    window.addEventListener('web-viewer-library-data-changed', handleLibraryDataChanged);
    return () => window.removeEventListener('web-viewer-library-data-changed', handleLibraryDataChanged);
  }, [clearImagePageCache, fetchImages, refreshDirectoryMetadata]);

  useEffect(() => {
    const galleryInactive = fullscreenIndex !== null || viewMode !== 'grid';
    if (galleryInactive) {
      imageLoadScheduler.pauseOwner('grid');
      imageLoadScheduler.pauseOwner('month-navigation');
    } else {
      imageLoadScheduler.resumeOwner('grid');
      imageLoadScheduler.resumeOwner('month-navigation');
    }
    return () => {
      imageLoadScheduler.resumeOwner('grid');
      imageLoadScheduler.resumeOwner('month-navigation');
    };
  }, [fullscreenIndex, viewMode]);

  useEffect(() => {
    if (!demoMode) return undefined;

    for (const [url, preload] of thumbnailPreloadRequestsRef.current) {
      preload.cancel();
      thumbnailPreloadRequestsRef.current.delete(url);
    }

    return undefined;
  }, [demoMode]);

  const resolveMonthTarget = useCallback((item: MonthJumpItem) => (
    resolveMonthTargetForItem(item, monthIndexItems, itemsPerPage)
  ), [itemsPerPage, monthIndexItems]);

  const cancelSpeculativePageRequests = useCallback((preserveCacheKey?: string) => {
    if (scrubSettleRef.current.timer !== null) {
      window.clearTimeout(scrubSettleRef.current.timer);
      scrubSettleRef.current.timer = null;
    }
    scrubSettleRef.current.cacheKey = null;
    for (const [url, preload] of thumbnailPreloadRequestsRef.current) {
      preload.cancel();
      thumbnailPreloadRequestsRef.current.delete(url);
    }
    cancelImagePageRequests(preserveCacheKey);
  }, [cancelImagePageRequests]);

  const preloadThumbnail = useCallback((item: ImageItem, priority: 0 | 1 | 2 | 3 = 3) => {
    if (demoMode || item.media_status) return;

    const url = buildThumbnailUrl(item, thumbnailSize);
    if (thumbnailPreloadRequestsRef.current.has(url)) return;

    const request = imageLoadScheduler.preload({
      url,
      priority,
      kind: 'thumbnail',
      owner: 'month-navigation',
    });

    thumbnailPreloadRequestsRef.current.set(url, request);
    void request.promise.finally(() => {
      if (thumbnailPreloadRequestsRef.current.get(url) === request) {
        thumbnailPreloadRequestsRef.current.delete(url);
      }
    });
  }, [demoMode, thumbnailSize]);

  const prefetchCurrentPageWindow = useCallback((target: ReturnType<typeof resolveMonthTarget>) => {
    if (target.page !== currentPage || images.length === 0) return;

    // Warm the target month before the gallery follows the pointer. Include a
    // small look-behind because the interpolated scrub position can still be
    // between the previous and target month when the request starts.
    const count = getDynamicThumbnailPrefetchCount(thumbnailSize);
    const lookBehind = Math.max(1, count);
    const start = Math.max(0, target.localIndex - lookBehind);
    const end = Math.min(images.length, target.localIndex + count);
    const windowImages = images.slice(start, end).filter(image => !image.media_status);
    const keepUrls = new Set(windowImages.map(image => buildThumbnailUrl(image, thumbnailSize)));

    // A long scrub can cross many months in one page. Drop speculative
    // requests that no longer belong to the current target window so the
    // pending queue follows the pointer instead of growing with its path.
    for (const [url, preload] of thumbnailPreloadRequestsRef.current) {
      if (keepUrls.has(url)) continue;
      preload.cancel();
      thumbnailPreloadRequestsRef.current.delete(url);
    }

    windowImages.forEach(image => preloadThumbnail(image, 1));
  }, [buildThumbnailUrl, currentPage, images, preloadThumbnail, resolveMonthTarget, thumbnailSize]);

  const applyScrubPreviewPage = useCallback((item: MonthJumpItem, target: ReturnType<typeof resolveMonthTarget>) => {
    const scrub = scrubSettleRef.current;
    if (!scrub.active || scrub.targetKey !== item.key || scrub.targetPage !== target.page) return;

    pendingMonthScrollBehaviorRef.current = 'auto';
    setPendingMonthKey(item.key);
    setDestinationMonthKey(item.key);
    setDestinationGlobalIndex(target.localIndex);
    setNavigationMode('scrubbing-preview');
    setCurrentPage(target.page);
  }, [resolveMonthTarget]);

  const prefetchMonthPage = useCallback((item: MonthJumpItem) => {
    if (scrubSettleRef.current.timer !== null) {
      window.clearTimeout(scrubSettleRef.current.timer);
    }

    const target = resolveMonthTarget(item);
    if (scrubSettleRef.current.active) {
      scrubSettleRef.current.targetKey = item.key;
      scrubSettleRef.current.targetPage = target.page;
    }
    if (target.page === currentPage) {
      prefetchCurrentPageWindow(target);
      return;
    }
    scrubSettleRef.current.timer = window.setTimeout(() => {
      scrubSettleRef.current.timer = null;
      if (navigationMode === 'scrubbing-preview') setNavigationMode('scrubbing-settle');
      cancelSpeculativePageRequests();

      const params = buildImageRequestParams(target.page);
      const cacheKey = params.toString();
      scrubSettleRef.current.cacheKey = cacheKey;
      if (hasCachedPage(params)) {
        applyScrubPreviewPage(item, target);
        return;
      }

      void loadImagePage(params, navigationMode === 'scrubbing-preview' ? 'scrub-settle' : 'hover-prefetch')
        .then(page => {
          if (scrubSettleRef.current.cacheKey !== cacheKey) return;
          const count = getDynamicThumbnailPrefetchCount(thumbnailSize);
          page.images.slice(target.localIndex, target.localIndex + count).forEach(image => preloadThumbnail(image, 1));
          applyScrubPreviewPage(item, target);
        })
        .catch(error => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
        });
    }, 100);
  }, [applyScrubPreviewPage, buildImageRequestParams, cancelSpeculativePageRequests, currentPage, hasCachedPage, loadImagePage, navigationMode, preloadThumbnail, prefetchCurrentPageWindow, resolveMonthTarget, thumbnailSize]);

  const handleJumpToMonth = useCallback((item: MonthJumpItem, options: MonthJumpNavigationOptions = {}) => {
    scrubSettleRef.current.active = false;
    scrubSettleRef.current.targetKey = null;
    scrubSettleRef.current.targetPage = null;
    const target = resolveMonthTarget(item);
    const preserveCacheKey = buildImageRequestParams(target.page).toString();
    supersedeNavigationPageRequests(preserveCacheKey);
    cancelSpeculativePageRequests(preserveCacheKey);
    pendingMonthScrollBehaviorRef.current = options.behavior ?? 'smooth';
    setPendingMonthKey(item.key);
    setDestinationMonthKey(item.key);
    setDestinationGlobalIndex(target.localIndex);
    setNavigationMode(options.scrubbing ? 'scrubbing-commit' : 'click-scrolling');

    // The month ruler is navigation, not another filter. The API calculates
    // each month's first offset after applying the current artist/search/month
    // filters and sort mode, so changing page keeps those filters intact.
    setCurrentPage(target.page);
  }, [buildImageRequestParams, cancelSpeculativePageRequests, resolveMonthTarget, supersedeNavigationPageRequests]);

  const handleMonthNavigationChange = useCallback((phase: MonthNavigationPhase, item?: MonthJumpItem) => {
    if (phase === 'click-start') {
      scrubSettleRef.current.active = false;
      scrubSettleRef.current.targetKey = null;
      scrubSettleRef.current.targetPage = null;
      const target = item ? resolveMonthTarget(item) : null;
      setNavigationMode('click-scrolling');
      setDestinationMonthKey(item?.key ?? null);
      setDestinationGlobalIndex(target?.localIndex ?? null);
      return;
    }

    if (phase === 'scrub-start') {
      cancelSpeculativePageRequests();
      scrubSettleRef.current.active = true;
      scrubSettleRef.current.targetKey = item?.key ?? null;
      scrubSettleRef.current.targetPage = item ? resolveMonthTarget(item).page : null;
      setNavigationMode('scrubbing-preview');
      setDestinationMonthKey(item?.key ?? null);
      setDestinationGlobalIndex(item ? resolveMonthTarget(item).localIndex : null);
      return;
    }

    if (phase === 'preview' || phase === 'settle') {
      setNavigationMode(phase === 'settle' ? 'scrubbing-settle' : 'scrubbing-preview');
      if (item) {
        const target = resolveMonthTarget(item);
        scrubSettleRef.current.targetKey = item.key;
        scrubSettleRef.current.targetPage = target.page;
        setDestinationMonthKey(item.key);
        setDestinationGlobalIndex(target.localIndex);
      }
      return;
    }

    if (phase === 'commit') {
      scrubSettleRef.current.active = false;
      scrubSettleRef.current.targetKey = null;
      scrubSettleRef.current.targetPage = null;
      setNavigationMode('scrubbing-commit');
      if (item) {
        const target = resolveMonthTarget(item);
        const preserveCacheKey = buildImageRequestParams(target.page).toString();
        supersedeNavigationPageRequests(preserveCacheKey);
        cancelSpeculativePageRequests(preserveCacheKey);
        pendingMonthScrollBehaviorRef.current = 'auto';
        setDestinationMonthKey(item.key);
        setDestinationGlobalIndex(target.localIndex);
        setPendingMonthKey(item.key);
        setCurrentPage(target.page);
      }
      else cancelSpeculativePageRequests();
      return;
    }

    if (phase === 'cancel' || phase === 'end') {
      cancelSpeculativePageRequests();
      scrubSettleRef.current.active = false;
      scrubSettleRef.current.targetKey = null;
      scrubSettleRef.current.targetPage = null;
      setNavigationMode('idle');
      setDestinationMonthKey(null);
      setDestinationGlobalIndex(null);
    }
  }, [buildImageRequestParams, cancelSpeculativePageRequests, resolveMonthTarget, supersedeNavigationPageRequests]);

  const loadSelectionPage = useCallback((page: number) => {
    const params = buildImageRequestParams(page);
    return loadImagePage(params, 'navigation');
  }, [buildImageRequestParams, loadImagePage]);

  const handlePageChange = useCallback((page: number, options: GalleryPageChangeOptions = {}) => {
    const totalPages = Math.max(1, Math.ceil(totalImages / Math.max(1, itemsPerPage)));
    const safePage = Math.max(1, Math.min(totalPages, Math.floor(page)));
    const preserveCacheKey = buildImageRequestParams(safePage).toString();
    supersedeNavigationPageRequests(preserveCacheKey);
    cancelSpeculativePageRequests(preserveCacheKey);
    cancelMonthNavigation();
    setShowScrollTop(false);
    setIsGridAtBottom(false);
    setGridScrollTopBottom(null);
    setGridScrollTopInlineEnd(null);
    if (options.preserveScroll) {
      paginationScrollResetRef.current = null;
      pendingMonthScrollBehaviorRef.current = 'auto';
    } else {
      paginationScrollResetRef.current = safePage;
      pendingMonthScrollBehaviorRef.current = 'smooth';
      getGalleryScrollContainer()?.scrollTo({ top: 0, behavior: 'auto' });
    }
    setCurrentPage(safePage);
  }, [buildImageRequestParams, cancelMonthNavigation, cancelSpeculativePageRequests, getGalleryScrollContainer, itemsPerPage, supersedeNavigationPageRequests, totalImages]);

  const handleWebtoonPageChange = useCallback((page: number, anchorIndex = 0) => {
    const totalPages = Math.max(1, Math.ceil(totalImages / Math.max(1, itemsPerPage)));
    const safePage = Math.max(1, Math.min(totalPages, Math.floor(page)));
    requestWebtoonStart(anchorIndex);
    handlePageChange(safePage);
  }, [handlePageChange, itemsPerPage, requestWebtoonStart, totalImages]);

  React.useLayoutEffect(() => {
    if (paginationScrollResetRef.current !== currentPage || pendingMonthKey) return undefined;

    const container = getGalleryScrollContainer();
    if (!container) return undefined;

    let frameId: number | null = null;
    let secondFrameId: number | null = null;
    let settleTimer: number | null = null;
    const reset = () => container.scrollTo({ top: 0, behavior: 'auto' });

    frameId = window.requestAnimationFrame(() => {
      reset();
      secondFrameId = window.requestAnimationFrame(() => {
        reset();
        settleTimer = window.setTimeout(() => {
          reset();
          if (paginationScrollResetRef.current === currentPage) paginationScrollResetRef.current = null;
        }, 80);
      });
    });

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      if (secondFrameId !== null) window.cancelAnimationFrame(secondFrameId);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
    };
  }, [currentPage, getGalleryScrollContainer, images, pendingMonthKey]);

  useEffect(() => {
    if (navigationMode === 'idle' || pendingMonthKey) return undefined;
    const container = mainScrollRef.current?.querySelector<HTMLElement>('[data-gallery-scroll-container="true"]')
      ?? mainScrollRef.current;
    if (!container) return undefined;

    let settleTimer: number | null = null;
    const finish = () => {
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      setNavigationMode('idle');
      setDestinationMonthKey(null);
      setDestinationGlobalIndex(null);
    };
    const scheduleFinish = () => {
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(finish, navigationMode === 'click-scrolling' ? 140 : 90);
    };
    container.addEventListener('scroll', scheduleFinish, { passive: true });
    container.addEventListener('scrollend', finish as EventListener);
    const fallbackTimer = window.setTimeout(finish, navigationMode === 'click-scrolling' ? 1600 : 500);

    return () => {
      container.removeEventListener('scroll', scheduleFinish);
      container.removeEventListener('scrollend', finish as EventListener);
      window.clearTimeout(fallbackTimer);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
    };
  }, [navigationMode, pendingMonthKey]);

  React.useLayoutEffect(() => {
    // Do not poll the DOM while a cross-page request is in flight. The old
    // page remains mounted during that interval, so a requestAnimationFrame
    // loop would spin once per frame waiting for a section that cannot exist
    // yet and compete with the navigation response.
    if (!pendingMonthKey || isLoadingImages || images.length === 0) return undefined;

    let frameId: number | null = null;
    let retryTimer: number | null = null;
    let frameCount = 0;
    let missingTargetAttempts = 0;
    let stableFrames = 0;
    let previousTargetTop: number | null = null;
    let previousScrollTop: number | null = null;
    const behavior = getMotionAwareScrollBehavior(pendingMonthScrollBehaviorRef.current);

    const alignTarget = () => {
      const container = getGalleryScrollContainer();
      const target = document.getElementById(`month-section-${pendingMonthKey}`);
      if (!container || !target) {
        if (missingTargetAttempts >= 40) {
          setPendingMonthKey(null);
          return;
        }
        missingTargetAttempts += 1;
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          alignTarget();
        }, 50);
        return;
      }
      missingTargetAttempts = 0;

      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const targetTop = targetRect.top - containerRect.top;
      const requestedTop = getScrollTopForElement(container, target);
      const shouldAlign = Math.abs(container.scrollTop - requestedTop) > 0.5;
      const shouldPreserveInitialMotion = behavior === 'smooth' && frameCount < 8;

      if (shouldAlign && (frameCount === 0 || !shouldPreserveInitialMotion || frameCount >= 8)) {
        container.scrollTo({
          top: requestedTop,
          behavior: frameCount === 0 ? behavior : 'auto',
        });
      }

      const currentScrollTop = container.scrollTop;
      const layoutStable = previousTargetTop !== null
        && Math.abs(targetTop - previousTargetTop) <= 1
        && previousScrollTop !== null
        && Math.abs(currentScrollTop - previousScrollTop) <= 1;
      if (Math.abs(targetTop) <= 1 && layoutStable) stableFrames += 1;
      else stableFrames = 0;
      previousTargetTop = targetTop;
      previousScrollTop = currentScrollTop;
      frameCount += 1;

      if (stableFrames >= 4 || frameCount >= 45) {
        scrollElementToContainerStart(container, target, 'auto');
        setPendingMonthKey(null);
        return;
      }

      frameId = window.requestAnimationFrame(alignTarget);
    };

    frameId = window.requestAnimationFrame(alignTarget);
    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [getGalleryScrollContainer, images, isLoadingImages, pendingMonthKey]);

  const webtoonConfigSaveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const viewerModeSaveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const videoPreferenceSaveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const videoPreferenceSaveTimerRef = useRef<number | null>(null);
  const pendingVideoPreferencePatchRef = useRef<VideoPreferencePatch>({});

  const enqueueVideoPreferenceSave = useCallback((patch: VideoPreferencePatch) => {
    videoPreferenceSaveQueueRef.current = videoPreferenceSaveQueueRef.current
      .catch(() => undefined)
      .then(() => persistWebConfigPatch(patch))
      .catch(error => {
        console.error('Failed to save video preference:', error);
      });
  }, [persistWebConfigPatch]);

  const handleVideoPreferenceChange = useCallback((patch: VideoPreferencePatch) => {
    const normalized = normalizeWebConfig(patch);
    const nextPatch: VideoPreferencePatch = {};
    if (patch.videoMuted !== undefined) nextPatch.videoMuted = normalized.videoMuted;
    if (patch.videoVolume !== undefined) nextPatch.videoVolume = normalized.videoVolume;
    if (Object.keys(nextPatch).length === 0) return;

    setWebConfigSnapshot(current => normalizeWebConfig({ ...current, ...nextPatch }));
    pendingVideoPreferencePatchRef.current = {
      ...pendingVideoPreferencePatchRef.current,
      ...nextPatch,
    };
    if (videoPreferenceSaveTimerRef.current !== null) {
      window.clearTimeout(videoPreferenceSaveTimerRef.current);
    }
    videoPreferenceSaveTimerRef.current = window.setTimeout(() => {
      videoPreferenceSaveTimerRef.current = null;
      const pendingPatch = pendingVideoPreferencePatchRef.current;
      pendingVideoPreferencePatchRef.current = {};
      if (Object.keys(pendingPatch).length > 0) enqueueVideoPreferenceSave(pendingPatch);
    }, 250);
  }, [enqueueVideoPreferenceSave]);

  useEffect(() => () => {
    if (videoPreferenceSaveTimerRef.current !== null) {
      window.clearTimeout(videoPreferenceSaveTimerRef.current);
    }
  }, []);

  const handleWebtoonSettingsChange = useCallback((patch: Partial<WebConfig>) => {
    const normalized = normalizeWebConfig(patch);
    if (patch.webtoonImageScale !== undefined) setWebtoonImageScale(normalized.webtoonImageScale);
    if (patch.webtoonImageGap !== undefined) setWebtoonImageGap(normalized.webtoonImageGap);
    if (patch.webtoonShowInfo !== undefined) setWebtoonShowInfo(normalized.webtoonShowInfo);
    if (patch.webtoonShowPageNumber !== undefined) setWebtoonShowPageNumber(normalized.webtoonShowPageNumber);
    if (patch.webtoonShowThumbnails !== undefined) setWebtoonShowThumbnails(normalized.webtoonShowThumbnails);

    webtoonConfigSaveQueueRef.current = webtoonConfigSaveQueueRef.current
      .catch(() => undefined)
      .then(() => persistWebConfigPatch(patch))
      .catch(error => {
        console.error('Failed to save webtoon setting:', error);
      });
  }, [persistWebConfigPatch]);

  const handlePreferredViewerModeChange = useCallback((nextMode: ViewerMode) => {
    preferredViewerModeRef.current = nextMode;
    setPreferredViewerMode(nextMode);

    viewerModeSaveQueueRef.current = viewerModeSaveQueueRef.current
      .catch(() => undefined)
      .then(() => persistWebConfigPatch({ defaultViewMode: nextMode }))
      .catch(error => {
        console.error('Failed to save defaultViewMode setting:', error);
      });
  }, [persistWebConfigPatch]);

  const handleViewModeChange = useCallback((requestedMode: ViewMode) => {
    if (requestedMode === 'fullscreen' || requestedMode === 'webtoon') {
      handlePreferredViewerModeChange(requestedMode);
    }

    const nextMode = isMobileViewportRef.current && requestedMode === 'grid'
      ? preferredViewerModeRef.current
      : requestedMode;
    const fullscreenActive = fullscreenIndex !== null;
    if (nextMode === viewMode && !fullscreenActive) return;

    const anchorIndex = getCurrentViewAnchorIndex();
    const safeAnchorIndex = normalizeViewAnchorIndex(anchorIndex);

    // A mode change is also a navigation boundary. Do not let an in-flight
    // month scrub resume against the newly mounted grid and overwrite the
    // row anchor or page that the user chose.
    cancelMonthNavigation();

    if (nextMode === 'fullscreen') {
      setFullscreenIndex(safeAnchorIndex ?? (images.length > 0 ? 0 : null));
    } else if (nextMode === 'webtoon') {
      handleEditModeChange(false);
      requestWebtoonStart(safeAnchorIndex ?? (images.length > 0 ? 0 : null));
      setFullscreenIndex(null);
    } else {
      requestGridRestore(safeAnchorIndex);
      setFullscreenIndex(null);
    }

    setViewMode(nextMode);
  }, [
    fullscreenIndex,
    getCurrentViewAnchorIndex,
    images.length,
    normalizeViewAnchorIndex,
    cancelMonthNavigation,
    requestGridRestore,
    requestWebtoonStart,
    handleEditModeChange,
    handlePreferredViewerModeChange,
    viewMode,
  ]);

  const handleReturnToGrid = useCallback(() => {
    const anchorIndex = normalizeViewAnchorIndex(getCurrentViewAnchorIndex());
    cancelMonthNavigation();
    requestGridRestore(anchorIndex);
    setFullscreenIndex(null);
    setIsWebtoonToolbarOpen(false);
    setViewMode('grid');
  }, [cancelMonthNavigation, getCurrentViewAnchorIndex, normalizeViewAnchorIndex, requestGridRestore]);

  const handleOpenImage = useCallback((index: number) => {
    const safeIndex = normalizeViewAnchorIndex(index);
    if (safeIndex === null) return;

    cancelMonthNavigation();
    if (preferredViewerModeRef.current === 'webtoon') {
      requestWebtoonStart(safeIndex);
      setFullscreenIndex(null);
      setViewMode('webtoon');
      return;
    }

    setFullscreenIndex(safeIndex);
    setViewMode('fullscreen');
  }, [cancelMonthNavigation, normalizeViewAnchorIndex, requestWebtoonStart]);

  const handleThemeChange = useCallback((nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    persistWebConfigPatch({ webTheme: nextTheme }).catch(err => {
      console.error('Failed to save webTheme setting:', err);
    });
  }, [persistWebConfigPatch]);

  const handleCloseMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  const handleToggleMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(open => !open);
    setIsSidebarOpen(false);
  }, []);

  const handleOpenFilters = useCallback(() => {
    setIsMobileMenuOpen(false);
    setIsSidebarOpen(true);
  }, []);

  // Handle Edit Mode Toggle & Keyboard E Shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (viewMode === 'webtoon') return;
      if (e.key === 'e' || e.key === 'E') {
        handleEditModeChange(!isEditMode);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleEditModeChange, isEditMode, viewMode]);

  useEffect(() => {
    if (viewMode === 'webtoon' && isEditMode) handleEditModeChange(false);
  }, [handleEditModeChange, isEditMode, viewMode]);

  const handleToggleGroupMangaPosts = useCallback(() => {
    const previousValue = groupMangaPosts;
    const nextVal = !previousValue;
    const requestId = ++groupSaveRequestRef.current;

    setGroupMangaPosts(nextVal);
    persistWebConfigPatch({ groupMangaPosts: nextVal }).catch(err => {
      if (requestId !== groupSaveRequestRef.current) return;
      console.error('Failed to save groupMangaPosts setting:', err);
      setGroupMangaPosts(previousValue);
    });
  }, [groupMangaPosts, persistWebConfigPatch]);

  const handleToggleBlur = useCallback(() => {
    const previousValue = blurEnabled;
    const nextValue = !previousValue;
    const requestId = ++blurSaveRequestRef.current;

    setBlurEnabled(nextValue);
    persistWebConfigPatch({ blurEnabled: nextValue }).catch(err => {
      if (requestId !== blurSaveRequestRef.current) return;
      console.error('Failed to save blurEnabled setting:', err);
      setBlurEnabled(previousValue);
    });
  }, [blurEnabled, persistWebConfigPatch]);

  const handleFullscreenToolbarSimpleModeChange = useCallback((simpleMode: boolean) => {
    const previousValue = fullscreenToolbarSimpleMode;
    const requestId = ++fullscreenToolbarModeSaveRequestRef.current;

    setFullscreenToolbarSimpleMode(simpleMode);
    setWebConfigSnapshot(current => ({ ...current, fullscreenToolbarSimpleMode: simpleMode }));
    persistWebConfigPatch({ fullscreenToolbarSimpleMode: simpleMode }).catch(err => {
      if (requestId !== fullscreenToolbarModeSaveRequestRef.current) return;
      console.error('Failed to save fullscreenToolbarSimpleMode setting:', err);
      setFullscreenToolbarSimpleMode(previousValue);
      setWebConfigSnapshot(current => ({ ...current, fullscreenToolbarSimpleMode: previousValue }));
    });
  }, [fullscreenToolbarSimpleMode, persistWebConfigPatch]);

  const handleFullscreenShowToolbarChange = useCallback((showToolbar: boolean) => {
    const previousValue = fullscreenShowToolbar;
    const requestId = ++fullscreenShowToolbarSaveRequestRef.current;

    setFullscreenShowToolbar(showToolbar);
    setWebConfigSnapshot(current => ({ ...current, fullscreenShowToolbar: showToolbar }));
    persistWebConfigPatch({ fullscreenShowToolbar: showToolbar }).catch(error => {
      if (requestId !== fullscreenShowToolbarSaveRequestRef.current) return;
      console.error('Failed to save fullscreenShowToolbar setting:', error);
      setFullscreenShowToolbar(previousValue);
      setWebConfigSnapshot(current => ({ ...current, fullscreenShowToolbar: previousValue }));
    });
  }, [fullscreenShowToolbar, persistWebConfigPatch]);

  const handleFullscreenShowFilmstripChange = useCallback((showFilmstrip: boolean) => {
    const previousValue = fullscreenShowThumbnails;
    const requestId = ++fullscreenShowThumbnailsSaveRequestRef.current;

    setFullscreenShowThumbnails(showFilmstrip);
    setWebConfigSnapshot(current => ({ ...current, fullscreenShowThumbnails: showFilmstrip }));
    persistWebConfigPatch({ fullscreenShowThumbnails: showFilmstrip }).catch(error => {
      if (requestId !== fullscreenShowThumbnailsSaveRequestRef.current) return;
      console.error('Failed to save fullscreenShowThumbnails setting:', error);
      setFullscreenShowThumbnails(previousValue);
      setWebConfigSnapshot(current => ({ ...current, fullscreenShowThumbnails: previousValue }));
    });
  }, [fullscreenShowThumbnails, persistWebConfigPatch]);

  const handleFullscreenCheckerboardChange = useCallback((enabled: boolean) => {
    const previousValue = webConfigSnapshot.fullscreenShowCheckerboard;
    const requestId = ++fullscreenCheckerboardSaveRequestRef.current;

    setWebConfigSnapshot(current => ({ ...current, fullscreenShowCheckerboard: enabled }));
    persistWebConfigPatch({ fullscreenShowCheckerboard: enabled }).catch(error => {
      if (requestId !== fullscreenCheckerboardSaveRequestRef.current) return;
      console.error('Failed to save fullscreenShowCheckerboard setting:', error);
      setWebConfigSnapshot(current => ({ ...current, fullscreenShowCheckerboard: previousValue }));
    });
  }, [persistWebConfigPatch, webConfigSnapshot.fullscreenShowCheckerboard]);

  const handleFullscreenZoomModeChange = useCallback((mode: WebConfig['fullscreenZoomMode']) => {
    const previousValue = webConfigSnapshot.fullscreenZoomMode;
    const requestId = ++fullscreenZoomModeSaveRequestRef.current;

    setWebConfigSnapshot(current => ({ ...current, fullscreenZoomMode: mode }));
    persistWebConfigPatch({ fullscreenZoomMode: mode }).catch(error => {
      if (requestId !== fullscreenZoomModeSaveRequestRef.current) return;
      console.error('Failed to save fullscreenZoomMode setting:', error);
      setWebConfigSnapshot(current => ({ ...current, fullscreenZoomMode: previousValue }));
    });
  }, [persistWebConfigPatch, webConfigSnapshot.fullscreenZoomMode]);

  const displayArtists = artists;
  const displayImages = images;

  // Group images into WorkGroups for current page
  const allWorkGroups = useMemo(() => {
    return groupImagesIntoWorkGroups(displayImages);
  }, [displayImages]);

  // Current Fullscreen Active Work Group & Item Index
  const currentFullscreenItem = fullscreenIndex !== null ? displayImages[fullscreenIndex] : null;
  const currentFullscreenGroup = useMemo(() => {
    if (!currentFullscreenItem) return null;
    return allWorkGroups.find(g => g.items.some(it => it.save_name === currentFullscreenItem.save_name)) || null;
  }, [currentFullscreenItem, allWorkGroups]);

  const handleNavigateNextWork = () => {
    if (!currentFullscreenGroup) {
      if (fullscreenIndex !== null && fullscreenIndex < images.length - 1) {
        setFullscreenIndex(fullscreenIndex + 1);
      }
      return;
    }
    const currentGroupIdx = allWorkGroups.findIndex(g => g.group_id === currentFullscreenGroup.group_id);
    if (currentGroupIdx !== -1 && currentGroupIdx < allWorkGroups.length - 1) {
      const nextGroup = allWorkGroups[currentGroupIdx + 1];
      const firstItem = nextGroup.items[0];
      const globalIdx = images.findIndex(x => x.save_name === firstItem.save_name);
      if (globalIdx !== -1) setFullscreenIndex(globalIdx);
    }
  };

  const handleNavigatePrevWork = () => {
    if (!currentFullscreenGroup) {
      if (fullscreenIndex !== null && fullscreenIndex > 0) {
        setFullscreenIndex(fullscreenIndex - 1);
      }
      return;
    }
    const currentGroupIdx = allWorkGroups.findIndex(g => g.group_id === currentFullscreenGroup.group_id);
    if (currentGroupIdx > 0) {
      const prevGroup = allWorkGroups[currentGroupIdx - 1];
      const lastItem = prevGroup.items[prevGroup.items.length - 1];
      const globalIdx = images.findIndex(x => x.save_name === lastItem.save_name);
      if (globalIdx !== -1) setFullscreenIndex(globalIdx);
    }
  };

  const handleOpenWorkGroupModal = (group: WorkGroup) => {
    setActiveWorkGroup(group);
    setIsMangaModalOpen(true);
  };

  const handleSelectMangaPage = (pageIdx: number) => {
    if (!activeWorkGroup) return;
    const targetItem = activeWorkGroup.items[pageIdx];
    const globalIdx = images.findIndex(x => x.save_name === targetItem?.save_name);
    if (globalIdx !== -1) handleOpenImage(globalIdx);
    setIsMangaModalOpen(false);
  };

  const handleResetAllFilters = () => {
    setSearchQuery('');
    setSelectedArtist(null);
    setSelectedMonths([]);
  };

  const currentArtist = useMemo(
    () => (selectedArtist === null ? null : displayArtists.find(artist => getArtistScopeKey(artist) === selectedArtist) ?? null),
    [displayArtists, selectedArtist],
  );

  const currentArtistScopeKey = currentArtist ? getArtistScopeKey(currentArtist) : null;
  const isArtistUpdating = isLibraryJobActive(libraryJob)
    && libraryJob?.job_type === 'update-library'
    && (currentArtistScopeKey === null
      || libraryJob.scopes?.some(scope => (
        scope.folder_id === currentArtistScopeKey || scope.scope_key === currentArtistScopeKey
      )));

  const handleRequestArtistUpdate = useCallback(() => {
    if (isArtistUpdating) return;
    setIsArtistUpdateNoticeOpen(true);
  }, [isArtistUpdating]);

  const handleStartArtistUpdate = useCallback(async () => {
    if (!currentArtist || currentArtist.member_id <= 0) {
      setIsArtistUpdateNoticeOpen(false);
      return;
    }

    setIsArtistUpdateNoticeOpen(false);
    try {
      const data = await apiClient.libraryJobs.start({
          type: 'update-library',
          folder_id: currentArtistScopeKey || undefined,
          member_id: currentArtistScopeKey ? undefined : currentArtist.member_id,
          analyze_colors: true,
          priority: 0,
        });
      if (!data.job) throw new Error('背景更新啟動失敗');
      startLibraryJob(data.job);
      setLibraryAnnouncement('已開始在背景更新目前繪師；既有索引可繼續瀏覽，完成後列表會自動更新。');
    } catch (error) {
      setLibraryAnnouncement(error instanceof Error ? error.message : '背景更新啟動失敗');
    }
  }, [currentArtist, startLibraryJob]);

  const handleArtistChanged = useCallback(() => {
    clearImagePageCache();
    setSelectedArtist(null);
    void refreshDirectoryMetadata().catch(err => console.error('Failed to refresh after artist action:', err));
  }, [clearImagePageCache, refreshDirectoryMetadata]);

  const handleArtistMetadataChanged = useCallback(() => {
    void refreshDirectoryMetadata().catch(err => console.error('Failed to refresh managed folder metadata:', err));
  }, [refreshDirectoryMetadata]);

  const handleArtistVisibilityChanged = useCallback(() => {
    clearImagePageCache();
    void refreshDirectoryMetadata().catch(err => console.error('Failed to refresh artist list after visibility action:', err));
    fetchImages();
  }, [clearImagePageCache, fetchImages, refreshDirectoryMetadata]);

  const handleOpenRecycleBin = useCallback(() => {
    setIsSettingsOpen(false);
    setIsArtistSettingsOpen(false);
    setIsRecycleBinOpen(true);
  }, []);

  const handleSettingsSaved = useCallback((savedConfig?: Partial<WebConfig>) => {
    if (savedConfig) {
      applyWebConfig(savedConfig);
    } else {
      loadWebConfig().catch(err => console.error('Failed to refresh web-config:', err));
    }

    fetchImages();
    // Also refetch artists and months in case directory rescan indexed new files.
    void refreshDirectoryMetadata().catch(err => console.error(err));
  }, [applyWebConfig, fetchImages, loadWebConfig, refreshDirectoryMetadata]);

  const handleOnboardingComplete = useCallback((config: WebConfig) => {
    applyWebConfig(config);
  }, [applyWebConfig]);

  if (!isWebConfigReady) {
    return (
      <div className="app-root__loading" aria-busy="true">
        載入 Web Viewer 設定中…
      </div>
    );
  }

  if (!webConfigSnapshot.onboardingCompleted) {
    return <FirstUseOnboarding initialConfig={webConfigSnapshot} onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className={`app-root${viewMode === 'webtoon' ? ' webtoon-app' : ''}${viewMode === 'webtoon' && isWebtoonHeaderHidden ? ' webtoon-app--header-hidden' : ''}`}>
      <Header
        viewMode={viewMode}
        setViewMode={handleViewModeChange}
        theme={theme}
        setTheme={handleThemeChange}
        isEditMode={isEditMode}
        setIsEditMode={handleEditModeChange}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        toggleMenu={handleToggleMobileMenu}
        isSidebarOpen={isSidebarOpen}
        isMobileMenuOpen={isMobileMenuOpen}
        totalCount={totalImages}
        onOpenSettings={() => setIsSettingsOpen(true)}
        groupMangaPosts={groupMangaPosts}
        onToggleGroupMangaPosts={handleToggleGroupMangaPosts}
        blurEnabled={blurEnabled}
        onToggleBlur={handleToggleBlur}
        libraryJob={libraryJob}
      />

      {viewMode === 'webtoon' && (
        <WebtoonMobileHeader
          isHidden={isWebtoonHeaderHidden}
          isSettingsOpen={isWebtoonToolbarOpen}
          onBack={handleReturnToGrid}
          onScrollToTop={() => {
            setIsWebtoonToolbarOpen(false);
            handleScrollToTop();
          }}
          onToggleSettings={() => setIsWebtoonToolbarOpen(open => !open)}
        />
      )}

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {libraryAnnouncement}
      </div>

      <MobileMenuDrawer
        isOpen={isMobileMenuOpen}
        onClose={handleCloseMobileMenu}
        preferredViewerMode={preferredViewerMode}
        onSelectPreferredViewerMode={handlePreferredViewerModeChange}
        theme={theme}
        setTheme={handleThemeChange}
        onOpenSettings={() => setIsSettingsOpen(true)}
        groupMangaPosts={groupMangaPosts}
        onToggleGroupMangaPosts={handleToggleGroupMangaPosts}
        blurEnabled={blurEnabled}
        onToggleBlur={handleToggleBlur}
      />

      <div
        className="webtoon-layout-shell relative flex flex-1 min-h-0 overflow-hidden"
        style={{
          '--viewer-sidebar-offset': isSidebarOpen && !isMobileViewport
            ? `${effectiveSidebarWidth}px`
            : '0px',
        } as React.CSSProperties}
      >
        {isSidebarOpen && (
          <button
            type="button"
            className="app-sidebar__backdrop"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="關閉篩選側欄"
            title="關閉篩選側欄"
          />
        )}

        <Sidebar
          isOpen={isSidebarOpen}
          sidebarWidth={effectiveSidebarWidth}
          maxSidebarWidth={maxSidebarWidth}
          onSidebarWidthChange={handleSidebarWidthChange}
          onSidebarWidthCommit={handleSidebarWidthCommit}
          onClose={() => setIsSidebarOpen(false)}
          months={months}
          artists={displayArtists}
          selectedMonths={selectedMonths}
          setSelectedMonths={setSelectedMonths}
          selectedArtist={selectedArtist}
          setSelectedArtist={setSelectedArtist}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onResetAllFilters={handleResetAllFilters}
          isLoading={isLoadingArtists}
        />

        <main
          ref={mainScrollRef}
          onScroll={viewMode === 'grid' ? undefined : handleMainScroll}
          onScrollCapture={viewMode === 'grid' ? handleMainScroll : undefined}
          onWheel={() => {
            if (viewMode === 'webtoon') webtoonUserScrollIntentRef.current = true;
          }}
          onTouchStart={() => {
            if (viewMode === 'webtoon') webtoonUserScrollIntentRef.current = true;
          }}
          onPointerDown={() => {
            if (viewMode === 'webtoon') webtoonUserScrollIntentRef.current = true;
          }}
          className={`flex-1 min-w-0 min-h-0 overflow-x-hidden overscroll-x-none overscroll-y-contain ${viewMode === 'grid' ? 'viewer-main--grid flex flex-col overflow-y-hidden' : 'overflow-y-auto'}`}
        >
          {viewMode === 'grid' && (
          <GalleryGrid
            images={displayImages}
            totalImages={totalImages}
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            thumbnailSize={thumbnailSize}
            onPageChange={handlePageChange}
            onLoadPage={loadSelectionPage}
            onItemsPerPageChange={(num) => setItemsPerPage(num)}
            sortMode={sortMode}
            onSortModeChange={(mode) => setSortMode(mode)}
            isEditMode={isEditMode}
            onToggleEditMode={handleToggleEditMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelectImage}
            onSetSelection={setSelectedImages}
            onReplaceSelection={replaceSelectedImages}
            onOpenFullscreen={handleOpenImage}
            searchQuery={searchQuery}
            selectedArtist={selectedArtist}
            onClearArtist={() => setSelectedArtist(null)}
            onOpenFilters={handleOpenFilters}
            isFilterSidebarOpen={isSidebarOpen}
            selectedMonths={selectedMonths}
            onResetAllFilters={handleResetAllFilters}
            groupMangaPosts={groupMangaPosts}
            onOpenWorkGroup={handleOpenWorkGroupModal}
            artists={displayArtists}
             monthIndexItems={monthIndexItems}
             onJumpToMonth={handleJumpToMonth}
             onPrefetchMonth={prefetchMonthPage}
             onNavigationChange={handleMonthNavigationChange}
             navigationMode={navigationMode}
             destinationMonthKey={destinationMonthKey}
             destinationGlobalIndex={destinationGlobalIndex}
             restoreGlobalIndex={gridRestoreAnchor?.index ?? null}
             restoreRequestId={gridRestoreAnchor?.requestId ?? 0}
             loadedPage={loadedPage}
             isLoading={isLoadingImages}
             isArtistLoading={isLoadingImages && selectedArtist !== null}
            isArtistUpdating={isArtistUpdating}
            onRequestArtistUpdate={handleRequestArtistUpdate}
            onOpenArtistSettings={() => setIsArtistSettingsOpen(true)}
            blurEnabled={blurEnabled}
            demoMode={demoMode}
          />
          )}

          {viewMode === 'webtoon' && (
            <WebtoonFeed
              images={displayImages}
              blurEnabled={blurEnabled}
              demoMode={demoMode}
              initialIndex={webtoonStartAnchor?.index ?? null}
              initialRequestId={webtoonStartAnchor?.requestId ?? 0}
              thumbnailSize={thumbnailSize}
              imageScale={webtoonImageScale}
              imageGap={webtoonImageGap}
              showInfo={webtoonShowInfo}
              showPageNumber={webtoonShowPageNumber}
              showThumbnails={isMobileViewport ? false : webtoonShowThumbnails}
              groupMangaPosts={groupMangaPosts}
              pageOffset={Math.max(0, (currentPage - 1) * itemsPerPage)}
              totalImages={totalImages}
              currentPage={currentPage}
              totalPages={Math.max(1, Math.ceil(totalImages / Math.max(1, itemsPerPage)))}
              mobileToolbarOpen={isWebtoonToolbarOpen}
              isMobileViewport={isMobileViewport}
              videoMuted={webConfigSnapshot.videoMuted}
              videoVolume={webConfigSnapshot.videoVolume}
              videoAutoplay={webConfigSnapshot.videoAutoplay}
              onPageChange={handleWebtoonPageChange}
              onSettingsChange={handleWebtoonSettingsChange}
              onVideoPreferenceChange={handleVideoPreferenceChange}
            />
          )}

        </main>
      </div>

      {showScrollTop && (!isMobileViewport || !isSidebarOpen) && (
          <IconButton
            type="button"
            className={`viewer-scroll-top is-visible${viewMode === 'webtoon' ? ' viewer-scroll-top--webtoon' : ''}${isGridAtBottom ? ' viewer-scroll-top--grid-end' : ''}`}
            style={isGridAtBottom && gridScrollTopBottom !== null && gridScrollTopInlineEnd !== null
              ? {
                '--viewer-scroll-top-grid-bottom': `${gridScrollTopBottom}px`,
                '--viewer-scroll-top-grid-inline-end': `${gridScrollTopInlineEnd}px`,
              } as React.CSSProperties
              : undefined}
            onClick={event => {
              handleScrollToTop();
              if (event.detail > 0) event.currentTarget.blur();
            }}
            variant="secondary"
          aria-label="回到頂端"
          title="回到頂端"
        >
          <ArrowUp className="h-5 w-5" aria-hidden="true" />
        </IconButton>
      )}

      {/* Manga Group Preview Modal */}
      <MangaGroupModal
        isOpen={isMangaModalOpen}
        workGroup={activeWorkGroup}
        onClose={() => setIsMangaModalOpen(false)}
        onSelectImage={handleSelectMangaPage}
        thumbnailSize={thumbnailSize}
        blurEnabled={blurEnabled}
        demoMode={demoMode}
      />

      {/* Keep one previewer instance for the single-image reader mode. */}
      {(fullscreenIndex !== null || viewMode === 'fullscreen') && images.length > 0 && (
        <FullscreenViewer
          key="fullscreen-viewer"
          images={displayImages}
          currentIndex={fullscreenIndex ?? 0}
          onClose={handleCloseFullscreen}
          onNavigate={handleNavigateFullscreen}
          activeMode={viewMode === 'webtoon' ? 'webtoon' : 'fullscreen'}
          onChangeMode={handleViewModeChange}
          onDeleteCurrent={promptDeleteSingle}
          onNavigateNextWork={handleNavigateNextWork}
          onNavigatePrevWork={handleNavigatePrevWork}
          preloadCount={preloadImageCount}
          thumbnailSize={thumbnailSize}
          blurEnabled={blurEnabled}
          demoMode={demoMode}
          isMobileViewport={isMobileViewport}
          groupMangaPosts={groupMangaPosts}
          onToggleGroupMangaPosts={handleToggleGroupMangaPosts}
          onToggleBlur={handleToggleBlur}
          simpleToolbar={fullscreenToolbarSimpleMode}
          onSimpleToolbarChange={handleFullscreenToolbarSimpleModeChange}
          showToolbarByDefault={fullscreenShowToolbar}
          onShowToolbarChange={handleFullscreenShowToolbarChange}
          showFilmstripByDefault={fullscreenShowThumbnails}
          onShowFilmstripChange={handleFullscreenShowFilmstripChange}
          fullscreenShowCheckerboard={webConfigSnapshot.fullscreenShowCheckerboard}
          onCheckerboardChange={handleFullscreenCheckerboardChange}
          fullscreenZoomMode={webConfigSnapshot.fullscreenZoomMode}
          onZoomModeChange={handleFullscreenZoomModeChange}
          videoSeekSeconds={webConfigSnapshot.fullscreenVideoSeekSeconds}
          videoHoldPlaybackRate={webConfigSnapshot.fullscreenVideoHoldPlaybackRate}
          videoMuted={webConfigSnapshot.videoMuted}
          videoVolume={webConfigSnapshot.videoVolume}
          videoAutoplay={webConfigSnapshot.videoAutoplay}
          onVideoPreferenceChange={handleVideoPreferenceChange}
          pageOffset={Math.max(0, (currentPage - 1) * itemsPerPage)}
          totalImages={totalImages}
        />
      )}

      {/* Batch Edit Toolbar */}
      {isEditMode && (
        <BatchEditToolbar
          selectedCount={selectedIds.size}
          totalCount={totalImages}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onDownloadSelected={handleDownloadSelected}
          isDownloading={isDownloadingSelection}
          downloadError={downloadSelectionError}
          onDeleteSelected={promptDeleteSelected}
          onCancel={() => handleEditModeChange(false)}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={showConfirmModal}
        title="移至回收區？"
        message={`確定要將選取的 ${deleteTargets.length} 項作品移至回收區嗎？原始檔案會保留在回收區，不會永久刪除。`}
        confirmLabel="移至回收區"
        cancelLabel="取消"
        onConfirm={confirmExecuteDelete}
        onCancel={() => setShowConfirmModal(false)}
      />

      <ConfirmModal
        isOpen={isArtistUpdateNoticeOpen}
        title="在背景更新繪師作品？"
        message="更新只會讀取目前繪師的資料夾，並寫入 Web Viewer 自己的索引。既有索引會先維持顯示，你可以繼續瀏覽；完成後列表會自動更新。"
        confirmLabel="開始背景更新"
        cancelLabel="稍後再做"
        variant="primary"
        onConfirm={() => void handleStartArtistUpdate()}
        onCancel={() => setIsArtistUpdateNoticeOpen(false)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsSaved={handleSettingsSaved}
        onArtistVisibilityChanged={handleArtistVisibilityChanged}
        onOpenRecycleBin={handleOpenRecycleBin}
        artists={displayArtists}
      />

      <ArtistSettingsModal
        isOpen={isArtistSettingsOpen}
        artist={currentArtist}
        onClose={() => setIsArtistSettingsOpen(false)}
        onArtistChanged={handleArtistChanged}
        onArtistMetadataChanged={handleArtistMetadataChanged}
      />

      <RecycleBinModal
        isOpen={isRecycleBinOpen}
        onClose={() => setIsRecycleBinOpen(false)}
      />

      <Toast
        isOpen={!!toastMessage}
        message={toastMessage || ''}
        variant={toastVariant}
        onClose={() => setToastMessage(null)}
      />
    </div>
  );
};

export default App;
