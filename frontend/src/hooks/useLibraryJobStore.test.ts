import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { LibraryJob } from '../types';
import {
  isLibraryJobActive,
  LIBRARY_JOB_RECOVERY_POLL_DELAY,
  resetLibraryJobStoreForTests,
  useLibraryJobStore,
} from './useLibraryJobStore';

const createJob = (overrides: Partial<LibraryJob> = {}): LibraryJob => ({
  job_id: 'job-store-test',
  job_type: 'update-library',
  status: 'running',
  phase: 'indexing',
  directory: 'C:/media',
  analyze_colors: true,
  discovered: 2,
  total: 2,
  processed: 1,
  added: 0,
  updated: 0,
  unchanged: 1,
  conflicts: 0,
  errors: 0,
  colors_created: 0,
  colors_reused: 0,
  cache_moved: 0,
  current_file: 'image.jpg',
  error_message: null,
  cancel_requested: false,
  created_at: '2026-08-10T00:00:00Z',
  started_at: '2026-08-10T00:00:01Z',
  finished_at: null,
  updated_at: '2026-08-10T00:00:02Z',
  ...overrides,
});

describe('useLibraryJobStore', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetLibraryJobStoreForTests();
  });

  it('shares one current-job poller and emits one terminal event to subscribers', async () => {
    const activeJob = createJob();
    const completedJob = createJob({
      status: 'completed',
      phase: 'completed',
      processed: 2,
      finished_at: '2026-08-10T00:00:03Z',
    });
    const current = vi.spyOn(apiClient.libraryJobs, 'current')
      .mockResolvedValueOnce({ job: activeJob })
      .mockResolvedValueOnce({ job: completedJob });
    const onFinished = vi.fn();

    const first = renderHook(() => useLibraryJobStore({ onJobFinished: onFinished }));
    const second = renderHook(() => useLibraryJobStore({ onJobFinished: onFinished }));

    await waitFor(() => expect(first.result.current.job?.status).toBe('running'));
    expect(current).toHaveBeenCalledTimes(1);
    expect(isLibraryJobActive(second.result.current.job)).toBe(true);

    await act(async () => {
      await new Promise(resolve => window.setTimeout(resolve, 850));
    });
    await waitFor(() => expect(first.result.current.job?.status).toBe('completed'));
    expect(onFinished).toHaveBeenCalledTimes(2);
    expect(current).toHaveBeenCalledTimes(2);

    first.unmount();
    second.unmount();
  });

  it('cancels through the shared client and updates the shared job state', async () => {
    const runningJob = createJob();
    const cancelledJob = createJob({ status: 'cancelled', phase: 'cancelled', cancel_requested: true });
    vi.spyOn(apiClient.libraryJobs, 'current')
      .mockResolvedValueOnce({ job: runningJob })
      .mockResolvedValue({ job: cancelledJob });
    const cancel = vi.spyOn(apiClient.libraryJobs, 'cancel').mockResolvedValue({ job: cancelledJob });

    const { result } = renderHook(() => useLibraryJobStore());
    await waitFor(() => expect(result.current.job?.job_id).toBe(runningJob.job_id));

    await act(async () => {
      await result.current.cancelLibraryJob(runningJob.job_id);
    });

    expect(cancel).toHaveBeenCalledWith(runningJob.job_id);
    expect(result.current.job?.status).toBe('cancelled');
  });

  it('recovers from a temporary backend outage without waiting for the idle interval', async () => {
    const runningJob = createJob();
    const interruptedJob = createJob({
      status: 'interrupted',
      phase: 'interrupted',
      error_message: 'Backend restarted; run the library job again',
      finished_at: '2026-08-10T00:00:04Z',
    });
    const pollingError = new Error('backend offline');
    const current = vi.spyOn(apiClient.libraryJobs, 'current')
      .mockResolvedValueOnce({ job: runningJob })
      .mockRejectedValueOnce(pollingError)
      .mockResolvedValueOnce({ job: interruptedJob });
    const onFinished = vi.fn();
    const onPollingError = vi.fn();

    const { result } = renderHook(() => useLibraryJobStore({ onJobFinished: onFinished, onPollingError }));
    await waitFor(() => expect(result.current.job?.status).toBe('running'));
    await waitFor(() => expect(onPollingError).toHaveBeenCalledWith(pollingError));

    await act(async () => {
      await new Promise(resolve => window.setTimeout(resolve, LIBRARY_JOB_RECOVERY_POLL_DELAY + 100));
    });
    await waitFor(() => expect(result.current.job?.status).toBe('interrupted'));

    expect(current).toHaveBeenCalledTimes(3);
    expect(onFinished).toHaveBeenCalledWith(interruptedJob);
  });
});
