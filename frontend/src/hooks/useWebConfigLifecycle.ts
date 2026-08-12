import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import { WebConfig } from '../types';
import { normalizeWebConfig } from '../utils/webConfig';

interface UseWebConfigLifecycleOptions {
  enabled?: boolean;
  onConfigLoaded: (config: WebConfig) => void;
  onError?: (error: unknown) => void;
}

export const useWebConfigLifecycle = ({
  enabled = true,
  onConfigLoaded,
  onError,
}: UseWebConfigLifecycleOptions) => {
  const [isReady, setIsReady] = useState(false);
  const persistQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const loadWebConfig = useCallback(async (): Promise<WebConfig> => {
    const config = await apiClient.webConfig.get();
    onConfigLoaded(config);
    return config;
  }, [onConfigLoaded]);

  const persistWebConfigPatch = useCallback((patch: Partial<WebConfig>): Promise<WebConfig> => {
    // Fullscreen toolbar controls can be changed in quick succession. Queue
    // read/merge/write cycles so a later patch never reads stale config and
    // accidentally overwrites the setting saved immediately before it.
    const request = (async () => {
      try {
        await persistQueueRef.current;
      } catch {
        // A failed write must not permanently block later preference changes.
      }

      const current = await apiClient.webConfig.get();
      const nextConfig = normalizeWebConfig({ ...current, ...patch });
      const response = await apiClient.webConfig.update(nextConfig);
      onConfigLoaded(response.webConfig);
      return response.webConfig;
    })();

    persistQueueRef.current = request.then(() => undefined, () => undefined);
    return request;
  }, [onConfigLoaded]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;

    loadWebConfig()
      .catch(error => {
        if (!cancelled) onError?.(error);
      })
      .finally(() => {
        if (!cancelled) setIsReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, loadWebConfig, onError]);

  return {
    isReady,
    loadWebConfig,
    persistWebConfigPatch,
  };
};
