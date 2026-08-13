import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { DEFAULT_WEB_CONFIG, WebConfig } from '../types';
import { normalizeWebConfig } from '../utils/webConfig';
import { usePreferencesController } from './usePreferencesController';

const config: WebConfig = {
  ...DEFAULT_WEB_CONFIG,
  itemsPerPage: 100,
};

describe('usePreferencesController', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads one normalized config and applies optimistic patches through the same owner', async () => {
    const get = vi.spyOn(apiClient.webConfig, 'get').mockResolvedValue({
      ...config,
      uiLanguage: 'en-US' as WebConfig['uiLanguage'],
    });
    const update = vi.spyOn(apiClient.webConfig, 'update').mockResolvedValue({
      status: 'success',
      webConfig: { ...config, uiLanguage: 'en', fullscreenPageLayout: 'spread' },
    });
    const { result } = renderHook(() => usePreferencesController());

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.config.uiLanguage).toBe('en');

    await act(async () => {
      await result.current.patchConfig({ fullscreenPageLayout: 'spread' });
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      fullscreenPageLayout: 'spread',
      uiLanguage: 'en',
    }));
    expect(result.current.config.fullscreenPageLayout).toBe('spread');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('serializes rapid patches and keeps the latest optimistic state', async () => {
    let serverConfig = { ...config };
    let releaseFirstUpdate: () => void = () => undefined;
    const firstUpdateBlocked = new Promise<void>(resolve => {
      releaseFirstUpdate = resolve;
    });
    let updateCount = 0;

    vi.spyOn(apiClient.webConfig, 'get').mockImplementation(async () => ({ ...serverConfig }));
    const update = vi.spyOn(apiClient.webConfig, 'update').mockImplementation(async nextConfig => {
      updateCount += 1;
      if (updateCount === 1) await firstUpdateBlocked;
      serverConfig = normalizeWebConfig(nextConfig);
      return { status: 'success', webConfig: { ...serverConfig } };
    });
    const { result } = renderHook(() => usePreferencesController());

    await waitFor(() => expect(result.current.isReady).toBe(true));
    let firstPatch!: Promise<WebConfig>;
    let secondPatch!: Promise<WebConfig>;
    act(() => {
      firstPatch = result.current.patchConfig({ fullscreenShowToolbar: false });
      secondPatch = result.current.patchConfig({ fullscreenShowThumbnails: false });
    });

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    releaseFirstUpdate();
    await act(async () => {
      await Promise.all([firstPatch, secondPatch]);
    });

    expect(update).toHaveBeenCalledTimes(2);
    expect(result.current.config.fullscreenShowToolbar).toBe(false);
    expect(result.current.config.fullscreenShowThumbnails).toBe(false);
  });

  it('rolls back the latest patch when persistence fails', async () => {
    vi.spyOn(apiClient.webConfig, 'get').mockResolvedValue(config);
    vi.spyOn(apiClient.webConfig, 'update').mockRejectedValue(new Error('write failed'));
    const onError = vi.fn();
    const { result } = renderHook(() => usePreferencesController({ onError }));

    await waitFor(() => expect(result.current.isReady).toBe(true));
    await expect(act(async () => {
      await result.current.patchConfig({ fullscreenPageLayout: 'spread' });
    })).rejects.toThrow('write failed');

    expect(result.current.config.fullscreenPageLayout).toBe('single');
    expect(onError).toHaveBeenCalled();
  });
});
