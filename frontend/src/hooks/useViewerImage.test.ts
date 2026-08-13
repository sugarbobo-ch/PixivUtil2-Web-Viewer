import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageItem } from '../types';
import { useViewerImage } from './useViewerImage';

const makeImage = (imageId: number, saveName: string): ImageItem => ({
  image_id: imageId,
  member_id: 1,
  title: saveName,
  save_name: saveName,
  created_date: '2026-01-01T00:00:00Z',
  last_update_date: '2026-01-01T00:00:00Z',
});

const createOptions = (images: ImageItem[], overrides: Partial<Parameters<typeof useViewerImage>[0]> = {}) => ({
  images,
  currentIndex: 0,
  navigationDirection: 1 as const,
  currentItem: images[0],
  currentItemIsVideo: false,
  currentMediaUrl: `/api/media/${encodeURIComponent(images[0]?.save_name ?? '')}`,
  demoMode: false,
  preloadCount: 0,
  ...overrides,
});

describe('useViewerImage', () => {
  it('resets thumbnail and original failure state when the media identity changes', () => {
    const first = makeImage(1, 'first.jpg');
    const second = makeImage(2, 'second.jpg');
    const { result, rerender } = renderHook(
      options => useViewerImage(options),
      { initialProps: createOptions([first]) },
    );

    const failedImage = document.createElement('img');
    Object.defineProperty(failedImage, 'currentSrc', { value: '/api/media/first.jpg' });
    act(() => {
      result.current.handleThumbnailError();
      result.current.handleDisplayedImageError({ currentTarget: failedImage } as React.SyntheticEvent<HTMLImageElement>);
    });
    expect(result.current.thumbnailFailed).toBe(true);
    expect(result.current.originalLoadFailed).toBe(true);

    rerender(createOptions([second], {
      currentItem: second,
      currentMediaUrl: '/api/media/second.jpg',
    }));
    expect(result.current.thumbnailFailed).toBe(false);
    expect(result.current.originalLoadFailed).toBe(false);
  });

  it('resets transform ownership when demo media replaces an image', () => {
    const image = makeImage(1, 'first.jpg');
    const onMediaReset = vi.fn();
    const { result, rerender } = renderHook(
      options => useViewerImage(options),
      { initialProps: createOptions([image], { onMediaReset }) },
    );

    expect(result.current.displayedImageUrl).toBeNull();
    rerender(createOptions([image], { onMediaReset, demoMode: true }));
    expect(onMediaReset).toHaveBeenCalledTimes(1);
    expect(result.current.visibleOriginalUrl).toBeNull();
  });
});
