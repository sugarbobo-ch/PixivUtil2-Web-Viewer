import '../styles/viewer.css';
import '../styles/spread-reader.css';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  FullscreenPageLayout,
  FullscreenReadingDirection,
  FullscreenSpreadPairing,
  ImageItem,
  SourceLink,
  VideoPreferencePatch,
  ViewerMode,
} from '../types';
import { useI18n } from '../i18n';
import { buildReaderSpread, getNextReaderSpreadAnchor, getPhysicalSpreadIndexes, getPreviousReaderSpreadAnchor, getReaderSpreadProgression } from '../utils/readerSpread';
import { buildMediaUrl, isVideoItem } from '../utils/media';
import { getGroupPageNumbers, getItemGroupKey } from '../utils/grouping';
import { buildThumbnailUrl } from '../utils/webConfig';
import { fetchSourceLink } from '../utils/sourceLinks';
import { LocalOpenTarget, openLocalMedia } from '../utils/localFileActions';
import { getOperationErrorMessage } from '../utils/operationError';
import { copyTextToClipboard, getParentPath } from '../utils/clipboard';
import { DemoMediaBlock } from './DemoMediaBlock';
import { MediaIssuePlaceholder } from './MediaIssuePlaceholder';
import { ViewerDetailsEntry, ViewerDetailsPanel } from './ViewerDetailsPanel';
import { ViewerFilmstrip } from './ViewerFilmstrip';
import { ViewerShortcutDialog } from './ViewerShortcutDialog';
import { ViewerToolbar } from './ViewerToolbar';
import { prefersReducedMotion } from '../utils/motion';
import { imageLoadScheduler, useImageLoadPermission } from '../utils/imageLoadScheduler';
import { useViewerChrome } from '../hooks/useViewerChrome';
import { useViewerFilmstrip } from '../hooks/useViewerFilmstrip';
import { useViewerKeyboard } from '../hooks/useViewerKeyboard';
import { useViewerVideo } from '../hooks/useViewerVideo';
import { calculateReaderSpreadLayout, ReaderSpreadMediaSize } from '../utils/readerSpreadLayout';
import { IconButton } from './ui/Button';
import {
  ChevronLeft,
  ChevronRight,
  FastForward,
  Gauge,
  Pause,
  Play,
  Rewind,
} from 'lucide-react';

interface SpreadViewerProps {
  images: ImageItem[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (newIndex: number) => void;
  onNavigateNextRange?: () => void;
  onNavigatePrevRange?: () => void;
  thumbnailSize: number;
  blurEnabled?: boolean;
  demoMode?: boolean;
  fullscreenPageLayout: FullscreenPageLayout;
  fullscreenReadingDirection: FullscreenReadingDirection;
  fullscreenSpreadPairing?: FullscreenSpreadPairing;
  onPageLayoutChange: (layout: FullscreenPageLayout) => void;
  onReadingDirectionChange: (direction: FullscreenReadingDirection) => void;
  onSpreadPairingChange?: (pairing: FullscreenSpreadPairing) => void;
  fullscreenShowCheckerboard?: boolean;
  activeMode: ViewerMode;
  onChangeMode: (mode: ViewerMode) => void;
  groupMangaPosts?: boolean;
  onToggleGroupMangaPosts?: () => void;
  onToggleBlur?: () => void;
  onDeleteCurrent?: (imageId: number) => void;
  videoMuted?: boolean;
  videoVolume?: number;
  videoAutoplay?: boolean;
  videoSeekSeconds?: number;
  videoHoldPlaybackRate?: number;
  onVideoPreferenceChange?: (patch: VideoPreferencePatch) => void;
  pageOffset?: number;
  totalImages?: number;
  showToolbarByDefault?: boolean;
  onShowToolbarChange?: (showToolbar: boolean) => void;
  showFilmstripByDefault?: boolean;
  onShowFilmstripChange?: (showFilmstrip: boolean) => void;
  onCheckerboardChange?: (enabled: boolean) => void;
  simpleToolbar?: boolean;
  onSimpleToolbarChange?: (simpleMode: boolean) => void;
  globalMediaMode?: boolean;
}

interface SpreadMediaSlotProps {
  item: ImageItem;
  pageNumber: number;
  isActive: boolean;
  thumbnailSize: number;
  blurEnabled: boolean;
  demoMode: boolean;
  videoMuted: boolean;
  videoVolume: number;
  videoAutoplay: boolean;
  videoSeekSeconds: number;
  videoHoldPlaybackRate: number;
  keyboardVideoTarget: boolean;
  revealOriginal: boolean;
  onVideoPreferenceChange?: (patch: VideoPreferencePatch) => void;
  onVideoControlsReady?: (itemId: number, toggleVideoPlayback: (() => void) | null) => void;
  onVideoFocus?: (itemId: number) => void;
  onMediaDimensionsChange?: (itemId: number, dimensions: ReaderSpreadMediaSize) => void;
  onOriginalDecoded?: (itemId: number, mediaUrl: string, dimensions: ReaderSpreadMediaSize) => void;
}

type BoundaryPageKind = 'start' | 'end';

interface SpreadSlotDescriptor {
  kind: 'media' | 'boundary';
  index?: number;
  boundaryKind?: BoundaryPageKind;
}

interface ViewerDetailActionState {
  openAction: LocalOpenTarget | null;
  openActionError: string | null;
  openActionErrorTarget: LocalOpenTarget | null;
  copyAction: LocalOpenTarget | null;
  copyActionError: string | null;
  copyActionErrorTarget: LocalOpenTarget | null;
  copyFeedback: LocalOpenTarget | null;
}

const createViewerDetailActionState = (): ViewerDetailActionState => ({
  openAction: null,
  openActionError: null,
  openActionErrorTarget: null,
  copyAction: null,
  copyActionError: null,
  copyActionErrorTarget: null,
  copyFeedback: null,
});

const SpreadMediaSlot: React.FC<SpreadMediaSlotProps> = ({
  item,
  pageNumber,
  isActive,
  thumbnailSize,
  blurEnabled,
  demoMode,
  videoMuted,
  videoVolume,
  videoAutoplay,
  videoSeekSeconds,
  videoHoldPlaybackRate,
  keyboardVideoTarget,
  revealOriginal,
  onVideoPreferenceChange,
  onVideoControlsReady,
  onVideoFocus,
  onMediaDimensionsChange,
  onOriginalDecoded,
}) => {
  const { t, formatNumber } = useI18n();
  const [hasLoadError, setHasLoadError] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const isVideo = isVideoItem(item);
  const mediaUrl = buildMediaUrl(item);
  const thumbnailUrl = buildThumbnailUrl(item, thumbnailSize);
  const shouldAutoplayVideo = videoAutoplay && !prefersReducedMotion();
  const {
    videoRef,
    videoFrameRef,
    outgoingVideoRef,
    videoDisplayStyle,
    isVideoReady,
    showOutgoingVideo,
    previousVideo,
    videoFeedback,
    videoFeedbackPhase,
    toggleVideoPlayback,
    handleVideoLoadedMetadata,
    handleVideoLoadedData,
    handleVideoVolumeChange,
    handleVideoClick,
    handleVideoPointerDown,
    handleVideoPointerEnd,
  } = useViewerVideo({
    currentItem: item,
    currentItemIsVideo: isVideo,
    currentMediaUrl: mediaUrl,
    demoMode,
    showFilmstrip: false,
    showToolbar: true,
    shouldAutoplayVideo,
    videoMuted,
    videoVolume,
    videoSeekSeconds,
    videoHoldPlaybackRate,
    onVideoPreferenceChange,
  });

  const reportMediaDimensions = useCallback((width: number, height: number) => {
    if (width > 0 && height > 0) {
      onMediaDimensionsChange?.(item.image_id, { width, height });
    }
  }, [item.image_id, onMediaDimensionsChange]);

  const handleVideoMetadata = useCallback((event: React.SyntheticEvent<HTMLVideoElement>) => {
    handleVideoLoadedMetadata(event);
    reportMediaDimensions(event.currentTarget.videoWidth, event.currentTarget.videoHeight);
  }, [handleVideoLoadedMetadata, reportMediaDimensions]);

  const handleVideoData = useCallback((event: React.SyntheticEvent<HTMLVideoElement>) => {
    setHasLoadError(false);
    handleVideoLoadedData(event);
    reportMediaDimensions(event.currentTarget.videoWidth, event.currentTarget.videoHeight);
  }, [handleVideoLoadedData, reportMediaDimensions]);

  useEffect(() => {
    if (!isVideo || !keyboardVideoTarget) return undefined;
    onVideoControlsReady?.(item.image_id, toggleVideoPlayback);
    return () => onVideoControlsReady?.(item.image_id, null);
  }, [isVideo, item.image_id, keyboardVideoTarget, onVideoControlsReady, toggleVideoPlayback]);
  const originalAdmitted = useImageLoadPermission({
    url: mediaUrl,
    priority: isActive ? 0 : 1,
    kind: 'original',
    owner: 'spread',
    enabled: !isVideo && !demoMode && !item.media_status,
  });
  const thumbnailAdmitted = useImageLoadPermission({
    url: thumbnailUrl,
    priority: 0,
    kind: 'thumbnail',
    owner: 'spread',
    enabled: !isVideo && !demoMode && !item.media_status,
  });

  useEffect(() => {
    setHasLoadError(false);
    setThumbnailFailed(false);
  }, [item.image_id, mediaUrl, thumbnailUrl]);

  useEffect(() => {
    if (!originalAdmitted || isVideo || demoMode || item.media_status) return undefined;

    let cancelled = false;
    let decodeStarted = false;
    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = isActive ? 'high' : 'low';

    const markDecoded = () => {
      if (cancelled || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
      const dimensions = { width: image.naturalWidth, height: image.naturalHeight };
      imageLoadScheduler.markLoaded(mediaUrl);
      reportMediaDimensions(dimensions.width, dimensions.height);
      onOriginalDecoded?.(item.image_id, mediaUrl, dimensions);
    };

    const decodeOriginal = () => {
      if (cancelled || decodeStarted) return;
      decodeStarted = true;
      if (typeof image.decode !== 'function') {
        markDecoded();
        return;
      }
      void image.decode().then(markDecoded).catch(() => {
        if (image.naturalWidth > 0 && image.naturalHeight > 0) markDecoded();
      });
    };

    image.onload = decodeOriginal;
    image.onerror = () => {
      if (cancelled) return;
      imageLoadScheduler.markFinished(mediaUrl, false);
      setHasLoadError(true);
    };
    image.src = mediaUrl;
    if (image.complete && image.naturalWidth > 0) decodeOriginal();

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [demoMode, isActive, isVideo, item.image_id, item.media_status, mediaUrl, onOriginalDecoded, originalAdmitted, reportMediaDimensions]);

  if (item.media_status || hasLoadError) {
    return (
      <div className="spread-reader__media-frame">
        <MediaIssuePlaceholder
          message={item.media_error || t('viewer.mediaLoadFailed')}
        />
      </div>
    );
  }

  if (demoMode) {
    return (
      <div className="spread-reader__media-frame" aria-label={t('manga.pageAlt', { page: formatNumber(pageNumber) })}>
        <DemoMediaBlock dominantColor={item.dominant_color} className="spread-reader__demo" />
      </div>
    );
  }

  return (
    <div className="spread-reader__media-frame" aria-busy={isVideo ? !isVideoReady : !revealOriginal}>
      {isVideo ? (
        <div
          ref={videoFrameRef}
          className="fullscreen-viewer__video-frame notranslate"
          translate="no"
        >
          <div className="fullscreen-viewer__video-background" aria-hidden="true" />
          {showOutgoingVideo && previousVideo && (
            <div
              className="fullscreen-viewer__video-surface fullscreen-viewer__video-surface--outgoing"
              style={previousVideo.style}
            >
              <video
                key={previousVideo.url}
                ref={outgoingVideoRef}
                src={previousVideo.url}
                autoPlay={false}
                loop
                preload="auto"
                playsInline
                muted
                controls={false}
                aria-hidden="true"
                tabIndex={-1}
                className="fullscreen-viewer__media fullscreen-viewer__media--outgoing"
              />
            </div>
          )}
          <div className="fullscreen-viewer__video-surface" style={videoDisplayStyle}>
            <video
              key={mediaUrl}
              ref={videoRef}
              src={mediaUrl}
              poster={thumbnailUrl}
              autoPlay={shouldAutoplayVideo}
              loop
              preload={isActive ? 'metadata' : 'none'}
              playsInline
              muted={videoMuted || videoVolume <= 0}
              controls={isVideoReady}
              aria-label={`${item.title || t('common.video')} — ${t('manga.pageAlt', { page: formatNumber(pageNumber) })}`}
              onLoadedMetadata={handleVideoMetadata}
              onLoadedData={handleVideoData}
              onVolumeChange={handleVideoVolumeChange}
              onFocus={() => onVideoFocus?.(item.image_id)}
              onError={() => setHasLoadError(true)}
              className={`fullscreen-viewer__media${isVideoReady ? ' is-video-ready' : ''}${blurEnabled ? ' blur-media blur-media--viewer' : ''}`}
            />
            {isVideoReady && (
              <div
                className="fullscreen-viewer__video-gesture-layer"
                aria-hidden="true"
                onClick={handleVideoClick}
                onPointerDown={handleVideoPointerDown}
                onPointerUp={handleVideoPointerEnd}
                onPointerCancel={handleVideoPointerEnd}
                onLostPointerCapture={handleVideoPointerEnd}
              />
            )}
          </div>
          {videoFeedback && (
            <div
              key={videoFeedback.id}
              className={`fullscreen-viewer__video-feedback fullscreen-viewer__video-feedback--${videoFeedback.kind} fullscreen-viewer__video-feedback--${videoFeedback.kind === 'play' || videoFeedback.kind === 'pause' ? 'center' : 'top'}${videoFeedbackPhase === 'exiting' ? ' is-exiting' : ''}`}
              aria-hidden="true"
            >
              <span className="fullscreen-viewer__video-feedback-icon">
                {videoFeedback.kind === 'play' && <Play className="w-7 h-7" />}
                {videoFeedback.kind === 'pause' && <Pause className="w-7 h-7" />}
                {videoFeedback.kind === 'rewind' && <Rewind className="w-7 h-7" />}
                {videoFeedback.kind === 'forward' && <FastForward className="w-7 h-7" />}
                {videoFeedback.kind === 'speed' && <Gauge className="w-7 h-7" />}
              </span>
              {videoFeedback.kind !== 'play' && videoFeedback.kind !== 'pause' && (
                <span>{videoFeedback.label}</span>
              )}
            </div>
          )}
          <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {videoFeedback?.label ?? ''}
          </span>
        </div>
      ) : (
        <>
          {thumbnailAdmitted && !thumbnailFailed && !revealOriginal && (
            <img
              className={`spread-reader__media spread-reader__media--thumbnail${blurEnabled ? ' blur-media blur-media--viewer' : ''}`}
              src={thumbnailUrl}
              alt=""
              aria-hidden="true"
              loading="eager"
              decoding="async"
              {...{ fetchpriority: 'high' }}
              draggable={false}
              onLoad={event => {
                imageLoadScheduler.markLoaded(thumbnailUrl);
                reportMediaDimensions(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
              }}
              onError={() => {
                imageLoadScheduler.markFinished(thumbnailUrl, false);
                setThumbnailFailed(true);
              }}
            />
          )}
          {revealOriginal && (
            <img
              className={`spread-reader__media spread-reader__media--original${blurEnabled ? ' blur-media blur-media--viewer' : ''}`}
              src={mediaUrl}
              alt={item.title || t('manga.pageAlt', { page: formatNumber(pageNumber) })}
              loading="eager"
              decoding="async"
              {...{ fetchpriority: 'high' }}
              draggable={false}
              onLoad={event => {
                setHasLoadError(false);
                reportMediaDimensions(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
              }}
              onError={() => {
                imageLoadScheduler.markFinished(mediaUrl, false);
                setHasLoadError(true);
              }}
            />
          )}
          {!revealOriginal && (!thumbnailAdmitted || thumbnailFailed) && (
            <div className="spread-reader__media-placeholder" role="status" aria-label={t('viewer.loadingMedia')}>
              {t('viewer.loadingMedia')}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const useNarrowReaderViewport = () => {
  const [isNarrow, setIsNarrow] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 720px)').matches
      : false
  ));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia('(max-width: 720px)');
    const update = () => setIsNarrow(mediaQuery.matches);
    update();
    mediaQuery.addEventListener?.('change', update);
    return () => mediaQuery.removeEventListener?.('change', update);
  }, []);

  return isNarrow;
};

export const SpreadViewer: React.FC<SpreadViewerProps> = ({
  images,
  currentIndex,
  onClose,
  onNavigate,
  onNavigateNextRange,
  onNavigatePrevRange,
  thumbnailSize,
  blurEnabled = false,
  demoMode = false,
  fullscreenPageLayout,
  fullscreenReadingDirection,
  fullscreenSpreadPairing = 'cover-single',
  onPageLayoutChange,
  onReadingDirectionChange,
  onSpreadPairingChange,
  fullscreenShowCheckerboard = true,
  activeMode,
  onChangeMode,
  groupMangaPosts = false,
  onToggleGroupMangaPosts,
  onToggleBlur,
  onDeleteCurrent,
  videoMuted = false,
  videoVolume = 1,
  videoAutoplay = true,
  videoSeekSeconds = 5,
  videoHoldPlaybackRate = 2,
  onVideoPreferenceChange,
  pageOffset = 0,
  totalImages = images.length,
  showToolbarByDefault = true,
  onShowToolbarChange,
  showFilmstripByDefault = true,
  onShowFilmstripChange,
  onCheckerboardChange,
  simpleToolbar = true,
  onSimpleToolbarChange,
  globalMediaMode = false,
}) => {
  const { t, formatPageRange } = useI18n();
  const stageRef = useRef<HTMLElement | null>(null);
  const videoControlsRef = useRef(new Map<number, () => void>());
  const focusedVideoIdRef = useRef<number | null>(null);
  const pointerRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);
  const panGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const wheelAccumulatorRef = useRef(0);
  const wheelNavigationTimerRef = useRef<number | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [isSlideshowPlaying, setIsSlideshowPlaying] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [detailActionStates, setDetailActionStates] = useState<Record<number, ViewerDetailActionState>>({});
  const [sourceLinks, setSourceLinks] = useState<Record<number, SourceLink | null>>({});
  const [sourceLoadingIds, setSourceLoadingIds] = useState<Set<number>>(() => new Set());
  const [reloadVersion, setReloadVersion] = useState(0);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [mediaDimensions, setMediaDimensions] = useState<Record<number, ReaderSpreadMediaSize>>({});
  const [decodedOriginalUrls, setDecodedOriginalUrls] = useState<Set<string>>(() => new Set());
  const handleVideoControlsReady = useCallback((itemId: number, toggle: (() => void) | null) => {
    if (toggle) {
      videoControlsRef.current.set(itemId, toggle);
    } else {
      videoControlsRef.current.delete(itemId);
      if (focusedVideoIdRef.current === itemId) focusedVideoIdRef.current = null;
    }
  }, []);
  const handleVideoFocus = useCallback((itemId: number) => {
    focusedVideoIdRef.current = itemId;
  }, []);
  const toggleActiveVideoPlayback = useCallback(() => {
    const focusedToggle = focusedVideoIdRef.current === null
      ? undefined
      : videoControlsRef.current.get(focusedVideoIdRef.current);
    const fallbackToggle = videoControlsRef.current.values().next().value as (() => void) | undefined;
    (focusedToggle ?? fallbackToggle)?.();
  }, []);

  const handleMediaDimensionsChange = useCallback((itemId: number, dimensions: ReaderSpreadMediaSize) => {
    setMediaDimensions(previous => {
      const current = previous[itemId];
      if (current?.width === dimensions.width && current.height === dimensions.height) return previous;
      return { ...previous, [itemId]: dimensions };
    });
  }, []);
  const handleOriginalDecoded = useCallback((itemId: number, mediaUrl: string, dimensions: ReaderSpreadMediaSize) => {
    handleMediaDimensionsChange(itemId, dimensions);
    setDecodedOriginalUrls(previous => {
      if (previous.has(mediaUrl)) return previous;
      const next = new Set(previous);
      next.add(mediaUrl);
      return next;
    });
  }, [handleMediaDimensionsChange]);
  const isNarrowViewport = useNarrowReaderViewport();
  const effectiveLayout: FullscreenPageLayout = fullscreenPageLayout === 'spread' && !isNarrowViewport
    ? 'spread'
    : 'single';
  const spreadOptions = useMemo(() => ({
    pageLayout: effectiveLayout,
    readingDirection: fullscreenReadingDirection,
    spreadPairing: fullscreenSpreadPairing,
    ...(globalMediaMode ? { globalOffset: pageOffset, globalTotal: totalImages } : {}),
  }), [effectiveLayout, fullscreenReadingDirection, fullscreenSpreadPairing, globalMediaMode, pageOffset, totalImages]);
  const currentSpread = useMemo(
    () => buildReaderSpread(images, currentIndex, spreadOptions),
    [currentIndex, images, spreadOptions],
  );
  const physicalIndexes = useMemo(
    () => getPhysicalSpreadIndexes(currentSpread, fullscreenReadingDirection),
    [currentSpread, fullscreenReadingDirection],
  );
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const updateStageSize = () => {
      const bounds = stage.getBoundingClientRect();
      const nextSize = {
        width: stage.clientWidth || bounds.width,
        height: stage.clientHeight || bounds.height,
      };
      setStageSize(previous => (
        previous.width === nextSize.width && previous.height === nextSize.height
          ? previous
          : nextSize
      ));
    };

    updateStageSize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateStageSize);
    observer?.observe(stage);
    window.addEventListener('resize', updateStageSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateStageSize);
    };
  }, []);

  const spreadAvailableWidth = useMemo(() => {
    if (stageSize.width <= 0) return 0;
    const viewportWidth = typeof window === 'undefined' ? stageSize.width : window.innerWidth;
    return Math.min(stageSize.width, viewportWidth * 0.9, 144 * 16);
  }, [stageSize.width]);

  const boundaryPageKind = useMemo<BoundaryPageKind | null>(() => {
    if (effectiveLayout !== 'spread' || physicalIndexes.length !== 1) return null;
    const index = currentSpread.progressionIndexes[0];
    const item = index === undefined ? undefined : images[index];
    if (!item || index === undefined) return null;
    const groupKey = getItemGroupKey(item);
    const absoluteIndex = pageOffset + index;
    const previousItem = images[index - 1];
    const nextItem = images[index + 1];
    const isWorkStart = absoluteIndex === 0
      || item.group_page_index === 1
      || (previousItem !== undefined && getItemGroupKey(previousItem) !== groupKey);
    const isWorkEnd = absoluteIndex === totalImages - 1
      || item.group_page_index === item.group_page_total
      || (nextItem !== undefined && getItemGroupKey(nextItem) !== groupKey);
    if (isWorkStart && fullscreenSpreadPairing === 'cover-single') return 'start';
    if (isWorkEnd) return 'end';
    return null;
  }, [
    currentSpread.progressionIndexes,
    effectiveLayout,
    fullscreenSpreadPairing,
    images,
    pageOffset,
    physicalIndexes.length,
    totalImages,
  ]);

  const spreadSlots = useMemo<SpreadSlotDescriptor[]>(() => {
    const mediaSlots = physicalIndexes.map(index => ({ kind: 'media' as const, index }));
    if (!boundaryPageKind) return mediaSlots;
    const boundarySlot: SpreadSlotDescriptor = { kind: 'boundary', boundaryKind: boundaryPageKind };
    if (boundaryPageKind === 'start') {
      return fullscreenReadingDirection === 'rtl'
        ? [...mediaSlots, boundarySlot]
        : [boundarySlot, ...mediaSlots];
    }
    return fullscreenReadingDirection === 'rtl'
      ? [boundarySlot, ...mediaSlots]
      : [...mediaSlots, boundarySlot];
  }, [boundaryPageKind, fullscreenReadingDirection, physicalIndexes]);

  const spreadLayout = useMemo(() => {
    if (effectiveLayout !== 'spread' || physicalIndexes.length < 2) return null;
    return calculateReaderSpreadLayout(
      spreadAvailableWidth,
      stageSize.height,
      physicalIndexes.map(index => {
        const item = images[index];
        return item ? mediaDimensions[item.image_id] ?? null : null;
      }),
    );
  }, [effectiveLayout, images, mediaDimensions, physicalIndexes, spreadAvailableWidth, stageSize.height]);

  const boundaryLayout = useMemo(() => {
    if (effectiveLayout !== 'spread' || !boundaryPageKind || physicalIndexes.length !== 1) return null;
    const item = images[physicalIndexes[0]];
    const mediaSize = item ? mediaDimensions[item.image_id] : undefined;
    if (!mediaSize) return null;
    return calculateReaderSpreadLayout(
      spreadAvailableWidth,
      stageSize.height,
      [mediaSize, mediaSize],
    );
  }, [boundaryPageKind, effectiveLayout, images, mediaDimensions, physicalIndexes, spreadAvailableWidth, stageSize.height]);

  const activeCanvasLayout = spreadLayout ?? boundaryLayout;
  const currentOriginalsDecoded = physicalIndexes.every(index => {
    const item = images[index];
    return Boolean(item && (isVideoItem(item) || decodedOriginalUrls.has(buildMediaUrl(item))));
  });
  const revealSpreadOriginals = currentOriginalsDecoded
    && (effectiveLayout !== 'spread' || Boolean(activeCanvasLayout));
  const progression = useMemo(
    () => getReaderSpreadProgression(images, spreadOptions),
    [images, spreadOptions],
  );
  const firstAnchor = progression[0] ?? null;
  const lastAnchor = progression.length > 0 ? progression[progression.length - 1] : null;
  const currentItem = images[currentSpread.anchorIndex] ?? images[currentIndex];
  const detailItems = useMemo(
    () => physicalIndexes
      .map(index => images[index])
      .filter((item): item is ImageItem => Boolean(item)),
    [images, physicalIndexes],
  );
  const pageNumberState = useMemo(
    () => groupMangaPosts
      ? getGroupPageNumbers(images)
      : {
        pageNumbers: images.map((_, index) => pageOffset + index + 1),
        pageTotals: images.map(() => Math.max(1, totalImages)),
        totalPages: Math.max(1, totalImages),
      },
    [groupMangaPosts, images, pageOffset, totalImages],
  );
  const pageIndexes = currentSpread.progressionIndexes.length > 0
    ? currentSpread.progressionIndexes
    : (currentItem ? [currentIndex] : []);
  const pageStart = pageIndexes.length > 0 ? Math.min(...pageIndexes) : 0;
  const pageEnd = pageIndexes.length > 0 ? Math.max(...pageIndexes) : pageStart;
  const pageRange = formatPageRange(
    pageNumberState.pageNumbers[pageStart] ?? pageOffset + pageStart + 1,
    pageNumberState.pageNumbers[pageEnd] ?? pageOffset + pageEnd + 1,
    pageNumberState.pageTotals[pageStart] ?? pageNumberState.totalPages,
  );
  const pageNumbers = useMemo(
    () => pageNumberState.pageNumbers,
    [pageNumberState.pageNumbers],
  );
  const copyFeedbackTimersRef = useRef(new Map<number, number>());
  const {
    viewerRef,
    toolbarRestoreButtonRef,
    mobileToolbarToggleRef,
    mobileToolbarMenuRef,
    showToolbar,
    showFilmstrip,
    showShortcutHelp,
    isMobileToolbarOpen,
    checkerboardEnabled,
    setShowShortcutHelp,
    setIsMobileToolbarOpen,
    handleShowToolbarChange,
    toggleShowToolbar,
    toggleShowFilmstrip,
    toggleCheckerboard,
    showToolbarAgain,
  } = useViewerChrome({
    showToolbarByDefault,
    onShowToolbarChange,
    showFilmstripByDefault,
    onShowFilmstripChange,
    fullscreenShowCheckerboard,
    onCheckerboardChange,
  });
  const {
    filmstripLayout,
    filmstripStartIndex,
    filmstripEndIndex,
    filmstripLoadStart,
    filmstripLoadEnd,
    filmstripViewportWidth,
    filmstripItemSize,
    isFilmstripPositioned,
    filmstripScrollRef,
    handleFilmstripScroll,
  } = useViewerFilmstrip({
    images,
    currentIndex: currentSpread.anchorIndex,
    showFilmstrip,
  });

  useEffect(() => {
    let cancelled = false;
    const nextLinks = detailItems.reduce<Record<number, SourceLink | null>>((links, item) => {
      links[item.image_id] = null;
      return links;
    }, {});
    setSourceLinks(nextLinks);

    if (!showDetails) {
      setSourceLoadingIds(new Set());
      return undefined;
    }

    const loadableItems = detailItems.filter(item => Boolean(item.save_name));
    setSourceLoadingIds(new Set(loadableItems.map(item => item.image_id)));
    void Promise.all(loadableItems.map(async item => ({
      imageId: item.image_id,
      link: await fetchSourceLink(item.save_name),
    }))).then(links => {
      if (cancelled) return;
      setSourceLinks(previous => links.reduce((next, entry) => ({
        ...next,
        [entry.imageId]: entry.link,
      }), previous));
      setSourceLoadingIds(new Set());
    });

    return () => {
      cancelled = true;
    };
  }, [detailItems, showDetails]);

  useEffect(() => {
    setDetailActionStates(previous => detailItems.reduce<Record<number, ViewerDetailActionState>>((next, item) => {
      next[item.image_id] = previous[item.image_id] ?? createViewerDetailActionState();
      return next;
    }, {}));
  }, [detailItems]);

  useEffect(() => () => {
    copyFeedbackTimersRef.current.forEach(timer => window.clearTimeout(timer));
    copyFeedbackTimersRef.current.clear();
  }, []);

  useEffect(() => {
    const nextAnchor = getNextReaderSpreadAnchor(images, currentSpread.anchorIndex, spreadOptions);
    if (nextAnchor === null) return undefined;

    const nextSpread = buildReaderSpread(images, nextAnchor, spreadOptions);
    const preloadEntries = nextSpread.progressionIndexes
      .map(index => images[index])
      .filter((item): item is ImageItem => Boolean(item && !item.media_status && !isVideoItem(item)))
      .map(item => {
        const mediaUrl = buildMediaUrl(item);
        return {
          item,
          mediaUrl,
          handle: imageLoadScheduler.preload({
            url: mediaUrl,
            priority: 1,
            kind: 'original',
            owner: 'spread',
          }),
        };
      });
    const decodedImages: HTMLImageElement[] = [];
    let cancelled = false;

    preloadEntries.forEach(({ item, mediaUrl, handle }) => {
      void handle.promise.then(() => {
        if (cancelled) return;
        const image = new Image();
        image.decoding = 'async';
        image.fetchPriority = 'low';
        decodedImages.push(image);
        let decodeStarted = false;
        const markDecoded = () => {
          if (cancelled || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
          handleOriginalDecoded(item.image_id, mediaUrl, {
            width: image.naturalWidth,
            height: image.naturalHeight,
          });
        };
        const decodeImage = () => {
          if (decodeStarted) return;
          decodeStarted = true;
          if (typeof image.decode !== 'function') {
            markDecoded();
            return;
          }
          void image.decode().then(markDecoded).catch(() => {
            if (image.naturalWidth > 0 && image.naturalHeight > 0) markDecoded();
          });
        };
        image.onload = decodeImage;
        image.src = mediaUrl;
        if (image.complete && image.naturalWidth > 0) decodeImage();
      });
    });

    return () => {
      cancelled = true;
      preloadEntries.forEach(({ handle }) => handle.cancel());
      decodedImages.forEach(image => {
        image.onload = null;
        image.onerror = null;
      });
    };
  }, [currentSpread.anchorIndex, handleOriginalDecoded, images, spreadOptions]);

  useEffect(() => {
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
    };
  }, []);

  useEffect(() => {
    const syncBrowserFullscreenState = () => {
      setIsBrowserFullscreen(document.fullscreenElement === viewerRef.current);
    };
    syncBrowserFullscreenState();
    document.addEventListener('fullscreenchange', syncBrowserFullscreenState);
    document.addEventListener('fullscreenerror', syncBrowserFullscreenState);
    return () => {
      document.removeEventListener('fullscreenchange', syncBrowserFullscreenState);
      document.removeEventListener('fullscreenerror', syncBrowserFullscreenState);
    };
  }, [viewerRef]);

  useEffect(() => {
    if (!isSlideshowPlaying || images.length < 2) return undefined;
    const timer = window.setInterval(() => {
      const nextAnchor = getNextReaderSpreadAnchor(images, currentSpread.anchorIndex, spreadOptions);
      if (nextAnchor === null) {
        onNavigateNextRange?.();
        return;
      }
      onNavigate(nextAnchor);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [currentSpread.anchorIndex, images, isSlideshowPlaying, onNavigate, onNavigateNextRange, spreadOptions]);

  useEffect(() => {
    setZoomPercent(100);
    setPan({ x: 0, y: 0 });
    setIsPanning(false);
    panGestureRef.current = null;
  }, [currentSpread.anchorIndex, effectiveLayout, fullscreenReadingDirection]);

  useEffect(() => () => {
    if (wheelNavigationTimerRef.current !== null) {
      window.clearTimeout(wheelNavigationTimerRef.current);
    }
  }, []);

  const navigateBy = useCallback((direction: 1 | -1) => {
    const nextIndex = direction > 0
      ? getNextReaderSpreadAnchor(images, currentSpread.anchorIndex, spreadOptions)
      : getPreviousReaderSpreadAnchor(images, currentSpread.anchorIndex, spreadOptions);
    if (nextIndex !== null) onNavigate(nextIndex);
    else if (direction > 0) onNavigateNextRange?.();
    else onNavigatePrevRange?.();
  }, [currentSpread.anchorIndex, images, onNavigate, onNavigateNextRange, onNavigatePrevRange, spreadOptions]);

  const navigateToBoundary = useCallback((anchor: number | null) => {
    if (anchor !== null) {
      onNavigate(anchor);
      return;
    }
    if (currentSpread.anchorIndex <= 0) onNavigatePrevRange?.();
    else onNavigateNextRange?.();
  }, [currentSpread.anchorIndex, onNavigate, onNavigateNextRange, onNavigatePrevRange]);

  const clampPan = useCallback((nextPan: { x: number; y: number }) => {
    const viewportWidth = stageRef.current?.clientWidth || 1000;
    const viewportHeight = stageRef.current?.clientHeight || 700;
    const scale = zoomPercent / 100;
    const maxX = Math.max(0, viewportWidth * (scale - 1) / 2);
    const maxY = Math.max(0, viewportHeight * (scale - 1) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, nextPan.x)),
      y: Math.min(maxY, Math.max(-maxY, nextPan.y)),
    };
  }, [zoomPercent]);

  const zoomIn = useCallback(() => {
    setZoomPercent(previous => Math.min(400, previous + 10));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomPercent(previous => {
      const nextZoom = Math.max(100, previous - 10);
      if (nextZoom === 100) setPan({ x: 0, y: 0 });
      return nextZoom;
    });
  }, []);

  const resetZoom = useCallback(() => {
    setZoomPercent(100);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (event.ctrlKey || event.metaKey || target.closest('.fullscreen-viewer__details, button, input, select, textarea, video, a')) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || event.deltaY === 0) return;

    event.preventDefault();
    wheelAccumulatorRef.current += event.deltaY;
    const threshold = 48;
    if (Math.abs(wheelAccumulatorRef.current) >= threshold) {
      const direction: 1 | -1 = wheelAccumulatorRef.current > 0 ? 1 : -1;
      wheelAccumulatorRef.current = 0;
      if (wheelNavigationTimerRef.current !== null) {
        window.clearTimeout(wheelNavigationTimerRef.current);
        wheelNavigationTimerRef.current = null;
      }
      navigateBy(direction);
      return;
    }

    if (wheelNavigationTimerRef.current !== null) {
      window.clearTimeout(wheelNavigationTimerRef.current);
    }
    wheelNavigationTimerRef.current = window.setTimeout(() => {
      wheelAccumulatorRef.current = 0;
      wheelNavigationTimerRef.current = null;
    }, 120);
  }, [navigateBy]);

  const handleStageClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest('.fullscreen-viewer__details, button, input, select, textarea, video, a')) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const clickedRightHalf = event.clientX - bounds.left >= bounds.width / 2;
    const shouldAdvance = fullscreenReadingDirection === 'rtl' ? !clickedRightHalf : clickedRightHalf;
    navigateBy(shouldAdvance ? 1 : -1);
  }, [fullscreenReadingDirection, navigateBy]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('.fullscreen-viewer__details, button, input, select, textarea, video, a')) return;
    if (zoomPercent > 100 && event.button === 0) {
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      panGestureRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: pan.x,
        originY: pan.y,
      };
      setIsPanning(true);
      return;
    }
    pointerRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [pan.x, pan.y, zoomPercent]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const gesture = panGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    setPan(clampPan({
      x: gesture.originX + event.clientX - gesture.startX,
      y: gesture.originY + event.clientY - gesture.startY,
    }));
  }, [clampPan]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const panGesture = panGestureRef.current;
    if (panGesture?.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
      panGestureRef.current = null;
      setIsPanning(false);
      suppressClickRef.current = true;
      return;
    }
    const pointer = pointerRef.current;
    pointerRef.current = null;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - pointer.startX;
    const deltaY = event.clientY - pointer.startY;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    suppressClickRef.current = true;
    const swipedForward = deltaX < 0;
      navigateBy(
      fullscreenReadingDirection === 'rtl'
        ? (swipedForward ? -1 : 1)
        : (swipedForward ? 1 : -1),
    );
  }, [fullscreenReadingDirection, navigateBy]);

  const handlePointerCancel = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (panGestureRef.current?.pointerId === event.pointerId) {
      panGestureRef.current = null;
      setIsPanning(false);
    }
    pointerRef.current = null;
  }, []);

  const handleVideoPreference = useCallback((patch: VideoPreferencePatch) => {
    onVideoPreferenceChange?.(patch);
  }, [onVideoPreferenceChange]);

  const toggleBrowserFullscreen = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (document.fullscreenElement === viewer) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    void viewer.requestFullscreen().catch(() => undefined);
  }, [viewerRef]);

  const reloadCurrentMedia = useCallback(() => {
    setReloadVersion(version => version + 1);
  }, []);

  const toggleShortcutHelp = useCallback(() => {
    setShowShortcutHelp(open => !open);
  }, [setShowShortcutHelp]);

  const closeMobileToolbar = useCallback(() => {
    setIsMobileToolbarOpen(false);
  }, [setIsMobileToolbarOpen]);

  const handlePageLayoutChange = useCallback((layout: FullscreenPageLayout) => {
    onPageLayoutChange(layout);
  }, [onPageLayoutChange]);

  const handleReadingDirectionChange = useCallback((direction: FullscreenReadingDirection) => {
    onReadingDirectionChange(direction);
  }, [onReadingDirectionChange]);

  const handleKeyboardNavigate = useCallback((index: number) => {
    navigateToBoundary(index <= 0 ? firstAnchor : lastAnchor);
  }, [firstAnchor, lastAnchor, navigateToBoundary]);

  const handleKeyboardArrowRight = useCallback(() => {
    navigateBy(fullscreenReadingDirection === 'rtl' ? -1 : 1);
  }, [fullscreenReadingDirection, navigateBy]);

  const handleKeyboardArrowLeft = useCallback(() => {
    navigateBy(fullscreenReadingDirection === 'rtl' ? 1 : -1);
  }, [fullscreenReadingDirection, navigateBy]);

  const closeShortcutHelp = useCallback(() => {
    setShowShortcutHelp(false);
  }, [setShowShortcutHelp]);

  const toggleDetails = useCallback(() => {
    setShowDetails(value => !value);
  }, []);

  const updateDetailActionState = useCallback((imageId: number, patch: Partial<ViewerDetailActionState>) => {
    setDetailActionStates(previous => ({
      ...previous,
      [imageId]: {
        ...(previous[imageId] ?? createViewerDetailActionState()),
        ...patch,
      },
    }));
  }, []);

  const handleOpenLocalMedia = useCallback(async (item: ImageItem, target: LocalOpenTarget) => {
    const canOpen = Boolean(
      item.save_name
      && item.media_status !== 'missing'
      && item.media_status !== 'internal',
    );
    if (!canOpen) return;

    updateDetailActionState(item.image_id, {
      openAction: target,
      openActionError: null,
      openActionErrorTarget: null,
    });
    try {
      await openLocalMedia({
        path: item.save_name,
        imageId: item.image_id,
        target,
      });
    } catch (error) {
      updateDetailActionState(item.image_id, {
        openActionError: getOperationErrorMessage(error, t),
        openActionErrorTarget: target,
      });
    } finally {
      updateDetailActionState(item.image_id, { openAction: null });
    }
  }, [t, updateDetailActionState]);

  const handleCopyPath = useCallback(async (item: ImageItem, target: LocalOpenTarget) => {
    const path = target === 'file' ? item.save_name : getParentPath(item.save_name);
    if (!path) {
      updateDetailActionState(item.image_id, { copyActionError: target === 'folder'
        ? t('viewer.noFolderPath')
        : t('viewer.noFilePath'), copyActionErrorTarget: target, copyFeedback: null });
      return;
    }

    updateDetailActionState(item.image_id, {
      copyAction: target,
      copyActionError: null,
      copyActionErrorTarget: null,
    });
    try {
      await copyTextToClipboard(path);
      const previousTimer = copyFeedbackTimersRef.current.get(item.image_id);
      if (previousTimer !== undefined) {
        window.clearTimeout(previousTimer);
      }
      updateDetailActionState(item.image_id, {
        copyFeedback: target,
      });
      const timer = window.setTimeout(() => {
        updateDetailActionState(item.image_id, { copyFeedback: null });
        copyFeedbackTimersRef.current.delete(item.image_id);
      }, 1800);
      copyFeedbackTimersRef.current.set(item.image_id, timer);
    } catch (error) {
      updateDetailActionState(item.image_id, {
        copyActionError: error instanceof Error ? error.message : t('viewer.copyPathError'),
        copyActionErrorTarget: target,
      });
    } finally {
      updateDetailActionState(item.image_id, { copyAction: null });
    }
  }, [t, updateDetailActionState]);

  const detailsEntries = useMemo<ViewerDetailsEntry[]>(() => detailItems.map(item => {
    const actionState = detailActionStates[item.image_id] ?? createViewerDetailActionState();
    const filePath = item.save_name ?? '';
    const folderPath = filePath ? getParentPath(filePath) : '';

    return {
      item,
      dimensions: mediaDimensions[item.image_id] ?? null,
      currentItemIsVideo: isVideoItem(item),
      mediaUrl: buildMediaUrl(item),
      canOpenLocalMedia: Boolean(
        item.save_name
        && item.media_status !== 'missing'
        && item.media_status !== 'internal',
      ),
      openAction: actionState.openAction,
      openActionError: actionState.openActionError,
      openActionErrorTarget: actionState.openActionErrorTarget,
      onOpenLocalMedia: target => handleOpenLocalMedia(item, target),
      canCopyFilePath: Boolean(filePath),
      canCopyFolderPath: Boolean(folderPath),
      copyAction: actionState.copyAction,
      copyActionError: actionState.copyActionError,
      copyActionErrorTarget: actionState.copyActionErrorTarget,
      copyFeedback: actionState.copyFeedback,
      onCopyPath: target => handleCopyPath(item, target),
      sourceLink: sourceLinks[item.image_id] ?? null,
      isSourceLoading: sourceLoadingIds.has(item.image_id),
    };
  }), [detailActionStates, detailItems, handleCopyPath, handleOpenLocalMedia, sourceLinks, sourceLoadingIds]);

  useViewerKeyboard({
    viewerRef,
    currentItem,
    imagesLength: images.length,
    transformReady: Boolean(currentItem && !currentItem.media_status),
    showShortcutHelp,
    isMobileToolbarOpen,
    zoomModeShortcuts: [],
    onClose,
    onNavigate: handleKeyboardNavigate,
    onDeleteCurrent,
    onNext: () => navigateBy(1),
    onPrevious: () => navigateBy(-1),
    onArrowRight: handleKeyboardArrowRight,
    onArrowLeft: handleKeyboardArrowLeft,
    onToggleShortcutHelp: toggleShortcutHelp,
    onCloseShortcutHelp: closeShortcutHelp,
    onCloseMobileToolbar: closeMobileToolbar,
    onApplyZoomMode: () => undefined,
    onZoomIn: zoomIn,
    onZoomOut: zoomOut,
    onShowActualSize: resetZoom,
    onFitToViewer: resetZoom,
    onRotate: () => undefined,
    onToggleFlipHorizontal: () => undefined,
    onToggleFlipVertical: () => undefined,
    onToggleDetails: toggleDetails,
    onToggleToolbar: toggleShowToolbar,
    onToggleFilmstrip: toggleShowFilmstrip,
    onReloadMedia: reloadCurrentMedia,
    onToggleCheckerboard: toggleCheckerboard,
    onToggleBrowserFullscreen: toggleBrowserFullscreen,
    onToggleSlideshow: () => setIsSlideshowPlaying(value => !value),
    onToggleVideoPlayback: toggleActiveVideoPlayback,
  });

  if (!currentItem) return null;

  return (
    <div
      ref={viewerRef}
      className={`fullscreen-viewer spread-reader animate-fadeIn${checkerboardEnabled ? ' is-checkerboard' : ''}${blurEnabled ? ' is-blur-enabled' : ''}${showToolbar ? '' : ' is-toolbar-hidden'}${images.length > 1 && showFilmstrip ? ' has-filmstrip' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={currentItem.title || t('viewer.imagePreview')}
      tabIndex={-1}
    >
      <ViewerToolbar
        currentItem={currentItem}
        counterLabel={pageRange}
        currentIndex={currentSpread.anchorIndex}
        imageCount={images.length}
        activeMode={activeMode}
        readerVariant="spread"
        fullscreenPageLayout={effectiveLayout}
        allowSpreadLayout={!isNarrowViewport}
        fullscreenReadingDirection={fullscreenReadingDirection}
        fullscreenSpreadPairing={fullscreenSpreadPairing}
        simpleToolbar={simpleToolbar}
        isMediaLoading={false}
        showToolbar={showToolbar}
        showFilmstrip={showFilmstrip}
        showShortcutHelp={showShortcutHelp}
        isMobileToolbarOpen={isMobileToolbarOpen}
        showDetails={showDetails}
        hasTransformableMedia={!currentItem.media_status}
        zoomMode="custom"
        effectiveZoomPercent={zoomPercent}
        zoomShortcuts={[]}
        flipHorizontal={false}
        flipVertical={false}
        checkerboardEnabled={checkerboardEnabled}
        isBrowserFullscreen={isBrowserFullscreen}
        isSlideshowPlaying={isSlideshowPlaying}
        groupMangaPosts={groupMangaPosts}
        blurEnabled={blurEnabled}
        mobileToolbarToggleRef={mobileToolbarToggleRef}
        mobileToolbarMenuRef={mobileToolbarMenuRef}
        toolbarRestoreButtonRef={toolbarRestoreButtonRef}
        onToggleMobileToolbar={() => setIsMobileToolbarOpen(value => !value)}
        onToggleDetails={toggleDetails}
        onPrevious={() => navigateBy(-1)}
        onNext={() => navigateBy(1)}
        onChangeMode={onChangeMode}
        onPageLayoutChange={handlePageLayoutChange}
        onReadingDirectionChange={handleReadingDirectionChange}
        onSpreadPairingChange={onSpreadPairingChange}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
        onShowActualSize={resetZoom}
        onFitToViewer={resetZoom}
        onApplyZoomMode={() => undefined}
        onRotate={() => undefined}
        onToggleFlipHorizontal={() => undefined}
        onToggleFlipVertical={() => undefined}
        onReloadMedia={reloadCurrentMedia}
        onToggleCheckerboard={toggleCheckerboard}
        onToggleBrowserFullscreen={toggleBrowserFullscreen}
        onToggleSlideshow={() => setIsSlideshowPlaying(value => !value)}
        onHideToolbar={() => {
          handleShowToolbarChange(false);
          closeMobileToolbar();
        }}
        onToggleFilmstrip={toggleShowFilmstrip}
        onToggleGroupMangaPosts={onToggleGroupMangaPosts}
        onToggleBlur={onToggleBlur}
        onToggleShortcutHelp={toggleShortcutHelp}
        onSimpleToolbarChange={onSimpleToolbarChange}
        showTransformControls={false}
        showZoomModes={false}
        showDetailsControl
        onDeleteCurrent={onDeleteCurrent}
        onShowToolbarAgain={showToolbarAgain}
        onClose={onClose}
      />

      <main
        ref={stageRef}
        className={`fullscreen-viewer__stage spread-reader__stage${effectiveLayout === 'single' ? ' is-single' : ' is-spread'}${effectiveLayout === 'spread' && physicalIndexes.length < 2 ? ' is-cover' : ''}`}
        onClick={handleStageClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onWheel={handleWheel}
        aria-label={t('viewer.navigation')}
      >
        {getPreviousReaderSpreadAnchor(images, currentSpread.anchorIndex, spreadOptions) !== null && (
          <IconButton
            type="button"
            onClick={() => navigateBy(-1)}
            aria-label={t('viewer.previousImage')}
            variant="secondary"
            size="lg"
            className="viewer-nav-button viewer-nav-button--previous"
            title={t('viewer.previousImage')}
          >
            <ChevronLeft className="w-8 h-8" aria-hidden="true" />
          </IconButton>
        )}

        {getNextReaderSpreadAnchor(images, currentSpread.anchorIndex, spreadOptions) !== null && (
          <IconButton
            type="button"
            onClick={() => navigateBy(1)}
            aria-label={t('viewer.nextImage')}
            variant="secondary"
            size="lg"
            className="viewer-nav-button viewer-nav-button--next"
            title={t('viewer.nextImage')}
          >
            <ChevronRight className="w-8 h-8" aria-hidden="true" />
          </IconButton>
        )}

        <div
          className={`spread-reader__surface${effectiveLayout === 'spread' ? ' is-spread' : ''}${boundaryPageKind ? ' is-boundary' : ''}`}
          style={activeCanvasLayout ? {
            inlineSize: activeCanvasLayout.width,
            blockSize: activeCanvasLayout.height,
          } : undefined}
        >
          <div
            className={`spread-reader__canvas${isPanning ? ' is-panning' : ''}${boundaryPageKind ? ' is-boundary' : ''}`}
            style={{
              ...(activeCanvasLayout ? {
                inlineSize: activeCanvasLayout.width,
                blockSize: activeCanvasLayout.height,
                gridTemplateColumns: activeCanvasLayout.slotWidths.map(width => `${width}px`).join(' '),
                gridTemplateRows: `${activeCanvasLayout.height}px`,
                alignContent: 'start',
              } : {}),
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoomPercent / 100})`,
            }}
          >
            {spreadSlots.map(slot => {
              if (slot.kind === 'boundary') {
                const boundaryLabel = slot.boundaryKind === 'start'
                  ? t('viewer.readerStart')
                  : t('viewer.readerEnd');
                return (
                  <article
                    className="spread-reader__slot spread-reader__slot--boundary"
                    key={`${reloadVersion}:boundary:${slot.boundaryKind}`}
                    aria-label={boundaryLabel}
                  >
                    <div className="spread-reader__boundary-page">
                      <p className="spread-reader__boundary-label">{boundaryLabel}</p>
                      <h2 className="spread-reader__boundary-title">
                        {currentItem.title || t('viewer.untitled')}
                      </h2>
                      {slot.boundaryKind === 'start' && (
                        <p className="spread-reader__boundary-artist">
                          {t('viewer.artistLabel')}: {currentItem.artist_name || currentItem.member_id}
                        </p>
                      )}
                    </div>
                  </article>
                );
              }

              const index = slot.index;
              const item = index === undefined ? undefined : images[index];
              if (!item || index === undefined) return null;
              const mediaSlotPosition = physicalIndexes.indexOf(index);
              const mediaOnRight = boundaryPageKind !== null
                && ((boundaryPageKind === 'start') === (fullscreenReadingDirection === 'ltr'));
              return (
                <article
                  className={`spread-reader__slot${boundaryPageKind ? ` is-boundary-media ${mediaOnRight ? 'is-boundary-media--right' : 'is-boundary-media--left'}` : ''}`}
                  key={`${reloadVersion}:${item.image_id}:${item.save_name}`}
                  aria-label={formatPageRange(
                    pageNumberState.pageNumbers[index] ?? pageOffset + index + 1,
                    pageNumberState.pageNumbers[index] ?? pageOffset + index + 1,
                    pageNumberState.pageTotals[index] ?? pageNumberState.totalPages,
                  )}
                  style={activeCanvasLayout ? {
                    blockSize: `${activeCanvasLayout.slotHeights[mediaSlotPosition]}px`,
                    alignSelf: 'start',
                  } : undefined}
                >
                  <SpreadMediaSlot
                    item={item}
                    pageNumber={pageNumberState.pageNumbers[index] ?? pageOffset + index + 1}
                    isActive={currentSpread.progressionIndexes.includes(index)}
                    thumbnailSize={thumbnailSize}
                    blurEnabled={blurEnabled}
                    demoMode={demoMode}
                    videoMuted={videoMuted}
                    videoVolume={videoVolume}
                    videoAutoplay={videoAutoplay}
                    videoSeekSeconds={videoSeekSeconds}
                    videoHoldPlaybackRate={videoHoldPlaybackRate}
                    keyboardVideoTarget={currentSpread.progressionIndexes.includes(index)}
                    revealOriginal={revealSpreadOriginals}
                    onVideoPreferenceChange={handleVideoPreference}
                    onVideoControlsReady={handleVideoControlsReady}
                    onVideoFocus={handleVideoFocus}
                    onMediaDimensionsChange={handleMediaDimensionsChange}
                    onOriginalDecoded={handleOriginalDecoded}
                  />
                </article>
              );
            })}
          </div>
        </div>

        {showDetails && currentItem && (
          <ViewerDetailsPanel
            items={detailsEntries}
            isMobileViewport={isNarrowViewport}
            primaryItemId={currentItem.image_id}
            onClose={() => setShowDetails(false)}
          />
        )}
      </main>

      {showShortcutHelp && (
        <ViewerShortcutDialog
          videoSeekSeconds={videoSeekSeconds}
          videoHoldPlaybackRate={videoHoldPlaybackRate}
          onClose={() => setShowShortcutHelp(false)}
        />
      )}

      {images.length > 1 && showFilmstrip && (
        <ViewerFilmstrip
          images={images}
          currentIndex={currentSpread.anchorIndex}
          activeIndexes={currentSpread.progressionIndexes}
          pageNumbers={pageNumbers}
          filmstripLayout={filmstripLayout}
          filmstripStartIndex={filmstripStartIndex}
          filmstripEndIndex={filmstripEndIndex}
          filmstripLoadStart={filmstripLoadStart}
          filmstripLoadEnd={filmstripLoadEnd}
          filmstripViewportWidth={filmstripViewportWidth}
          filmstripItemSize={filmstripItemSize}
          isFilmstripPositioned={isFilmstripPositioned}
          filmstripScrollRef={filmstripScrollRef}
          onFilmstripScroll={handleFilmstripScroll}
          onNavigate={index => onNavigate(buildReaderSpread(images, index, spreadOptions).anchorIndex)}
          thumbnailSize={thumbnailSize}
          blurEnabled={blurEnabled}
          demoMode={demoMode}
        />
      )}

      <div className="spread-reader__live-region" aria-live="polite" aria-atomic="true">
        {t('viewer.pageStatus', { range: pageRange })}
        {fullscreenPageLayout === 'spread' && isNarrowViewport ? ` ${t('viewer.spreadFallback')}` : ''}
      </div>
    </div>
  );
};
