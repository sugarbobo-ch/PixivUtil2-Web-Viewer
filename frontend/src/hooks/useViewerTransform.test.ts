import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useViewerTransform } from './useViewerTransform';

const baseOptions = {
  fullscreenZoomMode: 'auto' as const,
  hasCurrentItem: true,
  currentItemIsVideo: false,
  demoMode: false,
  currentMediaUrl: '/media-a',
  displayedImageUrl: '/media-a',
  naturalSize: { width: 1000, height: 800 },
  naturalSizeMediaUrl: '/media-a',
  stageSize: { width: 500, height: 400 },
  isDisplayedMediaCurrent: true,
  isMediaTransitionSuppressed: false,
};

describe('useViewerTransform', () => {
  it('derives fit geometry and applies zoom and rotation controls', () => {
    const onZoomModeChange = vi.fn();
    const { result } = renderHook(() => useViewerTransform({
      ...baseOptions,
      onZoomModeChange,
    }));

    expect(result.current.transformReady).toBe(true);
    expect(result.current.effectiveZoomPercent).toBe(50);

    act(() => {
      result.current.zoomIn();
      result.current.rotateImage(90);
    });

    expect(result.current.zoomMode).toBe('custom');
    expect(result.current.effectiveZoomPercent).toBe(60);
    expect(result.current.rotation).toBe(90);

    act(() => {
      result.current.applyZoomMode('fit');
    });
    expect(result.current.zoomMode).toBe('fit');
    expect(onZoomModeChange).toHaveBeenCalledWith('fit');
    expect(result.current.pan).toEqual({ x: 0, y: 0 });
  });

  it('keeps a locked zoom while resetting item-local orientation state', () => {
    const { result } = renderHook(() => useViewerTransform(baseOptions));

    act(() => {
      result.current.applyZoomMode('lock');
      result.current.rotateImage(90);
      result.current.setFlipHorizontal(true);
      result.current.resetTransform();
    });

    expect(result.current.zoomMode).toBe('lock');
    expect(result.current.rotation).toBe(0);
    expect(result.current.flipHorizontal).toBe(false);
    expect(result.current.pan).toEqual({ x: 0, y: 0 });
  });
});
