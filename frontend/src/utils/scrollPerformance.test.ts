import { describe, expect, it } from 'vitest';
import { isScrollPerformanceProbeRequested, summarizeScrollPerformance } from './scrollPerformance';

describe('summarizeScrollPerformance', () => {
  it('passes a supported scroll with no broken media or long task over 100ms', () => {
    expect(summarizeScrollPerformance({
      supported: true,
      scrollTop: 1200,
      scrollHeight: 2400,
      imageCount: 46,
      loadedImages: 46,
      brokenImages: 0,
      scrollPositions: [600, 1200, 1532],
      longTaskDurations: [51, 98.5],
    })).toEqual({
      status: 'passed',
      supported: true,
      scrollTop: 1200,
      scrollHeight: 2400,
      imageCount: 46,
      loadedImages: 46,
      brokenImages: 0,
      scrollStepCount: 3,
      scrollPositions: [600, 1200, 1532],
      longTaskCount: 2,
      maxLongTaskMs: 98.5,
    });
  });

  it('fails when a broken image or a long task over 100ms is observed', () => {
    expect(summarizeScrollPerformance({
      supported: true,
      scrollTop: 1200,
      scrollHeight: 2400,
      imageCount: 46,
      loadedImages: 45,
      brokenImages: 1,
      scrollPositions: [600, 1200, 1532],
      longTaskDurations: [101],
    }).status).toBe('failed');
  });

  it('keeps unsupported browser instrumentation explicit', () => {
    expect(summarizeScrollPerformance({
      supported: false,
      scrollTop: 0,
      scrollHeight: 0,
      imageCount: 0,
      loadedImages: 0,
      brokenImages: 0,
      scrollPositions: [],
      longTaskDurations: [],
    }).status).toBe('unsupported');
  });
});

describe('isScrollPerformanceProbeRequested', () => {
  it('only enables the probe for the explicit QA query parameter', () => {
    window.history.replaceState({}, '', '/?qa-scroll-performance=1');
    expect(isScrollPerformanceProbeRequested()).toBe(true);

    window.history.replaceState({}, '', '/');
    expect(isScrollPerformanceProbeRequested()).toBe(false);
  });
});
