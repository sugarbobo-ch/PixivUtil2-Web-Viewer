import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiClient, isAbortError, requestJson } from './client';

const responseFor = (body: unknown, ok = true, status = 200): Response => ({
  ok,
  status,
  json: async () => body,
} as Response);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('typed API client', () => {
  it('decodes successful JSON through the supplied parser', async () => {
    const fetchMock = vi.fn().mockResolvedValue(responseFor({ value: 3 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestJson('/api/example', undefined, value => {
      if (!value || typeof value !== 'object' || !('value' in value)) throw new Error('invalid');
      return Number(value.value);
    })).resolves.toBe(3);
    expect(fetchMock).toHaveBeenCalledWith('/api/example', {});
  });

  it('preserves structured HTTP errors and prefers API detail text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      responseFor({ detail: 'job unavailable' }, false, 409),
    ));

    await expect(requestJson('/api/example')).rejects.toMatchObject({
      message: 'job unavailable',
      status: 409,
      kind: 'http',
      data: { detail: 'job unavailable' },
    });
  });

  it('reports a successful response with malformed JSON as an API error', async () => {
    const response = {
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError('invalid json')),
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(requestJson('/api/example')).rejects.toMatchObject({
      name: 'ApiError',
      status: 200,
      kind: 'invalid-json',
    });
  });

  it('passes AbortError through without converting it to a generic API error', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    await expect(requestJson('/api/example')).rejects.toBe(abortError);
    expect(isAbortError(abortError)).toBe(true);
  });

  it('uses typed web-config endpoint methods and JSON request contracts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(responseFor({
      status: 'success',
      webConfig: { webTheme: 'light' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiClient.webConfig.update({ webTheme: 'light' });

    expect(result.status).toBe('success');
    expect(result.webConfig.webTheme).toBe('light');
    expect(fetchMock).toHaveBeenCalledWith('/api/web-config', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ webTheme: 'light' }),
    }));
  });

  it('validates directory metadata at the client boundary', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(responseFor([{ member_id: 8, name: 'artist', artwork_count: 2 }]))
      .mockResolvedValueOnce(responseFor([{ month: '2026-08', count: 2 }]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.directory.artists()).resolves.toEqual([
      { member_id: 8, name: 'artist', artwork_count: 2 },
    ]);
    await expect(apiClient.directory.months()).resolves.toEqual([
      { month: '2026-08', count: 2 },
    ]);
  });

  it('keeps successful binary responses available to download workflows', async () => {
    const response = { ok: true, status: 200, blob: vi.fn() } as unknown as Response;
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.images.downloadZip([8], [{ image_id: 8, path: 'artist/8.jpg' }])).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledWith('/api/images/download-zip', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ image_ids: [8], items: [{ image_id: 8, path: 'artist/8.jpg' }] }),
    }));
  });

  it('uses encoded thumbnail cache URLs and the expected mutation methods', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(responseFor({
        active_files: 1,
        active_bytes: 1024,
        tracked_files: 1,
        recoverable_files: 1,
        recoverable_bytes: 512,
        recovery_jobs: [],
      }))
      .mockResolvedValueOnce(responseFor({
        job_id: 'job/id',
        created_at: null,
        moved: 1,
        total: 1,
        total_bytes: 512,
        offset: 24,
        limit: 24,
        has_more: false,
        entries: [],
      }))
      .mockResolvedValueOnce(responseFor({ status: 'success', restored: 1, conflicts: 0, errors: [] }))
      .mockResolvedValueOnce(responseFor({
        status: 'success',
        moved: 1,
        bytes_freed: 512,
        metadata_removed: 1,
        remaining: 0,
        errors: [],
      }));
    vi.stubGlobal('fetch', fetchMock);

    const signal = new AbortController().signal;
    await apiClient.library.thumbnailCache.stats({ signal });
    await apiClient.library.thumbnailCache.entries(
      'job/id with spaces',
      { offset: 24, limit: 24 },
      { signal },
    );
    await apiClient.library.thumbnailCache.restore('job/id with spaces');
    await apiClient.library.thumbnailCache.recycle('job/id with spaces');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/library/stats', expect.objectContaining({
      cache: 'no-store',
      signal,
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/library/cache/job%2Fid%20with%20spaces/entries?offset=24&limit=24',
      expect.objectContaining({ cache: 'no-store', signal }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/library/cache/job%2Fid%20with%20spaces/restore',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/library/cache/job%2Fid%20with%20spaces',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('keeps thumbnail cache HTTP failures as ApiError instances', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      responseFor({ detail: 'cache unavailable' }, false, 503),
    ));

    await expect(apiClient.library.thumbnailCache.stats()).rejects.toBeInstanceOf(ApiError);
    await expect(apiClient.library.thumbnailCache.stats()).rejects.toMatchObject({
      message: 'cache unavailable',
      status: 503,
      kind: 'http',
    });
  });

  it('passes an aborted thumbnail cache entries request through unchanged', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    await expect(apiClient.library.thumbnailCache.entries('job-1')).rejects.toBe(abortError);
    expect(isAbortError(abortError)).toBe(true);
  });
});
