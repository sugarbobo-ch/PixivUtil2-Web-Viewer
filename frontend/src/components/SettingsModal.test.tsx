import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import {
  DEFAULT_WEB_CONFIG,
  Artist,
  ThumbnailCacheRecoveryDetails,
  ThumbnailCacheRecoveryEntry,
  ThumbnailCacheRecoveryJob,
  ThumbnailCacheStats,
} from '../types';
import { resetLibraryJobStoreForTests } from '../hooks/useLibraryJobStore';
import { SettingsModal } from './SettingsModal';

const NO_ARTISTS: Artist[] = [];

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const createRecoveryJob = (jobId: string): ThumbnailCacheRecoveryJob => ({
  job_id: jobId,
  created_at: '2026-08-10T00:00:00Z',
  moved: 1,
  recoverable_files: 1,
  recoverable_bytes: 1024,
  restorable: true,
});

const createRecoveryEntry = (sourcePath: string): ThumbnailCacheRecoveryEntry => ({
  recovery_name: `${sourcePath.split('/').at(-1) ?? 'thumbnail'}.webp`,
  cache_name: 'cache-key',
  cache_bytes: 1024,
  width: 320,
  height: 240,
  reason: 'stale-source',
  moved_at: '2026-08-10T00:00:00Z',
  source_path: sourcePath,
  source_file_size: 4096,
  source_mtime_ns: 123456789,
  generated_at: '2026-08-09T00:00:00Z',
  last_accessed_at: '2026-08-09T12:00:00Z',
});

const createDetails = (jobId: string, sourcePath: string): ThumbnailCacheRecoveryDetails => ({
  job_id: jobId,
  created_at: '2026-08-10T00:00:00Z',
  moved: 1,
  total: 1,
  total_bytes: 1024,
  offset: 0,
  limit: 24,
  has_more: false,
  entries: [createRecoveryEntry(sourcePath)],
});

const createStats = (recoveryJobs: ThumbnailCacheRecoveryJob[] = []): ThumbnailCacheStats => ({
  active_files: 1,
  active_bytes: 1024,
  tracked_files: 1,
  recoverable_files: recoveryJobs.length,
  recoverable_bytes: recoveryJobs.length * 1024,
  recovery_jobs: recoveryJobs,
});

const renderModal = (isOpen = true) => render(
  <SettingsModal
    isOpen={isOpen}
    onClose={vi.fn()}
    onSettingsSaved={vi.fn()}
    artists={NO_ARTISTS}
  />,
);

const mockSupportingRequests = () => {
  vi.spyOn(apiClient.webConfig, 'get').mockResolvedValue(DEFAULT_WEB_CONFIG);
  vi.spyOn(apiClient.pixivConfig, 'get').mockResolvedValue({
    sections: {},
    hasBackup: false,
    configPath: '',
    backupPath: '',
    defaultConfigPath: '',
    usingDefaultPath: true,
  });
  vi.spyOn(apiClient.libraryJobs, 'current').mockResolvedValue({ job: null });
  vi.spyOn(apiClient.artists, 'hidden').mockResolvedValue([]);
};

afterEach(() => {
  vi.restoreAllMocks();
  resetLibraryJobStoreForTests();
});

describe('SettingsModal thumbnail cache request lifecycle', () => {
  it('passes the saved Web Viewer config back to the parent immediately', async () => {
    mockSupportingRequests();
    const savedConfig = {
      ...DEFAULT_WEB_CONFIG,
      fullscreenShowToolbar: false,
      fullscreenShowThumbnails: false,
    };
    const expectedSavedConfig = {
      ...savedConfig,
      pixivConfigPath: '',
    };
    const onSettingsSaved = vi.fn();
    const update = vi.spyOn(apiClient.webConfig, 'update').mockResolvedValue({
      status: 'success',
      webConfig: savedConfig,
    });

    render(
      <SettingsModal
        isOpen
        onClose={vi.fn()}
        onSettingsSaved={onSettingsSaved}
        artists={NO_ARTISTS}
      />,
    );

    const saveButton = await waitFor(() => {
      const button = screen.getByRole('button', { name: /儲存顯示與瀏覽設定/ });
      if (button.hasAttribute('disabled')) throw new Error('Web Viewer save button is still disabled');
      return button;
    });
    fireEvent.click(saveButton);

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(onSettingsSaved).toHaveBeenCalledWith(expectedSavedConfig);
  });

  it('does not let a closed-modal stats response overwrite the reopened state', async () => {
    mockSupportingRequests();
    const firstStats = createDeferred<ThumbnailCacheStats>();
    const secondStats = createDeferred<ThumbnailCacheStats>();
    let statsCall = 0;
    const stats = vi.spyOn(apiClient.library.thumbnailCache, 'stats').mockImplementation(() => {
      statsCall += 1;
      return statsCall === 1 ? firstStats.promise : secondStats.promise;
    });

    const view = renderModal();
    await waitFor(() => expect(stats).toHaveBeenCalledTimes(1));
    const firstSignal = stats.mock.calls[0]?.[0]?.signal;

    view.rerender(
      <SettingsModal isOpen={false} onClose={vi.fn()} onSettingsSaved={vi.fn()} artists={NO_ARTISTS} />,
    );
    expect(firstSignal?.aborted).toBe(true);

    view.rerender(
      <SettingsModal isOpen onClose={vi.fn()} onSettingsSaved={vi.fn()} artists={NO_ARTISTS} />,
    );
    await waitFor(() => expect(stats).toHaveBeenCalledTimes(2));

    await act(async () => {
      secondStats.resolve(createStats());
      await secondStats.promise;
    });
    fireEvent.click(screen.getAllByRole('tab')[1]);
    await waitFor(() => expect(screen.getByText('1 KB・1 個縮圖')).toBeTruthy());

    await act(async () => {
      firstStats.resolve({ ...createStats(), active_files: 9, active_bytes: 9 * 1024 });
      await firstStats.promise;
    });
    expect(screen.queryByText('9 KB・9 個縮圖')).toBeNull();
  });

  it('does not let a stale entries response overwrite the selected recovery job', async () => {
    mockSupportingRequests();
    const jobOne = createRecoveryJob('job-1');
    const jobTwo = createRecoveryJob('job-2');
    vi.spyOn(apiClient.library.thumbnailCache, 'stats').mockResolvedValue(createStats([jobOne, jobTwo]));
    const firstEntries = createDeferred<ThumbnailCacheRecoveryDetails>();
    const secondEntries = createDeferred<ThumbnailCacheRecoveryDetails>();
    const entries = vi.spyOn(apiClient.library.thumbnailCache, 'entries').mockImplementation(jobId => (
      jobId === jobOne.job_id ? firstEntries.promise : secondEntries.promise
    ));

    renderModal();
    await waitFor(() => expect(entries).not.toHaveBeenCalled());
    fireEvent.click(screen.getAllByRole('tab')[1]);

    const jobOneButton = await waitFor(() => {
      const button = document.querySelector<HTMLButtonElement>(
        'button[aria-controls="thumbnail-cache-recovery-job-1"]',
      );
      if (!button) throw new Error('job one details button not rendered');
      return button;
    });
    const jobTwoButton = document.querySelector<HTMLButtonElement>(
      'button[aria-controls="thumbnail-cache-recovery-job-2"]',
    );
    if (!jobTwoButton) throw new Error('job two details button not rendered');

    fireEvent.click(jobOneButton);
    await waitFor(() => expect(entries).toHaveBeenCalledTimes(1));
    const firstSignal = entries.mock.calls[0]?.[2]?.signal;
    fireEvent.click(jobTwoButton);
    await waitFor(() => expect(entries).toHaveBeenCalledTimes(2));
    expect(firstSignal?.aborted).toBe(true);

    await act(async () => {
      secondEntries.resolve(createDetails(jobTwo.job_id, 'D:/job-two/current.jpg'));
      await secondEntries.promise;
    });
    await waitFor(() => expect(screen.getByText('current.jpg')).toBeTruthy());

    await act(async () => {
      firstEntries.resolve(createDetails(jobOne.job_id, 'D:/job-one/stale.jpg'));
      await firstEntries.promise;
    });
    expect(screen.queryByText('stale.jpg')).toBeNull();
  });
});
