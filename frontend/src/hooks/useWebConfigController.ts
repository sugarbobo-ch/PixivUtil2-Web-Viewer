import { Dispatch, SetStateAction, useCallback, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import { DEFAULT_WEB_CONFIG, WebConfig, WebConfigDraft } from '../types';
import { normalizeWebConfig } from '../utils/webConfig';

export const DEFAULT_WEB_CONFIG_DRAFT: WebConfigDraft = {
  ...DEFAULT_WEB_CONFIG,
  pixivConfigPath: '',
};

export const getLibrarySourceSignature = (config: WebConfigDraft): string => [
  config.librarySourceMode,
  config.librarySourceMode === 'folder'
    ? config.mediaRootPath.trim()
    : config.pixivConfigPath.trim(),
].join('\u0000');

const toDraft = (value: WebConfig): WebConfigDraft => ({
  ...value,
  pixivConfigPath: value.pixivConfigPath || '',
});

export interface UseWebConfigControllerResult {
  webConfig: WebConfigDraft;
  setWebConfig: Dispatch<SetStateAction<WebConfigDraft>>;
  replaceWebConfig: (value: WebConfig | WebConfigDraft) => WebConfigDraft;
  loadWebConfig: () => Promise<WebConfigDraft>;
  saveWebConfig: () => Promise<WebConfigDraft>;
  loading: boolean;
  error: unknown;
  librarySourceHasUnsavedChanges: boolean;
  librarySourceNeedsUpdate: boolean;
  clearLibrarySourceNeedsUpdate: () => void;
}

export const useWebConfigController = (): UseWebConfigControllerResult => {
  const [webConfig, setWebConfig] = useState<WebConfigDraft>(DEFAULT_WEB_CONFIG_DRAFT);
  const [savedLibrarySourceSignature, setSavedLibrarySourceSignature] = useState(
    getLibrarySourceSignature(DEFAULT_WEB_CONFIG_DRAFT),
  );
  const [librarySourceNeedsUpdate, setLibrarySourceNeedsUpdate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const replaceWebConfig = useCallback((value: WebConfig | WebConfigDraft): WebConfigDraft => {
    const nextWebConfig = toDraft(normalizeWebConfig(value));
    setWebConfig(nextWebConfig);
    setSavedLibrarySourceSignature(getLibrarySourceSignature(nextWebConfig));
    setLibrarySourceNeedsUpdate(false);
    setError(null);
    return nextWebConfig;
  }, []);

  const loadWebConfig = useCallback(async (): Promise<WebConfigDraft> => {
    setLoading(true);
    setError(null);
    try {
      return replaceWebConfig(await apiClient.webConfig.get());
    } catch (nextError) {
      setError(nextError);
      throw nextError;
    } finally {
      setLoading(false);
    }
  }, [replaceWebConfig]);

  const saveWebConfig = useCallback(async (): Promise<WebConfigDraft> => {
    setLoading(true);
    setError(null);
    try {
      const normalizedWebConfig = normalizeWebConfig(webConfig);
      const payload: WebConfigDraft = {
        ...DEFAULT_WEB_CONFIG_DRAFT,
        ...normalizedWebConfig,
        pixivConfigPath: webConfig.pixivConfigPath.trim(),
        mediaRootPath: normalizedWebConfig.librarySourceMode === 'pixiv'
          ? ''
          : normalizedWebConfig.mediaRootPath.trim(),
      };
      const response = await apiClient.webConfig.update(payload);
      const nextWebConfig = toDraft(response.webConfig);
      const sourceChanged = getLibrarySourceSignature(nextWebConfig) !== savedLibrarySourceSignature;
      setWebConfig(nextWebConfig);
      setSavedLibrarySourceSignature(getLibrarySourceSignature(nextWebConfig));
      if (sourceChanged) setLibrarySourceNeedsUpdate(true);
      return nextWebConfig;
    } catch (nextError) {
      setError(nextError);
      throw nextError;
    } finally {
      setLoading(false);
    }
  }, [savedLibrarySourceSignature, webConfig]);

  const librarySourceHasUnsavedChanges = useMemo(
    () => getLibrarySourceSignature(webConfig) !== savedLibrarySourceSignature,
    [savedLibrarySourceSignature, webConfig],
  );
  const clearLibrarySourceNeedsUpdate = useCallback(() => {
    setLibrarySourceNeedsUpdate(false);
  }, []);

  return {
    webConfig,
    setWebConfig,
    replaceWebConfig,
    loadWebConfig,
    saveWebConfig,
    loading,
    error,
    librarySourceHasUnsavedChanges,
    librarySourceNeedsUpdate,
    clearLibrarySourceNeedsUpdate,
  };
};
