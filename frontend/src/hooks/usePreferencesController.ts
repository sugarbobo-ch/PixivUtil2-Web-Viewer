import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import { DEFAULT_WEB_CONFIG, WebConfig } from '../types';
import { normalizeWebConfig } from '../utils/webConfig';

export interface PreferencesController {
  config: WebConfig;
  patchConfig: (patch: Partial<WebConfig>) => Promise<WebConfig>;
  replaceConfig: (config: WebConfig | Partial<WebConfig>) => WebConfig;
  loadConfig: () => Promise<WebConfig>;
  isReady: boolean;
  isSaving: boolean;
  error: unknown;
}

interface UsePreferencesControllerOptions {
  enabled?: boolean;
  onError?: (error: unknown) => void;
}

/**
 * Owns the app-level WebConfig mirror. Settings and reader controls can still
 * keep draft or instance-local state, but persisted preferences enter the app
 * through this one normalized controller and one serialized write queue.
 */
export const usePreferencesController = ({
  enabled = true,
  onError,
}: UsePreferencesControllerOptions = {}): PreferencesController => {
  const [config, setConfig] = useState<WebConfig>(DEFAULT_WEB_CONFIG);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const configRef = useRef(config);
  const persistQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const requestIdRef = useRef(0);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const replaceConfig = useCallback((value: WebConfig | Partial<WebConfig>): WebConfig => {
    const nextConfig = normalizeWebConfig({ ...configRef.current, ...value });
    configRef.current = nextConfig;
    setConfig(nextConfig);
    setError(null);
    return nextConfig;
  }, []);

  const loadConfig = useCallback(async (): Promise<WebConfig> => {
    setError(null);
    try {
      const nextConfig = normalizeWebConfig(await apiClient.webConfig.get());
      configRef.current = nextConfig;
      setConfig(nextConfig);
      return nextConfig;
    } catch (nextError) {
      setError(nextError);
      onError?.(nextError);
      throw nextError;
    }
  }, [onError]);

  const patchConfig = useCallback(async (patch: Partial<WebConfig>): Promise<WebConfig> => {
    const requestId = ++requestIdRef.current;
    const previousConfig = configRef.current;
    replaceConfig({ ...previousConfig, ...patch });
    setIsSaving(true);

    const request = persistQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const current = await apiClient.webConfig.get();
        const nextConfig = normalizeWebConfig({ ...current, ...patch });
        const response = await apiClient.webConfig.update(nextConfig);
        const savedConfig = normalizeWebConfig(response.webConfig);
        if (requestId >= requestIdRef.current) {
          configRef.current = savedConfig;
          setConfig(savedConfig);
        }
        return savedConfig;
      });

    persistQueueRef.current = request.then(() => undefined, () => undefined);

    try {
      return await request;
    } catch (nextError) {
      if (requestId === requestIdRef.current) {
        configRef.current = previousConfig;
        setConfig(previousConfig);
      }
      setError(nextError);
      onError?.(nextError);
      throw nextError;
    } finally {
      if (requestId === requestIdRef.current) setIsSaving(false);
    }
  }, [onError, replaceConfig]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    void loadConfig()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, loadConfig]);

  return {
    config,
    patchConfig,
    replaceConfig,
    loadConfig,
    isReady,
    isSaving,
    error,
  };
};

