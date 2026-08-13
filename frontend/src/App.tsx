import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Artist, LibraryJob, MonthItem, ImageItem, SortMode, ViewMode, ViewerMode, ThemeMode, WorkGroup, WebConfig, VideoPreferencePatch, DEFAULT_WEB_CONFIG } from './types';
import { ArrowUp } from 'lucide-react';
import { useI18n, type I18nContextValue } from './i18n';
import { groupImagesIntoWorkGroups } from './utils/grouping';
import { buildThumbnailUrl, normalizeWebConfig } from './utils/webConfig';
import { Header } from './components/Header';
import { WebtoonMobileHeader } from './components/WebtoonMobileHeader';
import { MobileMenuDrawer } from './components/MobileMenuDrawer';
import { Sidebar } from './components/Sidebar';
import { GalleryGrid } from './components/GalleryGrid';
import type { GalleryPageChangeOptions } from './components/GalleryGrid';
import { BatchEditToolbar } from './components/BatchEditToolbar';
import { ConfirmModal } from './components/ConfirmModal';
import { FirstUseOnboarding } from './components/FirstUseOnboarding';
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
import {
  getCrossPageMonthApproachTop,
  resolveMonthTarget as resolveMonthTargetForItem,
  sortMonthIndexItems,
} from './utils/monthNavigation';
import { getMotionAwareScrollBehavior } from './utils/motion';
import { createSmoothScrollRunner, type SmoothScrollRunner } from './utils/smoothScroll';
import { useImagePageLoader } from './hooks/useImagePageLoader';
import { isLibraryJobActive, useLibraryJobStore } from './hooks/useLibraryJobStore';
import { usePreferencesController } from './hooks/usePreferencesController';
import { useViewerNavigation } from './hooks/useViewerNavigation';
import { useSelectionWorkflow } from './hooks/useSelectionWorkflow';
import { apiClient } from './api/client';
import { isScrollPerformanceProbeRequested, startScrollPerformanceProbe } from './utils/scrollPerformance';
import { getArtistScopeKey } from './utils/artistIdentity';
import {
  clampSidebarWidth,
  getSidebarMaxWidth,
} from './utils/sidebarLayout';
import { createNavigationTransactionController, type NavigationTransaction } from './utils/navigationTransaction';
import {
  buildGlobalGalleryLayoutIndex,
  createGlobalHeightIndex,
  getGalleryLayoutMetrics,
} from './media-window/globalLayoutIndex';
import { createHttpMediaRangeAdapter } from './media-window/httpMediaRangeAdapter';
import { useGlobalMediaWindow } from './media-window/useGlobalMediaWindow';
import { useGlobalReaderRange } from './media-window/useGlobalReaderRange';
import type { MediaQuery } from './media-window';

const loadFullscreenViewer = () => import('./components/FullscreenViewer').then(module => ({
  default: module.FullscreenViewer,
}));
const loadSpreadViewer = () => import('./components/SpreadViewer').then(module => ({
  default: module.SpreadViewer,
}));
const loadWebtoonFeed = () => import('./components/WebtoonFeed').then(module => ({
  default: module.WebtoonFeed,
}));
const loadSettingsModal = () => import('./components/SettingsModal').then(module => ({
  default: module.SettingsModal,
}));
const loadArtistSettingsModal = () => import('./components/ArtistSettingsModal').then(module => ({
  default: module.ArtistSettingsModal,
}));
const loadRecycleBinModal = () => import('./components/RecycleBinModal').then(module => ({
  default: module.RecycleBinModal,
}));
const loadMangaGroupModal = () => import('./components/MangaGroupModal').then(module => ({
  default: module.MangaGroupModal,
}));

const LazyFullscreenViewer = React.lazy(loadFullscreenViewer);
const LazySpreadViewer = React.lazy(loadSpreadViewer);
const LazyWebtoonFeed = React.lazy(loadWebtoonFeed);
const LazySettingsModal = React.lazy(loadSettingsModal);
const LazyArtistSettingsModal = React.lazy(loadArtistSettingsModal);
const LazyRecycleBinModal = React.lazy(loadRecycleBinModal);
const LazyMangaGroupModal = React.lazy(loadMangaGroupModal);

// Keep the first month-jump response close to the visible window. The API
// still returns the complete month index, but hydrating 64 media rows is
// materially faster than waiting on a 200-row thumbnail batch before the
// dominant-color surfaces can be painted.
const GLOBAL_MEDIA_CHUNK_SIZE = 64;
const GLOBAL_MEDIA_MAX_CHUNKS = 8;
const GLOBAL_READER_WINDOW_SIZE = 160;
// The page owner is an explicit rollback path for an older backend. It is
// opt-in after the global range contract is available, so the normal runtime
// never starts a second current-page request beside GlobalMediaWindow.
const LEGACY_PAGINATION_ENABLED = import.meta.env.VITE_ENABLE_LEGACY_PAGINATION === 'true';

class LazyModuleBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(previousProps: { children: React.ReactNode }) {
    if (previousProps.children !== this.props.children && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return <LazyModuleError />;
    }
    return this.props.children;
  }
}

const LazyModuleError: React.FC = () => {
  const { t } = useI18n();
  return (
    <div className="app-root__loading" role="alert">
      {t('errors.moduleLoad')}
    </div>
  );
};

const LazyModuleFallback: React.FC = () => {
  const { t } = useI18n();
  return (
    <div className="app-root__loading" role="status" aria-live="polite">
      {t('common.processing')}
    </div>
  );
};

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

const getLibraryUpdateAnnouncement = (
  job: LibraryJob,
  t: I18nContextValue['t'],
  formatNumber: I18nContextValue['formatNumber'],
) => {
  const changes: string[] = [];
  if (job.added > 0) changes.push(t('library.addedCount', { count: formatNumber(job.added) }));
  if (job.updated > 0) changes.push(t('library.updatedCount', { count: formatNumber(job.updated) }));
  if ((job.removed ?? 0) > 0) changes.push(t('library.removedCount', { count: formatNumber(job.removed ?? 0) }));
  if (job.colors_created > 0) changes.push(t('library.colorsCreatedCount', { count: formatNumber(job.colors_created) }));
  return changes.length > 0
    ? t('library.updateSummary', { changes: changes.join(t('common.listSeparator')) })
    : t('library.updateNoChanges');
};

const getLibraryJobAnnouncement = (
  job: LibraryJob,
  t: I18nContextValue['t'],
  formatNumber: I18nContextValue['formatNumber'],
) => {
  if (job.status === 'completed') {
    return job.job_type === 'organize-thumbnail-cache'
      ? t('library.thumbnailOrganized', { count: formatNumber(job.cache_moved) })
      : getLibraryUpdateAnnouncement(job, t, formatNumber);
  }
  if (job.status === 'cancelled') return t('library.jobCancelled');
  if (job.status === 'interrupted') return t('library.jobInterrupted');
  return t('library.jobFailed');
};

export const App: React.FC = () => {
  const { t, setLanguage, formatNumber } = useI18n();
  const initialIsMobileViewport = typeof window !== 'undefined' && window.innerWidth <= 640;
  const [isMobileViewport, setIsMobileViewport] = useState(initialIsMobileViewport);
  const isMobileViewportRef = useRef(initialIsMobileViewport);
  const preferredViewerModeRef = useRef<ViewerMode>(DEFAULT_WEB_CONFIG.defaultViewMode);
  // Entering or reloading the site always starts at the work list. The
  // persisted preferred browsing mode is applied only when opening a work.
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => (
    typeof window === 'undefined' ? true : window.innerWidth > 640
  ));
  const [sidebarWidthDraft, setSidebarWidthDraft] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(() => (
    typeof window === 'undefined' ? 1024 : window.innerWidth
  ));
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isArtistSettingsOpen, setIsArtistSettingsOpen] = useState(false);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  const [isArtistUpdateNoticeOpen, setIsArtistUpdateNoticeOpen] = useState(false);

  const [activeWorkGroup, setActiveWorkGroup] = useState<WorkGroup | null>(null);
  const [isMangaModalOpen, setIsMangaModalOpen] = useState(false);
  const [libraryAnnouncement, setLibraryAnnouncement] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVariant, setToastVariant] = useState<ToastVariant>('info');

  const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    setToastMessage(message);
    setToastVariant(variant);
  }, []);

  const handleWebConfigError = useCallback((error: unknown) => {
    console.error('Failed to fetch or save web-config:', error);
  }, []);
  const {
    config: webConfig,
    patchConfig: persistWebConfigPatch,
    replaceConfig,
    loadConfig: loadWebConfig,
    isReady: isWebConfigReady,
  } = usePreferencesController({ onError: handleWebConfigError });
  const theme = webConfig.webTheme;
  const preferredViewerMode = webConfig.defaultViewMode;
  const sidebarWidth = sidebarWidthDraft ?? webConfig.sidebarWidth;
  const groupMangaPosts = webConfig.groupMangaPosts;
  const preloadImageCount = webConfig.preloadImageCount;
  const fullscreenToolbarSimpleMode = webConfig.fullscreenToolbarSimpleMode;
  const fullscreenShowToolbar = webConfig.fullscreenShowToolbar;
  const fullscreenShowThumbnails = webConfig.fullscreenShowThumbnails;
  const thumbnailSize = webConfig.thumbnailSize;
  const webtoonImageScale = webConfig.webtoonImageScale;
  const webtoonImageGap = webConfig.webtoonImageGap;
  const webtoonShowInfo = webConfig.webtoonShowInfo;
  const webtoonShowPageNumber = webConfig.webtoonShowPageNumber;
  const webtoonShowThumbnails = webConfig.webtoonShowThumbnails;
  const blurEnabled = webConfig.blurEnabled;
  const demoMode = webConfig.demoMode;
  const itemsPerPage = webConfig.itemsPerPage;
  const maxSidebarWidth = getSidebarMaxWidth(viewportWidth);
  const effectiveSidebarWidth = clampSidebarWidth(sidebarWidth, maxSidebarWidth);

  useEffect(() => {
    preferredViewerModeRef.current = preferredViewerMode;
    setLanguage(webConfig.uiLanguage);
  }, [preferredViewerMode, setLanguage, webConfig.uiLanguage]);

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
    enabled: LEGACY_PAGINATION_ENABLED,
    selectedMonths,
    selectedArtist,
    searchQuery,
    sortMode,
    itemsPerPage,
    currentPage,
  });

  const globalMediaAdapter = useMemo(() => createHttpMediaRangeAdapter(), []);
  const globalMediaQuery = useMemo<MediaQuery>(() => ({
    selectedMonths,
    selectedArtist,
    searchQuery,
    sortMode,
    grouping: groupMangaPosts ? 'grouped' : 'ungrouped',
  }), [groupMangaPosts, searchQuery, selectedArtist, selectedMonths, sortMode]);
  const {
    controller: globalMediaWindow,
    snapshot: globalMediaSnapshot,
    prefetch: prefetchGlobalMediaQuery,
  } = useGlobalMediaWindow({
    adapter: globalMediaAdapter,
    query: globalMediaQuery,
    chunkSize: GLOBAL_MEDIA_CHUNK_SIZE,
    maxChunks: GLOBAL_MEDIA_MAX_CHUNKS,
  });
  const globalLayout = useMemo(() => {
    if (!globalMediaSnapshot.revision || globalMediaSnapshot.months.length === 0) return null;
    return buildGlobalGalleryLayoutIndex(
      globalMediaSnapshot.months,
      getGalleryLayoutMetrics(
        viewportWidth,
        isSidebarOpen && !isMobileViewport ? effectiveSidebarWidth : 0,
      ),
    );
  }, [effectiveSidebarWidth, globalMediaSnapshot.months, globalMediaSnapshot.revision, isMobileViewport, isSidebarOpen, viewportWidth]);
  const isGlobalMediaMode = globalLayout !== null;
  const isGlobalMediaLoading = !LEGACY_PAGINATION_ENABLED && !globalMediaSnapshot.revision;
  const navigationImageCount = globalMediaSnapshot.revision
    ? globalMediaSnapshot.total
    : totalImages;

  const refreshMediaData = useCallback(() => {
    if (LEGACY_PAGINATION_ENABLED) {
      fetchImages();
      return Promise.resolve();
    }

    globalMediaWindow.reset(globalMediaQuery);
    return globalMediaWindow.ensure(
      { start: 0, end: GLOBAL_MEDIA_CHUNK_SIZE },
      'viewport',
    );
  }, [fetchImages, globalMediaQuery, globalMediaWindow]);

  const navigationIndexGetterRef = useRef<() => number | null>(() => null);
  const navigationCancelRef = useRef<() => void>(() => undefined);
  const exitEditModeRef = useRef<() => void>(() => undefined);
  const {
    viewMode,
    fullscreenIndex,
    setFullscreenIndex,
    gridRestoreAnchor,
    webtoonStartAnchor,
    requestWebtoonStart,
    openImage: openViewerImage,
    changeMode: changeViewerMode,
    returnToGrid: returnViewerToGrid,
    closeFullscreen: closeViewerFullscreen,
  } = useViewerNavigation({
    imageCount: navigationImageCount,
    preferredMode: preferredViewerMode,
    isMobileViewport,
    getCurrentIndex: () => navigationIndexGetterRef.current(),
    onExitEditMode: () => exitEditModeRef.current(),
    onCancelNavigation: () => navigationCancelRef.current(),
  });

  const [globalWebtoonIndex, setGlobalWebtoonIndex] = useState<number | null>(null);
  const [globalWebtoonRequestId, setGlobalWebtoonRequestId] = useState(0);
  const globalReaderRange = useGlobalReaderRange({
    controller: globalMediaWindow,
    index: fullscreenIndex,
    active: isGlobalMediaMode && fullscreenIndex !== null,
    maxItems: GLOBAL_READER_WINDOW_SIZE,
  });
  const globalWebtoonRange = useGlobalReaderRange({
    controller: globalMediaWindow,
    index: globalWebtoonIndex,
    active: isGlobalMediaMode && viewMode === 'webtoon' && globalWebtoonIndex !== null,
    maxItems: GLOBAL_READER_WINDOW_SIZE,
  });
  const globalWebtoonEstimatedHeight = useMemo(() => {
    const contentWidth = Math.max(
      320,
      viewportWidth - (isSidebarOpen && !isMobileViewport ? effectiveSidebarWidth : 0) - 48,
    );
    const mediaWidth = Math.min(960, Math.max(320, contentWidth * webtoonImageScale / 100));
    return Math.max(180, Math.round(mediaWidth / (4 / 5) + (webtoonShowInfo ? 64 : 0) + 16));
  }, [effectiveSidebarWidth, isMobileViewport, isSidebarOpen, viewportWidth, webtoonImageScale, webtoonShowInfo]);
  const globalWebtoonHeightIndex = useMemo(
    () => createGlobalHeightIndex(
      globalMediaSnapshot.total,
      globalWebtoonEstimatedHeight,
    ),
    [globalMediaSnapshot.total, globalWebtoonEstimatedHeight],
  );

  useEffect(() => {
    if (!isGlobalMediaMode || viewMode !== 'webtoon') {
      setGlobalWebtoonIndex(null);
      return;
    }
    const anchor = webtoonStartAnchor?.index;
    if (anchor !== undefined && anchor !== null && (webtoonStartAnchor?.requestId ?? 0) > 0) {
      setGlobalWebtoonIndex(anchor);
      setGlobalWebtoonRequestId(requestId => requestId === webtoonStartAnchor?.requestId ? requestId : webtoonStartAnchor?.requestId ?? requestId);
    } else if (globalWebtoonIndex === null && globalMediaSnapshot.total > 0) {
      setGlobalWebtoonIndex(0);
      setGlobalWebtoonRequestId(requestId => requestId === 0 ? 1 : requestId);
    }
  }, [globalMediaSnapshot.total, globalWebtoonIndex, isGlobalMediaMode, viewMode, webtoonStartAnchor]);

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
        if (memberMatches.length >= 1) return getArtistScopeKey(memberMatches[0]);
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
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isGridAtBottom, setIsGridAtBottom] = useState(false);
  const [gridScrollTopBottom, setGridScrollTopBottom] = useState<number | null>(null);
  const [gridScrollTopInlineEnd, setGridScrollTopInlineEnd] = useState<number | null>(null);
  const [isWebtoonHeaderHidden, setIsWebtoonHeaderHidden] = useState(false);
  const [isWebtoonToolbarOpen, setIsWebtoonToolbarOpen] = useState(false);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const previousMainScrollTopRef = useRef(0);
  const webtoonUserScrollIntentRef = useRef(false);
  const thumbnailPreloadRequestsRef = useRef(new Map<string, ImagePreloadHandle>());
  const [pendingMonthKey, setPendingMonthKey] = useState<string | null>(null);
  const pendingMonthScrollBehaviorRef = useRef<ScrollBehavior>('smooth');
  const [navigationMode, setNavigationMode] = useState<'idle' | 'click-scrolling' | 'scrubbing-preview' | 'scrubbing-settle' | 'scrubbing-commit'>('idle');
  const [destinationMonthKey, setDestinationMonthKey] = useState<string | null>(null);
  const [destinationGlobalIndex, setDestinationGlobalIndex] = useState<number | null>(null);
  const globalNavigationTransactionRef = useRef(createNavigationTransactionController());
  const globalNavigationActiveRef = useRef<NavigationTransaction | null>(null);
  const globalNavigationTargetRef = useRef<number | null>(null);
  const globalNavigationPinReleaseRef = useRef<(() => void) | null>(null);
  const globalScrubContainerRef = useRef<HTMLElement | null>(null);
  const globalScrubScrollRunnerRef = useRef<SmoothScrollRunner | null>(null);
  if (globalScrubScrollRunnerRef.current === null) {
    globalScrubScrollRunnerRef.current = createSmoothScrollRunner({
      getScrollTop: () => globalScrubContainerRef.current?.scrollTop ?? 0,
      setScrollTop: top => {
        const container = globalScrubContainerRef.current;
        if (container) container.scrollTop = top;
      },
      getViewportHeight: () => globalScrubContainerRef.current?.clientHeight ?? 1,
    }, {
      prefersReducedMotion: () => getMotionAwareScrollBehavior('smooth') === 'auto',
    });
  }
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
    fullscreenImageId: fullscreenIndex === null
      ? null
      : isGlobalMediaMode
        ? globalMediaSnapshot.get(fullscreenIndex).item?.image_id ?? null
        : images[fullscreenIndex]?.image_id ?? null,
    onFullscreenSelectionDeleted: () => setFullscreenIndex(null),
    refreshImages: refreshMediaData,
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
    const announcement = getLibraryJobAnnouncement(job, t, formatNumber);
    setLibraryAnnouncement(announcement);
    const variant: ToastVariant = job.status === 'completed'
      ? 'success'
      : job.status === 'cancelled'
      ? 'warning'
      : 'error';
    showToast(announcement, variant);
    libraryAnnouncementTimerRef.current = window.setTimeout(() => setLibraryAnnouncement(''), 8000);
  }, [formatNumber, showToast, t]);

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

  const handleSidebarWidthChange = useCallback((nextWidth: number) => {
    setSidebarWidthDraft(clampSidebarWidth(nextWidth, maxSidebarWidth));
  }, [maxSidebarWidth]);

  const handleSidebarWidthCommit = useCallback((nextWidth: number) => {
    const normalizedWidth = clampSidebarWidth(nextWidth, maxSidebarWidth);
    setSidebarWidthDraft(normalizedWidth);
    void persistWebConfigPatch({ sidebarWidth: normalizedWidth })
      .catch(error => console.error('Failed to save sidebarWidth setting:', error))
      .finally(() => setSidebarWidthDraft(null));
  }, [maxSidebarWidth, persistWebConfigPatch]);

  const handleEditModeChange = useCallback((edit: boolean) => {
    const nextEditMode = edit && viewMode !== 'webtoon';
    setIsEditMode(nextEditMode);
    clearSelectionError();
    if (!nextEditMode) handleDeselectAll();
  }, [clearSelectionError, handleDeselectAll, viewMode]);

  exitEditModeRef.current = () => handleEditModeChange(false);

  const handleToggleEditMode = useCallback(() => {
    setIsEditMode(current => {
      const next = viewMode !== 'webtoon' && !current;
      clearSelectionError();
      if (!next) handleDeselectAll();
      return next;
    });
  }, [clearSelectionError, handleDeselectAll, viewMode]);

  const handleNavigateFullscreen = useCallback((index: number) => {
    setFullscreenIndex(isGlobalMediaMode ? globalReaderRange.range.start + index : index);
  }, [globalReaderRange.range.start, isGlobalMediaMode, setFullscreenIndex]);

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

  navigationIndexGetterRef.current = getCurrentViewAnchorIndex;

  const followGlobalScrubScroll = useCallback((container: HTMLElement, targetTop: number, mode: 'follow' | 'settle') => {
    globalScrubContainerRef.current = container;
    const runner = globalScrubScrollRunnerRef.current;
    if (runner && !runner.isRunning()) {
      // A pointer can begin while a previous click's native smooth scroll is
      // still active. Reset that native animation before the rAF follower
      // takes ownership of scrollTop.
      container.scrollTo({ top: container.scrollTop, behavior: 'auto' });
    }
    runner?.setTarget(targetTop, mode);
  }, []);

  const stopGlobalScrubScroll = useCallback((snapToTarget = false) => {
    const runner = globalScrubScrollRunnerRef.current;
    runner?.stop({ snapToTarget: snapToTarget && runner.isRunning() });
    globalScrubContainerRef.current = null;
  }, []);

  const cancelMonthNavigation = useCallback(() => {
    const scrub = scrubSettleRef.current;
    if (scrub.timer !== null) window.clearTimeout(scrub.timer);
    scrub.timer = null;
    scrub.cacheKey = null;
    scrub.active = false;
    scrub.targetKey = null;
    scrub.targetPage = null;
    if (globalNavigationActiveRef.current) {
      globalNavigationTransactionRef.current.cancel(globalNavigationActiveRef.current);
      globalNavigationActiveRef.current = null;
    }
    stopGlobalScrubScroll();
    globalNavigationPinReleaseRef.current?.();
    globalNavigationPinReleaseRef.current = null;
    globalNavigationTargetRef.current = null;
    setPendingMonthKey(null);
    setDestinationMonthKey(null);
    setDestinationGlobalIndex(null);
    setNavigationMode('idle');
  }, [stopGlobalScrubScroll]);

  navigationCancelRef.current = cancelMonthNavigation;

  useEffect(() => () => {
    stopGlobalScrubScroll();
  }, [stopGlobalScrubScroll]);

  const handleCloseFullscreen = useCallback(() => {
    closeViewerFullscreen();
    setIsWebtoonToolbarOpen(false);
  }, [closeViewerFullscreen]);

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
    void globalMediaWindow.ensure({ start: 0, end: GLOBAL_MEDIA_CHUNK_SIZE }, 'viewport').catch(error => {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        console.error('Failed to load initial global media range:', error);
      }
    });
  }, [globalMediaWindow, isWebConfigReady]);

  const prefetchArtist = useCallback((artistKey: string | null) => {
    if (LEGACY_PAGINATION_ENABLED || artistKey === selectedArtist) return;
    void prefetchGlobalMediaQuery(
      { ...globalMediaQuery, selectedArtist: artistKey },
      { start: 0, end: GLOBAL_MEDIA_CHUNK_SIZE },
      'scrub-preview',
    ).catch(() => undefined);
  }, [globalMediaQuery, prefetchGlobalMediaQuery, selectedArtist]);

  const monthIndexItems = useMemo<MonthJumpItem[]>(() => {
    if (isGlobalMediaMode && globalLayout) {
      return globalLayout.months.map(month => ({
        key: month.key,
        label: month.label,
        count: month.imageCount,
        offset: month.offset,
      }));
    }
    return sortMonthIndexItems(availableMonthIndexItems, sortMode);
  }, [availableMonthIndexItems, globalLayout, isGlobalMediaMode, sortMode]);

  useEffect(() => {
    const handleLibraryDataChanged = () => {
      clearImagePageCache();
      void refreshDirectoryMetadata().catch(err => console.error('Failed to refresh directory metadata:', err));
      void refreshMediaData().catch(err => console.error('Failed to refresh global media data:', err));
    };

    window.addEventListener('web-viewer-library-data-changed', handleLibraryDataChanged);
    return () => window.removeEventListener('web-viewer-library-data-changed', handleLibraryDataChanged);
  }, [clearImagePageCache, globalMediaWindow, refreshDirectoryMetadata, refreshMediaData]);

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
    if (isGlobalMediaMode && globalMediaSnapshot.revision) {
      const start = Math.max(0, item.offset ?? 0);
      const range = { start, end: start + GLOBAL_MEDIA_CHUNK_SIZE };
      void globalMediaWindow.ensure(range, 'scrub-preview').catch(() => undefined);
      return;
    }

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
  }, [applyScrubPreviewPage, buildImageRequestParams, cancelSpeculativePageRequests, currentPage, globalMediaSnapshot.revision, globalMediaWindow, hasCachedPage, isGlobalMediaMode, loadImagePage, navigationMode, preloadThumbnail, prefetchCurrentPageWindow, resolveMonthTarget, thumbnailSize]);

  const handleJumpToMonth = useCallback((item: MonthJumpItem, options: MonthJumpNavigationOptions = {}) => {
    if (isGlobalMediaMode && globalLayout && globalMediaSnapshot.revision) {
      const container = getGalleryScrollContainer();
      const monthIndex = globalLayout.months.findIndex(month => month.key === item.key);
      if (!container || monthIndex < 0) return;

      const lowerMonth = globalLayout.months[monthIndex];
      const fractionalIndex = options.fractionalIndex;
      const clampedFractionalIndex = fractionalIndex === undefined
        ? monthIndex
        : Math.max(0, Math.min(globalLayout.months.length - 1, fractionalIndex));
      const lowerIndex = Math.floor(clampedFractionalIndex);
      const upperIndex = Math.min(globalLayout.months.length - 1, lowerIndex + 1);
      const fraction = clampedFractionalIndex - lowerIndex;
      const targetTop = globalLayout.months[lowerIndex].top
        + (globalLayout.months[upperIndex].top - globalLayout.months[lowerIndex].top) * fraction;
      const currentTop = Math.max(0, container.scrollTop);
      const activeTransaction = globalNavigationActiveRef.current;
      const transaction = activeTransaction && options.scrubbing
        ? activeTransaction
        : globalNavigationTransactionRef.current.begin({ currentTop, targetTop });
      globalNavigationActiveRef.current = transaction;
      globalNavigationTargetRef.current = targetTop;
      const viewportRange = globalLayout.getViewportRange(targetTop, targetTop + Math.max(1, container.clientHeight), 0, groupMangaPosts);
      const targetRange = {
        start: Math.max(0, Math.min(item.offset ?? lowerMonth.offset, viewportRange.start)),
        end: Math.max(viewportRange.end, (item.offset ?? lowerMonth.offset) + GLOBAL_MEDIA_CHUNK_SIZE),
      };
      globalNavigationPinReleaseRef.current?.();
      globalNavigationPinReleaseRef.current = globalMediaWindow.pin('month-navigation', targetRange);
      const request = globalMediaWindow.ensure(
        targetRange,
        options.previewOnly ? 'scrub-preview' : 'month-jump',
      ).catch(() => undefined);
      const commitJump = () => {
        // Scrubbing is allowed to reverse direction. The transaction
        // controller intentionally accepts only monotonic commits for async
        // jumps, so live pointer targets use the latest position directly.
        const nextTop = options.scrubbing
          ? targetTop
          : globalNavigationTransactionRef.current.commit(transaction, targetTop);
        if (nextTop === null) return;
        if (options.scrubbing) {
          followGlobalScrubScroll(container, nextTop, options.previewOnly ? 'follow' : 'settle');
        } else {
          stopGlobalScrubScroll();
          if (Math.abs(nextTop - container.scrollTop) > 0.5) {
            container.scrollTo({
              top: nextTop,
              behavior: getMotionAwareScrollBehavior(options.behavior ?? 'smooth'),
            });
          }
        }
        setPendingMonthKey(null);
        setDestinationMonthKey(item.key);
        setDestinationGlobalIndex(item.offset ?? lowerMonth.offset);
        setNavigationMode(options.scrubbing
          ? options.previewOnly ? 'scrubbing-preview' : 'scrubbing-commit'
          : 'click-scrolling');
      };

      // The layout index already provides the exact destination geometry.
      // Start moving immediately and let the range request fill cards or
      // dominant-color placeholders while the scroll is in progress.
      void request;
      commitJump();
      return;
    }

    const target = resolveMonthTarget(item);
    const isScrubPreview = options.scrubbing === true && options.previewOnly === true;
    scrubSettleRef.current.active = isScrubPreview;
    scrubSettleRef.current.targetKey = isScrubPreview ? item.key : null;
    scrubSettleRef.current.targetPage = isScrubPreview ? target.page : null;
    const preserveCacheKey = buildImageRequestParams(target.page).toString();
    supersedeNavigationPageRequests(preserveCacheKey);
    cancelSpeculativePageRequests(preserveCacheKey);
    const behavior = getMotionAwareScrollBehavior(options.behavior ?? 'smooth');
    pendingMonthScrollBehaviorRef.current = behavior;
    setPendingMonthKey(item.key);
    setDestinationMonthKey(item.key);
    setDestinationGlobalIndex(target.localIndex);
    setNavigationMode(isScrubPreview ? 'scrubbing-preview' : options.scrubbing ? 'scrubbing-commit' : 'click-scrolling');

    // The month ruler is navigation, not another filter. The API calculates
    // each month's first offset after applying the current artist/search/month
    // filters and sort mode, so changing page keeps those filters intact.
    // Begin moving on the currently mounted page immediately. Without this
    // approach scroll, a cold cross-page request leaves the viewport frozen
    // until the destination page arrives, then starts the smooth animation.
    const container = getGalleryScrollContainer();
    if (container) {
      const approachTop = getCrossPageMonthApproachTop({
        currentPage,
        targetPage: target.page,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
      });
      if (approachTop !== null && Math.abs(container.scrollTop - approachTop) > 0.5) {
        container.scrollTo({ top: approachTop, behavior });
      }
    }
    setCurrentPage(target.page);
  }, [buildImageRequestParams, cancelSpeculativePageRequests, currentPage, followGlobalScrubScroll, getGalleryScrollContainer, globalLayout, globalMediaSnapshot, globalMediaWindow, groupMangaPosts, isGlobalMediaMode, resolveMonthTarget, stopGlobalScrubScroll, supersedeNavigationPageRequests]);

  const handleMonthNavigationChange = useCallback((phase: MonthNavigationPhase, item?: MonthJumpItem) => {
    if (isGlobalMediaMode) {
      if (phase === 'scrub-start' && item) {
        handleJumpToMonth(item, { behavior: 'auto', scrubbing: true, previewOnly: true });
        return;
      }
      if (phase === 'commit' && item) {
        handleJumpToMonth(item, { behavior: 'auto', scrubbing: true, previewOnly: false });
        return;
      }
      if (phase === 'cancel' || phase === 'end') {
        cancelMonthNavigation();
        return;
      }
      if (phase === 'click-start' && item) {
        setNavigationMode('click-scrolling');
        setDestinationMonthKey(item.key);
        setDestinationGlobalIndex(item.offset ?? null);
      }
      return;
    }

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
  }, [buildImageRequestParams, cancelMonthNavigation, cancelSpeculativePageRequests, handleJumpToMonth, isGlobalMediaMode, resolveMonthTarget, supersedeNavigationPageRequests]);

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
    // A pointer can remain held while the preview target is stationary. Keep
    // the smoother and its target pin alive until MonthQuickNav emits commit
    // or cancel; a scroll-settle timer must not end a live drag by itself.
    if (navigationMode === 'idle' || navigationMode === 'scrubbing-preview' || pendingMonthKey) return undefined;
    const container = mainScrollRef.current?.querySelector<HTMLElement>('[data-gallery-scroll-container="true"]')
      ?? mainScrollRef.current;
    if (!container) return undefined;

    let settleTimer: number | null = null;
    const finish = () => {
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      if (isGlobalMediaMode) {
        stopGlobalScrubScroll(true);
        if (globalNavigationActiveRef.current) {
          globalNavigationTransactionRef.current.cancel(globalNavigationActiveRef.current);
          globalNavigationActiveRef.current = null;
        }
        globalNavigationPinReleaseRef.current?.();
        globalNavigationPinReleaseRef.current = null;
        globalNavigationTargetRef.current = null;
      }
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
  }, [globalNavigationTransactionRef, isGlobalMediaMode, navigationMode, pendingMonthKey, stopGlobalScrubScroll]);

  React.useLayoutEffect(() => {
    // Do not poll the DOM while a cross-page request is in flight. The old
    // page remains mounted during that interval, so a requestAnimationFrame
    // loop would spin once per frame waiting for a section that cannot exist
    // yet and compete with the navigation response.
    // GlobalMediaWindow resolves the month anchor from its dense layout index
    // and owns the scroll transaction directly; this legacy fallback must not
    // become a second scroll owner after the global range is ready.
    if (isGlobalMediaMode || !pendingMonthKey || isLoadingImages || images.length === 0) return undefined;

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

      if (shouldAlign && (frameCount === 0 || behavior === 'auto')) {
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

      const minStable = behavior === 'auto' ? 1 : 4;
      const maxFrames = behavior === 'auto' ? 6 : 45;
      if (stableFrames >= minStable || frameCount >= maxFrames) {
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
  }, [getGalleryScrollContainer, images, isGlobalMediaMode, isLoadingImages, pendingMonthKey]);

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
    void persistWebConfigPatch(patch).catch(error => {
      console.error('Failed to save webtoon setting:', error);
    });
  }, [persistWebConfigPatch]);

  const handlePreferredViewerModeChange = useCallback((nextMode: ViewerMode) => {
    preferredViewerModeRef.current = nextMode;
    void persistWebConfigPatch({ defaultViewMode: nextMode }).catch(error => {
      console.error('Failed to save defaultViewMode setting:', error);
    });
  }, [persistWebConfigPatch]);

  const handleViewModeChange = useCallback((requestedMode: ViewMode) => {
    if (requestedMode === 'fullscreen' || requestedMode === 'webtoon') {
      handlePreferredViewerModeChange(requestedMode);
    }
    changeViewerMode(requestedMode);
  }, [
    changeViewerMode,
    handlePreferredViewerModeChange,
  ]);

  const handleReturnToGrid = useCallback(() => {
    returnViewerToGrid();
    setIsWebtoonToolbarOpen(false);
  }, [returnViewerToGrid]);

  const handleOpenImage = useCallback((index: number) => {
    openViewerImage(index);
  }, [openViewerImage]);

  const prefetchReader = useCallback(() => {
    const loader = preferredViewerModeRef.current === 'webtoon'
      ? loadWebtoonFeed
      : webConfig.fullscreenPageLayout === 'spread' && !isMobileViewport
        ? loadSpreadViewer
        : loadFullscreenViewer;
    void loader().catch(error => {
      console.debug('Reader prefetch failed:', error);
    });
  }, [isMobileViewport, webConfig.fullscreenPageLayout]);

  const handleFullscreenPageLayoutChange = useCallback((layout: WebConfig['fullscreenPageLayout']) => {
    void persistWebConfigPatch({ fullscreenPageLayout: layout }).catch(error => {
      console.error('Failed to save fullscreenPageLayout setting:', error);
    });
  }, [persistWebConfigPatch]);

  const handleFullscreenReadingDirectionChange = useCallback((direction: WebConfig['fullscreenReadingDirection']) => {
    void persistWebConfigPatch({ fullscreenReadingDirection: direction }).catch(error => {
      console.error('Failed to save fullscreenReadingDirection setting:', error);
    });
  }, [persistWebConfigPatch]);

  const handleFullscreenSpreadPairingChange = useCallback((pairing: WebConfig['fullscreenSpreadPairing']) => {
    void persistWebConfigPatch({ fullscreenSpreadPairing: pairing }).catch(error => {
      console.error('Failed to save fullscreenSpreadPairing setting:', error);
    });
  }, [persistWebConfigPatch]);

  const handleThemeChange = useCallback((nextTheme: ThemeMode) => {
    void persistWebConfigPatch({ webTheme: nextTheme }).catch(err => {
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
    void persistWebConfigPatch({ groupMangaPosts: !groupMangaPosts }).catch(err => {
      console.error('Failed to save groupMangaPosts setting:', err);
    });
  }, [groupMangaPosts, persistWebConfigPatch]);

  const handleToggleBlur = useCallback(() => {
    void persistWebConfigPatch({ blurEnabled: !blurEnabled }).catch(err => {
      console.error('Failed to save blurEnabled setting:', err);
    });
  }, [blurEnabled, persistWebConfigPatch]);

  const handleFullscreenToolbarSimpleModeChange = useCallback((simpleMode: boolean) => {
    void persistWebConfigPatch({ fullscreenToolbarSimpleMode: simpleMode }).catch(err => {
      console.error('Failed to save fullscreenToolbarSimpleMode setting:', err);
    });
  }, [fullscreenToolbarSimpleMode, persistWebConfigPatch]);

  const handleFullscreenShowToolbarChange = useCallback((showToolbar: boolean) => {
    void persistWebConfigPatch({ fullscreenShowToolbar: showToolbar }).catch(error => {
      console.error('Failed to save fullscreenShowToolbar setting:', error);
    });
  }, [fullscreenShowToolbar, persistWebConfigPatch]);

  const handleFullscreenShowFilmstripChange = useCallback((showFilmstrip: boolean) => {
    void persistWebConfigPatch({ fullscreenShowThumbnails: showFilmstrip }).catch(error => {
      console.error('Failed to save fullscreenShowThumbnails setting:', error);
    });
  }, [fullscreenShowThumbnails, persistWebConfigPatch]);

  const handleFullscreenCheckerboardChange = useCallback((enabled: boolean) => {
    void persistWebConfigPatch({ fullscreenShowCheckerboard: enabled }).catch(error => {
      console.error('Failed to save fullscreenShowCheckerboard setting:', error);
    });
  }, [persistWebConfigPatch]);

  const handleFullscreenZoomModeChange = useCallback((mode: WebConfig['fullscreenZoomMode']) => {
    void persistWebConfigPatch({ fullscreenZoomMode: mode }).catch(error => {
      console.error('Failed to save fullscreenZoomMode setting:', error);
    });
  }, [persistWebConfigPatch]);

  const displayArtists = artists;
  const displayImages = images;
  const mediaTotalImages = globalMediaSnapshot.revision
    ? globalMediaSnapshot.total
    : totalImages;
  const readerImages = isGlobalMediaMode && fullscreenIndex !== null
    ? globalReaderRange.images
    : displayImages;
  const readerIndex = isGlobalMediaMode && fullscreenIndex !== null
    ? globalReaderRange.currentIndex
    : fullscreenIndex ?? 0;
  const readerPageOffset = isGlobalMediaMode && fullscreenIndex !== null
    ? globalReaderRange.range.start
    : Math.max(0, (currentPage - 1) * itemsPerPage);
  const readerIsReady = !isGlobalMediaMode || fullscreenIndex === null || globalReaderRange.isReady;
  const webtoonGlobalMode = isGlobalMediaMode
    && globalWebtoonIndex !== null
    && globalWebtoonRange.isReady;
  const webtoonImages = webtoonGlobalMode ? globalWebtoonRange.images : displayImages;
  const webtoonPageOffset = webtoonGlobalMode
    ? globalWebtoonRange.range.start
    : Math.max(0, (currentPage - 1) * itemsPerPage);
  const webtoonInitialIndex = webtoonGlobalMode
    ? globalWebtoonRange.currentIndex
    : webtoonStartAnchor?.index ?? null;
  const handleGlobalWebtoonIndexChange = useCallback((index: number, options: { align?: boolean } = {}) => {
    if (!webtoonGlobalMode) return;
    const safeIndex = Math.max(0, Math.min(Math.max(0, mediaTotalImages - 1), Math.floor(index)));
    setGlobalWebtoonIndex(current => current === safeIndex ? current : safeIndex);
    if (options.align) setGlobalWebtoonRequestId(requestId => requestId + 1);
  }, [mediaTotalImages, webtoonGlobalMode]);

  // Group images into WorkGroups for current page
  const allWorkGroups = useMemo(() => {
    return groupImagesIntoWorkGroups(readerImages);
  }, [readerImages]);

  // Current Fullscreen Active Work Group & Item Index
  const currentFullscreenItem = fullscreenIndex !== null ? readerImages[readerIndex] : null;
  const currentFullscreenGroup = useMemo(() => {
    if (!currentFullscreenItem) return null;
    return allWorkGroups.find(g => g.items.some(it => it.save_name === currentFullscreenItem.save_name)) || null;
  }, [currentFullscreenItem, allWorkGroups]);

  const handleNavigateNextWork = () => {
    if (isGlobalMediaMode) {
      if (fullscreenIndex !== null && fullscreenIndex < mediaTotalImages - 1) {
        setFullscreenIndex(fullscreenIndex + 1);
      }
      return;
    }
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
    if (isGlobalMediaMode) {
      if (fullscreenIndex !== null && fullscreenIndex > 0) {
        setFullscreenIndex(fullscreenIndex - 1);
      }
      return;
    }
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
    const globalIdx = isGlobalMediaMode
      ? globalMediaSnapshot.getLoaded?.().find(slot => slot.item?.save_name === targetItem?.save_name)?.index ?? -1
      : images.findIndex(x => x.save_name === targetItem?.save_name);
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
      if (!data.job) throw new Error(t('common.backgroundUpdateFailed'));
      startLibraryJob(data.job);
      setLibraryAnnouncement(t('common.backgroundUpdateStarted'));
    } catch (error) {
      setLibraryAnnouncement(error instanceof Error ? error.message : t('common.backgroundUpdateFailed'));
    }
  }, [currentArtist, startLibraryJob, t]);

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
    void refreshMediaData().catch(err => console.error('Failed to refresh media after artist visibility action:', err));
  }, [clearImagePageCache, refreshDirectoryMetadata, refreshMediaData]);

  const handleOpenRecycleBin = useCallback(() => {
    setIsSettingsOpen(false);
    setIsArtistSettingsOpen(false);
    setIsRecycleBinOpen(true);
  }, []);

  const handleSettingsSaved = useCallback((savedConfig?: Partial<WebConfig>) => {
    if (savedConfig) {
      replaceConfig({ ...webConfig, ...savedConfig });
      setCurrentPage(1);
    } else {
      loadWebConfig()
        .then(() => setCurrentPage(1))
        .catch(err => console.error('Failed to refresh web-config:', err));
    }

    void refreshMediaData().catch(err => console.error('Failed to refresh media after settings save:', err));
    // Also refetch artists and months in case directory rescan indexed new files.
    void refreshDirectoryMetadata().catch(err => console.error(err));
  }, [loadWebConfig, refreshDirectoryMetadata, refreshMediaData, replaceConfig, webConfig]);

  const handleOnboardingComplete = useCallback((config: WebConfig) => {
    replaceConfig(config);
  }, [replaceConfig]);

  if (!isWebConfigReady) {
    return (
      <div className="app-root__loading" aria-busy="true">
        {t('common.loadingConfig')}
      </div>
    );
  }

  if (!webConfig.onboardingCompleted) {
    return <FirstUseOnboarding initialConfig={webConfig} onComplete={handleOnboardingComplete} />;
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
        totalCount={mediaTotalImages}
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
            aria-label={t('filters.closeSidebar')}
            title={t('filters.closeSidebar')}
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
          onPrefetchArtist={prefetchArtist}
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
            totalImages={mediaTotalImages}
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            thumbnailSize={thumbnailSize}
            onPageChange={handlePageChange}
            onLoadPage={loadSelectionPage}
            onItemsPerPageChange={(num) => {
              void persistWebConfigPatch({ itemsPerPage: num }).catch(error => {
                console.error('Failed to save itemsPerPage setting:', error);
              });
            }}
            sortMode={sortMode}
            onSortModeChange={(mode) => setSortMode(mode)}
            isEditMode={isEditMode}
            onToggleEditMode={handleToggleEditMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelectImage}
            onSetSelection={setSelectedImages}
            onReplaceSelection={replaceSelectedImages}
            onOpenFullscreen={handleOpenImage}
            onPrefetchReader={prefetchReader}
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
            isLoading={isLoadingImages || isGlobalMediaLoading}
             isArtistLoading={isLoadingImages && selectedArtist !== null}
            isArtistUpdating={isArtistUpdating}
            onRequestArtistUpdate={handleRequestArtistUpdate}
            onOpenArtistSettings={() => setIsArtistSettingsOpen(true)}
            blurEnabled={blurEnabled}
            demoMode={demoMode}
            globalMediaWindow={isGlobalMediaMode ? globalMediaWindow : undefined}
            globalMediaSnapshot={isGlobalMediaMode ? globalMediaSnapshot : undefined}
            globalLayout={isGlobalMediaMode ? globalLayout ?? undefined : undefined}
          />
          )}

          {viewMode === 'webtoon' && (
            <LazyModuleBoundary>
              <React.Suspense fallback={<LazyModuleFallback />}>
                <LazyWebtoonFeed
                  images={webtoonImages}
                  blurEnabled={blurEnabled}
                  demoMode={demoMode}
                  initialIndex={webtoonInitialIndex}
                  initialRequestId={webtoonGlobalMode
                    ? globalWebtoonRequestId
                    : webtoonStartAnchor?.requestId ?? 0}
                  thumbnailSize={thumbnailSize}
                  imageScale={webtoonImageScale}
                  imageGap={webtoonImageGap}
                  showInfo={webtoonShowInfo}
                  showPageNumber={webtoonShowPageNumber}
                  showThumbnails={isMobileViewport ? false : webtoonShowThumbnails}
                  groupMangaPosts={groupMangaPosts}
                  pageOffset={webtoonPageOffset}
                  totalImages={mediaTotalImages}
                  currentPage={webtoonGlobalMode ? 1 : currentPage}
                  totalPages={webtoonGlobalMode ? 1 : Math.max(1, Math.ceil(totalImages / Math.max(1, itemsPerPage)))}
                  mobileToolbarOpen={isWebtoonToolbarOpen}
                  isMobileViewport={isMobileViewport}
                  videoMuted={webConfig.videoMuted}
                  videoVolume={webConfig.videoVolume}
                  videoAutoplay={webConfig.videoAutoplay}
                  onPageChange={handleWebtoonPageChange}
                  onSettingsChange={handleWebtoonSettingsChange}
                  onVideoPreferenceChange={handleVideoPreferenceChange}
                  isGlobalMode={webtoonGlobalMode}
                  globalRangeStart={webtoonGlobalMode ? globalWebtoonRange.range.start : 0}
                  globalHeightIndex={webtoonGlobalMode ? globalWebtoonHeightIndex : undefined}
                  onGlobalIndexChange={handleGlobalWebtoonIndexChange}
                />
              </React.Suspense>
            </LazyModuleBoundary>
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
          aria-label={t('common.scrollToTop')}
          title={t('common.scrollToTop')}
        >
          <ArrowUp className="h-5 w-5" aria-hidden="true" />
        </IconButton>
      )}

      {/* Manga Group Preview Modal */}
      {isMangaModalOpen && activeWorkGroup && (
        <LazyModuleBoundary>
          <React.Suspense fallback={<LazyModuleFallback />}>
            <LazyMangaGroupModal
              isOpen={isMangaModalOpen}
              workGroup={activeWorkGroup}
              onClose={() => setIsMangaModalOpen(false)}
              onSelectImage={handleSelectMangaPage}
              thumbnailSize={thumbnailSize}
              blurEnabled={blurEnabled}
              demoMode={demoMode}
            />
          </React.Suspense>
        </LazyModuleBoundary>
      )}

      {/* Keep one previewer instance for the single-image reader mode. */}
      {(fullscreenIndex !== null || viewMode === 'fullscreen') && (isGlobalMediaMode ? mediaTotalImages > 0 : images.length > 0) && (
        <LazyModuleBoundary>
          <React.Suspense fallback={<LazyModuleFallback />}>
            {!readerIsReady ? (
              <LazyModuleFallback />
            ) : webConfig.fullscreenPageLayout === 'spread' && !isMobileViewport ? (
              <LazySpreadViewer
                key="spread-viewer"
                images={readerImages}
                currentIndex={readerIndex}
                onClose={handleCloseFullscreen}
                onNavigate={handleNavigateFullscreen}
                onNavigateNextRange={isGlobalMediaMode && fullscreenIndex !== null && fullscreenIndex < mediaTotalImages - 1
                  ? handleNavigateNextWork
                  : undefined}
                onNavigatePrevRange={isGlobalMediaMode && fullscreenIndex !== null && fullscreenIndex > 0
                  ? handleNavigatePrevWork
                  : undefined}
                thumbnailSize={thumbnailSize}
                blurEnabled={blurEnabled}
                demoMode={demoMode}
                fullscreenPageLayout={webConfig.fullscreenPageLayout}
                fullscreenReadingDirection={webConfig.fullscreenReadingDirection}
                fullscreenSpreadPairing={webConfig.fullscreenSpreadPairing}
                onPageLayoutChange={handleFullscreenPageLayoutChange}
                onReadingDirectionChange={handleFullscreenReadingDirectionChange}
                onSpreadPairingChange={handleFullscreenSpreadPairingChange}
                showToolbarByDefault={fullscreenShowToolbar}
                onShowToolbarChange={handleFullscreenShowToolbarChange}
                showFilmstripByDefault={fullscreenShowThumbnails}
                onShowFilmstripChange={handleFullscreenShowFilmstripChange}
                fullscreenShowCheckerboard={webConfig.fullscreenShowCheckerboard}
                onCheckerboardChange={handleFullscreenCheckerboardChange}
                simpleToolbar={fullscreenToolbarSimpleMode}
                onSimpleToolbarChange={handleFullscreenToolbarSimpleModeChange}
                globalMediaMode={isGlobalMediaMode}
                activeMode="fullscreen"
                onChangeMode={handleViewModeChange}
                groupMangaPosts={groupMangaPosts}
                onToggleGroupMangaPosts={handleToggleGroupMangaPosts}
                onToggleBlur={handleToggleBlur}
                onDeleteCurrent={promptDeleteSingle}
                videoMuted={webConfig.videoMuted}
                videoVolume={webConfig.videoVolume}
                videoAutoplay={webConfig.videoAutoplay}
                videoSeekSeconds={webConfig.fullscreenVideoSeekSeconds}
                videoHoldPlaybackRate={webConfig.fullscreenVideoHoldPlaybackRate}
                onVideoPreferenceChange={handleVideoPreferenceChange}
                pageOffset={readerPageOffset}
                totalImages={mediaTotalImages}
              />
            ) : (
              <LazyFullscreenViewer
                key="fullscreen-viewer"
                images={readerImages}
                currentIndex={readerIndex}
                onClose={handleCloseFullscreen}
                onNavigate={handleNavigateFullscreen}
                activeMode="fullscreen"
                onChangeMode={handleViewModeChange}
                fullscreenPageLayout={isMobileViewport ? 'single' : webConfig.fullscreenPageLayout}
                onPageLayoutChange={handleFullscreenPageLayoutChange}
                fullscreenReadingDirection={webConfig.fullscreenReadingDirection}
                onReadingDirectionChange={handleFullscreenReadingDirectionChange}
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
                fullscreenShowCheckerboard={webConfig.fullscreenShowCheckerboard}
                onCheckerboardChange={handleFullscreenCheckerboardChange}
                fullscreenZoomMode={webConfig.fullscreenZoomMode}
                onZoomModeChange={handleFullscreenZoomModeChange}
                videoSeekSeconds={webConfig.fullscreenVideoSeekSeconds}
                videoHoldPlaybackRate={webConfig.fullscreenVideoHoldPlaybackRate}
                videoMuted={webConfig.videoMuted}
                videoVolume={webConfig.videoVolume}
                videoAutoplay={webConfig.videoAutoplay}
                onVideoPreferenceChange={handleVideoPreferenceChange}
                pageOffset={readerPageOffset}
                totalImages={mediaTotalImages}
              />
            )}
          </React.Suspense>
        </LazyModuleBoundary>
      )}

      {/* Batch Edit Toolbar */}
      {isEditMode && (
        <BatchEditToolbar
          selectedCount={selectedIds.size}
          totalCount={mediaTotalImages}
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
        title={t('common.moveToRecycleBinConfirmTitle')}
        message={t('common.moveToRecycleBinConfirmMessage', { count: formatNumber(deleteTargets.length) })}
        confirmLabel={t('common.moveToRecycleBin')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmExecuteDelete}
        onCancel={() => setShowConfirmModal(false)}
      />

      <ConfirmModal
        isOpen={isArtistUpdateNoticeOpen}
        title={t('common.backgroundUpdateTitle')}
        message={t('common.backgroundUpdateMessage')}
        confirmLabel={t('common.startBackgroundUpdate')}
        cancelLabel={t('common.later')}
        variant="primary"
        onConfirm={() => void handleStartArtistUpdate()}
        onCancel={() => setIsArtistUpdateNoticeOpen(false)}
      />

      {/* Settings Modal */}
      {isSettingsOpen && (
        <LazyModuleBoundary>
          <React.Suspense fallback={<LazyModuleFallback />}>
            <LazySettingsModal
              isOpen={isSettingsOpen}
              onClose={() => setIsSettingsOpen(false)}
              onSettingsSaved={handleSettingsSaved}
              onArtistVisibilityChanged={handleArtistVisibilityChanged}
              onOpenRecycleBin={handleOpenRecycleBin}
              artists={displayArtists}
            />
          </React.Suspense>
        </LazyModuleBoundary>
      )}

      {isArtistSettingsOpen && (
        <LazyModuleBoundary>
          <React.Suspense fallback={<LazyModuleFallback />}>
            <LazyArtistSettingsModal
              isOpen={isArtistSettingsOpen}
              artist={currentArtist}
              onClose={() => setIsArtistSettingsOpen(false)}
              onArtistChanged={handleArtistChanged}
              onArtistMetadataChanged={handleArtistMetadataChanged}
            />
          </React.Suspense>
        </LazyModuleBoundary>
      )}

      {isRecycleBinOpen && (
        <LazyModuleBoundary>
          <React.Suspense fallback={<LazyModuleFallback />}>
            <LazyRecycleBinModal
              isOpen={isRecycleBinOpen}
              onClose={() => setIsRecycleBinOpen(false)}
            />
          </React.Suspense>
        </LazyModuleBoundary>
      )}

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
