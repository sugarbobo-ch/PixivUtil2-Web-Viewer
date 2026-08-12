import { useCallback, useEffect, useRef, useState } from 'react';
import { LibraryJob } from '../types';
import { apiClient, isAbortError } from '../api/client';

interface UseLibraryJobPollingOptions {
  isOpen: boolean;
  onJobFinished: (job: LibraryJob) => void;
  onPollingError: (error: unknown) => void;
}

export const isLibraryJobActive = (job: LibraryJob | null) => (
  !!job && ['queued', 'running', 'cancelling'].includes(job.status)
);

export const useLibraryJobPolling = ({
  isOpen,
  onJobFinished,
  onPollingError,
}: UseLibraryJobPollingOptions) => {
  const [libraryJob, setLibraryJob] = useState<LibraryJob | null>(null);
  const [scanning, setScanning] = useState(false);
  const pollTimerRef = useRef<number | null>(null);
  const pollGenerationRef = useRef(0);
  const activeRequestRef = useRef<AbortController | null>(null);

  const stopPolling = useCallback(() => {
    pollGenerationRef.current += 1;
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
  }, []);

  const pollLibraryJob = useCallback(async (
    jobId: string,
    generation = pollGenerationRef.current,
  ) => {
    const controller = new AbortController();
    activeRequestRef.current = controller;
    try {
      const data = await apiClient.libraryJobs.get(jobId, { signal: controller.signal });
      if (generation !== pollGenerationRef.current || controller.signal.aborted) return;

      setLibraryJob(data);
      if (isLibraryJobActive(data)) {
        setScanning(true);
        pollTimerRef.current = window.setTimeout(() => {
          void pollLibraryJob(jobId, generation);
        }, 800);
        return;
      }

      stopPolling();
      setScanning(false);
      onJobFinished(data);
    } catch (error) {
      if (generation !== pollGenerationRef.current || controller.signal.aborted || isAbortError(error)) return;
      stopPolling();
      setScanning(false);
      onPollingError(error);
    } finally {
      if (activeRequestRef.current === controller) activeRequestRef.current = null;
    }
  }, [onJobFinished, onPollingError, stopPolling]);

  const startLibraryJob = useCallback((job: LibraryJob) => {
    stopPolling();
    setLibraryJob(job);
    setScanning(true);
    void pollLibraryJob(job.job_id);
  }, [pollLibraryJob, stopPolling]);

  const syncCurrentJob = useCallback((job: LibraryJob | null) => {
    if (!job) {
      stopPolling();
      setLibraryJob(null);
      setScanning(false);
      return;
    }

    setLibraryJob(job);
    if (isLibraryJobActive(job)) {
      startLibraryJob(job);
      return;
    }

    stopPolling();
    setScanning(false);
  }, [startLibraryJob, stopPolling]);

  const updateLibraryJob = useCallback((job: LibraryJob | null) => {
    setLibraryJob(job);
  }, []);

  const setJobBusy = useCallback((busy: boolean) => {
    setScanning(busy);
  }, []);

  useEffect(() => {
    if (isOpen) return;
    stopPolling();
    setScanning(false);
  }, [isOpen, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  return {
    libraryJob,
    scanning,
    startLibraryJob,
    syncCurrentJob,
    updateLibraryJob,
    setJobBusy,
    stopPolling,
  };
};
