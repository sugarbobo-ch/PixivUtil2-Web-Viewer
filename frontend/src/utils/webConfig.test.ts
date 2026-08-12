import { describe, expect, it } from 'vitest';
import { DEFAULT_WEB_CONFIG } from '../types';
import { normalizeWebConfig } from './webConfig';

describe('web-config contract normalization', () => {
  it('fills defaults for empty, null, and malformed roots', () => {
    expect(normalizeWebConfig(null)).toEqual(DEFAULT_WEB_CONFIG);
    expect(normalizeWebConfig([])).toEqual(DEFAULT_WEB_CONFIG);
    expect(normalizeWebConfig('legacy')).toEqual(DEFAULT_WEB_CONFIG);
    expect(DEFAULT_WEB_CONFIG.videoMuted).toBe(false);
    expect(DEFAULT_WEB_CONFIG.fullscreenToolbarSimpleMode).toBe(true);
    expect(DEFAULT_WEB_CONFIG.fullscreenShowToolbar).toBe(true);
    expect(DEFAULT_WEB_CONFIG.fullscreenShowThumbnails).toBe(true);
    expect(DEFAULT_WEB_CONFIG.fullscreenShowCheckerboard).toBe(true);
    expect(DEFAULT_WEB_CONFIG.fullscreenZoomMode).toBe('auto');
  });

  it('only derives the initial muted state from a zero volume when no mute preference exists', () => {
    expect(normalizeWebConfig({ videoVolume: 0 }).videoMuted).toBe(true);
    expect(normalizeWebConfig({ videoVolume: 1 }).videoMuted).toBe(false);
    expect(normalizeWebConfig({ videoMuted: true, videoVolume: 1 }).videoMuted).toBe(true);
  });

  it('migrates legacy keys and applies the documented numeric bounds', () => {
    const result = normalizeWebConfig({
      mosaicEnabled: 'off',
      thumbnailWidth: 99999,
      itemsPerPage: 0,
      preloadImageCount: -5,
      webtoonImageScale: 10,
      webtoonImageGap: 999,
      thumbnailCacheLimitMiB: 1,
      autoOpenBrowser: 'no',
    });

    expect(result.blurEnabled).toBe(false);
    expect(result.thumbnailSize).toBe(4096);
    expect(result.itemsPerPage).toBe(1);
    expect(result.preloadImageCount).toBe(0);
    expect(result.webtoonImageScale).toBe(30);
    expect(result.webtoonImageGap).toBe(300);
    expect(result.thumbnailCacheLimitMiB).toBe(128);
    expect(result.autoOpenBrowser).toBe(false);
    expect(result).not.toHaveProperty('mosaicEnabled');
  });

  it('normalizes fullscreen visual and video preferences', () => {
    const result = normalizeWebConfig({
      fullscreenShowToolbar: 'no',
      fullscreenShowThumbnails: 'yes',
      fullscreenShowCheckerboard: 'yes',
      fullscreenZoomMode: 'width',
      fullscreenVideoSeekSeconds: 999,
      fullscreenVideoHoldPlaybackRate: 9,
      fullscreenVideoMuted: 'off',
      videoVolume: 2,
      videoAutoplay: 'no',
    });

    expect(result.fullscreenShowToolbar).toBe(false);
    expect(result.fullscreenShowThumbnails).toBe(true);
    expect(result.fullscreenShowCheckerboard).toBe(true);
    expect(result.fullscreenZoomMode).toBe('width');
    expect(result.fullscreenVideoSeekSeconds).toBe(60);
    expect(result.fullscreenVideoHoldPlaybackRate).toBe(4);
    expect(result.videoMuted).toBe(false);
    expect(result.videoVolume).toBe(1);
    expect(result.videoAutoplay).toBe(false);
    expect(result).not.toHaveProperty('fullscreenVideoMuted');
  });
});
