import { useEffect, useSyncExternalStore } from 'react';
import { apiClient, isAbortError } from '../api/client';
import { LibraryJob } from '../types';

const ACTIVE_STATUSES: LibraryJob['status'][] = ['queued', 'running', 'cancelling'];
const TERMINAL_STATUSES: LibraryJob['status'][] = ['completed', 'cancelled', 'failed', 'interrupted'];
const ACTIVE_POLL_DELAY = 800;
const IDLE_POLL_DELAY = 10000;
export const LIBRARY_JOB_RECOVERY_POLL_DELAY = 1500;

export const isLibraryJobActive = (job: LibraryJob | null): boolean => (
  !!job && ACTIVE_STATUSES.includes(job.status)
);

export const isLibraryJobTerminal = (job: LibraryJob | null): boolean => (
  !!job && TERMINAL_STATUSES.includes(job.status)
);

interface LibraryJobStoreSnapshot {
  job: LibraryJob | null;
  busy: boolean;
  error: unknown;
}

export interface LibraryJobStoreEvent {
  type: 'updated' | 'terminal' | 'error';
  job: LibraryJob | null;
  previousJob: LibraryJob | null;
  error?: unknown;
}

export interface UseLibraryJobStoreOptions {
  onJobFinished?: (job: LibraryJob) => void;
  onPollingError?: (error: unknown) => void;
}

const initialSnapshot: LibraryJobStoreSnapshot = {
  job: null,
  busy: false,
  error: null,
};

let snapshot = initialSnapshot;
let pollTimer: number | null = null;
let pollGeneration = 0;
let activeRequest: AbortController | null = null;
let subscriberCount = 0;
let previousJob: LibraryJob | null = null;

const listeners = new Set<() => void>();
const eventListeners = new Set<(event: LibraryJobStoreEvent) => void>();

const notify = () => {
  listeners.forEach(listener => listener());
};

const emit = (event: LibraryJobStoreEvent) => {
  eventListeners.forEach(listener => listener(event));
};

const setSnapshot = (next: LibraryJobStoreSnapshot) => {
  snapshot = next;
  notify();
};

const updateJob = (job: LibraryJob | null) => {
  const priorJob = previousJob;
  previousJob = job;
  const becameTerminal = (
    !!job
    && !!priorJob
    && job.job_id === priorJob.job_id
    && isLibraryJobActive(priorJob)
    && isLibraryJobTerminal(job)
  );

  setSnapshot({
    job,
    busy: isLibraryJobActive(job) ? true : snapshot.busy,
    error: null,
  });
  emit({ type: becameTerminal ? 'terminal' : 'updated', job, previousJob: priorJob });

  if (becameTerminal && job.job_type === 'update-library' && ['completed', 'cancelled'].includes(job.status)) {
    window.dispatchEvent(new Event('web-viewer-library-data-changed'));
  }
};

const clearTimer = () => {
  if (pollTimer !== null) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
};

const stopPolling = () => {
  pollGeneration += 1;
  clearTimer();
  activeRequest?.abort();
  activeRequest = null;
};

const schedulePoll = (delay: number, generation: number) => {
  if (subscriberCount === 0 || generation !== pollGeneration) return;
  clearTimer();
  pollTimer = window.setTimeout(() => {
    pollTimer = null;
    void pollCurrentJob(generation);
  }, delay);
};

const pollCurrentJob = async (generation = pollGeneration): Promise<void> => {
  if (subscriberCount === 0 || generation !== pollGeneration) return;

  const controller = new AbortController();
  activeRequest?.abort();
  activeRequest = controller;
  try {
    const response = await apiClient.libraryJobs.current({ signal: controller.signal });
    if (generation !== pollGeneration || controller.signal.aborted) return;
    updateJob(response.job);
    setSnapshot({
      ...snapshot,
      busy: isLibraryJobActive(response.job),
      error: null,
    });
    schedulePoll(isLibraryJobActive(response.job) ? ACTIVE_POLL_DELAY : IDLE_POLL_DELAY, generation);
  } catch (error) {
    if (generation !== pollGeneration || controller.signal.aborted || isAbortError(error)) return;
    setSnapshot({ ...snapshot, error, busy: false });
    emit({ type: 'error', job: snapshot.job, previousJob, error });
    schedulePoll(LIBRARY_JOB_RECOVERY_POLL_DELAY, generation);
  } finally {
    if (activeRequest === controller) activeRequest = null;
  }
};

const startPolling = () => {
  if (subscriberCount === 0 || pollTimer !== null || activeRequest !== null) return;
  const generation = pollGeneration;
  void pollCurrentJob(generation);
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  subscriberCount += 1;
  startPolling();
  return () => {
    listeners.delete(listener);
    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount === 0) {
      stopPolling();
      setSnapshot({ ...snapshot, busy: false });
    }
  };
};

const subscribeEvents = (listener: (event: LibraryJobStoreEvent) => void) => {
  eventListeners.add(listener);
  return () => {
    eventListeners.delete(listener);
  };
};

const syncCurrentJob = (job: LibraryJob | null) => {
  stopPolling();
  updateJob(job);
  setSnapshot({ ...snapshot, busy: isLibraryJobActive(job), error: null });
  if (isLibraryJobActive(job)) {
    const generation = pollGeneration;
    void pollCurrentJob(generation);
  } else {
    startPolling();
  }
};

const startLibraryJob = (job: LibraryJob) => {
  stopPolling();
  updateJob(job);
  setSnapshot({ ...snapshot, busy: true, error: null });
  if (subscriberCount > 0) {
    const generation = pollGeneration;
    void pollCurrentJob(generation);
  }
};

const updateLibraryJob = (job: LibraryJob | null) => {
  updateJob(job);
  setSnapshot({ ...snapshot, busy: isLibraryJobActive(job), error: null });
};

const setJobBusy = (busy: boolean) => {
  setSnapshot({ ...snapshot, busy });
};

const requestSync = () => {
  stopPolling();
  if (subscriberCount > 0) {
    const generation = pollGeneration;
    void pollCurrentJob(generation);
  }
};

const cancelLibraryJob = async (jobId: string): Promise<LibraryJob> => {
  const response = await apiClient.libraryJobs.cancel(jobId);
  if (!response.job) throw new Error('工作狀態不存在。');
  updateLibraryJob(response.job);
  requestSync();
  return response.job;
};

export const libraryJobStore = {
  subscribe,
  subscribeEvents,
  getSnapshot: () => snapshot,
  syncCurrentJob,
  startLibraryJob,
  updateLibraryJob,
  setJobBusy,
  requestSync,
  cancelLibraryJob,
  stopPolling,
};

export const useLibraryJobStore = (options: UseLibraryJobStoreOptions = {}) => {
  const currentSnapshot = useSyncExternalStore(
    subscribe,
    libraryJobStore.getSnapshot,
    libraryJobStore.getSnapshot,
  );

  useEffect(() => {
    if (!options.onJobFinished && !options.onPollingError) return undefined;
    return subscribeEvents(event => {
      if (event.type === 'terminal' && event.job) options.onJobFinished?.(event.job);
      if (event.type === 'error' && event.error) options.onPollingError?.(event.error);
    });
  }, [options.onJobFinished, options.onPollingError]);

  return {
    job: currentSnapshot.job,
    libraryJob: currentSnapshot.job,
    scanning: currentSnapshot.busy || isLibraryJobActive(currentSnapshot.job),
    busy: currentSnapshot.busy,
    error: currentSnapshot.error,
    startLibraryJob,
    syncCurrentJob,
    updateLibraryJob,
    setJobBusy,
    requestSync,
    cancelLibraryJob,
    stopPolling,
  };
};

export const resetLibraryJobStoreForTests = () => {
  stopPolling();
  snapshot = initialSnapshot;
  previousJob = null;
  listeners.clear();
  eventListeners.clear();
  subscriberCount = 0;
};
