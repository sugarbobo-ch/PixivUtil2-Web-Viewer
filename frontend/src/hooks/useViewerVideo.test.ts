import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ImageItem } from '../types';
import { useViewerVideo } from './useViewerVideo';

const item: ImageItem = {
  image_id: 1,
  member_id: 7,
  title: 'Video item',
  save_name: 'Artist/video.mp4',
  created_date: '2026-08-12',
  last_update_date: '2026-08-12',
};

const makeOptions = (currentMediaUrl = '/media-a') => ({
  currentItem: item,
  currentItemIsVideo: true,
  currentMediaUrl,
  demoMode: false,
  showFilmstrip: true,
  showToolbar: true,
  shouldAutoplayVideo: false,
  videoMuted: true,
  videoVolume: 0,
  videoSeekSeconds: 5,
  videoHoldPlaybackRate: 2,
});

describe('useViewerVideo', () => {
  it('owns video readiness and resets it when the media identity changes', () => {
    const { result, rerender } = renderHook(
      ({ url }) => useViewerVideo(makeOptions(url)),
      { initialProps: { url: '/media-a' } },
    );
    const video = document.createElement('video');
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 });

    expect(result.current.isVideoReady).toBe(false);
    act(() => {
      result.current.handleVideoLoadedData({ currentTarget: video } as React.SyntheticEvent<HTMLVideoElement>);
    });
    expect(result.current.isVideoReady).toBe(true);

    rerender({ url: '/media-b' });
    expect(result.current.isVideoReady).toBe(false);
  });
});
