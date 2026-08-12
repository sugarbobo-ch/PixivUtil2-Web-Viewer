import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { DEFAULT_WEB_CONFIG, WebConfig } from '../types';
import { useWebConfigController } from './useWebConfigController';

const loadedConfig: WebConfig = {
  ...DEFAULT_WEB_CONFIG,
  itemsPerPage: 999999,
  pixivConfigPath: '  C:/pixiv/config.ini  ',
};

const ControllerProbe = () => {
  const controller = useWebConfigController();
  return (
    <div>
      <output data-testid="items-per-page">{controller.webConfig.itemsPerPage}</output>
      <output data-testid="source-dirty">{String(controller.librarySourceHasUnsavedChanges)}</output>
      <output data-testid="source-needs-update">{String(controller.librarySourceNeedsUpdate)}</output>
      <button type="button" onClick={() => void controller.loadWebConfig()}>load</button>
      <button
        type="button"
        onClick={() => controller.setWebConfig(current => ({
          ...current,
          librarySourceMode: 'folder',
          mediaRootPath: ' C:/media ',
        }))}
      >
        change source
      </button>
      <button type="button" onClick={() => void controller.saveWebConfig()}>save</button>
    </div>
  );
};

describe('useWebConfigController', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads and normalizes web config at the API boundary', async () => {
    vi.spyOn(apiClient.webConfig, 'get').mockResolvedValue(loadedConfig);

    render(<ControllerProbe />);
    screen.getByRole('button', { name: 'load' }).click();

    await waitFor(() => expect(screen.getByTestId('items-per-page').textContent).toBe('5000'));
    expect(screen.getByTestId('source-dirty').textContent).toBe('false');
  });

  it('keeps source dirty state and marks a saved source change for the workflow gate', async () => {
    vi.spyOn(apiClient.webConfig, 'get').mockResolvedValue(loadedConfig);
    vi.spyOn(apiClient.webConfig, 'update').mockResolvedValue({
      status: 'success',
      webConfig: {
        ...loadedConfig,
        librarySourceMode: 'folder',
        mediaRootPath: 'C:/media',
      },
    });

    render(<ControllerProbe />);
    screen.getByRole('button', { name: 'load' }).click();
    await waitFor(() => expect(screen.getByTestId('source-dirty').textContent).toBe('false'));

    screen.getByRole('button', { name: 'change source' }).click();
    await waitFor(() => expect(screen.getByTestId('source-dirty').textContent).toBe('true'));

    screen.getByRole('button', { name: 'save' }).click();
    await waitFor(() => expect(apiClient.webConfig.update).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('source-dirty').textContent).toBe('false'));
    expect(screen.getByTestId('source-needs-update').textContent).toBe('true');
  });
});
