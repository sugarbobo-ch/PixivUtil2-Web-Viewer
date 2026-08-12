import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomSelect } from './CustomSelect';

const makeRect = (top: number, bottom: number, height: number, left = 0, right = 320): DOMRect => ({
  x: left,
  y: top,
  left,
  right,
  top,
  bottom,
  width: right - left,
  height,
  toJSON: () => ({}),
} as DOMRect);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CustomSelect dropdown positioning', () => {
  it('uses the dropdown frame for placement and scrolling', async () => {
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
      if (this.classList.contains('custom-select__trigger')) return makeRect(500, 540, 40);
      if (this.classList.contains('custom-select__menu')) return makeRect(0, 320, 320);
      return makeRect(0, 0, 0);
    });
    const previousScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    try {
      render(
        <CustomSelect
          value="last"
          options={[1, 2, 3, 'last'].map(value => ({
            value,
            label: String(value),
            description: 'option description',
          }))}
          onChange={vi.fn()}
          ariaLabel="Test select"
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Test select' }));
      const listbox = await screen.findByRole('listbox');
      await waitFor(() => {
        expect(listbox.classList.contains('is-up')).toBe(true);
        expect(listbox.style.position).toBe('fixed');
        expect(listbox.style.top).toBe('172px');
        expect(scrollIntoView).not.toHaveBeenCalled();
      });
    } finally {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
      if (previousScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', previousScrollIntoView);
      } else {
        delete (HTMLElement.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
      }
    }
  });

  it('scrolls the nearest Settings-style pane until the dropdown frame fits', async () => {
    const scrollPane = document.createElement('div');
    scrollPane.style.overflowY = 'auto';
    scrollPane.dataset.testid = 'scroll-pane';
    Object.defineProperty(scrollPane, 'clientHeight', { configurable: true, value: 240 });
    Object.defineProperty(scrollPane, 'scrollHeight', { configurable: true, value: 960 });
    Object.defineProperty(scrollPane, 'scrollTop', { configurable: true, writable: true, value: 100 });
    document.body.appendChild(scrollPane);

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
      if (this.classList.contains('custom-select__trigger')) return makeRect(180, 220, 40);
      if (this.classList.contains('custom-select__menu')) return makeRect(180, 480, 300);
      if (this === scrollPane) return makeRect(0, 240, 240);
      return makeRect(0, 0, 0);
    });
    const previousScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });

    try {
      scrollPane.appendChild(document.createElement('div'));
      render(
        <div data-testid="select-host">
          <CustomSelect
            value="last"
            options={['first', 'last'].map(value => ({ value, label: value }))}
            onChange={vi.fn()}
            ariaLabel="Test select"
          />
        </div>,
        { container: scrollPane },
      );

      fireEvent.click(screen.getByRole('button', { name: 'Test select' }));
      await screen.findByRole('listbox');
      await waitFor(() => expect(scrollPane.scrollTop).toBe(100));
    } finally {
      scrollPane.remove();
      if (previousScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', previousScrollIntoView);
      } else {
        delete (HTMLElement.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
      }
    }
  });

  it('keeps the dropdown inside an explicit horizontal boundary', async () => {
    const boundaryRef = createRef<HTMLDivElement>();
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 493 });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
      if (this.dataset.testid === 'popover-boundary') return makeRect(0, 566, 566, 280, 493);
      if (this.classList.contains('custom-select__trigger')) return makeRect(180, 220, 40, 360, 400);
      if (this.classList.contains('custom-select__menu')) return makeRect(180, 480, 300, 0, 320);
      return makeRect(0, 0, 0);
    });

    try {
      render(
        <div ref={boundaryRef} data-testid="popover-boundary">
          <CustomSelect
            value="last"
            options={['first', 'last'].map(value => ({ value, label: value }))}
            onChange={vi.fn()}
            ariaLabel="Boundary select"
            boundaryRef={boundaryRef}
          />
        </div>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Boundary select' }));
      const listbox = await screen.findByRole('listbox');
      await waitFor(() => {
        expect(listbox.style.left).toBe('280px');
        expect(listbox.style.getPropertyValue('--anchored-max-width')).toBe('201px');
      });
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
    }
  });
});
