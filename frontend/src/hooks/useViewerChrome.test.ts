import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useViewerChrome } from './useViewerChrome';

describe('useViewerChrome', () => {
  it('keeps persistent defaults and reports toolbar, filmstrip, and checkerboard changes', () => {
    const onShowToolbarChange = vi.fn();
    const onShowFilmstripChange = vi.fn();
    const onCheckerboardChange = vi.fn();
    const { result } = renderHook(() => useViewerChrome({
      showToolbarByDefault: true,
      onShowToolbarChange,
      showFilmstripByDefault: false,
      onShowFilmstripChange,
      fullscreenShowCheckerboard: true,
      onCheckerboardChange,
    }));

    expect(result.current.showToolbar).toBe(true);
    expect(result.current.showFilmstrip).toBe(false);
    expect(result.current.checkerboardEnabled).toBe(true);

    act(() => {
      result.current.toggleShowToolbar();
      result.current.toggleShowFilmstrip();
      result.current.toggleCheckerboard();
    });

    expect(result.current.showToolbar).toBe(false);
    expect(result.current.showFilmstrip).toBe(true);
    expect(result.current.checkerboardEnabled).toBe(false);
    expect(onShowToolbarChange).toHaveBeenCalledWith(false);
    expect(onShowFilmstripChange).toHaveBeenCalledWith(true);
    expect(onCheckerboardChange).toHaveBeenCalledWith(false);
  });
});
