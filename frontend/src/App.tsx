import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Artist, LibraryJob, MonthItem, ImageItem, SortMode, ViewMode, ThemeMode, WorkGroup, WebConfig, DEFAULT_WEB_CONFIG } from './types';
import { ArrowUp } from 'lucide-react';
import { groupImagesIntoWorkGroups } from './utils/grouping';
import { buildThumbnailUrl, normalizeWebConfig } from './utils/webConfig';
import { Header } from './components/Header';
import { MobileMenuDrawer } from './components/MobileMenuDrawer';
import { Sidebar } from './components/Sidebar';
import { GalleryGrid } from './components/GalleryGrid';
import { FullscreenViewer } from './components/FullscreenViewer';
import { WebtoonFeed } from './components/WebtoonFeed';
import { BatchEditToolbar } from './components/BatchEditToolbar';
import { ConfirmModal } from './components/ConfirmModal';
import { SettingsModal } from './components/SettingsModal';
import { ArtistSettingsModal } from './components/ArtistSettingsModal';
import { RecycleBinModal } from './components/RecycleBinModal';
import { MangaGroupModal } from './components/MangaGroupModal';
import { MonthJumpItem, MonthJumpNavigationOptions, MonthNavigationPhase } from './components/MonthQuickNav';
import { getScrollTopForElement, scrollElementToContainerStart, getTargetPageAndLocalIndex } from './utils/galleryLayout';
import { imageLoadScheduler, ImagePreloadHandle } from './utils/imageLoadScheduler';

const getMonthKeyFromDate = (dateStr?: string) => {
  const value = dateStr?.trim() ?? '';
  const match = value.match(/^(\d{4})[\-/](\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}`;

  const compactMatch = value.match(/^(\d{4})(\d{2})/);
  return compactMatch ? `${compactMatch[1]}-${compactMatch[2]}` : null;
};

const getMonthJumpItemsFromImages = (items: ImageItem[]): MonthJumpItem[] => {
  const counts = new Map<string, number>();
  items.forEach(item => {
    const monthKey = getMonthKeyFromDate(item.created_date);
    if (monthKey) counts.set(monthKey, (counts.get(monthKey) ?? 0) + 1);
  });

  return Array.from(counts, ([key, count]) => {
    const [year, month] = key.split('-');
    return {
      key,
      label: year && month ? `${year} 年 ${month} 月` : key,
      count,
    };
  });
};

const getMonthJumpItemsFromApi = (value: unknown): MonthJumpItem[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap(item => {
    if (!item || typeof item.month !== 'string') return [];
    const count = Number(item.count);
    if (!Number.isFinite(count) || count <= 0) return [];

    const [year, month] = item.month.split('-');
    const offset = Number(item.offset);
    return [{
      key: item.month,
      label: year && month ? `${year} 年 ${month.padStart(2, '0')} 月` : item.month,
      count,
      ...(Number.isFinite(offset) && offset >= 0 ? { offset } : {}),
    }];
  });
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

const isLibraryJobActive = (job: LibraryJob | null) => (
  !!job && ['queued', 'running', 'cancelling'].includes(job.status)
);

const isLibraryJobTerminal = (job: LibraryJob | null) => (
  !!job && ['completed', 'cancelled', 'failed', 'interrupted'].includes(job.status)
);

const getLibraryJobAnnouncement = (job: LibraryJob) => {
  if (job.status === 'completed') {
    return job.job_type === 'organize-thumbnail-cache'
      ? `縮圖整理完成，移出 ${job.cache_moved} 個縮圖。`
      : `圖片資料庫更新完成，新增 ${job.added} 張、更新 ${job.updated} 張。`;
  }
  if (job.status === 'cancelled') return '媒體資料庫工作已取消，已完成的資料仍會保留。';
  if (job.status === 'interrupted') return '媒體資料庫工作已中斷，請從設定重新執行。';
  return '媒體資料庫工作失敗，請從設定查看錯誤。';
};

interface ImagePageCacheEntry {
  images: ImageItem[];
  total: number;
  monthIndexItems: MonthJumpItem[];
}

interface ImagePageRequest {
  promise: Promise<ImagePageCacheEntry>;
  controller: AbortController;
  kind: 'navigation' | 'scrub-settle' | 'hover-prefetch';
}

interface FilterUrlState {
  selectedMonths: string[];
  selectedArtist: number | null;
  searchQuery: string;
}

const getFilterStateFromUrl = (): FilterUrlState => {
  if (typeof window === 'undefined') {
    return { selectedMonths: [], selectedArtist: null, searchQuery: '' };
  }

  const params = new URLSearchParams(window.location.search);
  const artistValue = params.get('artist_id');
  const artistId = artistValue === null ? NaN : Number(artistValue);
  const selectedArtist = Number.isInteger(artistId) && artistId !== 0 ? artistId : null;
  const selectedMonths = Array.from(new Set(
    params.getAll('month')
      .flatMap(value => value.split(','))
      .map(value => value.trim())
      .filter(Boolean),
  ));

  return {
    selectedMonths,
    selectedArtist,
    searchQuery: params.get('search') ?? '',
  };
};

const syncFilterStateToUrl = ({ selectedMonths, selectedArtist, searchQuery }: FilterUrlState) => {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  if (selectedMonths.length > 0) {
    url.searchParams.set('month', selectedMonths.join(','));
  } else {
    url.searchParams.delete('month');
  }

  if (selectedArtist !== null) {
    url.searchParams.set('artist_id', String(selectedArtist));
  } else {
    url.searchParams.delete('artist_id');
  }

  if (searchQuery) {
    url.searchParams.set('search', searchQuery);
  } else {
    url.searchParams.delete('search');
  }

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) {
    window.history.replaceState(window.history.state, '', nextUrl);
  }
};

const normalizeImagePage = (data: any): ImagePageCacheEntry => {
  if (Array.isArray(data)) {
    return {
      images: data,
      total: data.length,
      monthIndexItems: getMonthJumpItemsFromImages(data),
    };
  }

  const images = Array.isArray(data?.images) ? data.images : [];
  const total = Number(data?.total);

  return {
    images,
    total: Number.isFinite(total) ? total : images.length,
    monthIndexItems: Array.isArray(data?.months)
      ? getMonthJumpItemsFromApi(data.months)
      : getMonthJumpItemsFromImages(images),
  };
};

export const App: React.FC = () => {
  const [theme, setTheme] = useState<ThemeMode>(DEFAULT_WEB_CONFIG.webTheme);
  // View mode is intentionally session-only. A page refresh should always
  // start in the grid instead of reopening fullscreen or webtoon mode.
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => (
    typeof window === 'undefined' ? true : window.innerWidth > 640
  ));
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isArtistSettingsOpen, setIsArtistSettingsOpen] = useState(false);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  const [isArtistUpdateNoticeOpen, setIsArtistUpdateNoticeOpen] = useState(false);

  // Group Mode & Manga Modal States
  const [groupMangaPosts, setGroupMangaPosts] = useState(DEFAULT_WEB_CONFIG.groupMangaPosts);
  const [preloadImageCount, setPreloadImageCount] = useState(DEFAULT_WEB_CONFIG.preloadImageCount);
  const [thumbnailSize, setThumbnailSize] = useState(DEFAULT_WEB_CONFIG.thumbnailSize);
  const [activeWorkGroup, setActiveWorkGroup] = useState<WorkGroup | null>(null);
  const [isMangaModalOpen, setIsMangaModalOpen] = useState(false);
  const [blurEnabled, setBlurEnabled] = useState(DEFAULT_WEB_CONFIG.blurEnabled);
  const [isWebConfigReady, setIsWebConfigReady] = useState(false);
  const [libraryJob, setLibraryJob] = useState<LibraryJob | null>(null);
  const [libraryAnnouncement, setLibraryAnnouncement] = useState('');

  // Data States
  const [artists, setArtists] = useState<Artist[]>([]);
  const [isLoadingArtists, setIsLoadingArtists] = useState(false);
  const [months, setMonths] = useState<MonthItem[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [availableMonthIndexItems, setAvailableMonthIndexItems] = useState<MonthJumpItem[]>([]);

  // Filter States
  const [selectedMonths, setSelectedMonths] = useState<string[]>(() => getFilterStateFromUrl().selectedMonths);
  const [selectedArtist, setSelectedArtist] = useState<number | null>(() => getFilterStateFromUrl().selectedArtist);
  const [searchQuery, setSearchQuery] = useState(() => getFilterStateFromUrl().searchQuery);

  const applyArtistList = useCallback((data: unknown) => {
    const nextArtists = Array.isArray(data) ? data as Artist[] : [];
    setArtists(nextArtists);
    setSelectedArtist(current => {
      if (current === null || nextArtists.length === 0) return current;
      return nextArtists.some(artist => Number(artist.member_id) === current) ? current : null;
    });
  }, []);

  const refreshDirectoryMetadata = useCallback(async () => {
    setIsLoadingArtists(true);
    try {
      const [artistsResponse, monthsResponse] = await Promise.all([
        fetch('/api/artists', { cache: 'no-store' }),
        fetch('/api/months', { cache: 'no-store' }),
      ]);
      if (!artistsResponse.ok) throw new Error(`artists request failed: ${artistsResponse.status}`);
      if (!monthsResponse.ok) throw new Error(`months request failed: ${monthsResponse.status}`);
      const [artistsData, monthsData] = await Promise.all([
        artistsResponse.json(),
        monthsResponse.json(),
      ]);
      applyArtistList(artistsData);
      setMonths(Array.isArray(monthsData) ? monthsData : []);
    } finally {
      setIsLoadingArtists(false);
    }
  }, [applyArtistList]);

  // Selection & Modal States
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<number[]>([]);
  const [isDownloadingSelection, setIsDownloadingSelection] = useState(false);
  const [downloadSelectionError, setDownloadSelectionError] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const imageRequestIdRef = useRef(0);
  const imagePageCacheRef = useRef(new Map<string, ImagePageCacheEntry>());
  const imagePageRequestsRef = useRef(new Map<string, ImagePageRequest>());
  const thumbnailPreloadRequestsRef = useRef(new Map<string, ImagePreloadHandle>());
  const blurSaveRequestRef = useRef(0);
  const groupSaveRequestRef = useRef(0);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
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
  const libraryJobPollTimerRef = useRef<number | null>(null);
  const previousLibraryJobRef = useRef<LibraryJob | null>(null);
  const libraryAnnouncementTimerRef = useRef<number | null>(null);

  const handleEditModeChange = useCallback((edit: boolean) => {
    setIsEditMode(edit);
    setDownloadSelectionError(null);
    if (!edit) setSelectedIds(new Set());
  }, []);

  const handleToggleEditMode = useCallback(() => {
    setIsEditMode(current => {
      const next = !current;
      setDownloadSelectionError(null);
      if (!next) setSelectedIds(new Set());
      return next;
    });
  }, []);

  const handleOpenFullscreen = useCallback((index: number) => {
    setFullscreenIndex(index);
  }, []);

  const handleNavigateFullscreen = useCallback((index: number) => {
    setFullscreenIndex(index);
  }, []);

  const handleCloseFullscreen = useCallback(() => {
    setFullscreenIndex(null);
    setViewMode('grid');
  }, []);

  const handleMainScroll = (event: React.UIEvent<HTMLElement>) => {
    const scrollTarget = event.target as HTMLElement;
    setShowScrollTop(scrollTarget.scrollTop > 240);
  };

  const getGalleryScrollContainer = useCallback(() => (
    mainScrollRef.current?.querySelector<HTMLElement>('[data-gallery-scroll-container="true"]')
      ?? mainScrollRef.current
  ), []);

  const handleScrollToTop = () => {
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const scrollContainer = getGalleryScrollContainer();
    scrollContainer?.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
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

  useEffect(() => {
    let cancelled = false;

    const schedulePoll = (delay: number) => {
      if (cancelled) return;
      if (libraryJobPollTimerRef.current !== null) window.clearTimeout(libraryJobPollTimerRef.current);
      libraryJobPollTimerRef.current = window.setTimeout(() => {
        void pollCurrentLibraryJob();
      }, delay);
    };

    const pollCurrentLibraryJob = async () => {
      try {
        const response = await fetch('/api/library/jobs/current', { cache: 'no-store' });
        if (!response.ok) throw new Error(`library job request failed: ${response.status}`);
        const data = await response.json() as { job?: LibraryJob | null };
        const nextJob = data.job ?? null;
        const previousJob = previousLibraryJobRef.current;
        previousLibraryJobRef.current = nextJob;
        if (!cancelled) setLibraryJob(nextJob);

        if (nextJob && previousJob && nextJob.job_id === previousJob.job_id && isLibraryJobActive(previousJob) && isLibraryJobTerminal(nextJob)) {
          if (libraryAnnouncementTimerRef.current !== null) window.clearTimeout(libraryAnnouncementTimerRef.current);
          setLibraryAnnouncement(getLibraryJobAnnouncement(nextJob));
          libraryAnnouncementTimerRef.current = window.setTimeout(() => setLibraryAnnouncement(''), 8000);
          if (nextJob.job_type === 'update-library' && ['completed', 'cancelled'].includes(nextJob.status)) {
            window.dispatchEvent(new Event('web-viewer-library-data-changed'));
          }
        }
        schedulePoll(isLibraryJobActive(nextJob) ? 1000 : 10000);
      } catch {
        schedulePoll(15000);
      }
    };

    const handleLibraryJobChanged = () => {
      if (libraryJobPollTimerRef.current !== null) window.clearTimeout(libraryJobPollTimerRef.current);
      void pollCurrentLibraryJob();
    };

    window.addEventListener('web-viewer-library-job-changed', handleLibraryJobChanged);
    void pollCurrentLibraryJob();
    return () => {
      cancelled = true;
      window.removeEventListener('web-viewer-library-job-changed', handleLibraryJobChanged);
      if (libraryJobPollTimerRef.current !== null) window.clearTimeout(libraryJobPollTimerRef.current);
      if (libraryAnnouncementTimerRef.current !== null) window.clearTimeout(libraryAnnouncementTimerRef.current);
    };
  }, []);

  // Fetch Artists & Months
  useEffect(() => {
    void refreshDirectoryMetadata().catch(err => console.error('Failed to fetch directory metadata:', err));
  }, [refreshDirectoryMetadata]);

  // Keep filter state shareable and restore it when the browser navigates to a
  // URL that already contains filter parameters.
  useEffect(() => {
    syncFilterStateToUrl({ selectedMonths, selectedArtist, searchQuery });
  }, [selectedMonths, selectedArtist, searchQuery]);

  useEffect(() => {
    const handlePopState = () => {
      const nextState = getFilterStateFromUrl();
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

  // Pagination & Sort States
  const [currentPage, setCurrentPage] = useState(1);
  const [totalImages, setTotalImages] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_WEB_CONFIG.itemsPerPage);
  const [sortMode, setSortMode] = useState<SortMode>('newest_month');

  const monthIndexItems = useMemo<MonthJumpItem[]>(() => {
    const monthList = [...availableMonthIndexItems].sort((a, b) => {
      const shouldSortAscending = sortMode === 'oldest' || sortMode === 'oldest_month';
      return shouldSortAscending ? a.key.localeCompare(b.key) : b.key.localeCompare(a.key);
    });

    return monthList;
  }, [availableMonthIndexItems, sortMode]);

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

  const buildImageRequestParams = useCallback((page: number) => {
    const params = new URLSearchParams();
    if (selectedMonths.length > 0) params.append('month', selectedMonths.join(','));
    if (selectedArtist !== null) params.append('artist_id', selectedArtist.toString());
    if (searchQuery) params.append('search', searchQuery);
    params.append('sort_mode', sortMode);
    params.append('limit', itemsPerPage.toString());
    params.append('offset', ((page - 1) * itemsPerPage).toString());
    return params;
  }, [selectedMonths, selectedArtist, searchQuery, sortMode, itemsPerPage]);

  const applyImagePage = useCallback((page: ImagePageCacheEntry) => {
    setImages(page.images);
    setTotalImages(page.total);
    setAvailableMonthIndexItems(page.monthIndexItems);
  }, []);

  const loadImagePage = useCallback((params: URLSearchParams, kind: ImagePageRequest['kind'] = 'navigation') => {
    const cacheKey = params.toString();
    const cachedPage = imagePageCacheRef.current.get(cacheKey);
    if (cachedPage) return Promise.resolve(cachedPage);

    const pendingRequest = imagePageRequestsRef.current.get(cacheKey);
    if (pendingRequest) {
      if (kind === 'navigation') pendingRequest.kind = 'navigation';
      return pendingRequest.promise;
    }

    const controller = new AbortController();
    const request = fetch(`/api/images?${cacheKey}`, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`Images request failed: ${res.status}`);
        return res.json();
      })
      .then(data => {
        const page = normalizeImagePage(data);
        imagePageCacheRef.current.delete(cacheKey);
        imagePageCacheRef.current.set(cacheKey, page);
        while (imagePageCacheRef.current.size > 24) {
          const oldestKey = imagePageCacheRef.current.keys().next().value as string | undefined;
          if (!oldestKey) break;
          imagePageCacheRef.current.delete(oldestKey);
        }
        return page;
      });

    const requestEntry: ImagePageRequest = { promise: request, controller, kind };
    imagePageRequestsRef.current.set(cacheKey, requestEntry);
    request.then(
      () => {
        if (imagePageRequestsRef.current.get(cacheKey) === requestEntry) imagePageRequestsRef.current.delete(cacheKey);
      },
      () => {
        if (imagePageRequestsRef.current.get(cacheKey) === requestEntry) imagePageRequestsRef.current.delete(cacheKey);
      },
    );
    return request;
  }, []);

  // Fetch Images based on Filters & Pagination
  const fetchImages = useCallback(() => {
    const requestId = ++imageRequestIdRef.current;
    const params = buildImageRequestParams(currentPage);
    const cacheKey = params.toString();
    const cachedPage = imagePageCacheRef.current.get(cacheKey);

    if (cachedPage) {
      applyImagePage(cachedPage);
      setIsLoadingImages(false);
      return;
    }

    setIsLoadingImages(true);
    loadImagePage(params)
      .then(page => {
        if (requestId !== imageRequestIdRef.current) return;
        applyImagePage(page);
      })
      .catch(err => {
        if (requestId === imageRequestIdRef.current) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          console.error('Failed to fetch images:', err);
        }
      })
      .finally(() => {
        if (requestId === imageRequestIdRef.current) {
          setIsLoadingImages(false);
        }
      });
  }, [applyImagePage, buildImageRequestParams, currentPage, loadImagePage]);

  useEffect(() => {
    if (!isWebConfigReady) return;
    fetchImages();
  }, [fetchImages, isWebConfigReady]);

  useEffect(() => {
    const handleLibraryDataChanged = () => {
      imagePageCacheRef.current.clear();
      void refreshDirectoryMetadata().catch(err => console.error('Failed to refresh directory metadata:', err));
      fetchImages();
    };

    window.addEventListener('web-viewer-library-data-changed', handleLibraryDataChanged);
    return () => window.removeEventListener('web-viewer-library-data-changed', handleLibraryDataChanged);
  }, [fetchImages, refreshDirectoryMetadata]);

  useEffect(() => {
    const fullscreenActive = fullscreenIndex !== null || viewMode === 'fullscreen';
    if (fullscreenActive) {
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

  const resolveMonthTarget = useCallback((item: MonthJumpItem) => {
    const fallbackIndex = monthIndexItems.findIndex(month => month.key === item.key);
    const fallbackOffset = fallbackIndex >= 0
      ? monthIndexItems.slice(0, fallbackIndex).reduce((total, month) => total + month.count, 0)
      : 0;
    const targetOffset = Number.isFinite(item.offset) && (item.offset ?? 0) >= 0
      ? item.offset ?? 0
      : fallbackOffset;

    return {
      offset: targetOffset,
      ...getTargetPageAndLocalIndex(targetOffset, itemsPerPage),
    };
  }, [itemsPerPage, monthIndexItems]);

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
    for (const [cacheKey, request] of imagePageRequestsRef.current) {
      if (cacheKey === preserveCacheKey) {
        request.kind = 'navigation';
        continue;
      }
      if (request.kind !== 'navigation') {
        request.controller.abort();
        imagePageRequestsRef.current.delete(cacheKey);
      }
    }
  }, []);

  const supersedeNavigationPageRequests = useCallback((preserveCacheKey: string) => {
    for (const [cacheKey, request] of imagePageRequestsRef.current) {
      if (cacheKey === preserveCacheKey || request.kind !== 'navigation') continue;
      request.controller.abort();
      imagePageRequestsRef.current.delete(cacheKey);
    }
  }, []);

  const preloadThumbnail = useCallback((item: ImageItem, priority: 0 | 1 | 2 | 3 = 3) => {
    if (item.media_status) return;

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
  }, [thumbnailSize]);

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
      if (imagePageCacheRef.current.has(cacheKey)) {
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
  }, [applyScrubPreviewPage, buildImageRequestParams, cancelSpeculativePageRequests, currentPage, loadImagePage, navigationMode, preloadThumbnail, prefetchCurrentPageWindow, resolveMonthTarget, thumbnailSize]);

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

  const handlePageChange = useCallback((page: number) => {
    const preserveCacheKey = buildImageRequestParams(page).toString();
    supersedeNavigationPageRequests(preserveCacheKey);
    cancelSpeculativePageRequests(preserveCacheKey);
    paginationScrollResetRef.current = page;
    pendingMonthScrollBehaviorRef.current = 'smooth';
    setPendingMonthKey(null);
    setDestinationMonthKey(null);
    setDestinationGlobalIndex(null);
    setNavigationMode('idle');
    getGalleryScrollContainer()?.scrollTo({ top: 0, behavior: 'auto' });
    setCurrentPage(page);
  }, [buildImageRequestParams, cancelSpeculativePageRequests, getGalleryScrollContainer, supersedeNavigationPageRequests]);

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
    if (!pendingMonthKey || images.length === 0) return;

    let frameId: number | null = null;
    let frameCount = 0;
    let stableFrames = 0;
    let previousTargetTop: number | null = null;
    let previousScrollTop: number | null = null;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const behavior = prefersReducedMotion ? 'auto' : pendingMonthScrollBehaviorRef.current;

    const alignTarget = () => {
      const container = getGalleryScrollContainer();
      const target = document.getElementById(`month-section-${pendingMonthKey}`);
      if (!container || !target) {
        frameId = window.requestAnimationFrame(alignTarget);
        return;
      }

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
    };
  }, [getGalleryScrollContainer, images, pendingMonthKey]);

  const applyWebConfig = useCallback((data: Partial<WebConfig>) => {
    const config = normalizeWebConfig(data);
    setTheme(config.webTheme);
    setThumbnailSize(config.thumbnailSize);
    setItemsPerPage(config.itemsPerPage);
    setGroupMangaPosts(config.groupMangaPosts);
    setBlurEnabled(config.blurEnabled);
    setPreloadImageCount(config.preloadImageCount);
    setCurrentPage(1);
  }, []);

  const loadWebConfig = useCallback(async () => {
    const response = await fetch('/api/web-config');
    if (!response.ok) {
      throw new Error(`Failed to load web-config (${response.status})`);
    }
    const data = await response.json();
    applyWebConfig(data);
    return normalizeWebConfig(data);
  }, [applyWebConfig]);

  const persistWebConfigPatch = useCallback(async (patch: Partial<WebConfig>) => {
    const currentResponse = await fetch('/api/web-config');
    if (!currentResponse.ok) {
      throw new Error(`Failed to load web-config before update (${currentResponse.status})`);
    }
    const current = await currentResponse.json();
    const nextConfig = normalizeWebConfig({ ...current, ...patch });
    const saveResponse = await fetch('/api/web-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextConfig),
    });
    if (!saveResponse.ok) {
      throw new Error(`Failed to save web-config (${saveResponse.status})`);
    }
    return nextConfig;
  }, []);

  // Apply persisted Web Viewer settings before the user starts interacting with the app.
  useEffect(() => {
    let cancelled = false;

    loadWebConfig()
      .catch(err => console.error('Failed to fetch web-config:', err))
      .finally(() => {
        if (!cancelled) setIsWebConfigReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [loadWebConfig]);

  const handleViewModeChange = useCallback((nextMode: ViewMode) => {
    setViewMode(nextMode);
    setFullscreenIndex(currentIndex => {
      if (nextMode !== 'fullscreen') return null;
      return currentIndex ?? (images.length > 0 ? 0 : null);
    });
  }, [images.length]);

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
      if (e.key === 'e' || e.key === 'E') {
        handleEditModeChange(!isEditMode);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleEditModeChange, isEditMode]);

  // Multi-select handlers
  const toggleSelectImage = (imageId: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(imageId)) next.delete(imageId);
      else next.add(imageId);
      return next;
    });
    setDownloadSelectionError(null);
  };

  const setSelectedImages = useCallback((imageIds: number[], selected: boolean) => {
    if (imageIds.length === 0) return;

    setSelectedIds(prev => {
      const next = new Set(prev);
      imageIds.forEach(imageId => {
        if (selected) next.add(imageId);
        else next.delete(imageId);
      });
      return next;
    });
    setDownloadSelectionError(null);
  }, []);

  const replaceSelectedImages = useCallback((imageIds: number[]) => {
    setSelectedIds(new Set(imageIds));
    setDownloadSelectionError(null);
  }, []);

  const handleDownloadSelected = useCallback(async () => {
    if (selectedIds.size === 0 || isDownloadingSelection) return;

    setIsDownloadingSelection(true);
    setDownloadSelectionError(null);

    try {
      const selectedItems = images
        .filter(image => selectedIds.has(image.image_id))
        .map(image => ({ image_id: image.image_id, path: image.save_name }));
      const response = await fetch('/api/images/download-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_ids: Array.from(selectedIds),
          items: selectedItems,
        }),
      });

      if (!response.ok) {
        let message = `ZIP 下載失敗（${response.status}）`;
        try {
          const payload = await response.json() as { detail?: unknown };
          if (typeof payload.detail === 'string' && payload.detail) message = payload.detail;
        } catch {
          // Keep the status-based message when the API response is not JSON.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition?.match(/filename="?([^";]+)"?/i)?.[1]
        ?? 'pixivutil2-selected-works.zip';
      const objectUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = objectUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ZIP 下載失敗';
      console.error('Failed to download selected images:', err);
      setDownloadSelectionError(message);
    } finally {
      setIsDownloadingSelection(false);
    }
  }, [images, isDownloadingSelection, selectedIds]);

  const handleSelectAll = () => {
    const all = new Set(images.map(img => img.image_id));
    setSelectedIds(all);
    setDownloadSelectionError(null);
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
    setDownloadSelectionError(null);
  };

  // Delete Actions
  const promptDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    setDeleteTargets(Array.from(selectedIds));
    setShowConfirmModal(true);
  };

  const promptDeleteSingle = (imageId: number) => {
    setDeleteTargets([imageId]);
    setShowConfirmModal(true);
  };

  const confirmExecuteDelete = async () => {
    if (!deleteTargets.length) return;
    try {
      const items = deleteTargets.flatMap(imageId => {
        const image = images.find(candidate => candidate.image_id === imageId);
        return image?.save_name
          ? [{ image_id: imageId, path: image.save_name }]
          : [];
      });
      const res = await fetch('/api/images/batch-trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_ids: deleteTargets, items }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || '無法將作品移至回收區');
      }
      console.log('Moved selected works to recycle bin:', data);

      // Refresh list and clear selection
      fetchImages();
      setSelectedIds(prev => {
        const next = new Set(prev);
        deleteTargets.forEach(id => next.delete(id));
        return next;
      });
      setShowConfirmModal(false);
      setDeleteTargets([]);
      if (fullscreenIndex !== null && deleteTargets.includes(images[fullscreenIndex]?.image_id)) {
        setFullscreenIndex(null);
      }
    } catch (err) {
      console.error('Failed to move selected works to recycle bin:', err);
    }
  };

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

  // Group images into WorkGroups for current page
  const allWorkGroups = useMemo(() => {
    return groupImagesIntoWorkGroups(images);
  }, [images]);

  // Current Fullscreen Active Work Group & Item Index
  const currentFullscreenItem = fullscreenIndex !== null ? images[fullscreenIndex] : null;
  const currentFullscreenGroup = useMemo(() => {
    if (!currentFullscreenItem) return null;
    return allWorkGroups.find(g => g.items.some(it => it.save_name === currentFullscreenItem.save_name)) || null;
  }, [currentFullscreenItem, allWorkGroups]);

  const currentGroupItems = currentFullscreenGroup ? currentFullscreenGroup.items : (currentFullscreenItem ? [currentFullscreenItem] : []);
  const currentGroupPageIndex = currentGroupItems.findIndex(it => it.save_name === currentFullscreenItem?.save_name);
  const safeGroupPageIndex = currentGroupPageIndex >= 0 ? currentGroupPageIndex : 0;

  const handleNavigateWorkGroupPage = (newGroupPageIndex: number) => {
    if (!currentGroupItems[newGroupPageIndex]) return;
    const targetItem = currentGroupItems[newGroupPageIndex];
    const globalIdx = images.findIndex(x => x.save_name === targetItem.save_name);
    if (globalIdx !== -1) {
      setFullscreenIndex(globalIdx);
    }
  };

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
    if (globalIdx !== -1) {
      setFullscreenIndex(globalIdx);
    }
    setIsMangaModalOpen(false);
  };

  const handleResetAllFilters = () => {
    setSearchQuery('');
    setSelectedArtist(null);
    setSelectedMonths([]);
  };

  const currentArtist = useMemo(
    () => (selectedArtist === null ? null : artists.find(artist => artist.member_id === selectedArtist) ?? null),
    [artists, selectedArtist],
  );

  const isArtistUpdating = isLibraryJobActive(libraryJob) && libraryJob?.job_type === 'update-library';

  const handleRequestArtistUpdate = useCallback(() => {
    if (isArtistUpdating) return;
    setIsArtistUpdateNoticeOpen(true);
  }, [isArtistUpdating]);

  const handleStartArtistUpdate = useCallback(async () => {
    if (isLibraryJobActive(libraryJob)) {
      setIsArtistUpdateNoticeOpen(false);
      return;
    }

    setIsArtistUpdateNoticeOpen(false);
    try {
      const response = await fetch('/api/library/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'update-library', analyze_colors: false }),
      });
      const data = await response.json().catch(() => ({})) as { job?: LibraryJob; detail?: string };
      if (!response.ok || !data.job) throw new Error(data.detail || `背景更新啟動失敗（${response.status}）`);
      setLibraryJob(data.job);
      setLibraryAnnouncement('繪師作品資料已開始在背景更新，瀏覽期間可能會有短暫卡頓。');
      window.dispatchEvent(new Event('web-viewer-library-job-changed'));
    } catch (error) {
      setLibraryAnnouncement(error instanceof Error ? error.message : '背景更新啟動失敗');
    }
  }, [libraryJob]);

  const handleArtistChanged = useCallback(() => {
    imagePageCacheRef.current.clear();
    setSelectedArtist(null);
    void refreshDirectoryMetadata().catch(err => console.error('Failed to refresh after artist action:', err));
  }, [refreshDirectoryMetadata]);

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

  if (!isWebConfigReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-sm text-zinc-400" aria-busy="true">
        載入 Web Viewer 設定中…
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-zinc-950 text-zinc-100 transition-colors">
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

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {libraryAnnouncement}
      </div>

      <MobileMenuDrawer
        isOpen={isMobileMenuOpen}
        onClose={handleCloseMobileMenu}
        viewMode={viewMode}
        setViewMode={handleViewModeChange}
        theme={theme}
        setTheme={handleThemeChange}
        onOpenSettings={() => setIsSettingsOpen(true)}
        groupMangaPosts={groupMangaPosts}
        onToggleGroupMangaPosts={handleToggleGroupMangaPosts}
        blurEnabled={blurEnabled}
        onToggleBlur={handleToggleBlur}
      />

      <div
        className="relative flex flex-1 min-h-0 overflow-hidden"
        style={{ '--viewer-sidebar-offset': isSidebarOpen ? '18rem' : '0px' } as React.CSSProperties}
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
          onClose={() => setIsSidebarOpen(false)}
          months={months}
          artists={artists}
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
          className={`flex-1 min-w-0 min-h-0 overflow-x-hidden overscroll-x-none overscroll-y-contain ${viewMode === 'grid' ? 'viewer-main--grid flex flex-col overflow-y-hidden' : 'overflow-y-auto'}`}
        >
          {viewMode === 'grid' && (
          <GalleryGrid
            images={images}
            totalImages={totalImages}
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            thumbnailSize={thumbnailSize}
            onPageChange={handlePageChange}
            onItemsPerPageChange={(num) => setItemsPerPage(num)}
            sortMode={sortMode}
            onSortModeChange={(mode) => setSortMode(mode)}
            isEditMode={isEditMode}
            onToggleEditMode={handleToggleEditMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelectImage}
            onSetSelection={setSelectedImages}
            onReplaceSelection={replaceSelectedImages}
            onOpenFullscreen={handleOpenFullscreen}
            searchQuery={searchQuery}
            onClearSearch={() => setSearchQuery('')}
            selectedArtist={selectedArtist}
            onClearArtist={() => setSelectedArtist(null)}
            onOpenFilters={handleOpenFilters}
            selectedMonths={selectedMonths}
            onClearMonth={(m) => setSelectedMonths(previous => previous.filter(x => x !== m))}
            onResetAllFilters={handleResetAllFilters}
            groupMangaPosts={groupMangaPosts}
            onOpenWorkGroup={handleOpenWorkGroupModal}
            artists={artists}
             monthIndexItems={monthIndexItems}
             onJumpToMonth={handleJumpToMonth}
             onPrefetchMonth={prefetchMonthPage}
             onNavigationChange={handleMonthNavigationChange}
             navigationMode={navigationMode}
             destinationMonthKey={destinationMonthKey}
             destinationGlobalIndex={destinationGlobalIndex}
             isLoading={isLoadingImages}
             isArtistLoading={isLoadingImages && selectedArtist !== null}
              isArtistUpdating={isArtistUpdating}
              onRequestArtistUpdate={handleRequestArtistUpdate}
              onOpenArtistSettings={() => setIsArtistSettingsOpen(true)}
             blurEnabled={blurEnabled}
          />
          )}

          {viewMode === 'webtoon' && (
            <WebtoonFeed images={images} blurEnabled={blurEnabled} />
          )}

        </main>
      </div>

      <button
        type="button"
        className={`viewer-scroll-top${showScrollTop ? ' is-visible' : ''}`}
        onClick={handleScrollToTop}
        disabled={!showScrollTop}
        tabIndex={showScrollTop ? 0 : -1}
        aria-label="回到頂端"
        title="回到頂端"
      >
        <ArrowUp className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Manga Group Preview Modal */}
      <MangaGroupModal
        isOpen={isMangaModalOpen}
        workGroup={activeWorkGroup}
        onClose={() => setIsMangaModalOpen(false)}
        onSelectImage={handleSelectMangaPage}
        thumbnailSize={thumbnailSize}
        blurEnabled={blurEnabled}
      />

      {/* Keep one Previewer instance for both the grid and Wheel Flip modes. */}
      {(fullscreenIndex !== null || viewMode === 'fullscreen') && images.length > 0 && (
        <FullscreenViewer
          key="fullscreen-viewer"
          images={images}
          currentIndex={fullscreenIndex ?? 0}
          onClose={handleCloseFullscreen}
          onNavigate={handleNavigateFullscreen}
          onDeleteCurrent={promptDeleteSingle}
          onNavigateNextWork={handleNavigateNextWork}
          onNavigatePrevWork={handleNavigatePrevWork}
          preloadCount={preloadImageCount}
          thumbnailSize={thumbnailSize}
          blurEnabled={blurEnabled}
        />
      )}

      {/* Batch Edit Toolbar */}
      {isEditMode && (
        <BatchEditToolbar
          selectedCount={selectedIds.size}
          totalCount={images.length}
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
        message="更新會在背景掃描圖片資料夾並同步資料庫。掃描 HDD 期間可能造成檔案讀取聲、介面短暫卡頓；你仍可繼續瀏覽，完成後列表會自動更新。"
        confirmLabel="開始背景更新"
        cancelLabel="稍後再做"
        onConfirm={() => void handleStartArtistUpdate()}
        onCancel={() => setIsArtistUpdateNoticeOpen(false)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsSaved={handleSettingsSaved}
        onOpenRecycleBin={handleOpenRecycleBin}
      />

      <ArtistSettingsModal
        isOpen={isArtistSettingsOpen}
        artist={currentArtist}
        onClose={() => setIsArtistSettingsOpen(false)}
        onArtistChanged={handleArtistChanged}
        onOpenRecycleBin={handleOpenRecycleBin}
        isUpdating={isArtistUpdating}
        onRequestUpdate={handleRequestArtistUpdate}
      />

      <RecycleBinModal
        isOpen={isRecycleBinOpen}
        onClose={() => setIsRecycleBinOpen(false)}
      />
    </div>
  );
};

export default App;
