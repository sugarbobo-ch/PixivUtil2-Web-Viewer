import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageItem } from '../types';
import { FullscreenViewer } from './FullscreenViewer';

const images: ImageItem[] = [
  {
    image_id: 1,
    member_id: 101,
    title: 'Image 1',
    save_name: 'artist/image-1.jpg',
    created_date: '2026-08-10',
    last_update_date: '2026-08-10',
  },
  {
    image_id: 2,
    member_id: 101,
    title: 'Image 2',
    save_name: 'artist/image-2.jpg',
    created_date: '2026-08-10',
    last_update_date: '2026-08-10',
  },
];

const renderViewer = (overrides: Partial<React.ComponentProps<typeof FullscreenViewer>> = {}) => render(
  <FullscreenViewer
    images={images}
    currentIndex={1}
    onClose={vi.fn()}
    onNavigate={vi.fn()}
    thumbnailSize={320}
    demoMode
    showFilmstripByDefault={false}
    totalImages={3}
    activeMode="fullscreen"
    onChangeMode={vi.fn()}
    {...overrides}
  />,
);

const mockVideoBounds = (video: HTMLVideoElement, width = 800, height = 450) => {
  vi.spyOn(video, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect);
};

describe('FullscreenViewer regression', () => {
  it('coalesces a rapid wheel burst and navigates directly to the final item', () => {
    vi.useFakeTimers();
    try {
      const onNavigate = vi.fn();
      const view = renderViewer({ currentIndex: 0, onNavigate });
      const dialog = screen.getByRole('dialog', { name: 'Image 1' });

      fireEvent.wheel(dialog, { deltaY: 100 });
      fireEvent.wheel(dialog, { deltaY: 100 });

      expect(onNavigate).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(99);
      });
      expect(onNavigate).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledWith(1);

      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps native video controls out of fullscreen navigation shortcuts', () => {
    const onNavigate = vi.fn();
    const videoImages: ImageItem[] = [{
      ...images[0],
      save_name: 'artist/video-1.mp4',
    }];
    const view = renderViewer({
      images: videoImages,
      currentIndex: 0,
      onNavigate,
      demoMode: false,
    });
    const dialog = screen.getByRole('dialog', { name: 'Image 1' });
    const video = dialog.querySelector<HTMLVideoElement>('video');

    expect(video).toBeTruthy();
    expect(video?.hasAttribute('controls')).toBe(false);
    expect(video?.getAttribute('preload')).toBe('metadata');
    expect(video?.closest('.fullscreen-viewer__video-frame')?.getAttribute('translate')).toBe('no');
    expect(video?.closest('.fullscreen-viewer__video-frame')?.classList.contains('notranslate')).toBe(true);
    if (!video) throw new Error('video element was not rendered');

    fireEvent.loadedData(video);
    expect(video.hasAttribute('controls')).toBe(true);

    fireEvent.keyDown(video, { key: 'ArrowRight', code: 'ArrowRight' });
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.click(dialog.querySelector<HTMLButtonElement>('button[aria-label="顯示影片詳細資訊"]')!);
    expect(dialog.querySelector('#fullscreen-details-heading')?.textContent).toBe('影片資訊 (I)');
    expect(dialog.querySelector('.fullscreen-viewer__details-body')?.textContent).toContain('影片尺寸');
    expect(dialog.querySelector('.fullscreen-viewer__details-body')?.textContent).toContain('影片大小');
    expect(dialog.querySelector('.viewer-primary-action')?.textContent).toContain('下載／開啟原影片');
    expect(dialog.querySelector('.fullscreen-viewer__details-folder-actions')?.textContent)
      .toContain('影片資料夾');

    view.unmount();
  });

  it('keeps video timeline arrows native while allowing viewer shortcuts from video focus', () => {
    const videoImages: ImageItem[] = images.map((item, index) => ({
      ...item,
      save_name: `artist/shortcut-video-${index + 1}.mp4`,
    }));
    const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });
    const view = renderViewer({
      images: videoImages,
      currentIndex: 0,
      demoMode: false,
      showFilmstripByDefault: false,
    });
    const dialog = screen.getByRole('dialog', { name: 'Image 1' });
    const video = dialog.querySelector<HTMLVideoElement>('video');

    expect(video).toBeTruthy();
    if (!video) throw new Error('video element was not rendered');

    const arrowEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowRight',
      code: 'ArrowRight',
    });
    video.dispatchEvent(arrowEvent);
    expect(arrowEvent.defaultPrevented).toBe(false);

    fireEvent.keyDown(video, { key: 't', code: 'KeyT' });
    expect(dialog.classList.contains('is-toolbar-hidden')).toBe(true);
    expect(dialog.querySelector('button[aria-label="顯示工具列"]')).toBeTruthy();
    expect(dialog.querySelector('button[aria-label="關閉全螢幕檢視"]')).toBeTruthy();

    fireEvent.keyDown(video, { key: 'g', code: 'KeyG' });
    expect(dialog.querySelector('.fullscreen-viewer__filmstrip')).toBeTruthy();

    const requestFullscreen = vi.fn(() => Promise.resolve());
    Object.defineProperty(dialog, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });
    fireEvent.keyDown(video, { key: 'f', code: 'KeyF' });
    expect(requestFullscreen).toHaveBeenCalledTimes(1);

    view.unmount();
    if (originalScrollTo) {
      Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
    }
  });

  it('applies persisted fullscreen video and background defaults', () => {
    const videoImages: ImageItem[] = images.map((item, index) => ({
      ...item,
      image_id: item.image_id + 5,
      save_name: `artist/persisted-video-${index + 1}.mp4`,
    }));
    const view = renderViewer({
      images: videoImages,
      currentIndex: 0,
      demoMode: false,
      fullscreenShowCheckerboard: true,
      fullscreenZoomMode: 'fill',
      videoMuted: false,
      videoSeekSeconds: 10,
      videoHoldPlaybackRate: 1.5,
    });
    const dialog = screen.getByRole('dialog', { name: 'Image 1' });
    const video = dialog.querySelector<HTMLVideoElement>('video');

    expect(dialog.classList.contains('is-checkerboard')).toBe(true);
    expect(video?.muted).toBe(false);

    view.unmount();
  });

  it('persists zero volume whenever native video audio is muted or set to zero', () => {
    const onVideoPreferenceChange = vi.fn();
    const videoImages: ImageItem[] = [{
      ...images[0],
      save_name: 'artist/volume-video.mp4',
    }];
    const view = renderViewer({
      images: videoImages,
      currentIndex: 0,
      demoMode: false,
      videoMuted: false,
      videoVolume: 0.7,
      onVideoPreferenceChange,
    });
    const video = screen.getByRole('dialog', { name: 'Image 1' }).querySelector<HTMLVideoElement>('video');

    expect(video).toBeTruthy();
    if (!video) throw new Error('video element was not rendered');

    Object.defineProperty(video, 'muted', { configurable: true, value: true });
    Object.defineProperty(video, 'volume', { configurable: true, value: 0.7 });
    fireEvent.volumeChange(video);
    expect(onVideoPreferenceChange).toHaveBeenLastCalledWith({ videoMuted: true, videoVolume: 0 });

    Object.defineProperty(video, 'muted', { configurable: true, value: false });
    Object.defineProperty(video, 'volume', { configurable: true, value: 0 });
    fireEvent.volumeChange(video);
    expect(onVideoPreferenceChange).toHaveBeenLastCalledWith({ videoMuted: true, videoVolume: 0 });

    view.unmount();
  });

  it('keeps the ready video visible while the next video is loading', () => {
    const videoImages: ImageItem[] = images.map((item, index) => ({
      ...item,
      save_name: `artist/video-transition-${index + 1}.mp4`,
    }));
    const view = renderViewer({
      images: videoImages,
      currentIndex: 0,
      demoMode: false,
    });
    const firstVideo = screen.getByRole('dialog', { name: 'Image 1' }).querySelector<HTMLVideoElement>('video');

    expect(firstVideo).toBeTruthy();
    if (!firstVideo) throw new Error('first video element was not rendered');
    vi.spyOn(firstVideo, 'pause').mockImplementation(() => undefined);
    fireEvent.loadedData(firstVideo);
    expect(firstVideo.hasAttribute('controls')).toBe(true);

    view.rerender(
      <FullscreenViewer
        images={videoImages}
        currentIndex={1}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        thumbnailSize={320}
        demoMode={false}
        showFilmstripByDefault={false}
        totalImages={3}
        activeMode="fullscreen"
        onChangeMode={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Image 2' });
    const videosWhileLoading = Array.from(dialog.querySelectorAll<HTMLVideoElement>('video'));
    expect(videosWhileLoading).toHaveLength(2);
    expect(videosWhileLoading[0].classList.contains('fullscreen-viewer__video--outgoing')).toBe(true);
    expect(videosWhileLoading[1].hasAttribute('controls')).toBe(false);

    fireEvent.loadedData(videosWhileLoading[1]);
    expect(dialog.querySelectorAll('video')).toHaveLength(1);
    expect(dialog.querySelector('video')?.hasAttribute('controls')).toBe(true);

    view.unmount();
  });

  it('navigates from a wheel gesture over video content', () => {
    vi.useFakeTimers();
    try {
      const onNavigate = vi.fn();
      const videoImages: ImageItem[] = images.map((item, index) => ({
        ...item,
        image_id: item.image_id + 10,
        save_name: `artist/video-${index + 1}.mp4`,
      }));
      const view = renderViewer({
        images: videoImages,
        currentIndex: 0,
        onNavigate,
        demoMode: false,
      });
      const dialog = screen.getByRole('dialog', { name: 'Image 1' });
      const video = dialog.querySelector<HTMLVideoElement>('video');

      expect(video).toBeTruthy();
      if (!video) throw new Error('video element was not rendered');

      fireEvent.wheel(video, { deltaY: 100 });
      expect(onNavigate).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledWith(1);

      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps video clicks inside media and navigates from the stage outside it', () => {
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    const videoImages: ImageItem[] = images.map((item, index) => ({
      ...item,
      image_id: item.image_id + 20,
      save_name: `artist/video-${index + 1}.mp4`,
    }));
    const view = renderViewer({
      images: videoImages,
      currentIndex: 0,
      onClose,
      onNavigate,
      demoMode: false,
    });
    const dialog = screen.getByRole('dialog', { name: 'Image 1' });
    const video = dialog.querySelector<HTMLVideoElement>('video');

    expect(video).toBeTruthy();
    if (!video) throw new Error('video element was not rendered');

    fireEvent.click(video, { clientX: 10, clientY: 10 });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    const stage = dialog.querySelector<HTMLElement>('.fullscreen-viewer__stage');
    expect(stage).toBeTruthy();
    if (!stage) throw new Error('viewer stage was not rendered');
    fireEvent.click(stage, { clientX: 100, clientY: 100 });
    expect(onNavigate).toHaveBeenCalledWith(1);

    view.unmount();
  });

  it('toggles playback from either video half', () => {
    vi.useFakeTimers();
    try {
      const view = renderViewer({
        images: images.map((item, index) => ({
          ...item,
          save_name: `artist/video-center-${index + 1}.mp4`,
        })),
        currentIndex: 0,
        demoMode: false,
      });
      const dialog = screen.getByRole('dialog', { name: 'Image 1' });
      const video = dialog.querySelector<HTMLVideoElement>('video');
      expect(video).toBeTruthy();
      if (!video) throw new Error('video element was not rendered');
      fireEvent.loadedData(video);
      const gestureLayer = dialog.querySelector<HTMLElement>('.fullscreen-viewer__video-gesture-layer');
      expect(gestureLayer).toBeTruthy();
      if (!gestureLayer) throw new Error('video gesture layer was not rendered');
      mockVideoBounds(video);
      Object.defineProperty(video, 'paused', { configurable: true, value: false });
      const pause = vi.spyOn(video, 'pause').mockImplementation(() => undefined);

      fireEvent.click(gestureLayer, { clientX: 100, clientY: 180 });
      act(() => {
        vi.advanceTimersByTime(120);
      });
      expect(pause).toHaveBeenCalledTimes(1);
      expect(dialog.querySelector('.fullscreen-viewer__video-feedback--center .lucide-pause')).toBeTruthy();
      expect(dialog.querySelector('.fullscreen-viewer__video-feedback--center')?.textContent).toBe('');

      Object.defineProperty(video, 'paused', { configurable: true, value: true });
      const play = vi.spyOn(video, 'play').mockResolvedValue(undefined);
      act(() => {
        vi.advanceTimersByTime(281);
      });
      fireEvent.click(gestureLayer, { clientX: 700, clientY: 180 });
      act(() => {
        vi.advanceTimersByTime(120);
      });
      expect(play).toHaveBeenCalledTimes(1);
      expect(dialog.querySelector('.fullscreen-viewer__video-feedback--center .lucide-play')).toBeTruthy();
      expect(dialog.querySelector('.fullscreen-viewer__video-feedback--center')?.textContent).toBe('');

      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('seeks five seconds from the left and right video halves on double click', () => {
    const view = renderViewer({
      images: images.map((item, index) => ({
        ...item,
        save_name: `artist/video-seek-${index + 1}.mp4`,
      })),
      currentIndex: 0,
      demoMode: false,
    });
    const dialog = screen.getByRole('dialog', { name: 'Image 1' });
    const video = dialog.querySelector<HTMLVideoElement>('video');
    expect(video).toBeTruthy();
    if (!video) throw new Error('video element was not rendered');
    fireEvent.loadedData(video);
    const gestureLayer = dialog.querySelector<HTMLElement>('.fullscreen-viewer__video-gesture-layer');
    expect(gestureLayer).toBeTruthy();
    if (!gestureLayer) throw new Error('video gesture layer was not rendered');
    mockVideoBounds(video);
    Object.defineProperty(video, 'duration', { configurable: true, value: 100 });
    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 20 });
    const dispatchDoubleClick = (clientX: number) => {
      fireEvent.click(gestureLayer, { clientX, clientY: 180, detail: 1 });
      fireEvent.click(gestureLayer, { clientX, clientY: 180, detail: 2 });
    };

    dispatchDoubleClick(100);
    expect(video.currentTime).toBe(15);
    expect(dialog.querySelector('.fullscreen-viewer__video-feedback')?.textContent).toContain('倒轉 5 秒');
    dispatchDoubleClick(700);
    expect(video.currentTime).toBe(20);
    expect(dialog.querySelector('.fullscreen-viewer__video-feedback')?.textContent).toContain('快轉 5 秒');

    dispatchDoubleClick(700);
    expect(video.currentTime).toBe(25);
    expect(dialog.querySelector('.fullscreen-viewer__video-feedback')?.textContent).toContain('快轉 10 秒');
    fireEvent.click(gestureLayer, { clientX: 700, clientY: 180, detail: 3 });
    expect(video.currentTime).toBe(25);

    view.unmount();
  });

  it('keeps a real pointer double-tap on the video surface out of native controls', () => {
    vi.useFakeTimers();
    try {
      const view = renderViewer({
        images: images.map((item, index) => ({
          ...item,
          save_name: `artist/video-pointer-seek-${index + 1}.mp4`,
        })),
        currentIndex: 0,
        demoMode: false,
      });
      const dialog = screen.getByRole('dialog', { name: 'Image 1' });
      const video = dialog.querySelector<HTMLVideoElement>('video');
      expect(video).toBeTruthy();
      if (!video) throw new Error('video element was not rendered');
      fireEvent.loadedData(video);
      const gestureLayer = dialog.querySelector<HTMLElement>('.fullscreen-viewer__video-gesture-layer');
      expect(gestureLayer).toBeTruthy();
      if (!gestureLayer) throw new Error('video gesture layer was not rendered');
      mockVideoBounds(video);
      Object.defineProperty(video, 'duration', { configurable: true, value: 100 });
      Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 20 });
      Object.defineProperty(video, 'paused', { configurable: true, value: false });
      const pause = vi.spyOn(video, 'pause').mockImplementation(() => undefined);
      const play = vi.spyOn(video, 'play').mockResolvedValue(undefined);

      const dispatchTap = (pointerId: number) => {
        fireEvent.pointerDown(gestureLayer, { pointerId, button: 0, clientX: 100, clientY: 180 });
        fireEvent.pointerUp(gestureLayer, { pointerId, button: 0, clientX: 100, clientY: 180 });
        fireEvent.click(gestureLayer, { clientX: 100, clientY: 180 });
      };

      dispatchTap(1);
      act(() => {
        vi.advanceTimersByTime(60);
      });
      dispatchTap(2);

      expect(video.currentTime).toBe(15);
      expect(dialog.querySelector('.fullscreen-viewer__video-feedback')?.textContent).toContain('5');
      expect(pause).not.toHaveBeenCalled();
      expect(play).not.toHaveBeenCalled();

      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves playback state for mouse double-click and touch double-tap seek', () => {
    vi.useFakeTimers();
    try {
      const view = renderViewer({
        images: images.map((item, index) => ({
          ...item,
          save_name: `artist/video-seek-state-${index + 1}.mp4`,
        })),
        currentIndex: 0,
        demoMode: false,
      });
      const dialog = screen.getByRole('dialog', { name: 'Image 1' });
      const video = dialog.querySelector<HTMLVideoElement>('video');
      expect(video).toBeTruthy();
      if (!video) throw new Error('video element was not rendered');
      fireEvent.loadedData(video);
      const gestureLayer = dialog.querySelector<HTMLElement>('.fullscreen-viewer__video-gesture-layer');
      expect(gestureLayer).toBeTruthy();
      if (!gestureLayer) throw new Error('video gesture layer was not rendered');
      mockVideoBounds(video);
      Object.defineProperty(video, 'duration', { configurable: true, value: 100 });
      Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 20 });
      let paused = false;
      Object.defineProperty(video, 'paused', { configurable: true, get: () => paused });
      vi.spyOn(video, 'pause').mockImplementation(() => {
        paused = true;
      });
      vi.spyOn(video, 'play').mockImplementation(() => {
        paused = false;
        return Promise.resolve();
      });

      fireEvent.click(gestureLayer, { clientX: 100, clientY: 180, detail: 1 });
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(paused).toBe(true);
      fireEvent.click(gestureLayer, { clientX: 100, clientY: 180, detail: 2 });
      expect(video.currentTime).toBe(15);
      expect(paused).toBe(false);

      paused = true;
      Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 20 });
      fireEvent.click(gestureLayer, { clientX: 700, clientY: 180, detail: 1 });
      act(() => {
        vi.advanceTimersByTime(60);
      });
      fireEvent.click(gestureLayer, { clientX: 700, clientY: 180, detail: 1 });
      expect(video.currentTime).toBe(25);
      expect(paused).toBe(true);

      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('plays at double speed while holding a side of the video', () => {
    vi.useFakeTimers();
    try {
      const view = renderViewer({
        images: images.map((item, index) => ({
          ...item,
          save_name: `artist/video-hold-${index + 1}.mp4`,
        })),
        currentIndex: 0,
        demoMode: false,
      });
      const dialog = screen.getByRole('dialog', { name: 'Image 1' });
      const video = dialog.querySelector<HTMLVideoElement>('video');
      expect(video).toBeTruthy();
      if (!video) throw new Error('video element was not rendered');
      fireEvent.loadedData(video);
      const gestureLayer = dialog.querySelector<HTMLElement>('.fullscreen-viewer__video-gesture-layer');
      expect(gestureLayer).toBeTruthy();
      if (!gestureLayer) throw new Error('video gesture layer was not rendered');
      mockVideoBounds(video);
      Object.defineProperty(video, 'playbackRate', { configurable: true, writable: true, value: 1 });
      Object.defineProperty(video, 'paused', { configurable: true, value: false });
      const pause = vi.spyOn(video, 'pause').mockImplementation(() => undefined);

      fireEvent.pointerDown(gestureLayer, { pointerId: 1, button: 0, clientX: 100, clientY: 180 });
      act(() => {
        vi.advanceTimersByTime(160);
      });
      expect(video.playbackRate).toBe(2);
      expect(dialog.querySelector('.fullscreen-viewer__video-feedback')?.textContent).toContain('2 倍速');

      fireEvent.pointerUp(gestureLayer, { pointerId: 1, button: 0, clientX: 100, clientY: 180 });
      expect(video.playbackRate).toBe(1);
      expect(dialog.querySelector('.fullscreen-viewer__video-feedback--top')).toBeNull();

      fireEvent.click(gestureLayer, { clientX: 100, clientY: 180 });
      act(() => {
        vi.advanceTimersByTime(120);
      });
      expect(pause).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(700);
      });
      expect(dialog.querySelector('.fullscreen-viewer__video-feedback')).toBeNull();

      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('focuses the dialog, traps Tab, closes on Escape, and restores focus', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = vi.fn();

    const view = renderViewer({ onClose });
    const dialog = screen.getByRole('dialog', { name: 'Image 2' });
    expect(document.activeElement).toBe(dialog);
    expect(screen.getByText('2 / 3')).toBeTruthy();

    const tabEvent = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab' });
    dialog.dispatchEvent(tabEvent);
    expect(tabEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialog);

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('keeps mobile toolbar controls inside the dialog and closes on outside pointer', async () => {
    const view = renderViewer({ isMobileViewport: true });
    const dialog = screen.getByRole('dialog', { name: 'Image 2' });
    const toggle = dialog.querySelector<HTMLButtonElement>('.fullscreen-viewer__mobile-toolbar-toggle button');
    const menu = dialog.querySelector<HTMLElement>('#fullscreen-mobile-toolbar');

    expect(toggle).toBeTruthy();
    expect(menu).toBeTruthy();
    if (!toggle || !menu) throw new Error('mobile toolbar controls were not rendered');
    expect(toggle.dataset.variant).toBe('ghost');
    expect(toggle.querySelector('.lucide-panel-top-dashed')).toBeTruthy();
    fireEvent.click(toggle);
    await waitFor(() => expect(menu?.classList.contains('is-mobile-open')).toBe(true));
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.dataset.variant).toBe('primary');
    expect(toggle.querySelector('.lucide-panel-top-dashed')).toBeTruthy();

    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(menu?.classList.contains('is-mobile-open')).toBe(false));
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');

    view.unmount();
  });

  it('uses the full stage and removes the shortcut footer when the filmstrip is hidden', () => {
    const view = renderViewer({ showFilmstripByDefault: false });
    const dialog = screen.getByRole('dialog', { name: 'Image 2' });

    expect(dialog.classList.contains('has-filmstrip')).toBe(false);
    expect(dialog.querySelector('.fullscreen-viewer__media-stack')).toBeTruthy();
    expect(dialog.querySelector('.fullscreen-viewer__filmstrip')).toBeNull();
    expect(dialog.querySelector('.fullscreen-viewer__footer')).toBeNull();

    view.unmount();
  });

  it('uses the gallery thumbnails icon for the bottom rail toggle', () => {
    const view = renderViewer({ showFilmstripByDefault: false, simpleToolbar: false });
    const dialog = screen.getByRole('dialog', { name: 'Image 2' });
    const toggle = dialog.querySelector<HTMLButtonElement>('button[aria-label="顯示圖庫面板"]');

    expect(toggle?.querySelector('.lucide-gallery-thumbnails')).toBeTruthy();

    view.unmount();
  });

  it('includes toolbar and gallery panel controls in the simple toolbar', () => {
    const view = renderViewer({ showFilmstripByDefault: false, simpleToolbar: true });
    const dialog = screen.getByRole('dialog', { name: 'Image 2' });
    const toolbarButton = dialog.querySelector<HTMLButtonElement>('button[aria-label="隱藏工具列"]');

    expect(toolbarButton).toBeTruthy();
    expect(toolbarButton?.dataset.variant).toBe('primary');
    expect(toolbarButton?.querySelector('.lucide-panel-top-dashed')).toBeTruthy();
    expect(dialog.querySelector('button[aria-label="顯示圖庫面板"]')).toBeTruthy();

    view.unmount();
  });

  it('keeps the close button visible while the toolbar is hidden', () => {
    const view = renderViewer({ showToolbarByDefault: false, showFilmstripByDefault: false });
    const dialog = screen.getByRole('dialog', { name: 'Image 2' });
    const topbar = dialog.querySelector('.fullscreen-viewer__topbar');
    const restoreButton = dialog.querySelector<HTMLButtonElement>('button[aria-label="顯示工具列"]');
    const closeButton = dialog.querySelector<HTMLButtonElement>('button[aria-label="關閉全螢幕檢視"]');

    expect(topbar?.classList.contains('is-toolbar-hidden')).toBe(true);
    expect(restoreButton).toBeTruthy();
    expect(closeButton).toBeTruthy();
    expect(restoreButton?.dataset.variant).toBe('ghost');
    expect(closeButton?.dataset.variant).toBe('ghost');
    expect(restoreButton?.querySelector('.lucide-panel-top-dashed')).toBeTruthy();
    if (!restoreButton) throw new Error('toolbar restore button was not rendered');

    fireEvent.click(restoreButton);
    expect(topbar?.classList.contains('is-toolbar-hidden')).toBe(false);
    expect(dialog.querySelector('button[aria-label="顯示工具列"]')).toBeNull();

    view.unmount();
  });

  it('persists fullscreen toolbar preferences through controls and shortcuts', () => {
    const onSimpleToolbarChange = vi.fn();
    const onShowToolbarChange = vi.fn();
    const onShowFilmstripChange = vi.fn();
    const onCheckerboardChange = vi.fn();
    const onZoomModeChange = vi.fn();
    const previousScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });

    try {
      const view = renderViewer({
        simpleToolbar: false,
        onSimpleToolbarChange,
        onShowToolbarChange,
        onShowFilmstripChange,
        onCheckerboardChange,
        onZoomModeChange,
        showFilmstripByDefault: false,
        fullscreenShowCheckerboard: false,
      });
      const dialog = screen.getByRole('dialog', { name: 'Image 2' });

    const visibilityButtons = dialog.querySelectorAll<HTMLButtonElement>(
      '.fullscreen-viewer__toolbar-group--visibility button',
    );
    expect(visibilityButtons).toHaveLength(2);
    fireEvent.click(visibilityButtons[0]);
    expect(onShowToolbarChange).toHaveBeenCalledWith(false);

    const restoreButton = dialog.querySelector<HTMLButtonElement>(
      '.fullscreen-viewer__hidden-toolbar-actions button',
    );
    expect(restoreButton).toBeTruthy();
    if (!restoreButton) throw new Error('toolbar restore button was not rendered');
    fireEvent.click(restoreButton);
    expect(onShowToolbarChange).toHaveBeenLastCalledWith(true);

    const galleryButton = dialog.querySelectorAll<HTMLButtonElement>(
      '.fullscreen-viewer__toolbar-group--visibility button',
    )[1];
    fireEvent.click(galleryButton);
    expect(onShowFilmstripChange).toHaveBeenCalledWith(true);

    const checkerboardButton = dialog.querySelectorAll<HTMLButtonElement>(
      '.fullscreen-viewer__toolbar-group--display button',
    )[1];
    expect(checkerboardButton).toBeTruthy();
    if (!checkerboardButton) throw new Error('checkerboard button was not rendered');
    fireEvent.click(checkerboardButton);
    expect(onCheckerboardChange).toHaveBeenCalledWith(true);

    const settingsButtons = dialog.querySelectorAll<HTMLButtonElement>(
      '.fullscreen-viewer__toolbar-group--settings button',
    );
    fireEvent.click(settingsButtons[1]);
    expect(onSimpleToolbarChange).toHaveBeenCalledWith(true);

    fireEvent.keyDown(dialog, { key: 'm', code: 'KeyM', ctrlKey: true });
    expect(onZoomModeChange).toHaveBeenCalledWith('fit');

      view.unmount();
    } finally {
      if (previousScrollTo) {
        Object.defineProperty(HTMLElement.prototype, 'scrollTo', previousScrollTo);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
      }
    }
  });

  it('copies the file and folder paths from fullscreen details', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    try {
      const view = renderViewer();
      const dialog = screen.getByRole('dialog', { name: 'Image 2' });
      const detailsButton = dialog.querySelector<HTMLButtonElement>('button[aria-label="顯示圖片詳細資訊"]');

      expect(detailsButton).toBeTruthy();
      if (!detailsButton) throw new Error('details button was not rendered');
      fireEvent.click(detailsButton);
      expect(document.querySelectorAll('.fullscreen-viewer__details-item')).toHaveLength(1);
      expect(dialog.querySelector('.fullscreen-viewer__details-folder-actions')?.textContent)
        .toContain('圖片資料夾');
      expect(dialog.querySelectorAll('.viewer-media-action')).toHaveLength(2);
      expect(Array.from(dialog.querySelectorAll<HTMLButtonElement>('.viewer-media-action'))
        .every(button => button.dataset.fullWidth === 'true')).toBe(true);
      expect(dialog.querySelectorAll('.fullscreen-viewer__details-folder-actions')).toHaveLength(1);
      expect(dialog.querySelectorAll('.fullscreen-viewer__details-folder-copy')).toHaveLength(1);
      expect(dialog.querySelectorAll('.fullscreen-viewer__details-folder-open')).toHaveLength(1);

      fireEvent.click(dialog.querySelector<HTMLButtonElement>('button[aria-label="複製檔案路徑"]')!);
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('artist/image-2.jpg');
        expect(dialog.querySelector('.fullscreen-viewer__details-path-copy .lucide-check')).toBeTruthy();
      });
      expect(dialog.querySelector('.fullscreen-viewer__copy-feedback')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: '複製資料夾路徑' }));
      await waitFor(() => {
        expect(writeText).toHaveBeenLastCalledWith('artist');
        expect(dialog.querySelector('.fullscreen-viewer__details-folder-copy .lucide-check')).toBeTruthy();
      });

      view.unmount();
    } finally {
      if (previousClipboard) {
        Object.defineProperty(navigator, 'clipboard', previousClipboard);
      } else {
        Reflect.deleteProperty(navigator, 'clipboard');
      }
    }
  });

  it('documents video gestures in the fullscreen shortcut help', () => {
    const view = renderViewer({ showFilmstripByDefault: false });
    const dialog = screen.getByRole('dialog', { name: 'Image 2' });
    const shortcutButton = dialog.querySelector<HTMLButtonElement>('button[aria-label="顯示全螢幕快捷鍵"]');

    expect(shortcutButton).toBeTruthy();
    if (!shortcutButton) throw new Error('shortcut button was not rendered');
    fireEvent.click(shortcutButton);

    const shortcutHelp = dialog.querySelector('#fullscreen-shortcut-help');
    expect(shortcutHelp?.textContent).toContain('影片播放器');
    expect(shortcutHelp?.textContent).toContain('左／右半部雙擊');
    expect(shortcutHelp?.textContent).toContain('2 倍速');

    view.unmount();
  });

  it('renders the centered issue frame block when the current item has a media status error', () => {
    const issueImages: ImageItem[] = [
      {
        image_id: 99,
        member_id: 101,
        title: 'Broken Image',
        save_name: 'artist/broken.jpg',
        created_date: '2026-08-10',
        last_update_date: '2026-08-10',
        media_status: 'missing',
        media_error: '圖片檔案不存在',
      },
    ];

    const view = renderViewer({ images: issueImages, currentIndex: 0, totalImages: 1 });
    const dialog = screen.getByRole('dialog', { name: 'Broken Image' });
    const issueFrame = dialog.querySelector('.fullscreen-viewer__issue-frame');

    expect(issueFrame).toBeTruthy();
    expect(issueFrame?.querySelector('.media-issue-placeholder')).toBeTruthy();
    expect(screen.getByText('圖片檔案不存在')).toBeTruthy();
    expect(screen.getByText('⚠ 圖片有問題')).toBeTruthy();

    view.unmount();
  });
});
