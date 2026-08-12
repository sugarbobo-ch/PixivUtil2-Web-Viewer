import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { DEFAULT_WEB_CONFIG, WebConfig } from '../types';
import { normalizeWebConfig } from '../utils/webConfig';
import { useWebConfigLifecycle } from './useWebConfigLifecycle';

const config: WebConfig = {
  ...DEFAULT_WEB_CONFIG,
  itemsPerPage: 100,
  pixivConfigPath: 'C:/pixiv/config.ini',
};

describe('useWebConfigLifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads once and exposes readiness through the lifecycle hook', async () => {
    const get = vi.spyOn(apiClient.webConfig, 'get').mockResolvedValue(config);
    const onConfigLoaded = vi.fn();

    const { result } = renderHook(() => useWebConfigLifecycle({ onConfigLoaded }));

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(get).toHaveBeenCalledTimes(1);
    expect(onConfigLoaded).toHaveBeenCalledWith(config);
  });

  it('normalizes and persists a patch before handing it back to the app', async () => {
    vi.spyOn(apiClient.webConfig, 'get').mockResolvedValue(config);
    const updatedConfig = { ...config, itemsPerPage: 5000 };
    const update = vi.spyOn(apiClient.webConfig, 'update').mockResolvedValue({
      status: 'success',
      webConfig: updatedConfig,
    });
    const onConfigLoaded = vi.fn();
    const { result } = renderHook(() => useWebConfigLifecycle({ onConfigLoaded }));

    await waitFor(() => expect(result.current.isReady).toBe(true));
    await result.current.persistWebConfigPatch({ itemsPerPage: 999999 });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ itemsPerPage: 5000 }));
    expect(onConfigLoaded).toHaveBeenLastCalledWith(updatedConfig);
  });

  it('serializes rapid patches so later changes merge with the latest saved config', async () => {
    let serverConfig = { ...config };
    let releaseFirstUpdate: () => void = () => undefined;
    const firstUpdateBlocked = new Promise<void>(resolve => {
      releaseFirstUpdate = resolve;
    });
    let updateCount = 0;

    const get = vi.spyOn(apiClient.webConfig, 'get').mockImplementation(async () => ({ ...serverConfig }));
    const update = vi.spyOn(apiClient.webConfig, 'update').mockImplementation(async nextConfig => {
      updateCount += 1;
      if (updateCount === 1) await firstUpdateBlocked;
      serverConfig = normalizeWebConfig(nextConfig);
      return { status: 'success', webConfig: { ...serverConfig } };
    });
    const onConfigLoaded = vi.fn();
    const { result } = renderHook(() => useWebConfigLifecycle({ onConfigLoaded }));

    await waitFor(() => expect(result.current.isReady).toBe(true));
    const firstPatch = result.current.persistWebConfigPatch({ fullscreenShowToolbar: false });
    const secondPatch = result.current.persistWebConfigPatch({ fullscreenShowThumbnails: false });

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(get).toHaveBeenCalledTimes(2);

    releaseFirstUpdate();
    await Promise.all([firstPatch, secondPatch]);

    expect(update).toHaveBeenCalledTimes(2);
    expect(serverConfig.fullscreenShowToolbar).toBe(false);
    expect(serverConfig.fullscreenShowThumbnails).toBe(false);
  });
});
