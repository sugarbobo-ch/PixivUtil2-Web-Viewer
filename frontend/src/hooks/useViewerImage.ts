import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ImageItem } from '../types';
import { buildMediaUrl, isVideoItem } from '../utils/media';
import { imageLoadScheduler } from '../utils/imageLoadScheduler';

interface ViewerSize {
  width: number;
  height: number;
}

interface UseViewerImageOptions {
  images: ImageItem[];
  currentIndex: number;
  navigationDirection: 1 | -1;
  currentItem?: ImageItem;
  currentItemIsVideo: boolean;
  currentMediaUrl: string;
  demoMode: boolean;
  preloadCount: number;
  onMediaReset?: () => void;
}

export interface UseViewerImageResult {
  displayedImageUrl: string | null;
  visibleOriginalUrl: string | null;
  displayedImagePathRef: React.MutableRefObject<string | null>;
  thumbnailFailed: boolean;
  originalLoadFailed: boolean;
  naturalSize: ViewerSize;
  naturalSizeMediaUrl: string | null;
  isMediaTransitionSuppressed: boolean;
  handleThumbnailError: () => void;
  handleDisplayedImageLoad: (event: React.SyntheticEvent<HTMLImageElement>) => void;
  handleDisplayedImageError: (event: React.SyntheticEvent<HTMLImageElement>) => void;
  reloadCurrentMedia: () => void;
}

/**
 * Owns the fullscreen image lifecycle: active admission, directional
 * preloading, decoded-image retention, reveal timing, and reload handling.
 * Transform state remains in useViewerTransform; onMediaReset bridges the
 * two domains without moving transform ownership into the media loader.
 */
export const useViewerImage = ({
  images,
  currentIndex,
  navigationDirection,
  currentItem,
  currentItemIsVideo,
  currentMediaUrl,
  demoMode,
  preloadCount,
  onMediaReset,
}: UseViewerImageOptions): UseViewerImageResult => {
  const [displayedImageUrl, setDisplayedImageUrl] = useState<string | null>(null);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [originalLoadFailed, setOriginalLoadFailed] = useState(false);
  const [naturalSize, setNaturalSize] = useState<ViewerSize>({ width: 0, height: 0 });
  const [naturalSizeMediaUrl, setNaturalSizeMediaUrl] = useState<string | null>(null);
  const [isMediaTransitionSuppressed, setIsMediaTransitionSuppressed] = useState(true);
  const preloadedImagesRef = useRef(new Map<string, HTMLImageElement>());
  const preloadHandlesRef = useRef(new Map<string, { cancel: () => void }>());
  const displayedImageUrlRef = useRef<string | null>(displayedImageUrl);
  const displayedImagePathRef = useRef<string | null>(null);
  const reloadRequestRef = useRef(0);
  const mediaTransitionResetFrameRef = useRef<number | null>(null);

  const clearPreloads = useCallback(() => {
    for (const [url, handle] of preloadHandlesRef.current) {
      handle.cancel();
      preloadHandlesRef.current.delete(url);
    }
    for (const image of preloadedImagesRef.current.values()) {
      image.onload = null;
      image.onerror = null;
      image.src = '';
    }
    preloadedImagesRef.current.clear();
  }, []);

  useEffect(() => () => {
    clearPreloads();
    if (mediaTransitionResetFrameRef.current !== null) {
      window.cancelAnimationFrame(mediaTransitionResetFrameRef.current);
    }
  }, [clearPreloads]);

  useEffect(() => {
    if (!currentItem || currentItemIsVideo || currentItem.media_status || !currentMediaUrl) {
      return undefined;
    }

    const handle = imageLoadScheduler.request({
      url: currentMediaUrl,
      priority: 0,
      kind: 'original',
      owner: 'fullscreen',
    });
    return () => handle.cancel();
  }, [currentItem, currentItemIsVideo, currentMediaUrl]);

  useEffect(() => {
    if (mediaTransitionResetFrameRef.current !== null) {
      window.cancelAnimationFrame(mediaTransitionResetFrameRef.current);
      mediaTransitionResetFrameRef.current = null;
    }
    setIsMediaTransitionSuppressed(true);
    setThumbnailFailed(false);
    setOriginalLoadFailed(false);

    if (demoMode || currentItemIsVideo || !currentMediaUrl) {
      displayedImageUrlRef.current = null;
      displayedImagePathRef.current = null;
      setDisplayedImageUrl(null);
      setNaturalSize({ width: 0, height: 0 });
      setNaturalSizeMediaUrl(null);
      onMediaReset?.();
    }
  }, [currentItem?.save_name, currentItemIsVideo, currentMediaUrl, demoMode, onMediaReset]);

  useEffect(() => {
    if (demoMode) {
      clearPreloads();
      return undefined;
    }

    if (!images.length || preloadCount <= 0) {
      clearPreloads();
      return undefined;
    }

    const preloadIndexes = new Set<number>();
    for (let i = 1; i <= preloadCount; i++) {
      preloadIndexes.add(currentIndex + navigationDirection * i);
    }
    if (preloadCount > 1) preloadIndexes.add(currentIndex - navigationDirection);

    const activePreloadUrls = new Set<string>(
      currentItem && !currentItemIsVideo && currentMediaUrl ? [currentMediaUrl] : [],
    );
    preloadIndexes.forEach(index => {
      if (index < 0 || index >= images.length) return;
      const item = images[index];
      if (!item || item.media_status || !item.save_name || isVideoItem(item)) return;

      const url = buildMediaUrl(item);
      activePreloadUrls.add(url);
      if (preloadedImagesRef.current.has(url)) return;

      const image = new Image();
      image.decoding = 'async';
      image.addEventListener('load', () => imageLoadScheduler.markLoaded(url), { once: true });
      image.addEventListener('error', () => imageLoadScheduler.markFinished(url, false), { once: true });
      image.fetchPriority = Math.abs(index - currentIndex) === 1 ? 'high' : 'low';
      preloadedImagesRef.current.set(url, image);
      const handle = imageLoadScheduler.request({
        url,
        priority: Math.abs(index - currentIndex) === 1 ? 1 : 2,
        kind: 'original',
        owner: 'fullscreen',
      });
      preloadHandlesRef.current.set(url, handle);
      void handle.admitted.then(() => {
        if (preloadedImagesRef.current.get(url) !== image) return;
        image.src = url;
        if (Math.abs(index - currentIndex) === 1) void image.decode().catch(() => undefined);
      });
    });

    for (const url of preloadedImagesRef.current.keys()) {
      if (activePreloadUrls.has(url)) continue;
      preloadedImagesRef.current.delete(url);
      preloadHandlesRef.current.get(url)?.cancel();
      preloadHandlesRef.current.delete(url);
    }

    return undefined;
  }, [clearPreloads, currentIndex, currentItem, currentItemIsVideo, currentMediaUrl, demoMode, images, navigationDirection, preloadCount]);

  useEffect(() => {
    if (demoMode || !currentItem || currentItemIsVideo || !currentMediaUrl) {
      if (displayedImageUrlRef.current !== null) {
        displayedImageUrlRef.current = null;
        displayedImagePathRef.current = null;
        setDisplayedImageUrl(null);
      }
      return undefined;
    }

    if (
      displayedImageUrlRef.current === currentMediaUrl
      && displayedImagePathRef.current === currentItem.save_name
    ) return undefined;

    let cancelled = false;
    let revealFrame: number | null = null;
    const cachedImage = preloadedImagesRef.current.get(currentMediaUrl);
    const image = cachedImage ?? new Image();
    image.decoding = 'async';
    image.fetchPriority = 'high';

    const revealImage = () => {
      if (cancelled || revealFrame !== null) return;
      revealFrame = window.requestAnimationFrame(() => {
        revealFrame = null;
        if (cancelled) return;
        imageLoadScheduler.markLoaded(currentMediaUrl);
        if (image.naturalWidth > 0 && image.naturalHeight > 0) {
          setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
          setNaturalSizeMediaUrl(currentMediaUrl);
          onMediaReset?.();
        }
        displayedImageUrlRef.current = currentMediaUrl;
        displayedImagePathRef.current = currentItem.save_name;
        setOriginalLoadFailed(false);
        setDisplayedImageUrl(currentMediaUrl);
        mediaTransitionResetFrameRef.current = window.requestAnimationFrame(() => {
          mediaTransitionResetFrameRef.current = null;
          setIsMediaTransitionSuppressed(false);
        });
      });
    };

    const handleImageError = () => {
      if (cancelled) return;
      imageLoadScheduler.markFinished(currentMediaUrl, false);
      if (displayedImagePathRef.current === currentItem.save_name) {
        displayedImageUrlRef.current = null;
        displayedImagePathRef.current = null;
        setDisplayedImageUrl(null);
      }
      setOriginalLoadFailed(true);
    };

    image.onload = revealImage;
    image.onerror = handleImageError;
    if (!cachedImage) {
      image.src = currentMediaUrl;
      preloadedImagesRef.current.set(currentMediaUrl, image);
    }

    if (image.complete) {
      void image.decode().then(revealImage).catch(() => {
        if (image.naturalWidth > 0) revealImage();
      });
    }

    return () => {
      cancelled = true;
      if (revealFrame !== null) window.cancelAnimationFrame(revealFrame);
      image.onload = null;
      image.onerror = null;
    };
  }, [currentItem, currentItemIsVideo, currentMediaUrl, demoMode, onMediaReset]);

  const handleDisplayedImageLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    setNaturalSize({
      width: event.currentTarget.naturalWidth,
      height: event.currentTarget.naturalHeight,
    });
    setNaturalSizeMediaUrl(currentMediaUrl);
    imageLoadScheduler.markLoaded(event.currentTarget.currentSrc || currentMediaUrl);
  }, [currentMediaUrl]);

  const handleDisplayedImageError = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    imageLoadScheduler.markFinished(event.currentTarget.currentSrc || currentMediaUrl, false);
    setOriginalLoadFailed(true);
    if (displayedImagePathRef.current === currentItem?.save_name) {
      displayedImageUrlRef.current = null;
      displayedImagePathRef.current = null;
      setDisplayedImageUrl(null);
    }
  }, [currentItem?.save_name, currentMediaUrl]);

  const reloadCurrentMedia = useCallback(() => {
    if (demoMode || !currentItem || !currentMediaUrl) return;
    if (currentItemIsVideo) return;

    const requestId = ++reloadRequestRef.current;
    const separator = currentMediaUrl.includes('?') ? '&' : '?';
    const reloadUrl = `${currentMediaUrl}${separator}viewer_reload=${Date.now()}`;
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      void image.decode().catch(() => undefined).finally(() => {
        if (requestId !== reloadRequestRef.current) return;
        imageLoadScheduler.markLoaded(reloadUrl);
        displayedImageUrlRef.current = reloadUrl;
        displayedImagePathRef.current = currentItem.save_name;
        setOriginalLoadFailed(false);
        setDisplayedImageUrl(reloadUrl);
      });
    };
    image.onerror = () => {
      if (requestId !== reloadRequestRef.current) return;
      imageLoadScheduler.markFinished(reloadUrl, false);
      setOriginalLoadFailed(true);
    };
    image.src = reloadUrl;
  }, [currentItem, currentItemIsVideo, currentMediaUrl, demoMode]);

  return {
    displayedImageUrl,
    visibleOriginalUrl: displayedImageUrl,
    displayedImagePathRef,
    thumbnailFailed,
    originalLoadFailed,
    naturalSize,
    naturalSizeMediaUrl,
    isMediaTransitionSuppressed,
    handleThumbnailError: () => setThumbnailFailed(true),
    handleDisplayedImageLoad,
    handleDisplayedImageError,
    reloadCurrentMedia,
  };
};
