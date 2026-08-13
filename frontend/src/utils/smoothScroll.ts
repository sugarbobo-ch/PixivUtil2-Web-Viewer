export type SmoothScrollMode = 'follow' | 'settle';

export interface SmoothScrollPort {
  getScrollTop: () => number;
  setScrollTop: (top: number) => void;
  getViewportHeight: () => number;
}

export interface SmoothScrollRunnerOptions {
  requestFrame?: (callback: (timestamp: number) => void) => number;
  cancelFrame?: (frameId: number) => void;
  prefersReducedMotion?: () => boolean;
}

export interface SmoothScrollRunner {
  setTarget: (targetTop: number, mode?: SmoothScrollMode) => void;
  stop: (options?: { snapToTarget?: boolean }) => void;
  isRunning: () => boolean;
}

const DEFAULT_FRAME_MS = 1000 / 60;
const FOLLOW_ALPHA = 0.28;
const FAR_FOLLOW_ALPHA = 0.42;
const SETTLE_ALPHA = 0.42;

const clampFinite = (value: number) => (
  Number.isFinite(value) ? Math.max(0, value) : 0
);

const alphaForFrame = (baseAlpha: number, elapsedMs: number) => {
  const frameScale = Math.max(0.5, Math.min(2, elapsedMs / DEFAULT_FRAME_MS));
  return 1 - ((1 - baseAlpha) ** frameScale);
};

/**
 * A latest-target, rAF-driven scroll follower for pointer scrubbing.
 *
 * The runner owns only the interpolation. Callers still own the navigation
 * transaction, range pinning, and placeholder rendering. Updating a target
 * never starts a second animation, so reversing direction while dragging is
 * immediately reflected by the existing frame loop.
 */
export const createSmoothScrollRunner = (
  port: SmoothScrollPort,
  options: SmoothScrollRunnerOptions = {},
): SmoothScrollRunner => {
  const requestFrame = options.requestFrame ?? ((callback: (timestamp: number) => void) => (
    window.requestAnimationFrame(callback)
  ));
  const cancelFrame = options.cancelFrame ?? ((frameId: number) => window.cancelAnimationFrame(frameId));
  const prefersReducedMotion = options.prefersReducedMotion ?? (() => false);

  let targetTop = 0;
  let mode: SmoothScrollMode = 'follow';
  let frameId: number | null = null;
  let lastTimestamp: number | null = null;

  const finish = () => {
    frameId = null;
    lastTimestamp = null;
  };

  const step = (timestamp: number) => {
    frameId = null;
    const currentTop = clampFinite(port.getScrollTop());
    const distance = targetTop - currentTop;
    if (Math.abs(distance) <= 0.5) {
      port.setScrollTop(targetTop);
      finish();
      return;
    }

    const elapsedMs = lastTimestamp === null
      ? DEFAULT_FRAME_MS
      : Math.max(1, Math.min(48, timestamp - lastTimestamp));
    lastTimestamp = timestamp;
    const viewportHeight = Math.max(1, port.getViewportHeight());
    const baseAlpha = mode === 'settle'
      ? SETTLE_ALPHA
      : Math.abs(distance) > viewportHeight * 2 ? FAR_FOLLOW_ALPHA : FOLLOW_ALPHA;
    const nextTop = currentTop + distance * alphaForFrame(baseAlpha, elapsedMs);
    port.setScrollTop(nextTop);
    frameId = requestFrame(step);
  };

  const schedule = () => {
    if (frameId !== null) return;
    lastTimestamp = null;
    frameId = requestFrame(step);
  };

  return {
    setTarget: (nextTargetTop, nextMode = 'follow') => {
      targetTop = clampFinite(nextTargetTop);
      mode = nextMode;
      if (prefersReducedMotion()) {
        port.setScrollTop(targetTop);
        finish();
        return;
      }
      schedule();
    },
    stop: ({ snapToTarget = false } = {}) => {
      if (frameId !== null) cancelFrame(frameId);
      if (snapToTarget) port.setScrollTop(targetTop);
      finish();
    },
    isRunning: () => frameId !== null,
  };
};
