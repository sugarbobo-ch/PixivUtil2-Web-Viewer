import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MonthQuickNav, type MonthJumpItem } from './MonthQuickNav';

const items: MonthJumpItem[] = [
  { key: '2026-08', label: '2026-08', count: 500, offset: 0 },
  { key: '2025-01', label: '2025-01', count: 500, offset: 500 },
  { key: '2018-01', label: '2018-01', count: 500, offset: 1000 },
];

const makeRect = (top: number, height: number, left = 0, width = 40): DOMRect => ({
  x: left,
  y: top,
  left,
  right: left + width,
  top,
  bottom: top + height,
  width,
  height,
  toJSON: () => ({}),
} as DOMRect);

const installMonthRulerLayout = () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
    if (this.classList.contains('viewer-month-index__ticks')) return makeRect(0, 150);
    if (this.classList.contains('viewer-month-index__tick-list')) return makeRect(0, 150);
    if (this.classList.contains('viewer-month-index__rail')) return makeRect(0, 150);
    if (this.classList.contains('viewer-month-index__tick')) {
      const index = Array.from(this.parentElement?.children ?? []).indexOf(this);
      return makeRect(index * 50, 2);
    }
    return makeRect(0, 0);
  });

  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      return this.classList.contains('viewer-month-index__tick-list') ? 150 : 150;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return 150;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return this.classList.contains('viewer-month-index__tick') ? 2 : 150;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get() {
      if (!this.classList.contains('viewer-month-index__tick')) return 0;
      return Array.from(this.parentElement?.children ?? []).indexOf(this) * 50;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    configurable: true,
    value: vi.fn(() => false),
  });
};

describe('MonthQuickNav interaction', () => {
  beforeEach(() => {
    installMonthRulerLayout();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts cross-page navigation while the pointer is still held down', () => {
    const onJumpToMonth = vi.fn();

    render(
      <main>
        <MonthQuickNav items={items} onJumpToMonth={onJumpToMonth} />
      </main>,
    );

    const rail = screen.getByRole('slider');
    fireEvent.pointerDown(rail, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      isPrimary: true,
      clientX: 20,
      clientY: 1,
    });
    fireEvent.pointerMove(rail, {
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: 20,
      clientY: 149,
    });

    expect(onJumpToMonth).toHaveBeenCalledWith(items[2], {
      behavior: 'auto',
      scrubbing: true,
      previewOnly: true,
    });
  });

  it('starts month prefetch on pointer down before committing a click jump', () => {
    const onPrefetchMonth = vi.fn();
    const onJumpToMonth = vi.fn();

    render(
      <main>
        <MonthQuickNav
          items={items}
          onPrefetchMonth={onPrefetchMonth}
          onJumpToMonth={onJumpToMonth}
        />
      </main>,
    );

    const rail = screen.getByRole('slider');
    fireEvent.pointerDown(rail, {
      pointerId: 2,
      pointerType: 'mouse',
      button: 0,
      isPrimary: true,
      clientX: 20,
      clientY: 149,
    });
    fireEvent.pointerUp(rail, {
      pointerId: 2,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: 20,
      clientY: 149,
    });

    expect(onPrefetchMonth).toHaveBeenCalledWith(items[2]);
    expect(onJumpToMonth).toHaveBeenCalledWith(items[2], expect.objectContaining({
      behavior: expect.any(String),
    }));
    expect(onPrefetchMonth.mock.invocationCallOrder[0])
      .toBeLessThan(onJumpToMonth.mock.invocationCallOrder[0]);
  });

  it('forwards wheel scrolling over the fixed ruler to the gallery container', () => {
    const scrollTo = vi.fn();
    render(
      <main>
        <MonthQuickNav items={items} />
        <div data-gallery-scroll-container="true" />
      </main>,
    );
    const container = document.querySelector<HTMLElement>('[data-gallery-scroll-container="true"]');
    expect(container).not.toBeNull();
    if (!container) return;
    Object.defineProperty(container, 'scrollTop', { configurable: true, value: 200 });
    Object.defineProperty(container, 'scrollTo', { configurable: true, value: scrollTo });

    fireEvent.wheel(screen.getByRole('slider'), { deltaY: 120, deltaMode: 0, clientY: 75 });

    expect(scrollTo).toHaveBeenCalledWith({ top: 320, behavior: 'auto' });
  });

  it('uses the controlled active month for the blue indicator', () => {
    const { container } = render(
      <main>
        <MonthQuickNav items={items} activeMonthKey={items[1].key} />
      </main>,
    );

    const ticks = container.querySelectorAll('.viewer-month-index__tick');
    expect(ticks[0].classList.contains('is-active')).toBe(false);
    expect(ticks[1].classList.contains('is-active')).toBe(true);
  });
});
