import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LibraryJob } from '../types';
import { useLibraryJobPolling } from './useLibraryJobPolling';

const createJob = (overrides: Partial<LibraryJob> = {}): LibraryJob => ({
  job_id: 'job-1',
  job_type: 'update-library',
  status: 'running',
  phase: 'indexing',
  directory: 'D:/media',
  analyze_colors: true,
  discovered: 10,
  total: 10,
  processed: 4,
  added: 1,
  updated: 1,
  unchanged: 2,
  conflicts: 0,
  errors: 0,
  colors_created: 0,
  colors_reused: 0,
  cache_moved: 0,
  current_file: '4.jpg',
  error_message: null,
  cancel_requested: false,
  created_at: '2026-08-10T00:00:00Z',
  started_at: '2026-08-10T00:00:01Z',
  finished_at: null,
  updated_at: '2026-08-10T00:00:02Z',
  ...overrides,
});

const responseFor = (job: LibraryJob): Response => ({
  ok: true,
  status: 200,
  json: async () => ({ job }),
} as Response);

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useLibraryJobPolling request lifecycle', () => {
  it('polls active jobs until terminal and invokes the finish callback', async () => {
    vi.useFakeTimers();
    const runningJob = createJob({ status: 'running', phase: 'indexing' });
    const completedJob = createJob({
      status: 'completed',
      phase: 'completed',
      processed: 10,
      finished_at: '2026-08-10T00:00:03Z',
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(responseFor(runningJob))
      .mockResolvedValueOnce(responseFor(completedJob));
    const onJobFinished = vi.fn();
    const onPollingError = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useLibraryJobPolling({
      isOpen: true,
      onJobFinished,
      onPollingError,
    }));

    act(() => result.current.startLibraryJob(createJob({ status: 'queued', phase: 'queued' })));
    await act(async () => {
      await flushPromises();
    });
    expect(result.current.libraryJob?.status).toBe('running');
    expect(result.current.scanning).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
      await flushPromises();
    });
    expect(onJobFinished).toHaveBeenCalledWith(completedJob);
    expect(result.current.libraryJob?.status).toBe('completed');
    expect(result.current.scanning).toBe(false);
    expect(onPollingError).not.toHaveBeenCalled();
  });

  it('reports polling errors and stops the busy state', async () => {
    const error = new Error('network down');
    const fetchMock = vi.fn().mockRejectedValue(error);
    const onJobFinished = vi.fn();
    const onPollingError = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useLibraryJobPolling({
      isOpen: true,
      onJobFinished,
      onPollingError,
    }));

    act(() => result.current.startLibraryJob(createJob()));
    await waitFor(() => expect(onPollingError).toHaveBeenCalledWith(error));
    expect(result.current.scanning).toBe(false);
    expect(onJobFinished).not.toHaveBeenCalled();
  });

  it('aborts an in-flight poll when the modal closes and ignores its response', async () => {
    const deferred = createDeferred<Response>();
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return deferred.promise;
    });
    const onJobFinished = vi.fn();
    const onPollingError = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    let isOpen = true;
    const { result, rerender } = renderHook(() => useLibraryJobPolling({
      isOpen,
      onJobFinished,
      onPollingError,
    }));

    act(() => result.current.startLibraryJob(createJob()));
    await waitFor(() => expect(requestSignal).toBeDefined());

    isOpen = false;
    rerender();
    expect(requestSignal?.aborted).toBe(true);

    deferred.resolve(responseFor(createJob({ status: 'running' })));
    await act(async () => {
      await deferred.promise;
    });
    expect(onJobFinished).not.toHaveBeenCalled();
    expect(onPollingError).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('handles an interrupted job as a terminal state after reopening', async () => {
    const interruptedJob = createJob({
      status: 'interrupted',
      phase: 'interrupted',
      error_message: 'backend restarted',
    });
    const fetchMock = vi.fn().mockResolvedValue(responseFor(interruptedJob));
    const onJobFinished = vi.fn();
    const onPollingError = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    let isOpen = false;
    const { result, rerender } = renderHook(() => useLibraryJobPolling({
      isOpen,
      onJobFinished,
      onPollingError,
    }));

    isOpen = true;
    rerender();
    act(() => result.current.syncCurrentJob(createJob({ status: 'running' })));
    await waitFor(() => expect(onJobFinished).toHaveBeenCalledWith(interruptedJob));
    expect(result.current.scanning).toBe(false);
    expect(onPollingError).not.toHaveBeenCalled();
  });
});
