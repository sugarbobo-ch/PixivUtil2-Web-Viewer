import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Artist, MonthItem, ImageItem, SortMode, ViewMode, ThemeMode, WorkGroup, WebConfig, DEFAULT_WEB_CONFIG } from './types';
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
import { MangaGroupModal } from './components/MangaGroupModal';
import { MonthJumpItem, MonthJumpNavigationOptions } from './components/MonthQuickNav';

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

interface ImagePageCacheEntry {
  images: ImageItem[];
  total: number;
  monthIndexItems: MonthJumpItem[];
}

const GRID_THUMBNAIL_PREFETCH_COUNT = 6;

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

  // Group Mode & Manga Modal States
  const [groupMangaPosts, setGroupMangaPosts] = useState(DEFAULT_WEB_CONFIG.groupMangaPosts);
  const [preloadImageCount, setPreloadImageCount] = useState(DEFAULT_WEB_CONFIG.preloadImageCount);
  const [thumbnailSize, setThumbnailSize] = useState(DEFAULT_WEB_CONFIG.thumbnailSize);
  const [activeWorkGroup, setActiveWorkGroup] = useState<WorkGroup | null>(null);
  const [isMangaModalOpen, setIsMangaModalOpen] = useState(false);
  const [blurEnabled, setBlurEnabled] = useState(DEFAULT_WEB_CONFIG.blurEnabled);
  const [isWebConfigReady, setIsWebConfigReady] = useState(false);

  // Data States
  const [artists, setArtists] = useState<Artist[]>([]);
  const [months, setMonths] = useState<MonthItem[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [availableMonthIndexItems, setAvailableMonthIndexItems] = useState<MonthJumpItem[]>([]);

  // Filter States
  const [selectedMonths, setSelectedMonths] = useState<string[]>(() => getFilterStateFromUrl().selectedMonths);
  const [selectedArtist, setSelectedArtist] = useState<number | null>(() => getFilterStateFromUrl().selectedArtist);
  const [searchQuery, setSearchQuery] = useState(() => getFilterStateFromUrl().searchQuery);

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
  const imagePageRequestsRef = useRef(new Map<string, Promise<ImagePageCacheEntry>>());
  const thumbnailPreloadRequestsRef = useRef(new Map<string, Promise<void>>());
  const blurSaveRequestRef = useRef(0);
  const groupSaveRequestRef = useRef(0);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [pendingMonthKey, setPendingMonthKey] = useState<string | null>(null);
  const pendingMonthScrollBehaviorRef = useRef<ScrollBehavior>('smooth');

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

  const handleScrollToTop = () => {
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const scrollContainer = mainScrollRef.current?.querySelector<HTMLElement>('[data-gallery-scroll-container="true"]')
      ?? mainScrollRef.current;
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

  // Fetch Artists & Months
  useEffect(() => {
    fetch('/api/artists')
      .then(res => res.json())
      .then(data => setArtists(data))
      .catch(err => console.error('Failed to fetch artists:', err));

    fetch('/api/months')
      .then(res => res.json())
      .then(data => setMonths(data))
      .catch(err => console.error('Failed to fetch months:', err));
  }, []);

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
    const scrollContainer = mainScrollRef.current?.querySelector<HTMLElement>('[data-gallery-scroll-container="true"]')
      ?? mainScrollRef.current;
    scrollContainer?.scrollTo({ top: 0, behavior: 'auto' });
  }, [selectedMonths, selectedArtist, searchQuery, sortMode]);

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

  const loadImagePage = useCallback((params: URLSearchParams) => {
    const cacheKey = params.toString();
    const cachedPage = imagePageCacheRef.current.get(cacheKey);
    if (cachedPage) return Promise.resolve(cachedPage);

    const pendingRequest = imagePageRequestsRef.current.get(cacheKey);
    if (pendingRequest) return pendingRequest;

    const request = fetch(`/api/images?${cacheKey}`)
      .then(res => {
        if (!res.ok) throw new Error(`Images request failed: ${res.status}`);
        return res.json();
      })
      .then(data => {
        const page = normalizeImagePage(data);
        imagePageCacheRef.current.set(cacheKey, page);
        return page;
      });

    imagePageRequestsRef.current.set(cacheKey, request);
    request.then(
      () => {
        if (imagePageRequestsRef.current.get(cacheKey) === request) imagePageRequestsRef.current.delete(cacheKey);
      },
      () => {
        if (imagePageRequestsRef.current.get(cacheKey) === request) imagePageRequestsRef.current.delete(cacheKey);
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

  const resolveMonthTargetPage = useCallback((item: MonthJumpItem) => {
    const fallbackIndex = monthIndexItems.findIndex(month => month.key === item.key);
    const fallbackOffset = fallbackIndex >= 0
      ? monthIndexItems.slice(0, fallbackIndex).reduce((total, month) => total + month.count, 0)
      : 0;
    const targetOffset = Number.isFinite(item.offset) && (item.offset ?? 0) >= 0
      ? item.offset ?? 0
      : fallbackOffset;

    return Math.floor(targetOffset / itemsPerPage) + 1;
  }, [itemsPerPage, monthIndexItems]);

  const preloadThumbnail = useCallback((item: ImageItem) => {
    if (item.media_status) return;

    const url = buildThumbnailUrl(item, thumbnailSize);
    if (thumbnailPreloadRequestsRef.current.has(url)) return;

    const request = new Promise<void>(resolve => {
      const image = new Image();
      image.decoding = 'async';
      image.fetchPriority = 'low';
      const finish = () => {
        image.onload = null;
        image.onerror = null;
        resolve();
      };
      image.onload = finish;
      image.onerror = finish;
      image.src = url;
    });

    thumbnailPreloadRequestsRef.current.set(url, request);
    void request.finally(() => {
      if (thumbnailPreloadRequestsRef.current.get(url) === request) {
        thumbnailPreloadRequestsRef.current.delete(url);
      }
    });
  }, [thumbnailSize]);

  const prefetchMonthPage = useCallback((item: MonthJumpItem) => {
    const targetPage = resolveMonthTargetPage(item);
    if (targetPage === currentPage) return;

    const params = buildImageRequestParams(targetPage);
    const cacheKey = params.toString();
    if (imagePageCacheRef.current.has(cacheKey) || imagePageRequestsRef.current.has(cacheKey)) return;

    void loadImagePage(params)
      .then(page => {
        // Only warm the first viewport. Prefetching every thumbnail would move
        // the bottleneck from navigation to a burst of image decoding.
        page.images.slice(0, GRID_THUMBNAIL_PREFETCH_COUNT).forEach(preloadThumbnail);
      })
      .catch(() => undefined);
  }, [buildImageRequestParams, currentPage, loadImagePage, preloadThumbnail, resolveMonthTargetPage]);

  const handleJumpToMonth = useCallback((item: MonthJumpItem, options: MonthJumpNavigationOptions = {}) => {
    pendingMonthScrollBehaviorRef.current = options.behavior ?? 'smooth';
    setPendingMonthKey(item.key);

    // The month ruler is navigation, not another filter. The API calculates
    // each month's first offset after applying the current artist/search/month
    // filters and sort mode, so changing page keeps those filters intact.
    setCurrentPage(resolveMonthTargetPage(item));
  }, [resolveMonthTargetPage]);

  useEffect(() => {
    if (!pendingMonthKey || images.length === 0) return;

    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(`month-section-${pendingMonthKey}`);
      if (!target) return;

      const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const behavior = prefersReducedMotion ? 'auto' : pendingMonthScrollBehaviorRef.current;
      target.scrollIntoView({ behavior, block: 'start' });
      setPendingMonthKey(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [images, pendingMonthKey]);

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

  const handleSettingsSaved = useCallback((savedConfig?: Partial<WebConfig>) => {
    if (savedConfig) {
      applyWebConfig(savedConfig);
    } else {
      loadWebConfig().catch(err => console.error('Failed to refresh web-config:', err));
    }

    fetchImages();
    // Also refetch artists and months in case directory rescan indexed new files.
    fetch('/api/artists').then(res => res.json()).then(data => setArtists(data)).catch(err => console.error(err));
    fetch('/api/months').then(res => res.json()).then(data => setMonths(data)).catch(err => console.error(err));
  }, [applyWebConfig, fetchImages, loadWebConfig]);

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
      />

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
            onPageChange={(p) => setCurrentPage(p)}
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
            isLoading={isLoadingImages}
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

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsSaved={handleSettingsSaved}
      />
    </div>
  );
};

export default App;
