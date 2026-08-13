import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageItem } from '../types';
import { SpreadViewer } from './SpreadViewer';

const makeImages = (count = 4): ImageItem[] => Array.from({ length: count }, (_, index) => ({
  image_id: index + 1,
  member_id: 7,
  title: `Work page ${index + 1}`,
  save_name: `Artist/Work_p${index + 1}.jpg`,
  created_date: '2026-08-12',
  last_update_date: '2026-08-12',
}));

const renderSpreadViewer = (overrides: Partial<React.ComponentProps<typeof SpreadViewer>> = {}) => render(
  <SpreadViewer
    images={makeImages()}
    currentIndex={1}
    onClose={vi.fn()}
    onNavigate={vi.fn()}
    thumbnailSize={320}
    demoMode
    fullscreenPageLayout="spread"
    fullscreenReadingDirection="ltr"
    onPageLayoutChange={vi.fn()}
    onReadingDirectionChange={vi.fn()}
    activeMode="fullscreen"
    onChangeMode={vi.fn()}
    {...overrides}
  />,
);

describe('SpreadViewer', () => {
  it('uses distinct reading-direction icons and hides them in single-page layout', () => {
    const spreadView = renderSpreadViewer();
    const directionGroup = spreadView.container.querySelector('.fullscreen-viewer__direction-switcher');
    const directionButtons = directionGroup?.querySelectorAll('button');

    expect(directionGroup).toBeTruthy();
    expect(directionButtons).toHaveLength(2);
    expect(directionButtons?.[0]?.querySelector('.lucide-align-left')).toBeTruthy();
    expect(directionButtons?.[1]?.querySelector('.lucide-align-right')).toBeTruthy();

    const singleView = renderSpreadViewer({ fullscreenPageLayout: 'single' });
    expect(singleView.container.querySelector('.fullscreen-viewer__direction-switcher')).toBeNull();

    spreadView.unmount();
    singleView.unmount();
  });

  it('exposes group mode and image details in the spread toolbar', () => {
    const onToggleGroupMangaPosts = vi.fn();
    const view = renderSpreadViewer({
      groupMangaPosts: true,
      onToggleGroupMangaPosts,
      simpleToolbar: false,
    });
    const contentGroup = view.container.querySelector('.fullscreen-viewer__toolbar-group--content');
    const groupButton = Array.from(contentGroup?.querySelectorAll('button') ?? [])
      .find(button => button.querySelector('.lucide-layers'));
    const detailsButton = view.container.querySelector<HTMLButtonElement>(
      '.fullscreen-viewer__details-toolbar-button',
    );

    expect(contentGroup).toBeTruthy();
    expect(groupButton?.getAttribute('aria-pressed')).toBe('true');
    expect(detailsButton).toBeTruthy();

    fireEvent.click(groupButton!);
    expect(onToggleGroupMangaPosts).toHaveBeenCalledTimes(1);

    fireEvent.click(detailsButton!);
    const detailsPanel = view.container.querySelector('#fullscreen-details-panel');
    expect(detailsPanel).toBeTruthy();
    expect(detailsPanel?.querySelector('.fullscreen-viewer__details-header .fullscreen-viewer__details-close')).toBeTruthy();
    expect(detailsPanel?.querySelector('.fullscreen-viewer__details-scroll .fullscreen-viewer__details-header')).toBeNull();
    expect(view.container.querySelectorAll('.fullscreen-viewer__details-item')).toHaveLength(2);
    expect(view.container.querySelectorAll('.fullscreen-viewer__details-item + .fullscreen-viewer__details-item')).toHaveLength(1);
    expect(view.container.querySelectorAll('.fullscreen-viewer__details-folder-actions')).toHaveLength(1);
    expect(view.container.querySelectorAll('.fullscreen-viewer__details-folder-open')).toHaveLength(1);
    expect(view.container.querySelectorAll('.fullscreen-viewer__details-folder-copy')).toHaveLength(1);
    expect(view.container.querySelectorAll('.viewer-media-action')).toHaveLength(4);
    expect(Array.from(view.container.querySelectorAll<HTMLButtonElement>('.viewer-media-action'))
      .every(button => button.dataset.fullWidth === 'true')).toBe(true);
    expect(view.container.querySelectorAll('.viewer-open-folder-action')).toHaveLength(0);
    expect(view.container.querySelectorAll('.viewer-copy-folder-action')).toHaveLength(0);
    fireEvent.click(view.container.querySelector<HTMLButtonElement>('.fullscreen-viewer__details-close')!);
    expect(view.container.querySelector('#fullscreen-details-panel')).toBeNull();
  });

  it('keeps group mode and blur controls out of the simple toolbar in spread mode', () => {
    const view = renderSpreadViewer({
      groupMangaPosts: true,
      onToggleGroupMangaPosts: vi.fn(),
      onToggleBlur: vi.fn(),
    });

    const contentGroup = view.container.querySelector('.fullscreen-viewer__toolbar-group--content');
    expect(contentGroup).toBeTruthy();
    expect(Array.from(contentGroup?.querySelectorAll('button') ?? [])
      .some(button => button.querySelector('.lucide-layers'))).toBe(false);
    expect(Array.from(contentGroup?.querySelectorAll('button') ?? [])
      .some(button => button.querySelector('.lucide-eye, .lucide-eye-off'))).toBe(false);
    expect(view.container.querySelector('.fullscreen-viewer__details-toolbar-button')).toBeTruthy();
  });

  it('keeps the fullscreen mode button available in the spread reader', () => {
    const onChangeMode = vi.fn();
    const view = renderSpreadViewer({ onChangeMode });
    const modeButtons = view.container.querySelectorAll<HTMLButtonElement>(
      '.fullscreen-viewer__mode-switcher .fullscreen-viewer__mode-button',
    );

    expect(modeButtons).toHaveLength(2);
    fireEvent.click(modeButtons[0]!);
    expect(onChangeMode).toHaveBeenCalledWith('fullscreen');
  });

  it('renders the content-settings toolbar group for image details', () => {
    const view = renderSpreadViewer();

    expect(view.container.querySelector('.fullscreen-viewer__toolbar-group--content')).toBeTruthy();
  });

  it('keeps thumbnail previews visible until spread originals are decoded', async () => {
    const view = renderSpreadViewer({ demoMode: false });

    await waitFor(() => {
      expect(view.container.querySelectorAll('img.spread-reader__media')).toHaveLength(2);
    });

    expect(view.container.querySelectorAll('.spread-reader__media--thumbnail')).toHaveLength(2);
    expect(view.container.querySelectorAll('.spread-reader__media--original')).toHaveLength(0);
  });

  it('reveals both spread originals together after both are decoded at final geometry', async () => {
    const NativeImage = globalThis.Image;
    const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    const pendingImages: ControlledImage[] = [];

    class ControlledImage {
      complete = false;
      naturalWidth = 0;
      naturalHeight = 0;
      decoding = 'auto';
      fetchPriority = 'auto';
      onload: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      private source = '';

      constructor() {
        pendingImages.push(this);
      }

      get src() {
        return this.source;
      }

      set src(value: string) {
        this.source = value;
      }

      decode() {
        return Promise.resolve();
      }

      load(width: number, height: number) {
        this.complete = true;
        this.naturalWidth = width;
        this.naturalHeight = height;
        this.onload?.(new Event('load'));
      }
    }

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1200 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 800 });
    globalThis.Image = ControlledImage as unknown as typeof Image;

    try {
      const view = renderSpreadViewer({ images: makeImages(3), demoMode: false });
      await waitFor(() => expect(pendingImages).toHaveLength(2));

      await act(async () => {
        pendingImages[0]?.load(1000, 1600);
        await Promise.resolve();
      });
      expect(view.container.querySelectorAll('.spread-reader__media--original')).toHaveLength(0);

      await act(async () => {
        pendingImages[1]?.load(1200, 1600);
        await Promise.resolve();
      });
      await waitFor(() => {
        expect(view.container.querySelectorAll('.spread-reader__media--original')).toHaveLength(2);
      });
      expect(view.container.querySelectorAll('.spread-reader__media--thumbnail')).toHaveLength(0);
    } finally {
      globalThis.Image = NativeImage;
      if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
      else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
      if (clientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeight);
      else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
    }
  });

  it('renders a cover as single page and pairs subsequent pages', () => {
    const view = renderSpreadViewer({ currentIndex: 0 });
    expect(view.container.querySelectorAll('.spread-reader__slot')).toHaveLength(2);
    expect(view.container.querySelectorAll('.spread-reader__slot--boundary')).toHaveLength(1);

    view.rerender(
      <SpreadViewer
        images={makeImages()}
        currentIndex={1}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        thumbnailSize={320}
        demoMode
        fullscreenPageLayout="spread"
        fullscreenReadingDirection="ltr"
        onPageLayoutChange={vi.fn()}
        onReadingDirectionChange={vi.fn()}
        activeMode="fullscreen"
        onChangeMode={vi.fn()}
      />,
    );
    expect(view.container.querySelectorAll('.spread-reader__slot')).toHaveLength(2);
    expect(view.container.querySelectorAll('.spread-reader__slot--boundary')).toHaveLength(0);
    expect(view.container.querySelector('.fullscreen-viewer__counter')?.textContent).toContain('2');
  });

  it('pairs from the first page and shows an end boundary for an odd final page', () => {
    const images = makeImages(5);
    const view = renderSpreadViewer({
      images,
      currentIndex: 0,
      fullscreenSpreadPairing: 'first-page',
    });

    expect(view.container.querySelectorAll('.spread-reader__slot')).toHaveLength(2);
    expect(view.container.querySelectorAll('.spread-reader__slot--boundary')).toHaveLength(0);

    view.rerender(
      <SpreadViewer
        images={images}
        currentIndex={4}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        thumbnailSize={320}
        demoMode
        fullscreenPageLayout="spread"
        fullscreenReadingDirection="ltr"
        fullscreenSpreadPairing="first-page"
        onPageLayoutChange={vi.fn()}
        onReadingDirectionChange={vi.fn()}
        activeMode="fullscreen"
        onChangeMode={vi.fn()}
      />,
    );

    const slots = Array.from(view.container.querySelectorAll('.spread-reader__slot'));
    expect(slots).toHaveLength(2);
    expect(slots[0]?.classList.contains('spread-reader__slot--boundary')).toBe(false);
    expect(slots[1]?.classList.contains('spread-reader__slot--boundary')).toBe(true);
  });

  it('changes the saved spread pairing from the toolbar shortcut', () => {
    const onSpreadPairingChange = vi.fn();
    const view = renderSpreadViewer({
      fullscreenSpreadPairing: 'cover-single',
      onSpreadPairingChange,
    });
    const button = view.container.querySelector<HTMLButtonElement>(
      '.fullscreen-viewer__toolbar-group--pairing button',
    );

    expect(button).toBeTruthy();
    expect(button?.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button!);
    expect(onSpreadPairingChange).toHaveBeenCalledWith('first-page');
  });

  it('uses physical RTL slot order while keeping progression navigation stable', () => {
    const onNavigate = vi.fn();
    const view = renderSpreadViewer({
      currentIndex: 1,
      fullscreenReadingDirection: 'rtl',
      onNavigate,
    });

    const slots = Array.from(view.container.querySelectorAll<HTMLElement>('.spread-reader__slot'));
    expect(slots[0]?.getAttribute('aria-label')).toBe('第 3–3 頁，共 4 頁');
    expect(slots[1]?.getAttribute('aria-label')).toBe('第 2–2 頁，共 4 頁');

    fireEvent.click(view.container.querySelector<HTMLButtonElement>('.fullscreen-viewer__toolbar-next')!);
    expect(onNavigate).toHaveBeenCalledWith(3);
  });

  it('navigates by vertical wheel and exposes a compact page filmstrip', () => {
    const onNavigate = vi.fn();
    const view = renderSpreadViewer({ onNavigate });
    const stage = view.container.querySelector<HTMLElement>('.spread-reader__stage');
    expect(stage).toBeTruthy();
    expect(view.container.querySelectorAll('[data-filmstrip-index]')).toHaveLength(4);

    fireEvent.wheel(stage!, { deltaY: 64, deltaX: 0 });
    expect(onNavigate).toHaveBeenCalledWith(3);

    const filmstripItems = view.container.querySelectorAll<HTMLButtonElement>('[data-filmstrip-index]');
    fireEvent.click(filmstripItems[0]!);
    expect(onNavigate).toHaveBeenCalledWith(0);
  });

  it('scrolls the desktop filmstrip horizontally when the wheel is over thumbnails', () => {
    const view = renderSpreadViewer({ images: makeImages(12) });
    const filmstrip = view.container.querySelector<HTMLDivElement>('.fullscreen-viewer__filmstrip-scroll');
    expect(filmstrip).toBeTruthy();

    filmstrip!.scrollLeft = 120;
    fireEvent.wheel(filmstrip!, { deltaX: 0, deltaY: 64, deltaMode: 0 });

    expect(filmstrip!.scrollLeft).toBe(184);
  });

  it('maps keyboard paging and click-half navigation to the configured direction', () => {
    const onNavigate = vi.fn();
    const view = renderSpreadViewer({
      currentIndex: 1,
      fullscreenReadingDirection: 'rtl',
      onNavigate,
    });
    const reader = view.container.querySelector<HTMLElement>('[role="dialog"]');
    const stage = view.container.querySelector<HTMLElement>('.spread-reader__stage');
    expect(reader).toBeTruthy();
    expect(stage).toBeTruthy();

    fireEvent.keyDown(reader!, { key: 'ArrowRight' });
    expect(onNavigate).toHaveBeenLastCalledWith(0);

    fireEvent.keyDown(reader!, { key: 'PageDown' });
    expect(onNavigate).toHaveBeenLastCalledWith(3);

    fireEvent.keyDown(reader!, { key: 'PageUp' });
    expect(onNavigate).toHaveBeenLastCalledWith(0);

    Object.defineProperty(stage!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 1000, bottom: 700, width: 1000, height: 700 }),
    });
    fireEvent.click(stage!, { clientX: 900, clientY: 350 });
    expect(onNavigate).toHaveBeenLastCalledWith(0);

    fireEvent.keyDown(reader!, { key: 'Home' });
    expect(onNavigate).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(reader!, { key: 'End' });
    expect(onNavigate).toHaveBeenLastCalledWith(3);

    view.rerender(
      <SpreadViewer
        images={makeImages()}
        currentIndex={1}
        onClose={vi.fn()}
        onNavigate={onNavigate}
        thumbnailSize={320}
        demoMode
        fullscreenPageLayout="spread"
        fullscreenReadingDirection="ltr"
        onPageLayoutChange={vi.fn()}
        onReadingDirectionChange={vi.fn()}
        activeMode="fullscreen"
        onChangeMode={vi.fn()}
      />,
    );
    const ltrStage = view.container.querySelector<HTMLElement>('.spread-reader__stage');
    expect(ltrStage).toBeTruthy();
    Object.defineProperty(ltrStage!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 1000, bottom: 700, width: 1000, height: 700 }),
    });
    fireEvent.click(ltrStage!, { clientX: 900, clientY: 350 });
    expect(onNavigate).toHaveBeenLastCalledWith(3);
  });

  it('navigates when the large media surface itself is clicked', () => {
    const onNavigate = vi.fn();
    const view = renderSpreadViewer({ onNavigate });
    const stage = view.container.querySelector<HTMLElement>('.spread-reader__stage');
    const media = view.container.querySelector<HTMLElement>('.spread-reader__media-frame');
    expect(stage).toBeTruthy();
    expect(media).toBeTruthy();

    Object.defineProperty(stage!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, right: 1000, bottom: 700, width: 1000, height: 700 }),
    });
    fireEvent.click(media!, { clientX: 900, clientY: 350 });

    expect(onNavigate).toHaveBeenLastCalledWith(3);
  });

  it('maps horizontal swipes to next and previous progression anchors', () => {
    const onNavigate = vi.fn();
    const view = renderSpreadViewer({ onNavigate, currentIndex: 1 });
    const stage = view.container.querySelector<HTMLElement>('.spread-reader__stage');
    expect(stage).toBeTruthy();

    fireEvent.pointerDown(stage!, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 700,
      clientY: 300,
    });
    fireEvent.pointerUp(stage!, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 580,
      clientY: 304,
    });

    expect(onNavigate).toHaveBeenCalledWith(3);
  });

  it('maps a leftward RTL swipe to the previous spread', () => {
    const onNavigate = vi.fn();
    const view = renderSpreadViewer({
      onNavigate,
      currentIndex: 1,
      fullscreenReadingDirection: 'rtl',
    });
    const stage = view.container.querySelector<HTMLElement>('.spread-reader__stage');
    expect(stage).toBeTruthy();

    fireEvent.pointerDown(stage!, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 700,
      clientY: 300,
    });
    fireEvent.pointerUp(stage!, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 580,
      clientY: 304,
    });

    expect(onNavigate).toHaveBeenCalledWith(0);
  });

  it('keeps side navigation and shared video controls in spread mode', () => {
    const onNavigate = vi.fn();
    const videoImages = makeImages(4).map((item, index) => ({
      ...item,
      save_name: `Artist/Work_p${index + 1}.mp4`,
    }));
    const view = renderSpreadViewer({
      images: videoImages,
      currentIndex: 1,
      demoMode: false,
      blurEnabled: true,
      onNavigate,
    });
    const dialog = view.container.querySelector<HTMLElement>('[role="dialog"]');
    const nextButton = view.container.querySelector<HTMLButtonElement>('.viewer-nav-button--next');
    const videos = Array.from(view.container.querySelectorAll<HTMLVideoElement>('video'));

    expect(nextButton).toBeTruthy();
    expect(videos).toHaveLength(2);
    expect(videos.every(video => video.controls === false)).toBe(true);
    expect(videos.every(video => video.preload === 'metadata')).toBe(true);
    expect(videos.every(video => video.classList.contains('blur-media'))).toBe(true);
    expect(videos.every(video => !video.closest('.spread-reader__media-frame')?.classList.contains('blur-media'))).toBe(true);

    fireEvent.keyDown(videos[0]!, { key: 'ArrowRight' });
    expect(onNavigate).toHaveBeenCalledWith(3);

    fireEvent.click(nextButton!);
    expect(onNavigate).toHaveBeenCalledWith(3);

    fireEvent.loadedData(videos[0]!);
    fireEvent.loadedData(videos[1]!);
    expect(videos.every(video => video.controls)).toBe(true);

    fireEvent.keyDown(videos[0]!, { key: 't', code: 'KeyT' });
    expect(dialog?.classList.contains('is-toolbar-hidden')).toBe(true);

    view.unmount();
  });

  it('keeps the saved spread preference and announces a narrow viewport fallback', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as typeof window.matchMedia;
    try {
      const view = renderSpreadViewer();
      expect(view.container.querySelectorAll('.spread-reader__slot')).toHaveLength(1);
    expect(view.container.querySelector('.spread-reader__status-row')).toBeNull();
    expect(view.container.querySelector('.spread-reader__status')).toBeNull();
    expect(view.container.querySelector('.spread-reader__live-region')?.textContent).toBeTruthy();
      expect(view.container.querySelectorAll('.fullscreen-viewer__layout-switcher button')).toHaveLength(1);
      expect(view.container.querySelector('.fullscreen-viewer__layout-switcher button[aria-pressed="true"]')).toBeTruthy();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});
