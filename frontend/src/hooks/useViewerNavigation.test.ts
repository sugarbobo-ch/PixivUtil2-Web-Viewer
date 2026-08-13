import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useViewerNavigation } from './useViewerNavigation';

describe('useViewerNavigation', () => {
  it('keeps fullscreen and grid restore anchors inside the loaded image range', () => {
    const { result } = renderHook(() => useViewerNavigation({
      imageCount: 3,
      isMobileViewport: false,
      getCurrentIndex: () => 2,
    }));

    act(() => result.current.openImage(99));
    expect(result.current.viewMode).toBe('fullscreen');
    expect(result.current.fullscreenIndex).toBe(2);

    act(() => result.current.closeFullscreen());
    expect(result.current.viewMode).toBe('grid');
    expect(result.current.gridRestoreAnchor?.index).toBe(2);
  });

  it('starts webtoon at the current anchor and exits edit mode', () => {
    const onExitEditMode = vi.fn();
    const { result } = renderHook(() => useViewerNavigation({
      imageCount: 4,
      preferredMode: 'webtoon',
      isMobileViewport: false,
      getCurrentIndex: () => 1,
      onExitEditMode,
    }));

    act(() => result.current.openImage(1));
    expect(result.current.viewMode).toBe('webtoon');
    expect(result.current.webtoonStartAnchor?.index).toBe(1);
    expect(onExitEditMode).toHaveBeenCalledTimes(1);
  });

  it('preserves the preferred mode when mobile cannot return to grid', () => {
    const { result } = renderHook(() => useViewerNavigation({
      imageCount: 2,
      preferredMode: 'fullscreen',
      isMobileViewport: true,
      getCurrentIndex: () => 0,
    }));

    act(() => result.current.changeMode('grid'));
    expect(result.current.viewMode).toBe('fullscreen');
  });
});
