import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageItem } from '../types';
import { useImagePageLoader } from './useImagePageLoader';

const createImage = (imageId: number): ImageItem => ({
  image_id: imageId,
  member_id: 1,
  title: `Image ${imageId}`,
  save_name: `artist/${imageId}.jpg`,
  created_date: '2026-08-10',
  last_update_date: '2026-08-10',
});

const responseFor = (images: ImageItem[]): Response => ({
  ok: true,
  status: 200,
  json: async () => ({ images, total: images.length }),
} as Response);

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const createOptions = (currentPage = 1) => ({
  selectedMonths: [],
  selectedArtist: null,
  searchQuery: '',
  sortMode: 'newest_month' as const,
  itemsPerPage: 2,
  currentPage,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useImagePageLoader request lifecycle', () => {
  it('does not start a current-page request when the legacy fallback is disabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue(responseFor([createImage(1)]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useImagePageLoader({
      ...createOptions(),
      enabled: false,
    }));

    act(() => result.current.fetchImages());
    await Promise.resolve();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.images).toEqual([]);
  });

  it('deduplicates the same request and reuses its cache result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(responseFor([createImage(1)]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useImagePageLoader(createOptions()));
    const params = result.current.buildImageRequestParams(1);

    const firstRequest = result.current.loadImagePage(params, 'hover-prefetch');
    const duplicateRequest = result.current.loadImagePage(params, 'navigation');

    expect(duplicateRequest).toBe(firstRequest);
    await expect(firstRequest).resolves.toMatchObject({ total: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(result.current.loadImagePage(params)).resolves.toMatchObject({ total: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('evicts the oldest page after the cache limit and loads it again', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => responseFor([]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useImagePageLoader(createOptions()));

    for (let offset = 0; offset < 25; offset += 1) {
      const params = new URLSearchParams({ offset: String(offset) });
      await result.current.loadImagePage(params, 'hover-prefetch');
    }

    expect(fetchMock).toHaveBeenCalledTimes(25);
    await result.current.loadImagePage(new URLSearchParams({ offset: '0' }), 'hover-prefetch');
    expect(fetchMock).toHaveBeenCalledTimes(26);
  });

  it('aborts speculative requests and rejects their stale response', async () => {
    const deferred = createDeferred<Response>();
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return deferred.promise;
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useImagePageLoader(createOptions()));
    const request = result.current.loadImagePage(
      new URLSearchParams({ offset: '4' }),
      'hover-prefetch',
    );

    act(() => result.current.cancelSpeculativePageRequests());
    expect(requestSignal?.aborted).toBe(true);

    deferred.resolve(responseFor([createImage(4)]));
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('invalidates the cache and aborts navigation requests on clear', async () => {
    const deferred = createDeferred<Response>();
    const fetchMock = vi.fn().mockImplementation(() => deferred.promise);
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useImagePageLoader(createOptions()));
    const params = result.current.buildImageRequestParams(1);
    const staleRequest = result.current.loadImagePage(params);

    act(() => result.current.clearCache());
    deferred.resolve(responseFor([createImage(1)]));
    await expect(staleRequest).rejects.toMatchObject({ name: 'AbortError' });

    fetchMock.mockResolvedValueOnce(responseFor([createImage(2)]));
    await expect(result.current.loadImagePage(params)).resolves.toMatchObject({
      images: [createImage(2)],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not let an older page response overwrite the current page', async () => {
    const firstPage = createDeferred<Response>();
    const secondPage = createDeferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => (
      String(input).includes('offset=0') ? firstPage.promise : secondPage.promise
    ));
    vi.stubGlobal('fetch', fetchMock);
    let currentPage = 1;
    const { result, rerender } = renderHook(() => useImagePageLoader(createOptions(currentPage)));

    act(() => result.current.fetchImages());
    currentPage = 2;
    rerender();
    act(() => result.current.fetchImages());

    await act(async () => {
      secondPage.resolve(responseFor([createImage(2)]));
      await secondPage.promise;
    });
    await waitFor(() => expect(result.current.images[0]?.image_id).toBe(2));

    await act(async () => {
      firstPage.resolve(responseFor([createImage(1)]));
      await firstPage.promise;
    });
    expect(result.current.images[0]?.image_id).toBe(2);
  });

  it('aborts in-flight requests when the hook unmounts', async () => {
    const deferred = createDeferred<Response>();
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return deferred.promise;
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result, unmount } = renderHook(() => useImagePageLoader(createOptions()));
    const request = result.current.loadImagePage(new URLSearchParams({ offset: '8' }));

    unmount();
    expect(requestSignal?.aborted).toBe(true);

    deferred.resolve(responseFor([createImage(8)]));
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('restores the mounted lifecycle after StrictMode effect replay', async () => {
    const fetchMock = vi.fn().mockResolvedValue(responseFor([createImage(9)]));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useImagePageLoader(createOptions()), {
      wrapper: StrictMode,
    });

    act(() => result.current.fetchImages());
    await waitFor(() => expect(result.current.images[0]?.image_id).toBe(9));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
