import { describe, expect, it, vi } from 'vitest';
import { createSmoothScrollRunner } from './smoothScroll';

const createFakeFrameClock = () => {
  let nextId = 1;
  const callbacks = new Map<number, (timestamp: number) => void>();
  return {
    requestFrame: (callback: (timestamp: number) => void) => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    cancelFrame: (id: number) => callbacks.delete(id),
    tick: (timestamp: number) => {
      const pending = Array.from(callbacks.entries());
      callbacks.clear();
      pending.forEach(([, callback]) => callback(timestamp));
    },
    pending: () => callbacks.size,
  };
};

describe('smooth scroll runner', () => {
  it('follows a moving target and reaches the exact final position', () => {
    const clock = createFakeFrameClock();
    let scrollTop = 0;
    const runner = createSmoothScrollRunner({
      getScrollTop: () => scrollTop,
      setScrollTop: value => { scrollTop = value; },
      getViewportHeight: () => 720,
    }, clock);

    runner.setTarget(1_000);
    expect(clock.pending()).toBe(1);
    clock.tick(16);
    expect(scrollTop).toBeGreaterThan(0);
    expect(scrollTop).toBeLessThan(1_000);

    runner.setTarget(200);
    clock.tick(32);
    expect(scrollTop).toBeLessThan(1_000);
    expect(scrollTop).toBeGreaterThan(0);

    for (let timestamp = 48; timestamp < 2_000 && runner.isRunning(); timestamp += 16) {
      clock.tick(timestamp);
    }
    expect(scrollTop).toBe(200);
    expect(runner.isRunning()).toBe(false);
  });

  it('snaps immediately when reduced motion is requested', () => {
    const clock = createFakeFrameClock();
    let scrollTop = 10;
    const runner = createSmoothScrollRunner({
      getScrollTop: () => scrollTop,
      setScrollTop: value => { scrollTop = value; },
      getViewportHeight: () => 720,
    }, { ...clock, prefersReducedMotion: () => true });

    runner.setTarget(500, 'settle');

    expect(scrollTop).toBe(500);
    expect(clock.pending()).toBe(0);
  });

  it('can cancel without forcing a target snap', () => {
    const clock = createFakeFrameClock();
    let scrollTop = 0;
    const cancel = vi.fn(clock.cancelFrame);
    const runner = createSmoothScrollRunner({
      getScrollTop: () => scrollTop,
      setScrollTop: value => { scrollTop = value; },
      getViewportHeight: () => 720,
    }, { requestFrame: clock.requestFrame, cancelFrame: cancel });

    runner.setTarget(800);
    clock.tick(16);
    const currentTop = scrollTop;
    runner.stop();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(scrollTop).toBe(currentTop);
    expect(runner.isRunning()).toBe(false);
  });
});
