import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { ImageItem, SourceLink } from '../types';
import { getItemGroupKey } from '../utils/grouping';
import { buildThumbnailUrl } from '../utils/webConfig';
import { fetchSourceLink } from '../utils/sourceLinks';
import { LocalOpenTarget, openLocalMedia } from '../utils/localFileActions';
import { MediaIssuePlaceholder } from './MediaIssuePlaceholder';
import { imageLoadScheduler, useImageLoadPermission } from '../utils/imageLoadScheduler';
import { ChevronLeft, ChevronRight, X, Download, Trash2, Info, ExternalLink, FolderOpen, Image as ImageIcon } from 'lucide-react';

const buildMediaUrl = (item: ImageItem): string => (
  `/api/file?path=${encodeURIComponent(item.save_name || '')}&image_id=${item.image_id}`
);

interface FilmstripThumbnailProps {
  item: ImageItem;
  index: number;
  isNearCurrent: boolean;
  isVisible: boolean;
  thumbnailSize: number;
  blurEnabled: boolean;
}

const FilmstripThumbnail = React.memo<FilmstripThumbnailProps>(({
  item,
  index,
  isNearCurrent,
  isVisible,
  thumbnailSize,
  blurEnabled,
}) => {
  const url = buildThumbnailUrl(item, thumbnailSize);
  const loadEnabled = isNearCurrent || isVisible;
  const admitted = useImageLoadPermission({
    url,
    priority: 2,
    kind: 'thumbnail',
    owner: 'filmstrip',
    enabled: loadEnabled,
  });

  return (
    <span className="fullscreen-viewer__thumbnail-slot">
      {admitted ? (
        <img
          src={url}
          alt={item.title || `P${index + 1}`}
          loading="lazy"
          decoding="async"
          {...{ fetchpriority: 'low' }}
          onLoad={() => imageLoadScheduler.markLoaded(url)}
          onError={() => imageLoadScheduler.markFinished(url, false)}
          className={`fullscreen-viewer__thumbnail-image ${blurEnabled ? 'blur-media blur-media--filmstrip' : ''}`}
        />
      ) : (
        <span className="fullscreen-viewer__thumbnail-placeholder" aria-hidden="true" />
      )}
    </span>
  );
});

interface FullscreenViewerProps {
  images: ImageItem[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (newIndex: number) => void;
  onDeleteCurrent?: (imageId: number) => void;
  onNavigateNextWork?: () => void;
  onNavigatePrevWork?: () => void;
  workTitle?: string;
  artistName?: string;
  preloadCount?: number;
  thumbnailSize: number;
  blurEnabled?: boolean;
}

export const FullscreenViewer: React.FC<FullscreenViewerProps> = ({
  images,
  currentIndex,
  onClose,
  onNavigate,
  onDeleteCurrent,
  onNavigateNextWork,
  onNavigatePrevWork,
  workTitle,
  artistName,
  preloadCount = 3,
  thumbnailSize,
  blurEnabled = false,
}) => {
  const currentItem = images[currentIndex];
  const currentMediaUrl = currentItem ? buildMediaUrl(currentItem) : '';
  const currentThumbnailUrl = currentItem ? buildThumbnailUrl(currentItem, thumbnailSize) : '';
  const currentItemIsVideo = currentItem?.save_name.toLowerCase().endsWith('.mp4') ?? false;
  const thumbnailAdmitted = useImageLoadPermission({
    url: currentThumbnailUrl,
    priority: 0,
    kind: 'thumbnail',
    owner: 'fullscreen',
    enabled: Boolean(currentItem && !currentItemIsVideo && !currentItem.media_status),
  });
  const [isPlaying, setIsPlaying] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [sourceLink, setSourceLink] = useState<SourceLink | null>(null);
  const [isSourceLoading, setIsSourceLoading] = useState(false);
  const [openAction, setOpenAction] = useState<LocalOpenTarget | null>(null);
  const [openActionError, setOpenActionError] = useState<string | null>(null);
  const [displayedImageUrl, setDisplayedImageUrl] = useState<string | null>(null);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [originalLoadFailed, setOriginalLoadFailed] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wheelGestureActive = useRef(false);
  const wheelGestureResetTimer = useRef<number | null>(null);
  const filmstripScrollRef = useRef<HTMLDivElement>(null);
  const activeThumbnailRef = useRef<HTMLButtonElement | null>(null);
  const hasPositionedFilmstrip = useRef(false);
  const preloadedImagesRef = useRef(new Map<string, HTMLImageElement>());
  const preloadHandlesRef = useRef(new Map<string, { cancel: () => void }>());
  const navigationDirectionRef = useRef<1 | -1>(1);
  const displayedImageUrlRef = useRef(displayedImageUrl);
  const displayedImagePathRef = useRef<string | null>(null);
  const [isFilmstripPositioned, setIsFilmstripPositioned] = useState(false);
  const [visibleFilmstripIndexes, setVisibleFilmstripIndexes] = useState<Set<number>>(() => new Set());
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  const canOpenLocalMedia = Boolean(
    currentItem?.save_name
    && currentItem.media_status !== 'missing'
    && currentItem.media_status !== 'internal',
  );
  const openMediaLabel = currentItemIsVideo ? '開啟影片' : '開啟圖片';
  const visibleOriginalUrl = displayedImagePathRef.current === currentItem?.save_name
    ? displayedImageUrl
    : null;

  useEffect(() => {
    let cancelled = false;
    setSourceLink(null);
    setIsSourceLoading(false);

    if (!showDetails || !currentItem?.save_name) return undefined;

    setIsSourceLoading(true);
    fetchSourceLink(currentItem.save_name).then(link => {
      if (cancelled) return;
      setSourceLink(link);
      setIsSourceLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [showDetails, currentItem?.save_name]);

  useEffect(() => {
    setOpenAction(null);
    setOpenActionError(null);
  }, [currentItem?.image_id]);

  useEffect(() => {
    displayedImageUrlRef.current = null;
    displayedImagePathRef.current = null;
    setDisplayedImageUrl(null);
    setThumbnailFailed(false);
    setOriginalLoadFailed(false);
  }, [currentItem?.save_name, currentMediaUrl]);

  const handleOpenLocalMedia = useCallback(async (target: LocalOpenTarget) => {
    if (!currentItem || !canOpenLocalMedia) return;

    setOpenAction(target);
    setOpenActionError(null);
    try {
      await openLocalMedia({
        path: currentItem.save_name,
        imageId: currentItem.image_id,
        target,
      });
    } catch (error) {
      setOpenActionError(error instanceof Error ? error.message : '無法開啟檔案，請稍後再試。');
    } finally {
      setOpenAction(null);
    }
  }, [canOpenLocalMedia, currentItem]);

  // Reserve the highest-priority original-image slot for the image currently
  // shown in the stage before directional neighbors are scheduled.
  useEffect(() => {
    if (!currentItem || currentItemIsVideo || currentItem.media_status || !currentMediaUrl) return undefined;

    const handle = imageLoadScheduler.request({
      url: currentMediaUrl,
      priority: 0,
      kind: 'original',
      owner: 'fullscreen',
    });
    return () => handle.cancel();
  }, [currentItem, currentItemIsVideo, currentMediaUrl]);

  // Lock the page behind the previewer and move focus into the dialog.
  useEffect(() => {
    previouslyFocusedElement.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;

    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overscrollBehavior = 'none';
    viewerRef.current?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
      previouslyFocusedElement.current?.focus({ preventScroll: true });
    };
  }, []);

  // Position the filmstrip before the first paint so opening the viewer never
  // exposes the automatic centering scroll.
  useLayoutEffect(() => {
    const container = filmstripScrollRef.current;
    const thumbnail = activeThumbnailRef.current;
    if (!container || !thumbnail) return;

    const targetLeft = thumbnail.offsetLeft - (container.clientWidth - thumbnail.offsetWidth) / 2;
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);

    container.scrollTo({
      left: Math.max(0, Math.min(maxScrollLeft, targetLeft)),
      behavior: 'auto',
    });

    if (!hasPositionedFilmstrip.current) {
      hasPositionedFilmstrip.current = true;
      setIsFilmstripPositioned(true);
    }
  }, [currentIndex, images.length]);

  // Observe the entire filmstrip with one root observer. The grid virtualizer
  // deliberately owns the expensive viewport work; the filmstrip only needs
  // to reveal thumbnails that are actually in or near its horizontal viewport.
  // Keep the previous visibility set while the active item changes so a
  // thumbnail that remains on screen is not replaced by a placeholder while
  // the observer reports the new scroll position.
  useEffect(() => {
    const root = filmstripScrollRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const observer = new IntersectionObserver(entries => {
      setVisibleFilmstripIndexes(previous => {
        const next = new Set(previous);
        entries.forEach(entry => {
          const index = Number((entry.target as HTMLElement).dataset.filmstripIndex);
          if (!Number.isInteger(index)) return;
          if (entry.isIntersecting) next.add(index);
          else next.delete(index);
        });
        if (next.size === previous.size && Array.from(next).every(index => previous.has(index))) return previous;
        return next;
      });
    }, { root, rootMargin: '96px' });

    root.querySelectorAll<HTMLElement>('[data-filmstrip-index]').forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [images.length]);

  // Dynamic configurable image preloader. Keep the query string identical to
  // the visible image URL so the browser can reuse the fetched response.
  useEffect(() => {
    if (!images.length || preloadCount <= 0) return;

    const preloadIndexes = new Set<number>();
    const direction = navigationDirectionRef.current;
    for (let i = 1; i <= preloadCount; i++) preloadIndexes.add(currentIndex + direction * i);
    if (preloadCount > 1) preloadIndexes.add(currentIndex - direction);

    const activePreloadUrls = new Set<string>(
      currentItem && !currentItemIsVideo && currentMediaUrl ? [currentMediaUrl] : [],
    );
    preloadIndexes.forEach(idx => {
      if (idx >= 0 && idx < images.length) {
        const item = images[idx];
        if (item && !item.media_status && item.save_name && !item.save_name.toLowerCase().endsWith('.mp4')) {
          const url = buildMediaUrl(item);
          activePreloadUrls.add(url);
          if (preloadedImagesRef.current.has(url)) return;

          const img = new Image();
          img.decoding = 'async';
          img.addEventListener('load', () => imageLoadScheduler.markLoaded(url), { once: true });
          img.addEventListener('error', () => imageLoadScheduler.markFinished(url, false), { once: true });
          const priority = Math.abs(idx - currentIndex) === 1 ? 1 : 2;
          img.fetchPriority = priority === 1 ? 'high' : 'low';
          preloadedImagesRef.current.set(url, img);
          const handle = imageLoadScheduler.request({
            url,
            priority,
            kind: 'original',
            owner: 'fullscreen',
          });
          preloadHandlesRef.current.set(url, handle);
          void handle.admitted.then(() => {
            if (preloadedImagesRef.current.get(url) !== img) return;
            img.src = url;
            if (Math.abs(idx - currentIndex) === 1) void img.decode().catch(() => undefined);
          });
        }
      }
    });

    for (const url of preloadedImagesRef.current.keys()) {
      if (!activePreloadUrls.has(url)) {
        preloadedImagesRef.current.delete(url);
        preloadHandlesRef.current.get(url)?.cancel();
        preloadHandlesRef.current.delete(url);
      }
    }
  }, [currentIndex, currentItem, currentItemIsVideo, currentMediaUrl, images, preloadCount]);

  // Keep the previous image on screen until the next one has loaded and
  // decoded. Replacing the visible <img> with an unfinished request exposes a
  // bright one-frame flash, especially when switching from a dark artwork.
  useEffect(() => {
    if (!currentItem || currentItemIsVideo || !currentMediaUrl) {
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
        displayedImageUrlRef.current = currentMediaUrl;
        displayedImagePathRef.current = currentItem.save_name;
        setOriginalLoadFailed(false);
        setDisplayedImageUrl(currentMediaUrl);
      });
    };

    const handleImageError = () => {
      if (cancelled) return;
      imageLoadScheduler.markFinished(currentMediaUrl, false);
      displayedImageUrlRef.current = null;
      displayedImagePathRef.current = null;
      setDisplayedImageUrl(null);
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
  }, [currentItem, currentItemIsVideo, currentMediaUrl]);

  const handleNext = useCallback(() => {
    navigationDirectionRef.current = 1;
    if (currentIndex < images.length - 1) {
      onNavigate(currentIndex + 1);
    } else if (onNavigateNextWork) {
      onNavigateNextWork();
    }
  }, [currentIndex, images.length, onNavigate, onNavigateNextWork]);

  const handlePrev = useCallback(() => {
    navigationDirectionRef.current = -1;
    if (currentIndex > 0) {
      onNavigate(currentIndex - 1);
    } else if (onNavigatePrevWork) {
      onNavigatePrevWork();
    }
  }, [currentIndex, onNavigate, onNavigatePrevWork]);

  // Wheel over the filmstrip pans its native horizontal scroller. Wheel Up /
  // Wheel Down elsewhere uses the same navigation callbacks as the arrow keys.
  // A short same-direction cooldown filters trackpad inertia without adding the
  // noticeable pause caused by the previous 250ms debounce.
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!(e.target instanceof Node) || !viewerRef.current?.contains(e.target)) return;

      const target = e.target instanceof Element ? e.target : null;
      const filmstrip = target?.closest('.fullscreen-viewer__filmstrip-scroll') as HTMLDivElement | null;
      if (filmstrip) {
        const rawDelta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (rawDelta === 0) return;

        const deltaMultiplier = e.deltaMode === 1
          ? 16
          : e.deltaMode === 2
            ? filmstrip.clientWidth
            : 1;

        e.preventDefault();
        e.stopPropagation();
        filmstrip.scrollLeft += rawDelta * deltaMultiplier;
        return;
      }
      if (e.deltaY === 0) return;

      e.preventDefault();
      e.stopPropagation();
      // Treat one continuous wheel/trackpad stream as one navigation gesture.
      // Trackpad inertia can alternate deltaY's sign; accepting that opposite
      // sign immediately makes the viewer jump back and forth.
      if (wheelGestureResetTimer.current !== null) {
        window.clearTimeout(wheelGestureResetTimer.current);
      }
      wheelGestureResetTimer.current = window.setTimeout(() => {
        wheelGestureActive.current = false;
        wheelGestureResetTimer.current = null;
      }, 180);
      if (wheelGestureActive.current) return;
      wheelGestureActive.current = true;

      if (e.deltaY > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    },
    [handleNext, handlePrev]
  );

  useEffect(() => {
    document.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => document.removeEventListener('wheel', handleWheel, true);
  }, [handleWheel]);

  useEffect(() => () => {
    if (wheelGestureResetTimer.current !== null) {
      window.clearTimeout(wheelGestureResetTimer.current);
    }
  }, []);

  // Keyboard Shortcuts (Arrow keys, J/K, Space, Esc, Delete).
  // Consume navigation events so the page behind the dialog cannot scroll.
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!(e.target instanceof Node) || !viewerRef.current?.contains(e.target)) return;

    const target = e.target instanceof Element ? e.target : null;
    const isInteractiveTarget = Boolean(target?.closest('button, input, textarea, select, [contenteditable="true"]'));

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      e.stopPropagation();
      handleNext();
      viewerRef.current?.focus({ preventScroll: true });
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'j' || e.key === 'J') {
      e.preventDefault();
      e.stopPropagation();
      handlePrev();
      viewerRef.current?.focus({ preventScroll: true });
    } else if (e.key === ' ' && !isInteractiveTarget) {
      e.preventDefault();
      e.stopPropagation();
      if (videoRef.current) {
        if (isPlaying) videoRef.current.pause();
        else videoRef.current.play();
        setIsPlaying(!isPlaying);
      }
    } else if (e.key === 'Delete' && onDeleteCurrent && currentItem) {
      e.preventDefault();
      e.stopPropagation();
      onDeleteCurrent(currentItem.image_id);
    }
  }, [onClose, handleNext, handlePrev, isPlaying, onDeleteCurrent, currentItem]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  if (!currentItem) return null;

  const mediaUrl = currentMediaUrl;

  return (
    <div
      ref={viewerRef}
      role="dialog"
      aria-modal="true"
      aria-label={currentItem.title || 'Image preview'}
      tabIndex={-1}
      className="fullscreen-viewer animate-fadeIn"
    >
      {/* Top Header Bar */}
      <div className="fullscreen-viewer__topbar">
        <div className="fullscreen-viewer__topbar-group">
          <span className="fullscreen-viewer__counter">
            {currentIndex + 1} / {images.length}
          </span>
          <h3
            className="fullscreen-viewer__title"
            title={currentItem.title || '無題'}
          >
            {currentItem.title || '無題'}
          </h3>
          {currentItem.media_status && (
            <span className="fullscreen-viewer__status" title={currentItem.media_error}>
              ⚠ 圖片有問題
            </span>
          )}
        </div>

        <div className="fullscreen-viewer__topbar-actions">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            aria-label="Show image details"
            aria-pressed={showDetails}
            className="viewer-icon-button"
            title="詳細資訊"
          >
            <Info className="w-5 h-5" aria-hidden="true" />
          </button>
          {onDeleteCurrent && (
            <button
              type="button"
              onClick={() => onDeleteCurrent(currentItem.image_id)}
              aria-label="Move image to recycle bin"
              className="viewer-icon-button viewer-icon-button--danger"
              title="移至回收區 (Delete)"
            >
              <Trash2 className="w-5 h-5" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="viewer-icon-button"
            title="關閉 (Esc)"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Main Display Area */}
      <div
        className="fullscreen-viewer__stage"
        onClick={event => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        {/* Navigation Buttons */}
        {currentIndex > 0 && (
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous image"
            className="viewer-nav-button viewer-nav-button--previous"
            title="上一張 (←)"
          >
            <ChevronLeft className="w-8 h-8" aria-hidden="true" />
          </button>
        )}

        {currentIndex < images.length - 1 && (
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next image"
            className="viewer-nav-button viewer-nav-button--next"
            title="下一張 (→)"
          >
            <ChevronRight className="w-8 h-8" aria-hidden="true" />
          </button>
        )}

        {/* Media Rendering */}
        {currentItem.media_status ? (
          <div className="fullscreen-viewer__issue-frame">
            <MediaIssuePlaceholder message={currentItem.media_error} />
          </div>
        ) : currentItemIsVideo ? (
          <div className="fullscreen-viewer__video-frame">
            <video
              ref={videoRef}
              src={mediaUrl}
              autoPlay
              loop
              controls
              className={`fullscreen-viewer__media ${blurEnabled ? 'blur-media blur-media--viewer' : ''}`}
            />
          </div>
        ) : (
          <div className="fullscreen-viewer__media-stack">
            {thumbnailAdmitted && !thumbnailFailed && (
              <img
                src={currentThumbnailUrl}
                alt=""
                aria-hidden="true"
                loading="eager"
                decoding="async"
                {...{ fetchpriority: 'high' }}
                onLoad={() => {
                  imageLoadScheduler.markLoaded(currentThumbnailUrl);
                }}
                onError={() => {
                  imageLoadScheduler.markFinished(currentThumbnailUrl, false);
                  setThumbnailFailed(true);
                }}
                className={`fullscreen-viewer__media fullscreen-viewer__media--thumbnail ${blurEnabled ? 'blur-media blur-media--viewer' : ''}`}
              />
            )}
            {visibleOriginalUrl && (
              <img
                src={visibleOriginalUrl}
                alt={currentItem.title}
                loading="eager"
                decoding="async"
                {...{ fetchpriority: 'high' }}
                onLoad={event => {
                  imageLoadScheduler.markLoaded(event.currentTarget.currentSrc || mediaUrl);
                }}
                onError={event => {
                  imageLoadScheduler.markFinished(event.currentTarget.currentSrc || mediaUrl, false);
                  setOriginalLoadFailed(true);
                  displayedImageUrlRef.current = null;
                  displayedImagePathRef.current = null;
                  setDisplayedImageUrl(null);
                }}
                className={`fullscreen-viewer__media fullscreen-viewer__media--original is-visible ${blurEnabled ? 'blur-media blur-media--viewer' : ''}`}
              />
            )}
            {originalLoadFailed && (
              <p className="fullscreen-viewer__load-error" role="status">
                原圖載入失敗，保留縮圖預覽。
              </p>
            )}
          </div>
        )}

        {/* Details Panel Overlay */}
        {showDetails && (
          <div className="fullscreen-viewer__details">
            <div>
              <h4 className="font-bold text-base text-white mb-2">{currentItem.title || '無題'}</h4>
              <div className="fullscreen-viewer__details-body">
                <p><span className="text-zinc-500">作品 ID:</span> {currentItem.image_id}</p>
                <p><span className="text-zinc-500">繪師:</span> {currentItem.artist_name || currentItem.member_id}</p>
                <p><span className="text-zinc-500">繪師 ID:</span> {currentItem.member_id}</p>
                <p><span className="text-zinc-500">發布時間:</span> {currentItem.created_date || '未知'}</p>
                <p className="break-all"><span className="text-zinc-500">儲存路徑:</span> {currentItem.save_name}</p>
                <p className="fullscreen-viewer__source-row" aria-live="polite">
                  <span className="fullscreen-viewer__details-label">來源作品:</span>{' '}
                  {isSourceLoading ? (
                    <span className="fullscreen-viewer__source-pending">正在確認來源…</span>
                  ) : sourceLink ? (
                    <a
                      href={sourceLink.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="fullscreen-viewer__source-link"
                    >
                      {sourceLink.platform === 'fanbox' ? '在 FANBOX 查看文章' : '在 Pixiv 查看作品'}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="fullscreen-viewer__source-unavailable">無法確認</span>
                  )}
                </p>
                {currentItem.media_status && (
                  <p className="text-amber-300"><span className="text-zinc-500">狀態:</span> {currentItem.media_error}</p>
                )}
              </div>
            </div>
            <div className="viewer-details-actions">
              <div className="viewer-file-actions">
              <button
                type="button"
                onClick={() => handleOpenLocalMedia('file')}
                className="viewer-secondary-action"
                disabled={!canOpenLocalMedia || openAction !== null}
                aria-busy={openAction === 'file'}
                title={`${openMediaLabel}（使用 Windows 預設程式）`}
              >
                <ImageIcon className="h-4 w-4" aria-hidden="true" />
                {openMediaLabel}
              </button>
              <button
                type="button"
                onClick={() => handleOpenLocalMedia('folder')}
                className="viewer-secondary-action"
                disabled={!canOpenLocalMedia || openAction !== null}
                aria-busy={openAction === 'folder'}
                title="開啟所在資料夾（使用檔案總管）"
              >
                <FolderOpen className="h-4 w-4" aria-hidden="true" />
                開啟資料夾
              </button>
              </div>
            {openActionError && (
              <p className="viewer-file-action-error" role="alert">{openActionError}</p>
            )}
            <button
              onClick={() => window.open(mediaUrl, '_blank')}
              className="viewer-primary-action"
            >
              <Download className="w-4 h-4" /> 下載 / 開啟原檔
            </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Filmstrip Thumbnail Bar */}
      {images.length > 1 && (
        <div className={`fullscreen-viewer__filmstrip${isFilmstripPositioned ? '' : ' is-positioning'}`}>
          <div ref={filmstripScrollRef} className="fullscreen-viewer__filmstrip-scroll">
            {images.map((item, idx) => {
              const isActive = idx === currentIndex;
              const isWorkBoundary = idx > 0 && getItemGroupKey(images[idx]) !== getItemGroupKey(images[idx - 1]);

              return (
                <React.Fragment key={item.image_id || idx}>
                  {/* Work Boundary Vertical Separator Line */}
                  {isWorkBoundary && (
                    <div
                      className="fullscreen-viewer__boundary"
                      title={`作品分界: ${item.title || '下一作品'}`}
                    />
                  )}

                  <button
                    ref={(el) => {
                      if (isActive) activeThumbnailRef.current = el;
                    }}
                    data-filmstrip-index={idx}
                    onClick={() => onNavigate(idx)}
                    aria-label={`Preview image ${idx + 1}`}
                    aria-current={isActive ? 'true' : undefined}
                    className={`fullscreen-viewer__thumbnail ${isActive ? 'is-active' : ''}`}
                  >
                    {item.media_status ? (
                      <MediaIssuePlaceholder message={item.media_error} compact />
                    ) : (
                      <FilmstripThumbnail
                        item={item}
                        index={idx}
                        isNearCurrent={Math.abs(idx - currentIndex) <= 3}
                        isVisible={visibleFilmstripIndexes.has(idx)}
                        thumbnailSize={thumbnailSize}
                        blurEnabled={blurEnabled}
                      />
                    )}
                    <span className="fullscreen-viewer__thumbnail-index">
                      {idx + 1}
                    </span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom Hint Footer */}
      <div className="fullscreen-viewer__footer">
        <span>滾輪上下 / 鍵盤左右切換 ‧ 空白鍵暫停影片 ‧ Esc 退出 ‧ E 切換編輯</span>
      </div>
    </div>
  );
};
