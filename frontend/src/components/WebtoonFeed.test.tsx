import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageItem } from '../types';
import { WebtoonFeed } from './WebtoonFeed';
import { createGlobalHeightIndex } from '../media-window/globalLayoutIndex';

const createImage = (imageId: number): ImageItem => ({
  image_id: imageId,
  member_id: 100 + imageId,
  title: `Image ${imageId}`,
  save_name: `artist/image-${imageId}.jpg`,
  created_date: '2026-08-10',
  last_update_date: '2026-08-10',
});

describe('WebtoonFeed toolbar regression', () => {
  it('keeps the current / total page indicator while the toolbar collapses', async () => {
    const main = document.createElement('main');
    document.body.appendChild(main);

    render(
      <WebtoonFeed
        images={[createImage(1)]}
        demoMode
        thumbnailSize={320}
        imageScale={80}
        imageGap={24}
        showInfo={false}
        showPageNumber
        showThumbnails={false}
        totalImages={4}
        currentPage={2}
        totalPages={4}
      />,
      { container: main },
    );

    expect(screen.getByText('1 / 4')).toBeTruthy();
    expect(screen.getByDisplayValue('2')).toBeTruthy();
    expect(screen.getByText('/ 4')).toBeTruthy();

    fireEvent.scroll(main);
    await waitFor(() => {
      const controls = document.querySelector('.webtoon-quick-toolbar__controls');
      expect(controls?.classList.contains('is-scrolling')).toBe(true);
    });

    const revealButton = document.querySelector<HTMLButtonElement>('.webtoon-quick-toolbar__reveal');
    expect(revealButton).toBeTruthy();
    if (!revealButton) throw new Error('collapsed toolbar reveal button was not rendered');
    fireEvent.click(revealButton);
    expect(document.querySelector('.webtoon-quick-toolbar__controls')?.classList.contains('is-scrolling')).toBe(false);

    main.remove();
  });

  it('uses the global range anchor and crosses a bounded range through the shared controller', () => {
    const onGlobalIndexChange = vi.fn();
    const globalHeightIndex = createGlobalHeightIndex(3, 240);
    const main = document.createElement('main');
    document.body.appendChild(main);

    render(
      <WebtoonFeed
        images={[createImage(2)]}
        demoMode
        thumbnailSize={320}
        imageScale={80}
        imageGap={24}
        showInfo={false}
        showPageNumber
        showThumbnails={false}
        totalImages={3}
        currentPage={1}
        totalPages={1}
        isGlobalMode
        globalRangeStart={1}
        globalHeightIndex={globalHeightIndex}
        onGlobalIndexChange={onGlobalIndexChange}
      />,
      { container: main },
    );

    const nextButton = screen.getByRole('button', { name: /下一張圖片/ });
    fireEvent.click(nextButton);
    expect(onGlobalIndexChange).toHaveBeenCalledWith(2, { align: true });

    main.remove();
  });

  it('does not re-align a global range prefetch update to the old entry index', () => {
    const previousScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
    const previousRequestAnimationFrame = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });

    const main = document.createElement('main');
    document.body.appendChild(main);
    const images = Array.from({ length: 8 }, (_, index) => createImage(index));
    const { rerender, unmount } = render(
      <WebtoonFeed
        images={images}
        demoMode
        initialIndex={4}
        initialRequestId={1}
        thumbnailSize={320}
        imageScale={80}
        imageGap={24}
        showInfo={false}
        showPageNumber
        showThumbnails={false}
        totalImages={8}
        currentPage={1}
        totalPages={1}
        isGlobalMode
        globalRangeStart={0}
        globalHeightIndex={createGlobalHeightIndex(8, 240)}
      />,
      { container: main },
    );
    const alignmentCount = scrollTo.mock.calls.length;

    rerender(
      <WebtoonFeed
        images={images}
        demoMode
        initialIndex={5}
        initialRequestId={1}
        thumbnailSize={320}
        imageScale={80}
        imageGap={24}
        showInfo={false}
        showPageNumber
        showThumbnails={false}
        totalImages={8}
        currentPage={1}
        totalPages={1}
        isGlobalMode
        globalRangeStart={0}
        globalHeightIndex={createGlobalHeightIndex(8, 240)}
      />,
    );

    expect(alignmentCount).toBeGreaterThan(0);
    expect(scrollTo).toHaveBeenCalledTimes(alignmentCount);

    unmount();
    main.remove();
    if (previousScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', previousScrollTo);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
    if (previousRequestAnimationFrame) Object.defineProperty(window, 'requestAnimationFrame', previousRequestAnimationFrame);
    else Reflect.deleteProperty(window, 'requestAnimationFrame');
  });

  it('does not compensate scroll when the first ready global range replaces the fallback shell', () => {
    const main = document.createElement('main');
    document.body.appendChild(main);
    Object.defineProperty(main, 'scrollTop', { configurable: true, writable: true, value: 500 });
    const images = [createImage(1), createImage(2)];
    const { rerender, unmount } = render(
      <WebtoonFeed
        images={images}
        demoMode
        thumbnailSize={320}
        imageScale={80}
        imageGap={24}
        showInfo={false}
        showPageNumber
        showThumbnails={false}
        totalImages={100}
      />,
      { container: main },
    );

    rerender(
      <WebtoonFeed
        images={images}
        demoMode
        thumbnailSize={320}
        imageScale={80}
        imageGap={24}
        showInfo={false}
        showPageNumber
        showThumbnails={false}
        totalImages={100}
        isGlobalMode
        globalRangeStart={80}
        globalHeightIndex={createGlobalHeightIndex(100, 240)}
      />,
    );

    expect(main.scrollTop).toBe(500);
    unmount();
    main.remove();
  });

  it('aligns the requested global anchor when the bounded range becomes ready after mount', () => {
    const previousScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
    const previousRequestAnimationFrame = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo });
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });

    const main = document.createElement('main');
    document.body.appendChild(main);
    const images = Array.from({ length: 160 }, (_, index) => createImage(index));
    const { rerender, unmount } = render(
      <WebtoonFeed
        images={[]}
        demoMode
        initialIndex={153}
        initialRequestId={1}
        thumbnailSize={320}
        imageScale={80}
        imageGap={24}
        showInfo={false}
        showPageNumber
        showThumbnails={false}
        totalImages={14627}
      />,
      { container: main },
    );

    rerender(
      <WebtoonFeed
        images={images}
        demoMode
        initialIndex={153}
        initialRequestId={1}
        thumbnailSize={320}
        imageScale={80}
        imageGap={24}
        showInfo={false}
        showPageNumber
        showThumbnails={false}
        totalImages={14627}
        isGlobalMode
        globalRangeStart={14467}
        globalHeightIndex={createGlobalHeightIndex(14627, 240)}
      />,
    );

    expect(scrollTo).toHaveBeenCalled();
    expect(scrollTo.mock.calls.at(-1)?.[0]?.top).toBeGreaterThan(10000);
    unmount();
    main.remove();
    if (previousScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', previousScrollTo);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
    if (previousRequestAnimationFrame) Object.defineProperty(window, 'requestAnimationFrame', previousRequestAnimationFrame);
    else Reflect.deleteProperty(window, 'requestAnimationFrame');
  });

  it('does not prefetch backward from the range head before the entry anchor is aligned', () => {
    const onGlobalIndexChange = vi.fn();
    const main = document.createElement('main');
    document.body.appendChild(main);
    render(
      <WebtoonFeed
        images={Array.from({ length: 160 }, (_, index) => createImage(index))}
        demoMode
        initialIndex={80}
        initialRequestId={1}
        thumbnailSize={320}
        imageScale={80}
        imageGap={24}
        showInfo={false}
        showPageNumber
        showThumbnails={false}
        totalImages={100}
        isGlobalMode
        globalRangeStart={80}
        globalHeightIndex={createGlobalHeightIndex(100, 240)}
        onGlobalIndexChange={onGlobalIndexChange}
      />,
      { container: main },
    );

    expect(onGlobalIndexChange).not.toHaveBeenCalled();
    main.remove();
  });
});
