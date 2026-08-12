import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useViewerMediaAdmission } from './useViewerMediaAdmission';

describe('useViewerMediaAdmission', () => {
  it('resets staged media state when the current URLs change', () => {
    const { result, rerender } = renderHook((props: { thumbnailUrl: string; mediaUrl: string }) => (
      useViewerMediaAdmission({
        ...props,
        thumbnailEnabled: true,
        originalEnabled: true,
        thumbnailPriority: 0,
        originalPriority: 0,
        owner: 'fullscreen',
      })
    ), { initialProps: { thumbnailUrl: '/thumb-a', mediaUrl: '/media-a' } });

    act(() => {
      result.current.markThumbnailLoaded();
      result.current.markOriginalLoaded();
    });
    expect(result.current.thumbnailReady).toBe(true);
    expect(result.current.originalReady).toBe(true);

    rerender({ thumbnailUrl: '/thumb-b', mediaUrl: '/media-b' });
    expect(result.current.thumbnailReady).toBe(false);
    expect(result.current.originalReady).toBe(false);
    expect(result.current.thumbnailFailed).toBe(false);
    expect(result.current.originalFailed).toBe(false);
  });

  it('keeps admission disabled for media marked as unavailable', () => {
    const { result } = renderHook(() => useViewerMediaAdmission({
      thumbnailUrl: '/thumb',
      mediaUrl: '/media',
      thumbnailEnabled: false,
      originalEnabled: false,
      thumbnailPriority: 0,
      originalPriority: 0,
      owner: 'webtoon',
    }));

    expect(result.current.thumbnailAdmitted).toBe(false);
    expect(result.current.originalAdmitted).toBe(false);
  });
});
