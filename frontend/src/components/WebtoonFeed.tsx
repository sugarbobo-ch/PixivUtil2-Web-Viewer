import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  CircleHelp,
  Eye,
  EyeOff,
  Hash,
  Minus,
  PanelLeft,
  Plus,
  Settings2,
} from 'lucide-react';
import { ImageItem, VideoPreferencePatch, WebConfig } from '../types';
import { MediaIssuePlaceholder } from './MediaIssuePlaceholder';
import { DemoMediaBlock } from './DemoMediaBlock';
import { buildMediaUrl, isVideoItem } from '../utils/media';
import { buildThumbnailUrl } from '../utils/webConfig';
import { getGroupPageNumbers } from '../utils/grouping';
import {
  buildWebtoonMetrics,
  buildWebtoonThumbnailLayout,
  findIndexAtOffset,
  getThumbnailHeight,
  WebtoonMetrics,
  WebtoonThumbnailLayout,
} from '../utils/viewerLayout';
import {
  imageLoadScheduler,
  useImageLoadPermission,
} from '../utils/imageLoadScheduler';
import { useViewerMediaAdmission } from '../hooks/useViewerMediaAdmission';
import { getScrollTopForElement } from '../utils/galleryLayout';
import { prefersReducedMotion } from '../utils/motion';
import { Badge, IconButton, Input } from './ui';

type WebtoonSettingsPatch = Partial<Pick<
  WebConfig,
  'webtoonImageScale' | 'webtoonImageGap' | 'webtoonShowInfo' | 'webtoonShowPageNumber' | 'webtoonShowThumbnails'
>>;

interface WebtoonFeedProps {
  images: ImageItem[];
  blurEnabled?: boolean;
  demoMode?: boolean;
  initialIndex?: number | null;
  initialRequestId?: number;
  thumbnailSize: number;
  imageScale: number;
  imageGap: number;
  showInfo: boolean;
  showPageNumber: boolean;
  showThumbnails: boolean;
  groupMangaPosts?: boolean;
  pageOffset?: number;
  totalImages?: number;
  currentPage?: number;
  totalPages?: number;
  mobileToolbarOpen?: boolean;
  isMobileViewport?: boolean;
  videoMuted?: boolean;
  videoVolume?: number;
  videoAutoplay?: boolean;
  onPageChange?: (page: number, anchorIndex?: number) => void;
  onSettingsChange?: (patch: WebtoonSettingsPatch) => void;
  onVideoPreferenceChange?: (patch: VideoPreferencePatch) => void;
}

const DEFAULT_ASPECT_RATIO = 4 / 5;
const VIRTUAL_OVERSCAN = 1400;
const MIN_ITEM_HEIGHT = 180;
const DEFAULT_THUMBNAIL_ASPECT_RATIO = 4 / 5;
const THUMBNAIL_EDGE_PADDING = 8;
const THUMBNAIL_GAP = 4;
const THUMBNAIL_BOUNDARY_WIDTH = 2;
const THUMBNAIL_BOUNDARY_MARGIN = 4;
const THUMBNAIL_MIN_HEIGHT = 44;
const THUMBNAIL_WIDTH_INSET = 16;
const THUMBNAIL_OVERSCAN = 4;
const QUICK_SCALE_STEP = 10;
const QUICK_GAP_STEP = 8;
const QUICK_TOOLBAR_COLLAPSE_DELAY = 500;
const WEBTOON_VIDEO_PLAY_THRESHOLD = 0.6;
const WEBTOON_VIDEO_PAUSE_THRESHOLD = 0.25;

const activeWebtoonAutoplayVideos = new Set<HTMLVideoElement>();

const playWebtoonVideoExclusively = (video: HTMLVideoElement) => {
  for (const activeVideo of activeWebtoonAutoplayVideos) {
    if (activeVideo !== video) activeVideo.pause();
  }
  activeWebtoonAutoplayVideos.add(video);
  try {
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      void playPromise.catch(() => undefined);
    }
  } catch {
    // Autoplay can still be rejected when the saved preference is unmuted.
  }
};

const pauseWebtoonVideo = (video: HTMLVideoElement) => {
  activeWebtoonAutoplayVideos.delete(video);
  if (!video.paused) video.pause();
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getMainForFeed = (feed: HTMLElement | null): HTMLElement | null => (
  feed?.closest('main') as HTMLElement | null
);

const getFeedDocumentTop = (main: HTMLElement, feed: HTMLElement) => {
  const mainRect = main.getBoundingClientRect();
  const feedRect = feed.getBoundingClientRect();
  return main.scrollTop + feedRect.top - mainRect.top;
};

interface WebtoonMediaProps {
  item: ImageItem;
  pageNumber: number;
  thumbnailSize: number;
  blurEnabled: boolean;
  demoMode: boolean;
  isNearCurrent: boolean;
  videoMuted: boolean;
  videoVolume: number;
  videoAutoplay: boolean;
  onVideoPreferenceChange?: (patch: VideoPreferencePatch) => void;
}

const WebtoonMedia = React.memo<WebtoonMediaProps>(({
  item,
  pageNumber,
  thumbnailSize,
  blurEnabled,
  demoMode,
  isNearCurrent,
  videoMuted,
  videoVolume,
  videoAutoplay,
  onVideoPreferenceChange,
}) => {
  const isVideo = isVideoItem(item);
  const mediaUrl = buildMediaUrl(item);
  const thumbnailUrl = buildThumbnailUrl(item, thumbnailSize);
  const [aspectRatio, setAspectRatio] = React.useState(DEFAULT_ASPECT_RATIO);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  const {
    thumbnailAdmitted,
    originalAdmitted,
    thumbnailReady,
    thumbnailFailed,
    originalReady,
    originalFailed,
    markThumbnailLoaded,
    markThumbnailError,
    markOriginalLoaded,
    markOriginalError,
  } = useViewerMediaAdmission({
    thumbnailUrl,
    mediaUrl,
    thumbnailPriority: isNearCurrent ? 1 : 2,
    originalPriority: isNearCurrent ? 0 : 1,
    thumbnailEnabled: !demoMode && !isVideo && !item.media_status,
    originalEnabled: !demoMode && !isVideo && !item.media_status && isNearCurrent,
    owner: 'webtoon',
  });

  React.useEffect(() => {
    setAspectRatio(DEFAULT_ASPECT_RATIO);
  }, [item.image_id, item.save_name, thumbnailUrl]);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo || demoMode) return;

    const shouldMuteVideo = videoMuted || videoVolume <= 0;
    if (video.muted !== shouldMuteVideo) video.muted = shouldMuteVideo;
    if (Math.abs(video.volume - videoVolume) > 0.001) video.volume = clamp(videoVolume, 0, 1);
  }, [demoMode, isVideo, item.image_id, mediaUrl, videoMuted, videoVolume]);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo || demoMode) return;

    if (typeof IntersectionObserver === 'undefined') {
      pauseWebtoonVideo(video);
      return;
    }

    const root = video.closest('main');
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= WEBTOON_VIDEO_PLAY_THRESHOLD) {
        if (videoAutoplay && !prefersReducedMotion()) playWebtoonVideoExclusively(video);
      } else if (!entry.isIntersecting || entry.intersectionRatio < WEBTOON_VIDEO_PAUSE_THRESHOLD) {
        pauseWebtoonVideo(video);
      }
    }, {
      root,
      threshold: [0, WEBTOON_VIDEO_PAUSE_THRESHOLD, WEBTOON_VIDEO_PLAY_THRESHOLD],
    });

    observer.observe(video);
    return () => {
      observer.disconnect();
      pauseWebtoonVideo(video);
    };
  }, [demoMode, isVideo, item.image_id, mediaUrl, videoAutoplay]);

  const handleVideoVolumeChange = React.useCallback((event: React.SyntheticEvent<HTMLVideoElement>) => {
    onVideoPreferenceChange?.({
      videoMuted: event.currentTarget.muted,
      videoVolume: clamp(event.currentTarget.volume, 0, 1),
    });
  }, [onVideoPreferenceChange]);

  const updateAspectRatio = (width: number, height: number) => {
    if (width > 0 && height > 0) setAspectRatio(width / height);
  };

  if (item.media_status) {
    return (
      <div className="webtoon-feed__media-frame webtoon-feed__media-frame--issue">
        <MediaIssuePlaceholder message={item.media_error} />
      </div>
    );
  }

  if (demoMode) {
    return (
      <div
        className="webtoon-feed__media-frame webtoon-feed__media-frame--demo"
        style={{ aspectRatio: String(aspectRatio) }}
      >
        <DemoMediaBlock dominantColor={item.dominant_color} />
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className="webtoon-feed__media-frame webtoon-feed__media-frame--video">
        <video
          ref={videoRef}
          src={mediaUrl}
          autoPlay={false}
          controls
          loop
          preload="metadata"
          playsInline
          muted={videoMuted || videoVolume <= 0}
          onVolumeChange={handleVideoVolumeChange}
          className={`webtoon-feed__video ${blurEnabled ? 'blur-media blur-media--feed' : ''}`}
        />
      </div>
    );
  }

  return (
    <div
      className={`webtoon-feed__media-frame${thumbnailReady ? ' is-thumbnail-ready' : ''}${originalReady ? ' is-original-ready' : ''}`}
      style={{ aspectRatio: String(aspectRatio) }}
    >
      {!thumbnailReady && !thumbnailFailed && (
        <div className="webtoon-feed__media-skeleton" aria-hidden="true" />
      )}
      {thumbnailAdmitted && !thumbnailFailed && (
        <img
          src={thumbnailUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading={isNearCurrent ? 'eager' : 'lazy'}
          decoding="async"
          {...{ fetchpriority: isNearCurrent ? 'high' : 'low' }}
          onLoad={event => {
            const image = event.currentTarget;
            markThumbnailLoaded();
            updateAspectRatio(image.naturalWidth, image.naturalHeight);
          }}
          onError={markThumbnailError}
          className={`webtoon-feed__media-layer webtoon-feed__media-layer--thumbnail ${blurEnabled ? 'blur-media blur-media--feed' : ''}`}
        />
      )}
      {originalAdmitted && !originalFailed && (
        <img
          src={mediaUrl}
          alt={item.title || `第 ${pageNumber} 頁`}
          draggable={false}
          loading="eager"
          decoding="async"
          {...{ fetchpriority: isNearCurrent ? 'high' : 'low' }}
          onLoad={event => {
            const image = event.currentTarget;
            markOriginalLoaded();
            updateAspectRatio(image.naturalWidth, image.naturalHeight);
          }}
          onError={markOriginalError}
          className={`webtoon-feed__media-layer webtoon-feed__media-layer--original ${originalReady ? 'is-visible' : ''} ${blurEnabled ? 'blur-media blur-media--feed' : ''}`}
        />
      )}
      {thumbnailFailed && originalFailed && (
        <MediaIssuePlaceholder message="圖片載入失敗" />
      )}
    </div>
  );
});

interface WebtoonThumbnailRailProps {
  images: ImageItem[];
  currentIndex: number;
  thumbnailSize: number;
  pageNumbers: number[];
  pageTotals: number[];
  blurEnabled: boolean;
  demoMode: boolean;
  onSelect: (index: number) => void;
}

interface WebtoonThumbnailItemProps {
  item: ImageItem;
  index: number;
  currentIndex: number;
  thumbnailSize: number;
  aspectRatio: number;
  top: number;
  height: number;
  pageNumber: number;
  pageTotal: number;
  blurEnabled: boolean;
  demoMode: boolean;
  onSelect: (index: number) => void;
  onAspectRatioChange: (index: number, aspectRatio: number) => void;
  onMoveFocus: (index: number, direction: -1 | 1) => void;
  onRestoreFocus: (index: number) => void;
}

const WebtoonThumbnailItem: React.FC<WebtoonThumbnailItemProps> = ({
  item,
  index,
  currentIndex,
  thumbnailSize,
  aspectRatio,
  top,
  height,
  pageNumber,
  pageTotal,
  blurEnabled,
  demoMode,
  onSelect,
  onAspectRatioChange,
  onMoveFocus,
  onRestoreFocus,
}) => {
  const isActive = index === currentIndex;
  const isNearCurrent = Math.abs(index - currentIndex) <= 3;
  const url = buildThumbnailUrl(item, thumbnailSize);
  const admitted = useImageLoadPermission({
    url,
    priority: isActive ? 0 : isNearCurrent ? 1 : 2,
    kind: 'thumbnail',
    owner: 'webtoon',
    enabled: !demoMode && !item.media_status,
  });

  return (
    <button
      type="button"
      data-webtoon-thumbnail-index={index}
      onClick={() => onSelect(index)}
      onKeyDown={event => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          event.stopPropagation();
          onMoveFocus(index, event.key === 'ArrowUp' ? -1 : 1);
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          onSelect(index);
          onRestoreFocus(index);
        }
      }}
      aria-label={`跳到第 ${pageNumber} / ${pageTotal} 頁`}
      aria-current={isActive ? 'page' : undefined}
      tabIndex={isActive ? 0 : -1}
      className={`webtoon-thumbnails__item${isActive ? ' is-active' : ''}`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        aspectRatio: String(aspectRatio),
      }}
    >
      <span className="webtoon-thumbnails__image-frame">
        {item.media_status ? (
          <MediaIssuePlaceholder message={item.media_error} compact />
        ) : demoMode ? (
          <DemoMediaBlock dominantColor={item.dominant_color} />
        ) : admitted ? (
          <img
            src={url}
            alt=""
            aria-hidden="true"
            draggable={false}
            loading={isNearCurrent ? 'eager' : 'lazy'}
            decoding="async"
            onLoad={event => {
              const image = event.currentTarget;
              imageLoadScheduler.markLoaded(url);
              if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                onAspectRatioChange(index, image.naturalWidth / image.naturalHeight);
              }
            }}
            onError={() => imageLoadScheduler.markFinished(url, false)}
            className={`webtoon-thumbnails__image ${blurEnabled ? 'blur-media blur-media--thumbnail' : ''}`}
          />
        ) : (
          <span className="webtoon-thumbnails__placeholder" aria-hidden="true" />
        )}
      </span>
      <Badge
        variant="hud"
        size="xs"
        className="webtoon-thumbnails__index"
        aria-hidden="true"
      >
        {pageNumber} / {pageTotal}
      </Badge>
    </button>
  );
};

const WebtoonThumbnailRail: React.FC<WebtoonThumbnailRailProps> = ({
  images,
  currentIndex,
  thumbnailSize,
  pageNumbers,
  pageTotals,
  blurEnabled,
  demoMode,
  onSelect,
}) => {
  const railRef = React.useRef<HTMLDivElement | null>(null);
  const focusFrameRef = React.useRef<number | null>(null);
  const aspectRatiosRef = React.useRef(new Map<number, number>());
  const [layoutVersion, setLayoutVersion] = React.useState(0);
  const [railWidth, setRailWidth] = React.useState(128);
  const [railHeight, setRailHeight] = React.useState(720);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(720);
  const thumbnailLayoutRef = React.useRef<WebtoonThumbnailLayout | null>(null);

  React.useEffect(() => {
    aspectRatiosRef.current.clear();
    setLayoutVersion(version => version + 1);
  }, [images]);

  React.useLayoutEffect(() => {
    const rail = railRef.current;
    const container = rail?.parentElement;
    if (!rail || !container) return undefined;
    const main = container.closest('main') as HTMLElement | null;

    const updateSize = () => {
      const mainRect = main?.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const topInset = mainRect && containerRect.top > mainRect.top
        ? Math.min(16, Math.max(0, Math.round(containerRect.top - mainRect.top)))
        : 0;
      const nextHeight = Math.max(
        1,
        (main?.clientHeight ?? container.clientHeight) - topInset,
      );
      const nextWidth = Math.max(1, rail.clientWidth || container.clientWidth);

      setRailWidth(previous => previous === nextWidth ? previous : nextWidth);
      setRailHeight(previous => previous === nextHeight ? previous : nextHeight);
      setViewportHeight(previous => previous === nextHeight ? previous : nextHeight);
    };
    const handleScroll = () => setScrollTop(rail.scrollTop);
    updateSize();
    rail.addEventListener('scroll', handleScroll, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateSize);
    observer?.observe(rail);
    observer?.observe(container);
    if (main) observer?.observe(main);
    window.addEventListener('resize', updateSize);
    return () => {
      rail.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateSize);
      observer?.disconnect();
    };
  }, [images.length]);

  const thumbnailLayout = React.useMemo<WebtoonThumbnailLayout>(() => (
    buildWebtoonThumbnailLayout({
      images,
      railWidth,
      aspectRatios: aspectRatiosRef.current,
      defaultAspectRatio: DEFAULT_THUMBNAIL_ASPECT_RATIO,
      edgePadding: THUMBNAIL_EDGE_PADDING,
      gap: THUMBNAIL_GAP,
      boundaryWidth: THUMBNAIL_BOUNDARY_WIDTH,
      boundaryMargin: THUMBNAIL_BOUNDARY_MARGIN,
      widthInset: THUMBNAIL_WIDTH_INSET,
      minHeight: THUMBNAIL_MIN_HEIGHT,
    })
  ), [images, layoutVersion, railWidth]);

  thumbnailLayoutRef.current = thumbnailLayout;

  const handleAspectRatioChange = React.useCallback((index: number, aspectRatio: number) => {
    const safeAspectRatio = clamp(aspectRatio, 0.2, 5);
    const previousAspectRatio = aspectRatiosRef.current.get(index) ?? DEFAULT_THUMBNAIL_ASPECT_RATIO;
    if (Math.abs(previousAspectRatio - safeAspectRatio) < 0.01) return;

    const rail = railRef.current;
    const anchorIndex = rail
      ? findIndexAtOffset(thumbnailLayout.offsets, rail.scrollTop + 1)
      : 0;
    const previousHeight = getThumbnailHeight(railWidth, previousAspectRatio, {
      widthInset: THUMBNAIL_WIDTH_INSET,
      minHeight: THUMBNAIL_MIN_HEIGHT,
    });
    const nextHeight = getThumbnailHeight(railWidth, safeAspectRatio, {
      widthInset: THUMBNAIL_WIDTH_INSET,
      minHeight: THUMBNAIL_MIN_HEIGHT,
    });
    aspectRatiosRef.current.set(index, safeAspectRatio);

    // Keep the first visible thumbnail anchored while an image above it
    // reveals its real aspect ratio and changes the virtual offsets.
    if (rail && index < anchorIndex) {
      rail.scrollTop = Math.max(0, rail.scrollTop + nextHeight - previousHeight);
    }
    setLayoutVersion(version => version + 1);
  }, [railWidth, thumbnailLayout.offsets]);

  React.useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail || images.length === 0) return;
    const layout = thumbnailLayoutRef.current;
    if (!layout) return;
    const targetTop = layout.offsets[currentIndex] ?? THUMBNAIL_EDGE_PADDING;
    const targetBottom = targetTop + (layout.heights[currentIndex] ?? THUMBNAIL_MIN_HEIGHT);
    const edgePadding = THUMBNAIL_EDGE_PADDING;
    let nextScrollTop = rail.scrollTop;

    if (targetTop < rail.scrollTop + edgePadding) {
      nextScrollTop = targetTop - edgePadding;
    } else if (targetBottom > rail.scrollTop + rail.clientHeight - edgePadding) {
      nextScrollTop = targetBottom - rail.clientHeight + edgePadding;
    }

    const maxScrollTop = Math.max(0, layout.totalHeight - rail.clientHeight);
    nextScrollTop = clamp(nextScrollTop, 0, maxScrollTop);
    if (Math.abs(nextScrollTop - rail.scrollTop) > 0.5) {
      rail.scrollTo({ top: nextScrollTop, behavior: 'auto' });
    }
    // Thumbnail aspect-ratio updates are already anchored in
    // handleAspectRatioChange. Re-run only when the rail geometry changes so
    // returning from the mobile layout can reveal the current active image
    // without snapping the rail during ordinary scrolling.
  }, [currentIndex, images, railHeight, railWidth]);

  const focusThumbnail = React.useCallback((index: number) => {
    const safeIndex = clamp(Math.floor(index), 0, Math.max(0, images.length - 1));
    if (focusFrameRef.current !== null) {
      window.cancelAnimationFrame(focusFrameRef.current);
      focusFrameRef.current = null;
    }

    let attempts = 0;
    const focusMountedThumbnail = () => {
      const rail = railRef.current;
      const target = rail?.querySelector<HTMLButtonElement>(
        `[data-webtoon-thumbnail-index="${safeIndex}"]`,
      );
      if (target) {
        target.focus({ preventScroll: true });
        focusFrameRef.current = null;
        return;
      }
      if (!rail || attempts >= 12) {
        focusFrameRef.current = null;
        return;
      }

      const targetTop = thumbnailLayout.offsets[safeIndex] ?? THUMBNAIL_EDGE_PADDING;
      const targetHeight = thumbnailLayout.heights[safeIndex] ?? THUMBNAIL_MIN_HEIGHT;
      const centeredTop = targetTop - Math.max(0, (rail.clientHeight - targetHeight) / 2);
      const maxScrollTop = Math.max(0, thumbnailLayout.totalHeight - rail.clientHeight);
      rail.scrollTo({
        top: clamp(centeredTop, 0, maxScrollTop),
        behavior: 'auto',
      });
      attempts += 1;
      focusFrameRef.current = window.requestAnimationFrame(focusMountedThumbnail);
    };

    focusMountedThumbnail();
  }, [images.length, thumbnailLayout]);

  React.useEffect(() => () => {
    if (focusFrameRef.current !== null) window.cancelAnimationFrame(focusFrameRef.current);
  }, []);

  const moveFocus = React.useCallback((index: number, direction: -1 | 1) => {
    const nextIndex = clamp(index + direction, 0, Math.max(0, images.length - 1));
    onSelect(nextIndex);
    focusThumbnail(nextIndex);
  }, [focusThumbnail, images.length, onSelect]);

  const startIndex = images.length > 0
    ? Math.max(
      0,
      findIndexAtOffset(
        thumbnailLayout.offsets,
        Math.max(0, scrollTop - VIRTUAL_OVERSCAN),
      ) - THUMBNAIL_OVERSCAN,
    )
    : 0;
  const endIndex = images.length > 0
    ? Math.min(
      images.length,
      findIndexAtOffset(
        thumbnailLayout.offsets,
        scrollTop + viewportHeight + VIRTUAL_OVERSCAN,
      ) + THUMBNAIL_OVERSCAN + 1,
    )
    : 0;

  return (
    <aside className="webtoon-thumbnails" aria-label="條漫縮圖導覽">
      <div
        ref={railRef}
        className="webtoon-thumbnails__scroll"
        style={{ height: `${railHeight}px` }}
      >
        <div className="webtoon-thumbnails__track" style={{ height: `${thumbnailLayout.totalHeight}px` }}>
          {images.slice(startIndex, endIndex).map((item, offset) => {
            const index = startIndex + offset;
            const boundaryTop = thumbnailLayout.boundaryOffsets[index];
            return (
              <React.Fragment key={item.image_id}>
                {boundaryTop !== null && boundaryTop !== undefined && (
                  <div
                    className="webtoon-thumbnails__boundary"
                    style={{ top: `${boundaryTop}px` }}
                    aria-hidden="true"
                  />
                )}
                <WebtoonThumbnailItem
                  item={item}
                  index={index}
                  currentIndex={currentIndex}
                  thumbnailSize={thumbnailSize}
                  aspectRatio={aspectRatiosRef.current.get(index) ?? DEFAULT_THUMBNAIL_ASPECT_RATIO}
                  top={thumbnailLayout.offsets[index] ?? THUMBNAIL_EDGE_PADDING}
                  height={thumbnailLayout.heights[index] ?? THUMBNAIL_MIN_HEIGHT}
                  pageNumber={pageNumbers[index] ?? index + 1}
                  pageTotal={pageTotals[index] ?? Math.max(1, images.length)}
                  blurEnabled={blurEnabled}
                  demoMode={demoMode}
                  onSelect={onSelect}
                  onAspectRatioChange={handleAspectRatioChange}
                  onMoveFocus={moveFocus}
                  onRestoreFocus={focusThumbnail}
                />
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </aside>
  );
};

interface WebtoonQuickToolbarProps {
  currentIndex: number;
  imageCount: number;
  imageScale: number;
  imageGap: number;
  showInfo: boolean;
  showPageNumber: boolean;
  showThumbnails: boolean;
  currentPage: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
  onSettingsChange: (patch: WebtoonSettingsPatch) => void;
  onPageChange?: (page: number) => void;
  isScrolling: boolean;
  mobileToolbarOpen: boolean;
  isMobileViewport: boolean;
  onReveal: () => void;
  onPointerEnter: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerLeave: (event: React.PointerEvent<HTMLDivElement>) => void;
}

const WebtoonQuickToolbar: React.FC<WebtoonQuickToolbarProps> = ({
  currentIndex,
  imageCount,
  imageScale,
  imageGap,
  showInfo,
  showPageNumber,
  showThumbnails,
  currentPage,
  totalPages,
  onPrevious,
  onNext,
  onSettingsChange,
  onPageChange,
  isScrolling,
  mobileToolbarOpen,
  isMobileViewport,
  onReveal,
  onPointerEnter,
  onPointerLeave,
}) => {
  const [pageInput, setPageInput] = React.useState(String(currentPage));
  const [isHelpOpen, setIsHelpOpen] = React.useState(false);
  const previousScrollingRef = React.useRef(isScrolling);
  const toolbarIsCollapsed = isScrolling && !mobileToolbarOpen;
  const helpIsVisible = isHelpOpen && toolbarIsCollapsed;

  React.useEffect(() => setPageInput(String(currentPage)), [currentPage]);

  React.useEffect(() => {
    if (!isScrolling || (isScrolling && !previousScrollingRef.current)) {
      setIsHelpOpen(false);
    }
    previousScrollingRef.current = isScrolling;
  }, [isScrolling]);

  const commitPage = () => {
    const parsedPage = Number.parseInt(pageInput, 10);
    const page = Number.isFinite(parsedPage) ? clamp(parsedPage, 1, totalPages) : currentPage;
    setPageInput(String(page));
    if (Number.isInteger(page) && page !== currentPage) onPageChange?.(page);
  };

  return (
    <div
      id="webtoon-mobile-quick-settings"
      className={`webtoon-quick-toolbar__hit-area${toolbarIsCollapsed ? ' is-scrolling' : ''}${mobileToolbarOpen ? ' is-mobile-open' : ''}`}
      onPointerLeave={event => {
        setIsHelpOpen(false);
        onPointerLeave(event);
      }}
    >
      <div className={`webtoon-quick-toolbar__controls${toolbarIsCollapsed ? ' is-scrolling' : ''}`}>
        {toolbarIsCollapsed && (
          <IconButton
            type="button"
            variant={helpIsVisible ? 'primary' : 'secondary'}
            className={`webtoon-quick-toolbar__button webtoon-quick-toolbar__help-trigger${helpIsVisible ? ' is-active' : ''}`}
            onClick={event => {
              event.stopPropagation();
              setIsHelpOpen(open => !open);
            }}
            aria-expanded={helpIsVisible}
            aria-controls="webtoon-shortcuts-help"
            aria-label="顯示條漫快捷鍵"
            title="顯示條漫快捷鍵"
          >
            <CircleHelp aria-hidden="true" />
          </IconButton>
        )}

        <div
        className={`webtoon-quick-toolbar${toolbarIsCollapsed ? ' is-scrolling' : ''}`}
        onPointerEnter={onPointerEnter}
      role="toolbar"
      aria-label="條漫快捷設定"
    >
      <div className="webtoon-quick-toolbar__group webtoon-quick-toolbar__group--navigation" aria-label="圖片導覽">
        <IconButton type="button" onClick={onPrevious} disabled={currentIndex <= 0 && currentPage <= 1} variant="secondary" className="webtoon-quick-toolbar__button" aria-label="上一張圖片" title="上一張圖片（↑ / ← / J）">
          <ChevronUp aria-hidden="true" />
        </IconButton>
        <IconButton type="button" onClick={onNext} disabled={currentIndex >= imageCount - 1 && currentPage >= totalPages} variant="secondary" className="webtoon-quick-toolbar__button" aria-label="下一張圖片" title="下一張圖片（↓ / → / K）">
          <ChevronDown aria-hidden="true" />
        </IconButton>
      </div>

      <div className="webtoon-quick-toolbar__group webtoon-quick-toolbar__group--scale" aria-label="圖片寬度">
        <IconButton type="button" onClick={() => onSettingsChange({ webtoonImageScale: clamp(imageScale - QUICK_SCALE_STEP, 30, 100) })} variant="secondary" className="webtoon-quick-toolbar__button" aria-label="縮小圖片" title="縮小圖片（每次 10%，[）">
          <Minus aria-hidden="true" />
        </IconButton>
        <span className="webtoon-quick-toolbar__value">{imageScale}%</span>
        <IconButton type="button" onClick={() => onSettingsChange({ webtoonImageScale: clamp(imageScale + QUICK_SCALE_STEP, 30, 100) })} variant="secondary" className="webtoon-quick-toolbar__button" aria-label="放大圖片" title="放大圖片（每次 10%，]）">
          <Plus aria-hidden="true" />
        </IconButton>
      </div>

      <div className="webtoon-quick-toolbar__group" aria-label="圖片間距">
        <IconButton type="button" onClick={() => onSettingsChange({ webtoonImageGap: clamp(imageGap - QUICK_GAP_STEP, 0, 300) })} variant="secondary" className="webtoon-quick-toolbar__button" aria-label="縮小圖片間距" title="縮小圖片間距（每次 8px）">
          <Minus aria-hidden="true" />
        </IconButton>
        <span className="webtoon-quick-toolbar__value">{imageGap}px</span>
        <IconButton type="button" onClick={() => onSettingsChange({ webtoonImageGap: clamp(imageGap + QUICK_GAP_STEP, 0, 300) })} variant="secondary" className="webtoon-quick-toolbar__button" aria-label="增加圖片間距" title="增加圖片間距（每次 8px）">
          <Plus aria-hidden="true" />
        </IconButton>
      </div>

      <div className="webtoon-quick-toolbar__group webtoon-quick-toolbar__group--display" aria-label="顯示設定">
        {!isMobileViewport && (
          <IconButton type="button" onClick={() => onSettingsChange({ webtoonShowInfo: !showInfo })} aria-pressed={showInfo} variant={showInfo ? 'primary' : 'secondary'} className={`webtoon-quick-toolbar__button${showInfo ? ' is-active' : ''}`} aria-label={showInfo ? '隱藏圖片資訊' : '顯示圖片資訊'} title={showInfo ? '隱藏圖片資訊（I）' : '顯示圖片資訊（I）'}>
            {showInfo ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
          </IconButton>
        )}
        <IconButton type="button" onClick={() => onSettingsChange({ webtoonShowPageNumber: !showPageNumber })} aria-pressed={showPageNumber} variant={showPageNumber ? 'primary' : 'secondary'} className={`webtoon-quick-toolbar__button${showPageNumber ? ' is-active' : ''}`} aria-label={showPageNumber ? '隱藏頁碼' : '顯示頁碼'} title={showPageNumber ? '隱藏頁碼（P）' : '顯示頁碼（P）'}>
          <Hash aria-hidden="true" />
        </IconButton>
        {!isMobileViewport && (
          <IconButton type="button" onClick={() => onSettingsChange({ webtoonShowThumbnails: !showThumbnails })} aria-pressed={showThumbnails} variant={showThumbnails ? 'primary' : 'secondary'} className={`webtoon-quick-toolbar__button${showThumbnails ? ' is-active' : ''}`} aria-label={showThumbnails ? '隱藏縮圖導覽' : '顯示縮圖導覽'} title={showThumbnails ? '隱藏縮圖導覽（T）' : '顯示縮圖導覽（T）'}>
            <PanelLeft aria-hidden="true" />
          </IconButton>
        )}
      </div>

      {totalPages > 1 && (
        <div className="webtoon-quick-toolbar__group webtoon-quick-toolbar__pagination" aria-label="資料頁面">
          <IconButton type="button" onClick={() => onPageChange?.(currentPage - 1)} disabled={currentPage <= 1} variant="secondary" className="webtoon-quick-toolbar__button" aria-label="上一資料頁" title="上一資料頁">
            <ChevronLeft aria-hidden="true" />
          </IconButton>
          <label className="webtoon-quick-toolbar__page-input">
            <span className="sr-only">資料頁</span>
            <Input
              controlSize="xs"
              type="number"
              min={1}
              max={totalPages}
              value={pageInput}
              onChange={event => setPageInput(event.target.value)}
              onBlur={commitPage}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitPage();
                }
              }}
              aria-label={`資料頁，共 ${totalPages} 頁`}
            />
            <span>/ {totalPages}</span>
          </label>
          <IconButton type="button" onClick={() => onPageChange?.(currentPage + 1)} disabled={currentPage >= totalPages} variant="secondary" className="webtoon-quick-toolbar__button" aria-label="下一資料頁" title="下一資料頁">
            <ChevronRight aria-hidden="true" />
          </IconButton>
        </div>
      )}

      {toolbarIsCollapsed && (
        <IconButton
          type="button"
          variant="secondary"
          className="webtoon-quick-toolbar__button webtoon-quick-toolbar__reveal"
          onClick={() => {
            setIsHelpOpen(false);
            onReveal();
          }}
          aria-label="展開條漫快捷設定"
          title="展開條漫快捷設定"
        >
          <Settings2 aria-hidden="true" />
        </IconButton>
      )}
    </div>
      </div>
      {helpIsVisible && (
        <div id="webtoon-shortcuts-help" className="webtoon-quick-toolbar__help-popover" role="note">
          <strong>條漫快捷鍵</strong>
          <span>↑/↓、←/→、J/K 翻頁</span>
          <span>[ ] 比例 · I 資訊 · P 頁碼 · T 縮圖</span>
        </div>
      )}
      </div>
  );
};

export const WebtoonFeed: React.FC<WebtoonFeedProps> = ({
  images,
  blurEnabled = false,
  demoMode = false,
  initialIndex = null,
  initialRequestId = 0,
  thumbnailSize,
  imageScale,
  imageGap,
  showInfo,
  showPageNumber,
  showThumbnails,
  groupMangaPosts = false,
  pageOffset = 0,
  totalImages = images.length,
  currentPage = 1,
  totalPages = 1,
  mobileToolbarOpen = false,
  isMobileViewport = false,
  videoMuted = false,
  videoVolume = 1,
  videoAutoplay = true,
  onPageChange,
  onSettingsChange,
  onVideoPreferenceChange,
}) => {
  const feedRef = React.useRef<HTMLElement | null>(null);
  const heightsRef = React.useRef(new Map<number, number>());
  const alignFrameRef = React.useRef<number | null>(null);
  const alignToIndexRef = React.useRef<(index: number, behavior?: ScrollBehavior) => void>(() => undefined);
  const initialAnchorLockRef = React.useRef<{ index: number; requestId: number } | null>(null);
  const [heightVersion, setHeightVersion] = React.useState(0);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(720);
  const [feedWidth, setFeedWidth] = React.useState(760);
  const [feedTop, setFeedTop] = React.useState(0);
  const [isScrolling, setIsScrolling] = React.useState(false);
  const toolbarCollapseTimerRef = React.useRef<number | null>(null);
  const toolbarPointerInsideRef = React.useRef(false);
  const pageNumberState = React.useMemo(
    () => groupMangaPosts
      ? getGroupPageNumbers(images)
      : {
        pageNumbers: images.map((_, index) => pageOffset + index + 1),
        pageTotals: images.map(() => Math.max(1, totalImages)),
        totalPages: Math.max(1, totalImages),
      },
    [groupMangaPosts, images, pageOffset, totalImages],
  );
  const cancelToolbarCollapse = React.useCallback(() => {
    if (toolbarCollapseTimerRef.current !== null) {
      window.clearTimeout(toolbarCollapseTimerRef.current);
      toolbarCollapseTimerRef.current = null;
    }
  }, []);

  const revealToolbar = React.useCallback(() => {
    cancelToolbarCollapse();
    setIsScrolling(false);
  }, [cancelToolbarCollapse]);

  const handleToolbarPointerEnter = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      toolbarPointerInsideRef.current = false;
      cancelToolbarCollapse();
      return;
    }

    toolbarPointerInsideRef.current = true;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('button, input, select, textarea')) {
      cancelToolbarCollapse();
      return;
    }
    revealToolbar();
  }, [cancelToolbarCollapse, revealToolbar]);

  const handleToolbarPointerLeave = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      toolbarPointerInsideRef.current = false;
      cancelToolbarCollapse();
      return;
    }

    toolbarPointerInsideRef.current = false;
    cancelToolbarCollapse();
    toolbarCollapseTimerRef.current = window.setTimeout(() => {
      toolbarCollapseTimerRef.current = null;
      if (!toolbarPointerInsideRef.current) setIsScrolling(true);
    }, QUICK_TOOLBAR_COLLAPSE_DELAY);
  }, [cancelToolbarCollapse]);

  React.useEffect(() => () => cancelToolbarCollapse(), [cancelToolbarCollapse]);

  const markScrolling = React.useCallback(() => {
    if (!toolbarPointerInsideRef.current) setIsScrolling(true);
  }, []);

  const estimatedHeight = React.useMemo(() => {
    const mediaWidth = Math.min(960, Math.max(320, feedWidth * imageScale / 100));
    const infoHeight = showInfo ? 64 : 0;
    return Math.max(MIN_ITEM_HEIGHT, Math.round(mediaWidth / DEFAULT_ASPECT_RATIO) + infoHeight + 16);
  }, [feedWidth, imageScale, showInfo]);

  React.useEffect(() => {
    heightsRef.current.clear();
    setHeightVersion(version => version + 1);
  }, [images, imageScale, showInfo]);

  const metrics = React.useMemo<WebtoonMetrics>(() => buildWebtoonMetrics({
    imageCount: images.length,
    estimatedHeight,
    imageGap,
    measuredHeights: heightsRef.current,
    minItemHeight: MIN_ITEM_HEIGHT,
  }), [estimatedHeight, heightVersion, imageGap, images.length]);

  const relativeScrollTop = Math.max(0, scrollTop - feedTop);
  const activeIndex = images.length > 0
    ? clamp(findIndexAtOffset(metrics.offsets, relativeScrollTop + 1), 0, images.length - 1)
    : 0;
  const virtualStart = images.length > 0
    ? clamp(findIndexAtOffset(metrics.offsets, Math.max(0, relativeScrollTop - VIRTUAL_OVERSCAN)), 0, images.length - 1)
    : 0;
  const virtualEnd = images.length > 0
    ? clamp(findIndexAtOffset(metrics.offsets, relativeScrollTop + viewportHeight + VIRTUAL_OVERSCAN) + 2, virtualStart + 1, images.length)
    : 0;

  const updateScrollMetrics = React.useCallback(() => {
    const feed = feedRef.current;
    const main = getMainForFeed(feed);
    if (!feed || !main) return;
    const mainRect = main.getBoundingClientRect();
    const feedRect = feed.getBoundingClientRect();
    setScrollTop(main.scrollTop);
    setViewportHeight(Math.max(1, main.clientHeight));
    setFeedWidth(Math.max(1, feed.clientWidth));
    setFeedTop(Math.max(0, main.scrollTop + feedRect.top - mainRect.top));
  }, []);

  React.useEffect(() => {
    const feed = feedRef.current;
    const main = getMainForFeed(feed);
    if (!feed || !main) return undefined;

    let frameId: number | null = null;
    const scheduleMetrics = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updateScrollMetrics();
      });
    };
    const handleScroll = () => {
      markScrolling();
      scheduleMetrics();
    };
    const clearInitialAnchorLock = () => {
      initialAnchorLockRef.current = null;
      if (alignFrameRef.current !== null) {
        window.cancelAnimationFrame(alignFrameRef.current);
        alignFrameRef.current = null;
      }
    };

    updateScrollMetrics();
    main.addEventListener('scroll', handleScroll, { passive: true });
    main.addEventListener('wheel', clearInitialAnchorLock, { passive: true });
    main.addEventListener('pointerdown', clearInitialAnchorLock, { passive: true });
    main.addEventListener('touchstart', clearInitialAnchorLock, { passive: true });
    window.addEventListener('resize', scheduleMetrics);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMetrics);
    observer?.observe(main);
    observer?.observe(feed);
    return () => {
      main.removeEventListener('scroll', handleScroll);
      main.removeEventListener('wheel', clearInitialAnchorLock);
      main.removeEventListener('pointerdown', clearInitialAnchorLock);
      main.removeEventListener('touchstart', clearInitialAnchorLock);
      window.removeEventListener('resize', scheduleMetrics);
      observer?.disconnect();
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      setIsScrolling(false);
    };
  }, [images.length, markScrolling, updateScrollMetrics, showThumbnails]);

  React.useEffect(() => {
    const root = feedRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(entries => {
      let changed = false;
      entries.forEach(entry => {
        const element = entry.target as HTMLElement;
        const index = Number(element.dataset.webtoonIndex);
        const height = Math.round(element.getBoundingClientRect().height);
        if (!Number.isInteger(index) || height < MIN_ITEM_HEIGHT) return;
        const previousHeight = heightsRef.current.get(index);
        if (previousHeight === undefined || Math.abs(previousHeight - height) > 1) {
          heightsRef.current.set(index, height);
          changed = true;
        }
      });
      if (changed) setHeightVersion(version => version + 1);
    });
    root.querySelectorAll<HTMLElement>('[data-webtoon-index]').forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [virtualEnd, virtualStart, imageGap, showInfo, imageScale]);

  const alignToIndex = React.useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const safeIndex = clamp(Math.floor(index), 0, Math.max(0, images.length - 1));
    const feed = feedRef.current;
    const main = getMainForFeed(feed);
    if (!feed || !main || images.length === 0) return;

    if (alignFrameRef.current !== null) window.cancelAnimationFrame(alignFrameRef.current);
    let attempts = 0;
    const align = () => {
      const target = feed.querySelector<HTMLElement>(`[data-webtoon-index="${safeIndex}"]`);
      const media = target?.querySelector<HTMLElement>('.webtoon-feed__media-frame');
      if (target) {
        const top = getScrollTopForElement(main, media ?? target);
        main.scrollTo({ top, behavior: attempts === 0 ? behavior : 'auto' });
        setScrollTop(top);
      } else {
        const top = getFeedDocumentTop(main, feed) + metrics.offsets[safeIndex];
        main.scrollTo({ top, behavior: attempts === 0 ? behavior : 'auto' });
        setScrollTop(top);
      }
      attempts += 1;
      if (attempts < 10) alignFrameRef.current = window.requestAnimationFrame(align);
      else alignFrameRef.current = null;
    };
    alignFrameRef.current = window.requestAnimationFrame(align);
  }, [images.length, metrics.offsets]);

  alignToIndexRef.current = alignToIndex;

  React.useLayoutEffect(() => {
    if (initialIndex === null || initialRequestId === 0 || images.length === 0) return undefined;
    initialAnchorLockRef.current = { index: initialIndex, requestId: initialRequestId };
    alignToIndexRef.current(initialIndex, 'auto');
    return () => {
      if (initialAnchorLockRef.current?.requestId === initialRequestId) {
        initialAnchorLockRef.current = null;
      }
      if (alignFrameRef.current !== null) {
        window.cancelAnimationFrame(alignFrameRef.current);
        alignFrameRef.current = null;
      }
    };
  }, [images.length, initialIndex, initialRequestId]);

  // Thumbnail/original dimensions can arrive after the first alignment. Their
  // height changes rebuild the virtual offsets, so keep the requested image at
  // the viewport start until the user provides a new scroll/navigation intent.
  React.useLayoutEffect(() => {
    const lock = initialAnchorLockRef.current;
    if (
      initialIndex === null
      || initialRequestId === 0
      || lock?.index !== initialIndex
      || lock.requestId !== initialRequestId
    ) return;
    alignToIndexRef.current(initialIndex, 'auto');
  }, [heightVersion, imageGap, initialIndex, initialRequestId, metrics.offsets]);

  React.useEffect(() => () => {
    if (alignFrameRef.current !== null) window.cancelAnimationFrame(alignFrameRef.current);
  }, []);

  const navigate = React.useCallback((direction: -1 | 1) => {
    const nextIndex = activeIndex + direction;
    if (nextIndex >= 0 && nextIndex < images.length) {
      initialAnchorLockRef.current = null;
      alignToIndex(nextIndex);
      return;
    }
    if (direction > 0 && currentPage < totalPages) onPageChange?.(currentPage + 1, 0);
    if (direction < 0 && currentPage > 1) onPageChange?.(currentPage - 1, 0);
  }, [activeIndex, alignToIndex, currentPage, images.length, onPageChange, totalPages]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      if (
        target?.closest('.webtoon-thumbnails__item')
        && (event.key === 'ArrowUp' || event.key === 'ArrowDown')
      ) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 'k' || event.key === 'K') {
        event.preventDefault();
        navigate(1);
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'j' || event.key === 'J') {
        event.preventDefault();
        navigate(-1);
      } else if (event.key === '[') {
        event.preventDefault();
        onSettingsChange?.({ webtoonImageScale: clamp(imageScale - QUICK_SCALE_STEP, 30, 100) });
      } else if (event.key === ']') {
        event.preventDefault();
        onSettingsChange?.({ webtoonImageScale: clamp(imageScale + QUICK_SCALE_STEP, 30, 100) });
      } else if (event.key.toLowerCase() === 'i') {
        onSettingsChange?.({ webtoonShowInfo: !showInfo });
      } else if (event.key.toLowerCase() === 'p') {
        onSettingsChange?.({ webtoonShowPageNumber: !showPageNumber });
      } else if (event.key.toLowerCase() === 't') {
        onSettingsChange?.({ webtoonShowThumbnails: !showThumbnails });
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [imageScale, navigate, onSettingsChange, showInfo, showPageNumber, showThumbnails]);

  if (images.length === 0) {
    return (
      <div className="webtoon-feed webtoon-feed--empty">
        <p>目前沒有可閱讀的圖片。</p>
      </div>
    );
  }

  return (
    <div className={`webtoon-reader${showThumbnails ? ' has-thumbnails' : ''}`}>
      {showThumbnails && (
        <WebtoonThumbnailRail
          images={images}
          currentIndex={activeIndex}
          thumbnailSize={thumbnailSize}
          pageNumbers={pageNumberState.pageNumbers}
          pageTotals={pageNumberState.pageTotals}
          blurEnabled={blurEnabled}
          demoMode={demoMode}
          onSelect={index => {
            initialAnchorLockRef.current = null;
            alignToIndex(index);
          }}
        />
      )}

      <section
        ref={feedRef}
        className="webtoon-feed"
        aria-label="條漫閱讀區"
      >
        <div className="webtoon-feed__virtual-list" style={{ height: `${metrics.totalHeight}px` }}>
          {Array.from({ length: Math.max(0, virtualEnd - virtualStart) }, (_, offset) => {
            const index = virtualStart + offset;
            const item = images[index];
            const pageNumber = pageNumberState.pageNumbers[index] ?? pageOffset + index + 1;
            const pageTotal = pageNumberState.pageTotals[index] ?? pageNumberState.totalPages;
            return (
              <article
                key={item.image_id}
                data-webtoon-index={index}
                className="webtoon-feed__item"
                style={{
                  top: `${metrics.offsets[index]}px`,
                  marginBottom: `${imageGap}px`,
                  '--webtoon-image-scale': `${imageScale}%`,
                } as React.CSSProperties}
              >
                {showInfo && (
                  <header className="webtoon-feed__info">
                    <div className="webtoon-feed__info-primary">
                      <strong>{item.title || '未命名作品'}</strong>
                      <span>{item.artist_name || `繪師 ID: ${item.member_id}`}</span>
                    </div>
                    {showPageNumber && (
                      <Badge
                        variant="surface"
                        size="sm"
                        className="webtoon-feed__info-page"
                        aria-label={`第 ${pageNumber} / ${pageTotal} 頁`}
                      >
                        {pageNumber} / {pageTotal}
                      </Badge>
                    )}
                  </header>
                )}
                {showPageNumber && !showInfo && (
                  <Badge
                    variant="hud"
                    size="sm"
                    className="webtoon-feed__page-badge"
                    aria-label={`第 ${pageNumber} / ${pageTotal} 頁`}
                  >
                    {pageNumber} / {pageTotal}
                  </Badge>
                )}
                <div className="webtoon-feed__media-wrap">
                  <WebtoonMedia
                    item={item}
                    pageNumber={pageNumber}
                    thumbnailSize={thumbnailSize}
                    blurEnabled={blurEnabled}
                    demoMode={demoMode}
                    isNearCurrent={Math.abs(index - activeIndex) <= 3}
                    videoMuted={videoMuted}
                    videoVolume={videoVolume}
                    videoAutoplay={videoAutoplay}
                    onVideoPreferenceChange={onVideoPreferenceChange}
                  />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <WebtoonQuickToolbar
        currentIndex={activeIndex}
        imageCount={images.length}
        imageScale={imageScale}
        imageGap={imageGap}
        showInfo={showInfo}
        showPageNumber={showPageNumber}
        showThumbnails={showThumbnails}
        currentPage={currentPage}
        totalPages={totalPages}
        onPrevious={() => navigate(-1)}
        onNext={() => navigate(1)}
        onSettingsChange={patch => onSettingsChange?.(patch)}
        onPageChange={page => onPageChange?.(page, 0)}
        isScrolling={isScrolling}
        mobileToolbarOpen={mobileToolbarOpen}
        isMobileViewport={isMobileViewport}
        onReveal={revealToolbar}
        onPointerEnter={handleToolbarPointerEnter}
        onPointerLeave={handleToolbarPointerLeave}
      />
    </div>
  );
};
