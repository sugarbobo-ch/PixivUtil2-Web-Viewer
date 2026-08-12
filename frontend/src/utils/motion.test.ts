import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getMotionAwareScrollBehavior,
  prefersReducedMotion,
  REDUCED_MOTION_MEDIA_QUERY,
} from './motion';

describe('motion preference helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses auto scrolling when the browser requests reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === REDUCED_MOTION_MEDIA_QUERY,
      media: query,
    })));

    expect(prefersReducedMotion()).toBe(true);
    expect(getMotionAwareScrollBehavior()).toBe('auto');
    expect(getMotionAwareScrollBehavior('instant')).toBe('auto');
  });

  it('preserves the preferred behavior when reduced motion is not requested', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false,
      media: REDUCED_MOTION_MEDIA_QUERY,
    })));

    expect(prefersReducedMotion()).toBe(false);
    expect(getMotionAwareScrollBehavior()).toBe('smooth');
    expect(getMotionAwareScrollBehavior('instant')).toBe('instant');
  });

  it('falls back safely when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);

    expect(prefersReducedMotion()).toBe(false);
    expect(getMotionAwareScrollBehavior()).toBe('smooth');
  });
});
