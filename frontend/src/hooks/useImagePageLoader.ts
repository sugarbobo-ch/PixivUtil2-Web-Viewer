import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageItem, MonthIndexItem, SortMode } from '../types';
import { apiClient, isAbortError } from '../api/client';
import { ImagePageResponse } from '../api/parsers';
import { normalizeSelectedMonths } from '../utils/timeFilters';

export type ImagePage = ImagePageResponse;

export type ImagePageRequestKind = 'navigation' | 'scrub-settle' | 'hover-prefetch';

interface ImagePageRequest {
  promise: Promise<ImagePage>;
  controller: AbortController;
  kind: ImagePageRequestKind;
  cancelled: boolean;
}

interface UseImagePageLoaderOptions {
  enabled?: boolean;
  selectedMonths: string[];
  selectedArtist: string | null;
  searchQuery: string;
  sortMode: SortMode;
  itemsPerPage: number;
  currentPage: number;
}

const createAbortError = () => {
  const error = new Error('Image page request was cancelled.');
  error.name = 'AbortError';
  return error;
};

export const useImagePageLoader = ({
  enabled = true,
  selectedMonths,
  selectedArtist,
  searchQuery,
  sortMode,
  itemsPerPage,
  currentPage,
}: UseImagePageLoaderOptions) => {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [totalImages, setTotalImages] = useState(0);
  const [availableMonthIndexItems, setAvailableMonthIndexItems] = useState<MonthIndexItem[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [loadedPage, setLoadedPage] = useState<number | null>(null);
  const imageRequestIdRef = useRef(0);
  const imagePageCacheRef = useRef(new Map<string, ImagePage>());
  const imagePageRequestsRef = useRef(new Map<string, ImagePageRequest>());
  const requestGenerationRef = useRef(0);
  const isMountedRef = useRef(true);

  const abortAllPageRequests = useCallback(() => {
    for (const request of imagePageRequestsRef.current.values()) {
      request.cancelled = true;
      request.controller.abort();
    }
    imagePageRequestsRef.current.clear();
  }, []);

  const buildImageRequestParams = useCallback((page: number) => {
    const params = new URLSearchParams();
    const normalizedSelectedMonths = normalizeSelectedMonths(selectedMonths);
    if (normalizedSelectedMonths.length > 0) params.append('month', normalizedSelectedMonths.join(','));
    if (selectedArtist !== null) {
      if (selectedArtist.startsWith('folder:')) {
        params.append('folder_id', selectedArtist.slice(7));
      } else {
        params.append('artist_id', selectedArtist);
      }
    }
    if (searchQuery) params.append('search', searchQuery);
    params.append('sort_mode', sortMode);
    params.append('limit', itemsPerPage.toString());
    params.append('offset', ((page - 1) * itemsPerPage).toString());
    return params;
  }, [itemsPerPage, searchQuery, selectedArtist, selectedMonths, sortMode]);

  const loadImagePage = useCallback((
    params: URLSearchParams,
    kind: ImagePageRequestKind = 'navigation',
  ) => {
    const cacheKey = params.toString();
    const generation = requestGenerationRef.current;
    const cachedPage = imagePageCacheRef.current.get(cacheKey);
    if (cachedPage) return Promise.resolve(cachedPage);

    const pendingRequest = imagePageRequestsRef.current.get(cacheKey);
    if (pendingRequest) {
      if (kind === 'navigation') pendingRequest.kind = 'navigation';
      return pendingRequest.promise;
    }

    const controller = new AbortController();
    let requestEntry: ImagePageRequest;
    const request = apiClient.images.page(cacheKey, { signal: controller.signal })
      .then(data => {
        if (generation !== requestGenerationRef.current || requestEntry.cancelled) {
          throw createAbortError();
        }
        const page = data;
        imagePageCacheRef.current.delete(cacheKey);
        imagePageCacheRef.current.set(cacheKey, page);
        while (imagePageCacheRef.current.size > 24) {
          const oldestKey = imagePageCacheRef.current.keys().next().value as string | undefined;
          if (!oldestKey) break;
          imagePageCacheRef.current.delete(oldestKey);
        }
        return page;
      });

    requestEntry = { promise: request, controller, kind, cancelled: false };
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

  const fetchImages = useCallback(() => {
    if (!enabled) return;
    const requestId = ++imageRequestIdRef.current;
    const params = buildImageRequestParams(currentPage);
    const cacheKey = params.toString();
    const cachedPage = imagePageCacheRef.current.get(cacheKey);

    if (!isMountedRef.current) return;
    if (cachedPage) {
      setImages(cachedPage.images);
      setTotalImages(cachedPage.total);
      setAvailableMonthIndexItems(cachedPage.monthIndexItems);
      setLoadedPage(currentPage);
      setIsLoadingImages(false);
      return;
    }

    setIsLoadingImages(true);
    loadImagePage(params)
      .then(page => {
        if (requestId !== imageRequestIdRef.current || !isMountedRef.current) return;
        setImages(page.images);
        setTotalImages(page.total);
        setAvailableMonthIndexItems(page.monthIndexItems);
        setLoadedPage(currentPage);
      })
      .catch(err => {
        if (requestId === imageRequestIdRef.current && isMountedRef.current) {
          if (isAbortError(err)) return;
          console.error('Failed to fetch images:', err);
        }
      })
      .finally(() => {
        if (requestId === imageRequestIdRef.current && isMountedRef.current) setIsLoadingImages(false);
      });
  }, [buildImageRequestParams, currentPage, enabled, loadImagePage]);

  const clearCache = useCallback(() => {
    requestGenerationRef.current += 1;
    imagePageCacheRef.current.clear();
    abortAllPageRequests();
  }, [abortAllPageRequests, enabled]);

  const hasCachedPage = useCallback((params: URLSearchParams) => (
    imagePageCacheRef.current.has(params.toString())
  ), []);

  const cancelSpeculativePageRequests = useCallback((preserveCacheKey?: string) => {
    for (const [cacheKey, request] of imagePageRequestsRef.current) {
      if (cacheKey === preserveCacheKey) {
        request.kind = 'navigation';
        continue;
      }
      if (request.kind !== 'navigation') {
        request.cancelled = true;
        request.controller.abort();
        imagePageRequestsRef.current.delete(cacheKey);
      }
    }
  }, []);

  const supersedeNavigationPageRequests = useCallback((preserveCacheKey: string) => {
    for (const [cacheKey, request] of imagePageRequestsRef.current) {
      if (cacheKey === preserveCacheKey || request.kind !== 'navigation') continue;
      request.cancelled = true;
      request.controller.abort();
      imagePageRequestsRef.current.delete(cacheKey);
    }
  }, []);

  useEffect(() => {
    // React StrictMode replays effects during development. Mark the hook as
    // mounted again before the replayed setup so a legitimate request is not
    // discarded after the first cleanup pass.
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      requestGenerationRef.current += 1;
      abortAllPageRequests();
    };
  }, [abortAllPageRequests]);

  return {
    images,
    totalImages,
    availableMonthIndexItems,
    isLoadingImages,
    loadedPage,
    buildImageRequestParams,
    loadImagePage,
    fetchImages,
    clearCache,
    hasCachedPage,
    cancelSpeculativePageRequests,
    supersedeNavigationPageRequests,
  };
};
