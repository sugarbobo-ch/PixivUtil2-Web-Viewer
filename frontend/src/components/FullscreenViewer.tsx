import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { FullscreenZoomMode, ImageItem, SourceLink, VideoPreferencePatch, ViewerMode } from '../types';
import { getGroupPageNumbers } from '../utils/grouping';
import { buildMediaUrl, isVideoItem } from '../utils/media';
import { buildThumbnailUrl } from '../utils/webConfig';
import { fetchSourceLink } from '../utils/sourceLinks';
import { LocalOpenTarget, openLocalMedia } from '../utils/localFileActions';
import { copyTextToClipboard, getParentPath } from '../utils/clipboard';
import { MediaIssuePlaceholder } from './MediaIssuePlaceholder';
import { DemoMediaBlock } from './DemoMediaBlock';
import { imageLoadScheduler, useImageLoadPermission } from '../utils/imageLoadScheduler';
import { useViewerMediaAdmission } from '../hooks/useViewerMediaAdmission';
import { prefersReducedMotion } from '../utils/motion';
import { Button, IconButton } from './ui/Button';
import {
  buildFilmstripLayout,
  findIndexAtOffset,
  FilmstripLayout,
} from '../utils/viewerLayout';
import {
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Copy,
  Download,
  Expand,
  ExternalLink,
  Eye,
  EyeOff,
  FastForward,
  FlipHorizontal2,
  FlipVertical2,
  FolderOpen,
  Gauge,
  GalleryThumbnails,
  Grid2X2,
  Image as ImageIcon,
  Info,
  Layers,
  Lock,
  Maximize2,
  Minimize2,
  Minus,
  MoveHorizontal,
  MoveVertical,
  Pause,
  PanelTop,
  PanelTopDashed,
  Play,
  Plus,
  Presentation,
  RefreshCw,
  Rewind,
  RotateCcw,
  RotateCw,
  Scan,
  ScanSearch,
  ScrollText,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';

// Keep the existing 3.5rem square filmstrip design while virtualizing the
// horizontal track. The CSS uses the same values at the default root size.
const FILMSTRIP_ITEM_SIZE = 56;
const FILMSTRIP_GAP = 6;
const FILMSTRIP_EDGE_PADDING = 4;
const FILMSTRIP_BOUNDARY_WIDTH = 2;
const FILMSTRIP_BOUNDARY_MARGIN = 4;
const FILMSTRIP_VIRTUAL_OVERSCAN = 640;
const FILMSTRIP_LOAD_OVERSCAN = 96;
const MIN_ZOOM_PERCENT = 10;
const MAX_ZOOM_PERCENT = 800;
const ZOOM_STEP = 10;
const SWIPE_MIN_DISTANCE = 48;
const SWIPE_MIN_VELOCITY = 0.28;
const SWIPE_MAX_DURATION = 750;
const SWIPE_DIRECTION_BIAS = 1.2;
const SWIPE_MOVE_TOLERANCE = 12;
const WHEEL_NAVIGATION_SETTLE_MS = 100;
const VIDEO_CONTROLS_HIT_HEIGHT = 72;
const VIDEO_HOLD_DELAY_MS = 160;
const VIDEO_CENTER_ZONE_START = 0.35;
const VIDEO_CENTER_ZONE_END = 0.65;
const VIDEO_FEEDBACK_DURATION_MS = 700;
const VIDEO_FEEDBACK_EXIT_MS = 120;
const VIDEO_SINGLE_CLICK_DELAY_MS = 120;
const VIDEO_DOUBLE_CLICK_WINDOW_MS = 280;

type ZoomMode = 'auto' | 'lock' | 'width' | 'height' | 'fit' | 'fill' | 'custom';

const ZOOM_MODE_SHORTCUTS: Array<{
  mode: Exclude<ZoomMode, 'custom'>;
  key: string;
  code: KeyboardEvent['code'];
  label: string;
}> = [
  { mode: 'auto', key: '1', code: 'Numpad1', label: '自動縮放（不放大）' },
  { mode: 'lock', key: '2', code: 'Numpad2', label: '鎖定縮放比例' },
  { mode: 'width', key: '3', code: 'Numpad3', label: '符合視窗寬度' },
  { mode: 'height', key: '4', code: 'Numpad4', label: '符合視窗高度' },
  { mode: 'fit', key: '5', code: 'Numpad5', label: '適合視窗（可放大）' },
  { mode: 'fill', key: '6', code: 'Numpad6', label: '填滿視窗' },
];

interface Point {
  x: number;
  y: number;
}

interface StageSwipeGesture {
  pointerId: number;
  startX: number;
  startY: number;
  startedAt: number;
  canSwipe: boolean;
  moved: boolean;
}

interface VideoHoldGesture {
  pointerId: number;
  video: HTMLVideoElement;
  previousPlaybackRate: number;
  activationTimer: number | null;
  isActive: boolean;
}

type VideoFeedbackKind = 'play' | 'pause' | 'rewind' | 'forward' | 'speed';
type VideoFeedbackPhase = 'visible' | 'exiting';

interface VideoFeedback {
  kind: VideoFeedbackKind;
  label: string;
  id: number;
}

interface PreviousVideoDescriptor {
  url: string;
  style?: React.CSSProperties;
  isReady: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getVideoInteractionRatio = (
  event: { clientX: number; clientY: number },
  video: HTMLVideoElement,
): number | null => {
  const bounds = video.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  if (
    event.clientX < bounds.left
    || event.clientX > bounds.right
    || event.clientY < bounds.top
    || event.clientY > bounds.bottom
  ) return null;

  const controlsHeight = Math.min(
    VIDEO_CONTROLS_HIT_HEIGHT,
    Math.max(48, bounds.height * 0.14),
  );
  if (event.clientY >= bounds.bottom - controlsHeight) return null;

  return clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
};

interface FilmstripThumbnailProps {
  item: ImageItem;
  pageNumber: number;
  isNearCurrent: boolean;
  isVisible: boolean;
  thumbnailSize: number;
  blurEnabled: boolean;
  demoMode: boolean;
}

const FilmstripThumbnail = React.memo<FilmstripThumbnailProps>(({
  item,
  pageNumber,
  isNearCurrent,
  isVisible,
  thumbnailSize,
  blurEnabled,
  demoMode,
}) => {
  const url = buildThumbnailUrl(item, thumbnailSize);
  const loadEnabled = isNearCurrent || isVisible;
  const admitted = useImageLoadPermission({
    url,
    priority: 2,
    kind: 'thumbnail',
    owner: 'filmstrip',
    enabled: loadEnabled && !demoMode,
  });

  return (
    <span className="fullscreen-viewer__thumbnail-slot">
      {demoMode ? (
        <DemoMediaBlock dominantColor={item.dominant_color} />
      ) : admitted ? (
        <img
          src={url}
          alt={item.title || `P${pageNumber}`}
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
  preloadCount?: number;
  thumbnailSize: number;
  blurEnabled?: boolean;
  demoMode?: boolean;
  isMobileViewport?: boolean;
  groupMangaPosts?: boolean;
  onToggleGroupMangaPosts?: () => void;
  onToggleBlur?: () => void;
  simpleToolbar?: boolean;
  onSimpleToolbarChange?: (simpleMode: boolean) => void;
  /** Persistent preference for the initial visibility of the fullscreen toolbar. */
  showToolbarByDefault?: boolean;
  /** Persist changes made to the fullscreen toolbar visibility control. */
  onShowToolbarChange?: (showToolbar: boolean) => void;
  /** Persistent preference for the initial visibility of the gallery panel. */
  showFilmstripByDefault?: boolean;
  /** Persist changes made to the fullscreen gallery panel visibility control. */
  onShowFilmstripChange?: (showFilmstrip: boolean) => void;
  /** Persistent fullscreen defaults configured from the Web Viewer settings. */
  fullscreenShowCheckerboard?: boolean;
  /** Persist changes made to the fullscreen checkerboard control. */
  onCheckerboardChange?: (enabled: boolean) => void;
  fullscreenZoomMode?: FullscreenZoomMode;
  /** Persist named fullscreen zoom modes selected from the toolbar. */
  onZoomModeChange?: (mode: FullscreenZoomMode) => void;
  videoSeekSeconds?: number;
  videoHoldPlaybackRate?: number;
  videoMuted?: boolean;
  videoVolume?: number;
  videoAutoplay?: boolean;
  onVideoPreferenceChange?: (patch: VideoPreferencePatch) => void;
  pageOffset?: number;
  totalImages?: number;
  activeMode: ViewerMode;
  onChangeMode: (mode: ViewerMode) => void;
}

export const FullscreenViewer: React.FC<FullscreenViewerProps> = ({
  images,
  currentIndex,
  onClose,
  onNavigate,
  onDeleteCurrent,
  onNavigateNextWork,
  onNavigatePrevWork,
  preloadCount = 3,
  thumbnailSize,
  blurEnabled = false,
  demoMode = false,
  isMobileViewport = false,
  groupMangaPosts = false,
  onToggleGroupMangaPosts,
  onToggleBlur,
  simpleToolbar = true,
  onSimpleToolbarChange,
  showToolbarByDefault = true,
  onShowToolbarChange,
  showFilmstripByDefault = true,
  onShowFilmstripChange,
  fullscreenShowCheckerboard = true,
  fullscreenZoomMode = 'auto',
  onCheckerboardChange,
  onZoomModeChange,
  videoSeekSeconds = 5,
  videoHoldPlaybackRate = 2,
  videoMuted = false,
  videoVolume = 1,
  videoAutoplay = true,
  onVideoPreferenceChange,
  pageOffset = 0,
  totalImages = images.length,
  activeMode,
  onChangeMode,
}) => {
  const currentItem = images[currentIndex];
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
  const currentPageTotal = pageNumberState.pageTotals[currentIndex] ?? pageNumberState.totalPages;
  const currentMediaUrl = currentItem ? buildMediaUrl(currentItem) : '';
  const currentThumbnailUrl = currentItem ? buildThumbnailUrl(currentItem, thumbnailSize) : '';
  const currentItemIsVideo = currentItem ? isVideoItem(currentItem) : false;
  const shouldAutoplayVideo = videoAutoplay && !prefersReducedMotion();
  const {
    thumbnailAdmitted,
    markThumbnailLoaded,
    markThumbnailError,
  } = useViewerMediaAdmission({
    thumbnailUrl: currentThumbnailUrl,
    mediaUrl: currentMediaUrl,
    thumbnailPriority: 0,
    originalPriority: 0,
    thumbnailEnabled: Boolean(currentItem && !demoMode && !currentItemIsVideo && !currentItem.media_status),
    originalEnabled: false,
    owner: 'fullscreen',
  });
  const [showDetails, setShowDetails] = useState(false);
  const [sourceLink, setSourceLink] = useState<SourceLink | null>(null);
  const [isSourceLoading, setIsSourceLoading] = useState(false);
  const [openAction, setOpenAction] = useState<LocalOpenTarget | null>(null);
  const [openActionError, setOpenActionError] = useState<string | null>(null);
  const [copyAction, setCopyAction] = useState<LocalOpenTarget | null>(null);
  const [copyActionError, setCopyActionError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [displayedImageUrl, setDisplayedImageUrl] = useState<string | null>(null);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [originalLoadFailed, setOriginalLoadFailed] = useState(false);
  const [zoomMode, setZoomMode] = useState<ZoomMode>(fullscreenZoomMode);
  const [customZoomPercent, setCustomZoomPercent] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [naturalSizeMediaUrl, setNaturalSizeMediaUrl] = useState<string | null>(null);
  const [isMediaTransitionSuppressed, setIsMediaTransitionSuppressed] = useState(true);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
const [videoNaturalSize, setVideoNaturalSize] = useState({ width: 0, height: 0 });
const [videoNaturalSizeMediaUrl, setVideoNaturalSizeMediaUrl] = useState<string | null>(null);
const [videoReadyMediaUrl, setVideoReadyMediaUrl] = useState<string | null>(null);
const [videoFrameSize, setVideoFrameSize] = useState({ width: 0, height: 0 });
const [videoFeedback, setVideoFeedback] = useState<VideoFeedback | null>(null);
const [videoFeedbackPhase, setVideoFeedbackPhase] = useState<VideoFeedbackPhase>('visible');
  const [showToolbar, setShowToolbar] = useState(showToolbarByDefault);
const [showFilmstrip, setShowFilmstrip] = useState(showFilmstripByDefault);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [isMobileToolbarOpen, setIsMobileToolbarOpen] = useState(false);
  const [checkerboardEnabled, setCheckerboardEnabled] = useState(fullscreenShowCheckerboard);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [isSlideshowPlaying, setIsSlideshowPlaying] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const toolbarRestoreButtonRef = useRef<HTMLButtonElement>(null);
  const mobileToolbarToggleRef = useRef<HTMLButtonElement>(null);
  const mobileToolbarMenuRef = useRef<HTMLDivElement>(null);
  const mobileToolbarWasOpenRef = useRef(false);
  const mediaStackRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const panGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const stageSwipeGestureRef = useRef<StageSwipeGesture | null>(null);
  const suppressStageClickUntilRef = useRef(0);
  const wheelNavigationTargetRef = useRef<number | null>(null);
  const wheelNavigationBoundaryRef = useRef<1 | -1 | 0>(0);
  const wheelNavigationTimerRef = useRef<number | null>(null);
  const filmstripScrollRef = useRef<HTMLDivElement>(null);
  const hasPositionedFilmstrip = useRef(false);
  const filmstripScrollFrameRef = useRef<number | null>(null);
  const pendingFilmstripScrollLeftRef = useRef(0);
  const preloadedImagesRef = useRef(new Map<string, HTMLImageElement>());
  const preloadHandlesRef = useRef(new Map<string, { cancel: () => void }>());
  const navigationDirectionRef = useRef<1 | -1>(1);
  const displayedImageUrlRef = useRef(displayedImageUrl);
  const displayedImagePathRef = useRef<string | null>(null);
  const reloadRequestRef = useRef(0);
  const zoomModeRef = useRef<ZoomMode>(zoomMode);
  const mediaTransitionResetFrameRef = useRef<number | null>(null);
  const [isFilmstripPositioned, setIsFilmstripPositioned] = useState(false);
  const [filmstripScrollLeft, setFilmstripScrollLeft] = useState(0);
  const [filmstripViewportWidth, setFilmstripViewportWidth] = useState(720);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);
  const videoFrameRef = useRef<HTMLDivElement>(null);
  const videoHoldGestureRef = useRef<VideoHoldGesture | null>(null);
  const videoFeedbackTimerRef = useRef<number | null>(null);
  const copyFeedbackTimerRef = useRef<number | null>(null);
  const videoFeedbackSequenceRef = useRef(0);
  const videoSeekFeedbackRef = useRef<{ direction: -1 | 1; totalSeconds: number } | null>(null);
  const videoClickTimerRef = useRef<number | null>(null);
  const videoLastTapAtRef = useRef<number | null>(null);
  const videoClickPlaybackStateRef = useRef<boolean | null>(null);
  const suppressNextVideoClickRef = useRef(false);
  const previousVideoRef = useRef<PreviousVideoDescriptor | null>(null);
  const outgoingVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setShowToolbar(showToolbarByDefault);
  }, [showToolbarByDefault]);

  useEffect(() => {
    if (showToolbar) return undefined;

    const focusFrame = window.requestAnimationFrame(() => {
      toolbarRestoreButtonRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [showToolbar]);

  useEffect(() => {
    setShowFilmstrip(showFilmstripByDefault);
  }, [showFilmstripByDefault]);

  useEffect(() => {
    setCheckerboardEnabled(fullscreenShowCheckerboard);
  }, [fullscreenShowCheckerboard]);

  useEffect(() => {
    setZoomMode(fullscreenZoomMode);
    setCustomZoomPercent(100);
    setPan({ x: 0, y: 0 });
  }, [fullscreenZoomMode]);

  useEffect(() => {
    if (!isMobileToolbarOpen) {
      if (mobileToolbarWasOpenRef.current) {
        mobileToolbarWasOpenRef.current = false;
        mobileToolbarToggleRef.current?.focus({ preventScroll: true });
      }
      return undefined;
    }

    mobileToolbarWasOpenRef.current = true;
    const focusFrame = window.requestAnimationFrame(() => {
      const buttons = mobileToolbarMenuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      const firstVisibleButton = Array.from(buttons ?? []).find(button => button.getClientRects().length > 0);
      firstVisibleButton?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(focusFrame);
  }, [isMobileToolbarOpen]);

  useEffect(() => {
    if (!isMobileToolbarOpen) return undefined;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.fullscreen-viewer__mobile-toolbar-toggle, #fullscreen-mobile-toolbar')) return;
      setIsMobileToolbarOpen(false);
    };

    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
  }, [isMobileToolbarOpen]);

  useEffect(() => {
    zoomModeRef.current = zoomMode;
  }, [zoomMode]);

  const canOpenLocalMedia = Boolean(
    currentItem?.save_name
    && currentItem.media_status !== 'missing'
    && currentItem.media_status !== 'internal',
  );
  const currentFilePath = currentItem?.save_name ?? '';
  const currentFolderPath = currentFilePath ? getParentPath(currentFilePath) : '';
  const canCopyFilePath = Boolean(currentFilePath);
  const canCopyFolderPath = Boolean(currentFolderPath);
  const openMediaLabel = currentItemIsVideo ? '開啟影片' : '開啟圖片';
  // Keep the last decoded original visible while the next item is loading.
  // The navigation metadata can advance immediately, but the media surface
  // should not be cleared until the replacement is ready to paint.
  const visibleOriginalUrl = displayedImageUrl;
  const isDisplayedMediaCurrent = Boolean(
    currentItem
    && displayedImagePathRef.current === currentItem.save_name,
  );
  const showThumbnailPreview = thumbnailAdmitted
    && !thumbnailFailed
    && !Boolean(visibleOriginalUrl);
  const transformReady = Boolean(
    currentItem
    && !demoMode
    && !currentItemIsVideo
    && !currentItem.media_status
    && naturalSizeMediaUrl === (displayedImageUrl || currentMediaUrl)
    && naturalSize.width > 0
    && naturalSize.height > 0
    && stageSize.width > 0
    && stageSize.height > 0
  );
  const hasTransformableMedia = Boolean(
    currentItem
    && !demoMode
    && !currentItemIsVideo
    && !currentItem.media_status
  );
  const isMediaLoading = Boolean(
    hasTransformableMedia
    && !isDisplayedMediaCurrent
  );
  const suppressMediaTransitions = isMediaLoading || isMediaTransitionSuppressed;
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const isQuarterTurn = normalizedRotation === 90 || normalizedRotation === 270;
  const orientedNaturalWidth = isQuarterTurn ? naturalSize.height : naturalSize.width;
  const orientedNaturalHeight = isQuarterTurn ? naturalSize.width : naturalSize.height;
  // The image element is sized to its intrinsic content and constrained by
  // the stage. Keep the transform baseline in sync with that geometry so
  // small images are not scaled down just because the stage is larger.
  const baseMediaZoomPercent = transformReady
    ? Math.min(
      100,
      Math.min(stageSize.width / naturalSize.width, stageSize.height / naturalSize.height) * 100,
    )
    : 100;
  const widthZoomPercent = transformReady ? stageSize.width / orientedNaturalWidth * 100 : 100;
  const heightZoomPercent = transformReady ? stageSize.height / orientedNaturalHeight * 100 : 100;
  const fitZoomPercent = Math.min(widthZoomPercent, heightZoomPercent);
  const fillZoomPercent = Math.max(widthZoomPercent, heightZoomPercent);
  const autoZoomPercent = transformReady
    ? Math.min(100, fitZoomPercent)
    : 100;
  const effectiveZoomPercent = (() => {
    switch (zoomMode) {
      case 'auto': return autoZoomPercent;
      case 'width': return widthZoomPercent;
      case 'height': return heightZoomPercent;
      case 'fit': return fitZoomPercent;
      case 'fill': return fillZoomPercent;
      case 'lock':
      case 'custom':
      default: return customZoomPercent;
    }
  })();
  const renderScale = transformReady && baseMediaZoomPercent > 0
    ? effectiveZoomPercent / baseMediaZoomPercent
    : 1;
  const isPannable = transformReady && (
    orientedNaturalWidth * effectiveZoomPercent / 100 > stageSize.width + 1
    || orientedNaturalHeight * effectiveZoomPercent / 100 > stageSize.height + 1
  );

  const clampPan = useCallback((nextPan: Point, zoomPercent: number, nextRotation: number): Point => {
    if (
      naturalSize.width <= 0
      || naturalSize.height <= 0
      || stageSize.width <= 0
      || stageSize.height <= 0
    ) return { x: 0, y: 0 };

    const normalizedNextRotation = ((nextRotation % 360) + 360) % 360;
    const quarterTurn = normalizedNextRotation === 90 || normalizedNextRotation === 270;
    const contentWidth = (quarterTurn ? naturalSize.height : naturalSize.width) * zoomPercent / 100;
    const contentHeight = (quarterTurn ? naturalSize.width : naturalSize.height) * zoomPercent / 100;
    const maxX = Math.max(0, (contentWidth - stageSize.width) / 2);
    const maxY = Math.max(0, (contentHeight - stageSize.height) / 2);

    return {
      x: clamp(nextPan.x, -maxX, maxX),
      y: clamp(nextPan.y, -maxY, maxY),
    };
  }, [naturalSize.height, naturalSize.width, stageSize.height, stageSize.width]);

  const applyCustomZoom = useCallback((zoomPercent: number) => {
    const nextZoom = clamp(Math.round(zoomPercent), MIN_ZOOM_PERCENT, MAX_ZOOM_PERCENT);
    setZoomMode(current => current === 'lock' ? 'lock' : 'custom');
    setCustomZoomPercent(nextZoom);
    setPan(previous => clampPan(previous, nextZoom, rotation));
  }, [clampPan, rotation]);

  const zoomIn = useCallback(() => {
    if (!transformReady) return;
    applyCustomZoom(effectiveZoomPercent + ZOOM_STEP);
  }, [applyCustomZoom, effectiveZoomPercent, transformReady]);

  const zoomOut = useCallback(() => {
    if (!transformReady) return;
    applyCustomZoom(effectiveZoomPercent - ZOOM_STEP);
  }, [applyCustomZoom, effectiveZoomPercent, transformReady]);

  const showActualSize = useCallback(() => {
    if (!transformReady) return;
    setZoomMode(current => current === 'lock' ? 'lock' : 'custom');
    setCustomZoomPercent(100);
    setPan(previous => clampPan(previous, 100, rotation));
  }, [clampPan, rotation, transformReady]);

  const fitToViewer = useCallback(() => {
    setZoomMode('fit');
    setPan({ x: 0, y: 0 });
    onZoomModeChange?.('fit');
  }, [onZoomModeChange]);

  const applyZoomMode = useCallback((mode: Exclude<ZoomMode, 'custom'>) => {
    if (!transformReady) return;
    if (mode === 'lock') setCustomZoomPercent(Math.round(effectiveZoomPercent));
    setZoomMode(mode);
    setPan({ x: 0, y: 0 });
    onZoomModeChange?.(mode);
  }, [effectiveZoomPercent, onZoomModeChange, transformReady]);

  const rotateImage = useCallback((degrees: number) => {
    if (!transformReady) return;
    setRotation(previous => (previous + degrees + 360) % 360);
    setPan({ x: 0, y: 0 });
  }, [transformReady]);

  const mediaFrameStyle = React.useMemo<React.CSSProperties>(() => ({
    width: transformReady ? naturalSize.width * baseMediaZoomPercent / 100 : undefined,
    height: transformReady ? naturalSize.height * baseMediaZoomPercent / 100 : undefined,
    transform: `translate3d(${pan.x}px, ${pan.y}px, 0) rotate(${normalizedRotation}deg) scale(${renderScale * (flipHorizontal ? -1 : 1)}, ${renderScale * (flipVertical ? -1 : 1)})`,
  }), [
    baseMediaZoomPercent,
    flipHorizontal,
    flipVertical,
    naturalSize.height,
    naturalSize.width,
    normalizedRotation,
    pan.x,
    pan.y,
    renderScale,
    transformReady,
  ]);

  const videoDisplayStyle = React.useMemo<React.CSSProperties | undefined>(() => {
    if (
      videoNaturalSizeMediaUrl !== currentMediaUrl
      || videoNaturalSize.width <= 0
      || videoNaturalSize.height <= 0
      || videoFrameSize.width <= 0
      || videoFrameSize.height <= 0
    ) return undefined;

    const scale = Math.min(
      videoFrameSize.width / videoNaturalSize.width,
      videoFrameSize.height / videoNaturalSize.height,
    );
    if (!Number.isFinite(scale) || scale <= 0) return undefined;

    return {
      width: videoNaturalSize.width * scale,
      height: videoNaturalSize.height * scale,
      maxWidth: 'none',
      maxHeight: 'none',
    };
  }, [currentMediaUrl, videoFrameSize.height, videoFrameSize.width, videoNaturalSize.height, videoNaturalSize.width, videoNaturalSizeMediaUrl]);
  const isVideoReady = videoReadyMediaUrl === currentMediaUrl;
  const previousVideo = previousVideoRef.current;
  const showOutgoingVideo = Boolean(
    currentItemIsVideo
    && !demoMode
    && !currentItem?.media_status
    && !isVideoReady
    && previousVideo
    && previousVideo.url !== currentMediaUrl
    && previousVideo.isReady,
  );

  const filmstripLayout = React.useMemo<FilmstripLayout>(() => buildFilmstripLayout(images, {
    itemSize: FILMSTRIP_ITEM_SIZE,
    gap: FILMSTRIP_GAP,
    edgePadding: FILMSTRIP_EDGE_PADDING,
    boundaryWidth: FILMSTRIP_BOUNDARY_WIDTH,
    boundaryMargin: FILMSTRIP_BOUNDARY_MARGIN,
  }), [images]);

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
    if (mediaTransitionResetFrameRef.current !== null) {
      window.cancelAnimationFrame(mediaTransitionResetFrameRef.current);
      mediaTransitionResetFrameRef.current = null;
    }
    setIsMediaTransitionSuppressed(true);
    setThumbnailFailed(false);
    setOriginalLoadFailed(false);

    // A video/demo/invalid item does not use the previous image surface. For
    // ordinary image navigation, keep the previous decoded media and its
    // geometry until the replacement image has been decoded below.
    if (demoMode || currentItemIsVideo || !currentMediaUrl) {
      displayedImageUrlRef.current = null;
      displayedImagePathRef.current = null;
      setDisplayedImageUrl(null);
      setNaturalSize({ width: 0, height: 0 });
      setNaturalSizeMediaUrl(null);
      if (zoomModeRef.current !== 'lock') {
        setZoomMode(fullscreenZoomMode);
        setCustomZoomPercent(100);
      }
      setRotation(0);
      setFlipHorizontal(false);
      setFlipVertical(false);
      setPan({ x: 0, y: 0 });
      setIsPanning(false);
    }

    setShowShortcutHelp(false);
    setIsMobileToolbarOpen(false);
    setCopyActionError(null);
    setCopyFeedback(null);
    if (copyFeedbackTimerRef.current !== null) {
      window.clearTimeout(copyFeedbackTimerRef.current);
      copyFeedbackTimerRef.current = null;
    }
    panGestureRef.current = null;
    stageSwipeGestureRef.current = null;
    suppressStageClickUntilRef.current = 0;
  }, [currentItem?.save_name, currentItemIsVideo, currentMediaUrl, demoMode, fullscreenZoomMode]);

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
  }, []);

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

  const handleCopyPath = useCallback(async (target: LocalOpenTarget) => {
    const path = target === 'file' ? currentFilePath : currentFolderPath;
    if (!path) {
      setCopyActionError(target === 'folder'
        ? '目前檔案沒有可辨識的資料夾路徑。'
        : '目前沒有可複製的檔案路徑。');
      setCopyFeedback(null);
      return;
    }

    setCopyAction(target);
    setCopyActionError(null);
    try {
      await copyTextToClipboard(path);
      if (copyFeedbackTimerRef.current !== null) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }
      setCopyFeedback(target === 'folder' ? '已複製資料夾路徑' : '已複製檔案路徑');
      copyFeedbackTimerRef.current = window.setTimeout(() => {
        setCopyFeedback(null);
        copyFeedbackTimerRef.current = null;
      }, 1800);
    } catch (error) {
      setCopyActionError(error instanceof Error ? error.message : '無法複製路徑，請稍後再試。');
    } finally {
      setCopyAction(null);
    }
  }, [currentFilePath, currentFolderPath]);

  const handleShowToolbarChange = useCallback((nextValue: boolean) => {
    if (showToolbar === nextValue) return;
    setShowToolbar(nextValue);
    onShowToolbarChange?.(nextValue);
  }, [onShowToolbarChange, showToolbar]);

  const toggleShowToolbar = useCallback(() => {
    handleShowToolbarChange(!showToolbar);
  }, [handleShowToolbarChange, showToolbar]);

  const handleShowFilmstripChange = useCallback((nextValue: boolean) => {
    if (showFilmstrip === nextValue) return;
    setShowFilmstrip(nextValue);
    onShowFilmstripChange?.(nextValue);
  }, [onShowFilmstripChange, showFilmstrip]);

  const toggleShowFilmstrip = useCallback(() => {
    handleShowFilmstripChange(!showFilmstrip);
  }, [handleShowFilmstripChange, showFilmstrip]);

  const handleCheckerboardChange = useCallback((nextValue: boolean) => {
    if (checkerboardEnabled === nextValue) return;
    setCheckerboardEnabled(nextValue);
    onCheckerboardChange?.(nextValue);
  }, [checkerboardEnabled, onCheckerboardChange]);

  const toggleCheckerboard = useCallback(() => {
    handleCheckerboardChange(!checkerboardEnabled);
  }, [checkerboardEnabled, handleCheckerboardChange]);

  const handleShowToolbar = useCallback(() => {
    handleShowToolbarChange(true);
    window.requestAnimationFrame(() => {
      viewerRef.current?.focus({ preventScroll: true });
    });
  }, [handleShowToolbarChange]);

  useEffect(() => () => {
    if (copyFeedbackTimerRef.current !== null) {
      window.clearTimeout(copyFeedbackTimerRef.current);
    }
  }, []);

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

  useEffect(() => {
    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const viewer = viewerRef.current;
      if (!viewer) return;

      const focusableElements = Array.from(viewer.querySelectorAll<HTMLElement>([
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        'a[href]',
        '[tabindex]:not([tabindex="-1"])',
      ].join(', '))).filter(element => (
        !element.hasAttribute('aria-hidden')
        && element.getClientRects().length > 0
      ));

      if (focusableElements.length === 0) {
        event.preventDefault();
        viewer.focus({ preventScroll: true });
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      const activeFocusableIndex = activeElement instanceof HTMLElement
        ? focusableElements.indexOf(activeElement)
        : -1;

      if (!viewer.contains(activeElement) || activeFocusableIndex === -1) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleTabKey);
    return () => document.removeEventListener('keydown', handleTabKey);
  }, []);

  useLayoutEffect(() => {
    const mediaStack = mediaStackRef.current;
    if (!mediaStack) {
      setStageSize({ width: 0, height: 0 });
      return undefined;
    }

    const updateStageSize = () => {
      const nextSize = {
        width: mediaStack.clientWidth,
        height: mediaStack.clientHeight,
      };
      setStageSize(previous => (
        previous.width === nextSize.width && previous.height === nextSize.height
          ? previous
          : nextSize
      ));
    };

    updateStageSize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateStageSize);
    observer?.observe(mediaStack);
    window.addEventListener('resize', updateStageSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateStageSize);
    };
  }, [currentItem?.image_id, currentItem?.media_status, currentItemIsVideo]);

  useLayoutEffect(() => {
    const frame = videoFrameRef.current;
    if (!frame || !currentItemIsVideo || demoMode) {
      setVideoFrameSize({ width: 0, height: 0 });
      return undefined;
    }

    const updateFrameSize = () => {
      const nextSize = {
        width: frame.clientWidth,
        height: frame.clientHeight,
      };
      setVideoFrameSize(previous => (
        previous.width === nextSize.width && previous.height === nextSize.height
          ? previous
          : nextSize
      ));
    };

    updateFrameSize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateFrameSize);
    observer?.observe(frame);
    window.addEventListener('resize', updateFrameSize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateFrameSize);
    };
  }, [currentItem?.image_id, currentItemIsVideo, demoMode, showFilmstrip, showToolbar]);

  useLayoutEffect(() => {
    if (currentItemIsVideo && !demoMode && !currentItem?.media_status && currentMediaUrl && isVideoReady) {
      previousVideoRef.current = {
        url: currentMediaUrl,
        style: videoDisplayStyle,
        isReady: isVideoReady,
      };
    } else if (!currentItemIsVideo || demoMode || currentItem?.media_status || !currentMediaUrl) {
      previousVideoRef.current = null;
    }
  }, [currentItem?.media_status, currentItemIsVideo, currentMediaUrl, demoMode, isVideoReady, videoDisplayStyle]);

  useLayoutEffect(() => {
    if (showOutgoingVideo) {
      outgoingVideoRef.current?.pause();
    }
  }, [currentMediaUrl, showOutgoingVideo]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentItemIsVideo || demoMode) return;

    const shouldMuteVideo = videoMuted || videoVolume <= 0;
    if (video.muted !== shouldMuteVideo) video.muted = shouldMuteVideo;
    if (Math.abs(video.volume - videoVolume) > 0.001) video.volume = clamp(videoVolume, 0, 1);
  }, [currentItemIsVideo, currentMediaUrl, demoMode, isVideoReady, videoMuted, videoVolume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentItemIsVideo || demoMode || !isVideoReady) return;

    if (!shouldAutoplayVideo) {
      if (!video.paused) video.pause();
      return;
    }

    if ((video.paused || video.ended) && video.readyState >= 2) {
      try {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          void playPromise.catch(() => undefined);
        }
      } catch {
        // Browsers may reject unmuted autoplay before user interaction.
      }
    }
  }, [currentItemIsVideo, currentMediaUrl, demoMode, isVideoReady, shouldAutoplayVideo]);

  useEffect(() => {
    setPan(previous => {
      const next = clampPan(previous, effectiveZoomPercent, rotation);
      return next.x === previous.x && next.y === previous.y ? previous : next;
    });
  }, [clampPan, effectiveZoomPercent, rotation]);

  // Measure the horizontal viewport separately from the virtual track. The
  // track can be wider than the viewport without mounting every thumbnail.
  useLayoutEffect(() => {
    const container = filmstripScrollRef.current;
    if (!container || images.length <= 1) return undefined;

    const updateViewportWidth = () => {
      const nextWidth = Math.max(1, container.clientWidth);
      setFilmstripViewportWidth(previous => previous === nextWidth ? previous : nextWidth);
    };

    updateViewportWidth();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateViewportWidth);
    observer?.observe(container);
    window.addEventListener('resize', updateViewportWidth);
    return () => {
      window.removeEventListener('resize', updateViewportWidth);
      observer?.disconnect();
    };
  }, [images.length, showFilmstrip]);

  // Position the active item before the first paint so opening the viewer
  // never exposes the automatic centering scroll. This uses the virtual
  // offsets directly, so the active button does not need to be mounted first.
  useLayoutEffect(() => {
    const container = filmstripScrollRef.current;
    if (!container || images.length <= 1) return;

    const itemLeft = filmstripLayout.itemOffsets[currentIndex] ?? 0;
    const targetLeft = itemLeft - Math.max(0, (container.clientWidth - FILMSTRIP_ITEM_SIZE) / 2);
    const maxScrollLeft = Math.max(0, filmstripLayout.totalWidth - container.clientWidth);
    const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, targetLeft));

    if (Math.abs(container.scrollLeft - nextScrollLeft) > 0.5) {
      container.scrollTo({ left: nextScrollLeft, behavior: 'auto' });
    }
    setFilmstripScrollLeft(previous => Math.abs(previous - nextScrollLeft) < 0.5 ? previous : nextScrollLeft);

    if (!hasPositionedFilmstrip.current) {
      hasPositionedFilmstrip.current = true;
      setIsFilmstripPositioned(true);
    }
  }, [currentIndex, filmstripLayout, filmstripViewportWidth, images.length, showFilmstrip]);

  const handleFilmstripScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    pendingFilmstripScrollLeftRef.current = event.currentTarget.scrollLeft;
    if (filmstripScrollFrameRef.current !== null) return;

    filmstripScrollFrameRef.current = window.requestAnimationFrame(() => {
      filmstripScrollFrameRef.current = null;
      const nextScrollLeft = pendingFilmstripScrollLeftRef.current;
      setFilmstripScrollLeft(previous => Math.abs(previous - nextScrollLeft) < 0.5 ? previous : nextScrollLeft);
    });
  }, []);

  useEffect(() => () => {
    if (filmstripScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(filmstripScrollFrameRef.current);
    }
  }, []);

  useEffect(() => () => {
    if (mediaTransitionResetFrameRef.current !== null) {
      window.cancelAnimationFrame(mediaTransitionResetFrameRef.current);
    }
  }, []);

  // Dynamic configurable image preloader. Keep the query string identical to
  // the visible image URL so the browser can reuse the fetched response.
  useEffect(() => {
    if (demoMode) {
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
      return;
    }

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
        if (item && !item.media_status && item.save_name && !isVideoItem(item)) {
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
  }, [currentIndex, currentItem, currentItemIsVideo, currentMediaUrl, demoMode, images, preloadCount]);

  // Keep the previous image on screen until the next one has loaded and
  // decoded. Replacing the visible <img> with an unfinished request exposes a
  // bright one-frame flash, especially when switching from a dark artwork.
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
        // Apply the new item's default view only at the same moment that its
        // decoded pixels become visible. This keeps the outgoing image stable
        // while loading and prevents a blank/reset frame between items.
        if (zoomModeRef.current !== 'lock') {
          setZoomMode(fullscreenZoomMode);
          setCustomZoomPercent(100);
        }
        setRotation(0);
        setFlipHorizontal(false);
        setFlipVertical(false);
        setPan({ x: 0, y: 0 });
        setIsPanning(false);
        setNaturalSize({
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
          setNaturalSizeMediaUrl(currentMediaUrl);
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
      // If a later item fails, keep the already decoded outgoing image in
      // place instead of exposing an empty stage. Only clear the surface when
      // the failed request belongs to the image currently being displayed.
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
  }, [currentItem, currentItemIsVideo, currentMediaUrl, demoMode, fullscreenZoomMode]);

  const reloadCurrentMedia = useCallback(() => {
    if (demoMode || !currentItem || !currentMediaUrl) return;
    if (currentItemIsVideo) {
      videoRef.current?.load();
      void videoRef.current?.play().catch(() => undefined);
      return;
    }

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

  const toggleBrowserFullscreen = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const syncStateAfterRequest = () => {
      setIsBrowserFullscreen(document.fullscreenElement === viewer);
    };

    if (document.fullscreenElement === viewer) {
      void document.exitFullscreen().catch(syncStateAfterRequest);
      return;
    }

    void viewer.requestFullscreen().catch(syncStateAfterRequest);
  }, []);

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

  useEffect(() => {
    if (!isSlideshowPlaying) return undefined;
    if (prefersReducedMotion()) {
      setIsSlideshowPlaying(false);
      return undefined;
    }

    const timer = window.setInterval(() => {
      if (images.length <= 1) return;
      if (currentIndex < images.length - 1) onNavigate(currentIndex + 1);
      else onNavigate(0);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [currentIndex, images.length, isSlideshowPlaying, onNavigate]);

  const showVideoFeedback = useCallback((
    feedback: Omit<VideoFeedback, 'id'>,
    options: { persist?: boolean } = {},
  ) => {
    if (videoFeedbackTimerRef.current !== null) {
      window.clearTimeout(videoFeedbackTimerRef.current);
    }
    if (feedback.kind !== 'rewind' && feedback.kind !== 'forward') {
      videoSeekFeedbackRef.current = null;
    }
    const id = videoFeedbackSequenceRef.current + 1;
    videoFeedbackSequenceRef.current = id;
    setVideoFeedbackPhase('visible');
    setVideoFeedback({ ...feedback, id });
    if (options.persist) {
      videoFeedbackTimerRef.current = null;
      return;
    }
    videoFeedbackTimerRef.current = window.setTimeout(() => {
      setVideoFeedbackPhase('exiting');
      videoFeedbackTimerRef.current = window.setTimeout(() => {
        setVideoFeedback(null);
        setVideoFeedbackPhase('visible');
        videoSeekFeedbackRef.current = null;
        videoFeedbackTimerRef.current = null;
      }, VIDEO_FEEDBACK_EXIT_MS);
    }, VIDEO_FEEDBACK_DURATION_MS - VIDEO_FEEDBACK_EXIT_MS);
  }, []);

  const clearVideoFeedback = useCallback(() => {
    if (videoFeedbackTimerRef.current !== null) {
      window.clearTimeout(videoFeedbackTimerRef.current);
      videoFeedbackTimerRef.current = null;
    }
    setVideoFeedback(null);
    setVideoFeedbackPhase('visible');
    videoSeekFeedbackRef.current = null;
  }, []);

  const clearVideoClick = useCallback(() => {
    if (videoClickTimerRef.current !== null) {
      window.clearTimeout(videoClickTimerRef.current);
      videoClickTimerRef.current = null;
    }
  }, []);

  const toggleVideoPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused || video.ended) {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        void playPromise.catch(() => undefined);
      }
      showVideoFeedback({ kind: 'play', label: '播放' });
    } else {
      video.pause();
      showVideoFeedback({ kind: 'pause', label: '暫停' });
    }
  }, [showVideoFeedback]);

  const releaseVideoHold = useCallback((clearFeedback = true) => {
    const gesture = videoHoldGestureRef.current;
    if (!gesture) return;

    if (gesture.activationTimer !== null) {
      window.clearTimeout(gesture.activationTimer);
    }
    if (gesture.isActive) {
      gesture.video.playbackRate = gesture.previousPlaybackRate;
      if (clearFeedback) clearVideoFeedback();
    }
    videoHoldGestureRef.current = null;
  }, [clearVideoFeedback]);

  useEffect(() => {
    releaseVideoHold();
    clearVideoFeedback();
    clearVideoClick();
    videoLastTapAtRef.current = null;
    videoClickPlaybackStateRef.current = null;
    suppressNextVideoClickRef.current = false;
    setVideoNaturalSize({ width: 0, height: 0 });
    setVideoNaturalSizeMediaUrl(null);
    setVideoReadyMediaUrl(null);
  }, [clearVideoClick, clearVideoFeedback, currentItem?.image_id, currentItemIsVideo, currentMediaUrl, demoMode, releaseVideoHold]);

  useEffect(() => () => {
    releaseVideoHold(false);
  }, [releaseVideoHold]);

  useEffect(() => () => {
    if (videoFeedbackTimerRef.current !== null) {
      window.clearTimeout(videoFeedbackTimerRef.current);
    }
    clearVideoClick();
  }, [clearVideoClick]);

  const handleVideoLoadedMetadata = useCallback((event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    const shouldMuteVideo = videoMuted || videoVolume <= 0;
    if (video.muted !== shouldMuteVideo) video.muted = shouldMuteVideo;
    if (Math.abs(video.volume - videoVolume) > 0.001) video.volume = clamp(videoVolume, 0, 1);
    if (video.videoWidth <= 0 || video.videoHeight <= 0) return;
    setVideoNaturalSize({
      width: video.videoWidth,
      height: video.videoHeight,
    });
    setVideoNaturalSizeMediaUrl(currentMediaUrl);
  }, [currentMediaUrl, videoMuted, videoVolume]);

  const handleVideoLoadedData = useCallback((event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      setVideoNaturalSize({
        width: video.videoWidth,
        height: video.videoHeight,
      });
      setVideoNaturalSizeMediaUrl(currentMediaUrl);
    }
    setVideoReadyMediaUrl(currentMediaUrl);
  }, [currentMediaUrl]);

  const handleVideoVolumeChange = useCallback((event: React.SyntheticEvent<HTMLVideoElement>) => {
    const volume = clamp(event.currentTarget.volume, 0, 1);
    const isMuted = event.currentTarget.muted || volume <= 0;
    onVideoPreferenceChange?.({
      videoMuted: isMuted,
      videoVolume: isMuted ? 0 : volume,
    });
  }, [onVideoPreferenceChange]);

  const seekVideo = useCallback((seconds: number, playbackWasPaused?: boolean | null) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const shouldRemainPaused = playbackWasPaused ?? (video.paused || video.ended);
    const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    video.currentTime = clamp(currentTime + seconds, 0, video.duration);
    const direction: -1 | 1 = seconds < 0 ? -1 : 1;
    const previous = videoSeekFeedbackRef.current;
    const totalSeconds = previous?.direction === direction
      ? previous.totalSeconds + Math.abs(seconds)
      : Math.abs(seconds);
    videoSeekFeedbackRef.current = { direction, totalSeconds };
    showVideoFeedback({
      kind: direction < 0 ? 'rewind' : 'forward',
      label: `${direction < 0 ? '倒轉' : '快轉'} ${totalSeconds} 秒`,
    });
    if (shouldRemainPaused) {
      if (!video.paused) video.pause();
    } else if (video.paused || video.ended) {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        void playPromise.catch(() => undefined);
      }
    }
  }, [showVideoFeedback]);

  const handleVideoClick = useCallback((event: React.MouseEvent<HTMLVideoElement>) => {
    event.stopPropagation();
    if (suppressNextVideoClickRef.current) {
      suppressNextVideoClickRef.current = false;
      clearVideoClick();
      videoLastTapAtRef.current = null;
      videoClickPlaybackStateRef.current = null;
      return;
    }

    const ratio = getVideoInteractionRatio(event, event.currentTarget);
    if (ratio === null) {
      clearVideoClick();
      videoLastTapAtRef.current = null;
      videoClickPlaybackStateRef.current = null;
      return;
    }

    event.preventDefault();
    const now = Date.now();
    const previousTapAt = videoLastTapAtRef.current;
    const hasPreviousTap = previousTapAt !== null;
    const isWithinDoubleClickWindow = hasPreviousTap
      && now - previousTapAt <= VIDEO_DOUBLE_CLICK_WINDOW_MS;
    // Pair taps ourselves so the browser's cumulative event.detail (3, 4, ...)
    // cannot turn a single click into another seek.
    if (isWithinDoubleClickWindow) {
      clearVideoClick();
      const playbackWasPaused = hasPreviousTap
        ? videoClickPlaybackStateRef.current ?? (event.currentTarget.paused || event.currentTarget.ended)
        : (event.currentTarget.paused || event.currentTarget.ended);
      videoLastTapAtRef.current = null;
      videoClickPlaybackStateRef.current = null;
      seekVideo(ratio < 0.5 ? -videoSeekSeconds : videoSeekSeconds, playbackWasPaused);
      return;
    }

    if (previousTapAt === null || now - previousTapAt > VIDEO_DOUBLE_CLICK_WINDOW_MS) {
      videoClickPlaybackStateRef.current = null;
    }
    videoLastTapAtRef.current = now;
    videoClickPlaybackStateRef.current = event.currentTarget.paused || event.currentTarget.ended;
    clearVideoClick();
    videoClickTimerRef.current = window.setTimeout(() => {
      videoClickTimerRef.current = null;
      toggleVideoPlayback();
    }, VIDEO_SINGLE_CLICK_DELAY_MS);
  }, [clearVideoClick, seekVideo, toggleVideoPlayback, videoSeekSeconds]);

  const handleVideoPointerDown = useCallback((event: React.PointerEvent<HTMLVideoElement>) => {
    event.stopPropagation();
    if (event.button !== 0) return;

    clearVideoClick();
    const ratio = getVideoInteractionRatio(event, event.currentTarget);
    if (
      ratio === null
      || (ratio >= VIDEO_CENTER_ZONE_START && ratio <= VIDEO_CENTER_ZONE_END)
    ) return;

    releaseVideoHold();
    const gesture: VideoHoldGesture = {
      pointerId: event.pointerId,
      video: event.currentTarget,
      previousPlaybackRate: event.currentTarget.playbackRate,
      activationTimer: null,
      isActive: false,
    };
    videoHoldGestureRef.current = gesture;
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Some embedded browsers expose the method but reject capture on media.
      }
    }
    gesture.activationTimer = window.setTimeout(() => {
      if (videoHoldGestureRef.current !== gesture) return;
      gesture.isActive = true;
      videoLastTapAtRef.current = null;
      videoClickPlaybackStateRef.current = null;
      gesture.video.playbackRate = videoHoldPlaybackRate;
      showVideoFeedback(
        { kind: 'speed', label: `${videoHoldPlaybackRate} 倍速` },
        { persist: true },
      );
      if (gesture.video.paused) {
        const playPromise = gesture.video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          void playPromise.catch(() => undefined);
        }
      }
    }, VIDEO_HOLD_DELAY_MS);
  }, [clearVideoClick, releaseVideoHold, showVideoFeedback, videoHoldPlaybackRate]);

  const handleVideoPointerEnd = useCallback((event: React.PointerEvent<HTMLVideoElement>) => {
    const gesture = videoHoldGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (gesture.isActive) {
      suppressNextVideoClickRef.current = true;
    }
    releaseVideoHold();
  }, [releaseVideoHold]);

  const handlePanPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPannable || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
    setIsPanning(true);
  }, [isPannable, pan.x, pan.y]);

  const handlePanPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = panGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    setPan(clampPan({
      x: gesture.originX + event.clientX - gesture.startX,
      y: gesture.originY + event.clientY - gesture.startY,
    }, effectiveZoomPercent, rotation));
  }, [clampPan, effectiveZoomPercent, rotation]);

  const endPanGesture = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (panGestureRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panGestureRef.current = null;
    setIsPanning(false);
  }, []);

  const handleStagePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;

    suppressStageClickUntilRef.current = 0;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('button, input, select, textarea, video, [contenteditable="true"]')) return;

    stageSwipeGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
      canSwipe: !isPannable && !currentItemIsVideo,
      moved: false,
    };

  }, [currentItemIsVideo, isPannable]);

  const handleStagePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = stageSwipeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance >= SWIPE_MOVE_TOLERANCE) gesture.moved = true;

    if (Math.abs(deltaX) >= Math.abs(deltaY) * SWIPE_DIRECTION_BIAS && Math.abs(deltaX) >= SWIPE_MOVE_TOLERANCE) {
      event.preventDefault();
    }
  }, []);

  const handleStagePointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = stageSwipeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const distanceX = Math.abs(deltaX);
    const elapsed = Math.max(1, performance.now() - gesture.startedAt);
    const velocity = distanceX / elapsed;
    const isHorizontal = distanceX >= Math.abs(deltaY) * SWIPE_DIRECTION_BIAS;
    const isSwipe = event.type === 'pointerup'
      && gesture.canSwipe
      && isHorizontal
      && distanceX >= SWIPE_MIN_DISTANCE
      && velocity >= SWIPE_MIN_VELOCITY
      && elapsed <= SWIPE_MAX_DURATION;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    stageSwipeGestureRef.current = null;

    if (gesture.moved || isSwipe) {
      suppressStageClickUntilRef.current = performance.now() + 350;
    }

    if (!isSwipe) return;

    event.preventDefault();
    event.stopPropagation();
    if (deltaX < 0) handleNext();
    else handlePrev();
  }, [handleNext, handlePrev]);

  const handleStageClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (performance.now() < suppressStageClickUntilRef.current) {
      suppressStageClickUntilRef.current = 0;
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('video')) return;

    if (event.target === event.currentTarget) {
      if (currentItemIsVideo) {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left + bounds.width / 2) handlePrev();
        else handleNext();
        return;
      }
      onClose();
      return;
    }
    if (target?.closest('button, input, select, textarea, [contenteditable="true"]')) return;

    const mediaSurface = target?.closest<HTMLElement>('.fullscreen-viewer__media-stack, .fullscreen-viewer__video-frame, .fullscreen-viewer__issue-frame');
    if (!mediaSurface) return;

    const bounds = mediaSurface.getBoundingClientRect();
    if (event.clientX < bounds.left + bounds.width / 2) handlePrev();
    else handleNext();
  }, [currentItemIsVideo, handleNext, handlePrev, onClose]);

  const flushWheelNavigation = useCallback(() => {
    wheelNavigationTimerRef.current = null;
    const targetIndex = wheelNavigationTargetRef.current;
    const boundaryDirection = wheelNavigationBoundaryRef.current;
    wheelNavigationTargetRef.current = null;
    wheelNavigationBoundaryRef.current = 0;

    if (targetIndex !== null && targetIndex !== currentIndex) {
      navigationDirectionRef.current = targetIndex > currentIndex ? 1 : -1;
      onNavigate(targetIndex);
      return;
    }

    if (boundaryDirection > 0) handleNext();
    else if (boundaryDirection < 0) handlePrev();
  }, [currentIndex, handleNext, handlePrev, onNavigate]);

  // If another navigation source changes the current item while a wheel burst
  // is pending, discard the stale target instead of jumping from an old index.
  useEffect(() => {
    wheelNavigationTargetRef.current = null;
    wheelNavigationBoundaryRef.current = 0;
    if (wheelNavigationTimerRef.current !== null) {
      window.clearTimeout(wheelNavigationTimerRef.current);
      wheelNavigationTimerRef.current = null;
    }
  }, [currentIndex]);

  useEffect(() => () => {
    if (wheelNavigationTimerRef.current !== null) {
      window.clearTimeout(wheelNavigationTimerRef.current);
    }
  }, []);

  // Wheel over the filmstrip pans its native horizontal scroller. Wheel Up /
  // Wheel Down elsewhere contributes exactly one image per non-zero wheel
  // event. A short trailing settle window coalesces a rapid burst, so only
  // the final stopped-on image is committed and loaded.
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!(e.target instanceof Node) || !viewerRef.current?.contains(e.target)) return;

      const target = e.target instanceof Element ? e.target : null;
      if (e.ctrlKey && transformReady && e.deltaY !== 0) {
        e.preventDefault();
        e.stopPropagation();
        if (e.deltaY < 0) zoomIn();
        else zoomOut();
        return;
      }
      const toolbar = target?.closest('.fullscreen-viewer__topbar-actions');
      if (toolbar) {
        const toolbarCenter = toolbar.querySelector<HTMLElement>('.fullscreen-viewer__toolbar-center');
        const rawDelta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        e.preventDefault();
        e.stopPropagation();
        if (toolbarCenter && toolbarCenter.scrollWidth > toolbarCenter.clientWidth && rawDelta !== 0) {
          toolbarCenter.scrollLeft += rawDelta;
        } else if (toolbar instanceof HTMLElement && toolbar.scrollWidth > toolbar.clientWidth && rawDelta !== 0) {
          toolbar.scrollLeft += rawDelta;
        }
        return;
      }
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
      const direction: 1 | -1 = e.deltaY > 0 ? 1 : -1;
      const currentTarget = wheelNavigationTargetRef.current ?? currentIndex;
      const nextTarget = currentTarget + direction;

      if (nextTarget < 0) {
        wheelNavigationTargetRef.current = 0;
        wheelNavigationBoundaryRef.current = -1;
      } else if (nextTarget >= images.length) {
        wheelNavigationTargetRef.current = Math.max(0, images.length - 1);
        wheelNavigationBoundaryRef.current = 1;
      } else {
        wheelNavigationTargetRef.current = nextTarget;
        wheelNavigationBoundaryRef.current = 0;
      }

      if (wheelNavigationTimerRef.current !== null) {
        window.clearTimeout(wheelNavigationTimerRef.current);
      }

      wheelNavigationTimerRef.current = window.setTimeout(
        flushWheelNavigation,
        WHEEL_NAVIGATION_SETTLE_MS,
      );
    },
    [currentIndex, flushWheelNavigation, images.length, transformReady, zoomIn, zoomOut]
  );

  useEffect(() => {
    document.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => document.removeEventListener('wheel', handleWheel, true);
  }, [handleWheel]);

  // Keyboard shortcuts follow the ImageGlass conventions where they do not
  // conflict with the viewer's established J/K and arrow navigation.
  // Consume navigation events so the page behind the dialog cannot scroll.
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!(e.target instanceof Node) || !viewerRef.current?.contains(e.target)) return;

    const target = e.target instanceof Element ? e.target : null;
    const isVideoTarget = Boolean(target?.closest('video'));
    const isInteractiveTarget = Boolean(target?.closest('button, input, textarea, select, [contenteditable="true"]'));

    if (e.key === 'F1') {
      e.preventDefault();
      e.stopPropagation();
      setShowShortcutHelp(open => !open);
      return;
    }

    if (e.key === 'Escape' && showShortcutHelp) {
      e.preventDefault();
      e.stopPropagation();
      setShowShortcutHelp(false);
      return;
    }

    if (e.key === 'Escape' && isMobileToolbarOpen) {
      e.preventDefault();
      e.stopPropagation();
      setIsMobileToolbarOpen(false);
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }

    const isFilmstripTarget = Boolean(target?.closest('.fullscreen-viewer__thumbnail'));
    const isFilmstripNavigationKey = e.key === 'ArrowRight'
      || e.key === 'ArrowDown'
      || e.key === 'PageDown'
      || e.key === 'k'
      || e.key === 'K'
      || e.key === 'ArrowLeft'
      || e.key === 'ArrowUp'
      || e.key === 'PageUp'
      || e.key === 'j'
      || e.key === 'J';

    if (isFilmstripTarget && isFilmstripNavigationKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'k' || e.key === 'K') {
        handleNext();
      } else {
        handlePrev();
      }
      viewerRef.current?.focus({ preventScroll: true });
      return;
    }

    // Keep unmodified horizontal arrows native to a focused video so the
    // browser can seek its timeline. Other viewer shortcuts must still work
    // while the video itself owns focus (for example T, G and F).
    const shouldPreserveVideoTimelineControl = isVideoTarget
      && !e.ctrlKey
      && !e.altKey
      && !e.metaKey
      && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');

    if (shouldPreserveVideoTimelineControl || isInteractiveTarget) return;

    const zoomModeShortcut = !e.ctrlKey && !e.altKey && !e.metaKey
      ? ZOOM_MODE_SHORTCUTS.find(item => item.key === e.key || item.code === e.code)
      : undefined;

    if (zoomModeShortcut) {
      e.preventDefault();
      e.stopPropagation();
      applyZoomMode(zoomModeShortcut.mode);
    } else if (!e.altKey && !e.metaKey && (e.key === '+' || e.code === 'NumpadAdd' || (e.ctrlKey && e.key === '='))) {
      e.preventDefault();
      e.stopPropagation();
      zoomIn();
    } else if (!e.altKey && !e.metaKey && (e.key === '-' || e.code === 'NumpadSubtract')) {
      e.preventDefault();
      e.stopPropagation();
      zoomOut();
    } else if (e.ctrlKey && e.key === '0') {
      e.preventDefault();
      e.stopPropagation();
      showActualSize();
    } else if (e.ctrlKey && (e.key === 'm' || e.key === 'M')) {
      e.preventDefault();
      e.stopPropagation();
      fitToViewer();
    } else if (e.ctrlKey && e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      rotateImage(90);
    } else if (e.ctrlKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      rotateImage(-90);
    } else if (e.ctrlKey && (e.key === 'h' || e.key === 'H')) {
      e.preventDefault();
      e.stopPropagation();
      if (transformReady) setFlipHorizontal(value => !value);
    } else if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault();
      e.stopPropagation();
      if (transformReady) setFlipVertical(value => !value);
    } else if (e.key === 'Home') {
      e.preventDefault();
      e.stopPropagation();
      onNavigate(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      onNavigate(Math.max(0, images.length - 1));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      e.stopPropagation();
      handleNext();
      viewerRef.current?.focus({ preventScroll: true });
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'j' || e.key === 'J') {
      e.preventDefault();
      e.stopPropagation();
      handlePrev();
      viewerRef.current?.focus({ preventScroll: true });
    } else if ((e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      e.stopPropagation();
      setShowDetails(value => !value);
    } else if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      e.stopPropagation();
      toggleShowToolbar();
      setIsMobileToolbarOpen(false);
    } else if ((e.key === 'g' || e.key === 'G') && images.length > 1) {
      e.preventDefault();
      e.stopPropagation();
      toggleShowFilmstrip();
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      e.stopPropagation();
      reloadCurrentMedia();
    } else if (e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      e.stopPropagation();
      toggleCheckerboard();
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      e.stopPropagation();
      toggleBrowserFullscreen();
    } else if ((e.key === 's' || e.key === 'S') && images.length > 1) {
      e.preventDefault();
      e.stopPropagation();
      setIsSlideshowPlaying(value => !value);
    } else if ((e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space') && !e.repeat) {
      e.preventDefault();
      e.stopPropagation();
      toggleVideoPlayback();
    } else if (e.key === 'Delete' && onDeleteCurrent && currentItem) {
      e.preventDefault();
      e.stopPropagation();
      onDeleteCurrent(currentItem.image_id);
    }
  }, [
    applyZoomMode,
    currentItem,
    fitToViewer,
    handleNext,
    handlePrev,
    toggleCheckerboard,
    toggleShowFilmstrip,
    toggleShowToolbar,
    images.length,
    onClose,
    onDeleteCurrent,
    onNavigate,
    rotateImage,
    reloadCurrentMedia,
    isMobileToolbarOpen,
    showActualSize,
    showShortcutHelp,
    toggleVideoPlayback,
    transformReady,
    toggleBrowserFullscreen,
    zoomIn,
    zoomOut,
  ]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  const filmstripStartIndex = images.length > 0
    ? Math.max(
      0,
      findIndexAtOffset(
        filmstripLayout.itemOffsets,
        Math.max(0, filmstripScrollLeft - FILMSTRIP_VIRTUAL_OVERSCAN),
      ),
    )
    : 0;
  const filmstripEndIndex = images.length > 0
    ? Math.min(
      images.length,
      findIndexAtOffset(
        filmstripLayout.itemOffsets,
        filmstripScrollLeft + filmstripViewportWidth + FILMSTRIP_VIRTUAL_OVERSCAN,
      ) + 1,
    )
    : 0;
  const filmstripLoadStart = filmstripScrollLeft - FILMSTRIP_LOAD_OVERSCAN;
  const filmstripLoadEnd = filmstripScrollLeft + filmstripViewportWidth + FILMSTRIP_LOAD_OVERSCAN;

  if (!currentItem) return null;

  const mediaUrl = currentMediaUrl;
  const renderZoomModeIcon = (mode: Exclude<ZoomMode, 'custom'>) => {
    const iconClassName = 'w-5 h-5';
    switch (mode) {
      case 'auto': return <ScanSearch className={iconClassName} aria-hidden="true" />;
      case 'lock': return <Lock className={iconClassName} aria-hidden="true" />;
      case 'width': return <MoveHorizontal className={iconClassName} aria-hidden="true" />;
      case 'height': return <MoveVertical className={iconClassName} aria-hidden="true" />;
      case 'fit': return <Minimize2 className={iconClassName} aria-hidden="true" />;
      case 'fill': return <Expand className={iconClassName} aria-hidden="true" />;
      default: return null;
    }
  };

  return (
    <div
      ref={viewerRef}
      role="dialog"
      aria-modal="true"
      aria-label={currentItem.title || 'Image preview'}
      tabIndex={-1}
      className={`fullscreen-viewer animate-fadeIn${checkerboardEnabled ? ' is-checkerboard' : ''}${blurEnabled ? ' is-blur-enabled' : ''}${demoMode ? ' is-demo-mode' : ''}${showToolbar ? '' : ' is-toolbar-hidden'}${images.length > 1 && showFilmstrip ? ' has-filmstrip' : ''}`}
    >
      {/* Top Header Bar */}
      <div className={`fullscreen-viewer__topbar${showToolbar ? '' : ' is-toolbar-hidden'}`}>
        <div className="fullscreen-viewer__topbar-group">
          <span className="fullscreen-viewer__counter">
            {pageNumberState.pageNumbers[currentIndex] ?? pageOffset + currentIndex + 1} / {currentPageTotal}
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

        <div className="fullscreen-viewer__mobile-toolbar-toggle">
          <IconButton
            ref={mobileToolbarToggleRef}
            type="button"
            onClick={() => setIsMobileToolbarOpen(value => !value)}
            aria-expanded={isMobileToolbarOpen}
            aria-controls="fullscreen-mobile-toolbar"
            aria-label={isMobileToolbarOpen ? '關閉工具列' : '開啟工具列'}
            variant={isMobileToolbarOpen ? 'primary' : 'ghost'}
            title={isMobileToolbarOpen ? '關閉工具列' : '開啟工具列'}
          >
            <PanelTopDashed className="w-5 h-5" aria-hidden="true" />
          </IconButton>
        </div>

        <div className="fullscreen-viewer__mobile-details-toggle">
          <IconButton
            type="button"
            onClick={() => setShowDetails(value => !value)}
            aria-label={showDetails ? '隱藏圖片詳細資訊' : '顯示圖片詳細資訊'}
            aria-pressed={showDetails}
            aria-controls="fullscreen-details-panel"
            variant={showDetails ? 'primary' : 'plain'}
            title="圖片資訊 (I)"
          >
            <Info className="w-5 h-5" aria-hidden="true" />
          </IconButton>
        </div>

        <div
          ref={mobileToolbarMenuRef}
          id="fullscreen-mobile-toolbar"
          role="region"
          aria-label="手機工具列"
          className={`fullscreen-viewer__topbar-actions${simpleToolbar ? ' is-simple' : ''}${isMediaLoading ? ' is-media-loading' : ''}${isMobileToolbarOpen ? ' is-mobile-open' : ''}`}
        >
          <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--navigation fullscreen-viewer__toolbar-navigation" role="group" aria-label="圖片導覽">
            <IconButton
              type="button"
              onClick={handlePrev}
              disabled={currentIndex <= 0}
              variant="ghost"
              aria-label="上一張圖片"
              data-mobile-label="上一頁"
              title="上一張 (← / J)"
            >
              <ChevronLeft className="w-5 h-5" aria-hidden="true" />
            </IconButton>
            <IconButton
              type="button"
              onClick={handleNext}
              disabled={currentIndex >= images.length - 1}
              variant="ghost"
              aria-label="下一張圖片"
              data-mobile-label="下一頁 >"
              className="fullscreen-viewer__toolbar-next"
              title="下一張 (→ / K)"
            >
              <ChevronRight className="w-5 h-5" aria-hidden="true" />
            </IconButton>
          </div>

          <div className="fullscreen-viewer__toolbar-center">
            <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--mode fullscreen-viewer__mode-switcher" role="group" aria-label="閱讀模式">
            <span className="fullscreen-viewer__mobile-group-heading" aria-hidden="true">
              <Maximize2 className="h-4 w-4" />
              <span>閱讀模式</span>
            </span>
            <IconButton
              type="button"
              onClick={() => onChangeMode('fullscreen')}
              aria-pressed={activeMode === 'fullscreen'}
              variant={activeMode === 'fullscreen' ? 'primary' : 'ghost'}
              aria-label="切換至單張檢視"
              className="fullscreen-viewer__mode-button"
              data-mobile-label="單張"
              title="單張檢視"
            >
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
            </IconButton>
            <IconButton
              type="button"
              onClick={() => onChangeMode('webtoon')}
              aria-pressed={activeMode === 'webtoon'}
              variant={activeMode === 'webtoon' ? 'primary' : 'ghost'}
              aria-label="切換至條漫檢視"
              className="fullscreen-viewer__mode-button"
              data-mobile-label="條漫"
              title="條漫檢視"
            >
              <ScrollText className="h-4 w-4" aria-hidden="true" />
            </IconButton>
            </div>

            <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--zoom fullscreen-viewer__zoom-controls" role="group" aria-label="圖片縮放">
            <span className="fullscreen-viewer__mobile-group-heading" aria-hidden="true">
              <ScanSearch className="h-4 w-4" />
              <span>圖片縮放</span>
            </span>
            <IconButton
              type="button"
              onClick={zoomOut}
              disabled={!hasTransformableMedia || effectiveZoomPercent <= MIN_ZOOM_PERCENT}
              variant="ghost"
              aria-label="縮小圖片"
              title="縮小 (-／Num-)"
            >
              <Minus className="w-5 h-5" aria-hidden="true" />
            </IconButton>
            <span className="fullscreen-viewer__zoom-current" aria-live="polite" aria-atomic="true">
              {Math.round(effectiveZoomPercent)}%
            </span>
            <IconButton
              type="button"
              onClick={zoomIn}
              disabled={!hasTransformableMedia || effectiveZoomPercent >= MAX_ZOOM_PERCENT}
              variant="ghost"
              aria-label="放大圖片"
              title="放大 (+／Num+)"
            >
              <Plus className="w-5 h-5" aria-hidden="true" />
            </IconButton>
            <IconButton
              type="button"
              onClick={showActualSize}
              disabled={!hasTransformableMedia}
              variant="ghost"
              aria-label={`目前縮放 ${Math.round(effectiveZoomPercent)}%，切換至原始大小`}
              className="fullscreen-viewer__zoom-value"
              data-mobile-label="原始比例"
              title="原始大小 (Ctrl + 0)"
            >
              <ScanSearch className="w-5 h-5" aria-hidden="true" />
            </IconButton>
              {simpleToolbar && (
                <IconButton
                  type="button"
                  onClick={fitToViewer}
                  disabled={!hasTransformableMedia}
                  aria-pressed={zoomMode === 'fit'}
                  variant={zoomMode === 'fit' ? 'primary' : 'ghost'}
                  aria-label="使圖片適合視窗"
                  title="適合視窗 (Ctrl + M)"
                >
                  <Scan className="w-5 h-5" aria-hidden="true" />
                </IconButton>
              )}
            </div>

            {!simpleToolbar && (
              <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--zoom-modes fullscreen-viewer__zoom-modes" role="group" aria-label="圖片縮放模式">
                <span className="fullscreen-viewer__mobile-group-heading" aria-hidden="true">
                  <Scan className="h-4 w-4" />
                  <span>圖片縮放模式</span>
                </span>
                {ZOOM_MODE_SHORTCUTS.map(item => (
                  <IconButton
                    key={item.mode}
                    type="button"
                    onClick={() => applyZoomMode(item.mode)}
                    disabled={!hasTransformableMedia}
                    aria-pressed={zoomMode === item.mode}
                    aria-label={`${item.label}，快捷鍵 ${item.key} 或 Num${item.key}`}
                    variant={zoomMode === item.mode ? 'primary' : 'ghost'}
                    title={`${item.key}／Num${item.key} · ${item.label}`}
                  >
                    {renderZoomModeIcon(item.mode)}
                  </IconButton>
                ))}
              </div>
            )}

            {!simpleToolbar && (
            <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--transform" role="group" aria-label="圖片方向">
              <span className="fullscreen-viewer__mobile-group-heading" aria-hidden="true">
                <RotateCw className="h-4 w-4" />
                <span>圖片方向</span>
              </span>
              <IconButton
                type="button"
                onClick={() => rotateImage(-90)}
                disabled={!hasTransformableMedia}
                aria-label="向左旋轉"
                variant="ghost"
                title="向左旋轉 (Ctrl + ←)"
              >
                <RotateCcw className="w-5 h-5" aria-hidden="true" />
              </IconButton>
              <IconButton
                type="button"
                onClick={() => rotateImage(90)}
                disabled={!hasTransformableMedia}
                aria-label="向右旋轉"
                variant="ghost"
                title="向右旋轉 (Ctrl + →)"
              >
                <RotateCw className="w-5 h-5" aria-hidden="true" />
              </IconButton>
              <IconButton
                type="button"
                onClick={() => setFlipHorizontal(value => !value)}
                disabled={!hasTransformableMedia}
                aria-pressed={flipHorizontal}
                aria-label="水平翻轉"
                variant={flipHorizontal ? 'primary' : 'ghost'}
                title="水平翻轉 (Ctrl + H)"
              >
                <FlipHorizontal2 className="w-5 h-5" aria-hidden="true" />
              </IconButton>
              <IconButton
                type="button"
                onClick={() => setFlipVertical(value => !value)}
                disabled={!hasTransformableMedia}
                aria-pressed={flipVertical}
                aria-label="垂直翻轉"
                variant={flipVertical ? 'primary' : 'ghost'}
                title="垂直翻轉 (Ctrl + V)"
              >
                <FlipVertical2 className="w-5 h-5" aria-hidden="true" />
              </IconButton>
            </div>
            )}

            {!simpleToolbar && (
            <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--display" role="group" aria-label="檢視功能">
              <span className="fullscreen-viewer__mobile-group-heading" aria-hidden="true">
                <GalleryThumbnails className="h-4 w-4" />
                <span>檢視功能</span>
              </span>
              <IconButton
                type="button"
                onClick={reloadCurrentMedia}
                aria-label="重新載入目前圖片"
                variant="ghost"
                title="重新載入 (R)"
              >
                <RefreshCw className="w-5 h-5" aria-hidden="true" />
              </IconButton>
              <IconButton
                type="button"
                onClick={toggleCheckerboard}
                aria-pressed={checkerboardEnabled}
                aria-label={checkerboardEnabled ? '關閉棋盤格背景' : '開啟棋盤格背景'}
                variant={checkerboardEnabled ? 'primary' : 'ghost'}
                title="棋盤格背景 (B)"
              >
                <Grid2X2 className="w-5 h-5" aria-hidden="true" />
              </IconButton>
              <IconButton
                type="button"
                onClick={toggleBrowserFullscreen}
                aria-pressed={isBrowserFullscreen}
                aria-label={isBrowserFullscreen ? '離開瀏覽器全螢幕' : '進入瀏覽器全螢幕'}
                variant={isBrowserFullscreen ? 'primary' : 'ghost'}
                title="瀏覽器全螢幕 (F)"
              >
                {isBrowserFullscreen
                  ? <Minimize2 className="w-5 h-5" aria-hidden="true" />
                  : <Maximize2 className="w-5 h-5" aria-hidden="true" />}
              </IconButton>
              {images.length > 1 && (
                <IconButton
                  type="button"
                  onClick={() => setIsSlideshowPlaying(value => !value)}
                  aria-pressed={isSlideshowPlaying}
                  aria-label={isSlideshowPlaying ? '暫停幻燈片播放' : '開始幻燈片播放'}
                  variant={isSlideshowPlaying ? 'primary' : 'ghost'}
                  title="幻燈片 (S)"
                >
                  {isSlideshowPlaying
                    ? <Pause className="w-5 h-5" aria-hidden="true" />
                    : <Presentation className="w-5 h-5" aria-hidden="true" />}
                </IconButton>
              )}
            </div>
            )}

            <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--visibility" role="group" aria-label="工具列與圖庫面板">
              <span className="fullscreen-viewer__mobile-group-heading" aria-hidden="true">
                <PanelTop className="h-4 w-4" />
                <span>工具列與圖庫面板</span>
              </span>
              <IconButton
                type="button"
                onClick={() => {
                  handleShowToolbarChange(false);
                  setIsMobileToolbarOpen(false);
                }}
                aria-pressed={showToolbar}
                aria-label="隱藏工具列"
                data-mobile-label="工具列"
                variant={showToolbar ? 'primary' : 'ghost'}
                title="工具列 (T)"
              >
                <PanelTopDashed className="w-5 h-5" aria-hidden="true" />
              </IconButton>
              {images.length > 1 && (
                <IconButton
                  type="button"
                  onClick={toggleShowFilmstrip}
                  aria-pressed={showFilmstrip}
                  aria-label={showFilmstrip ? '隱藏圖庫面板' : '顯示圖庫面板'}
                  data-mobile-label="圖庫面板"
                  variant={showFilmstrip ? 'primary' : 'ghost'}
                  title="圖庫面板 (G)"
                >
                  <GalleryThumbnails className="w-5 h-5" aria-hidden="true" />
                </IconButton>
              )}
            </div>

            <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--content" role="group" aria-label="內容顯示設定">
              <span className="fullscreen-viewer__mobile-group-heading" aria-hidden="true">
                <Layers className="h-4 w-4" />
                <span>內容顯示設定</span>
              </span>
              {!simpleToolbar && onToggleGroupMangaPosts && (
                <IconButton
                  type="button"
                  onClick={onToggleGroupMangaPosts}
                  aria-pressed={groupMangaPosts}
                  aria-label={groupMangaPosts ? '關閉組圖模式' : '開啟組圖模式'}
                  data-mobile-label="組圖"
                  variant={groupMangaPosts ? 'primary' : 'ghost'}
                  title={groupMangaPosts ? '關閉組圖模式' : '開啟組圖模式'}
                >
                  <Layers className="w-5 h-5" aria-hidden="true" />
                </IconButton>
              )}
              {!simpleToolbar && onToggleBlur && (
                <IconButton
                  type="button"
                  onClick={onToggleBlur}
                  aria-pressed={blurEnabled}
                  aria-label={blurEnabled ? '關閉模糊遮罩' : '開啟模糊遮罩'}
                  data-mobile-label="模糊"
                  variant={blurEnabled ? 'primary' : 'ghost'}
                  title={blurEnabled ? '關閉模糊遮罩' : '開啟模糊遮罩'}
                >
                  {blurEnabled ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
                </IconButton>
              )}
              <IconButton
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                aria-label={showDetails ? '隱藏圖片詳細資訊' : '顯示圖片詳細資訊'}
                aria-pressed={showDetails}
                aria-controls="fullscreen-details-panel"
                className="fullscreen-viewer__details-toolbar-button"
                data-mobile-label="資訊"
                variant={showDetails ? 'primary' : 'ghost'}
                title="詳細資訊 (I)"
              >
                <Info className="w-5 h-5" aria-hidden="true" />
              </IconButton>
            </div>
          </div>

          <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--settings fullscreen-viewer__toolbar-settings" role="group" aria-label="工具列設定">
            <span className="fullscreen-viewer__mobile-group-heading" aria-hidden="true">
              <Settings2 className="h-4 w-4" />
              <span>工具列設定</span>
            </span>
            <IconButton
              type="button"
              onClick={() => setShowShortcutHelp(value => !value)}
              aria-label="顯示全螢幕快捷鍵"
              aria-expanded={showShortcutHelp}
              aria-controls="fullscreen-shortcut-help"
              data-mobile-label="快捷鍵"
              variant={showShortcutHelp ? 'primary' : 'ghost'}
              title="快捷鍵 (F1)"
            >
              <CircleHelp className="w-5 h-5" aria-hidden="true" />
            </IconButton>
            {onSimpleToolbarChange && (
              <IconButton
                type="button"
                onClick={() => onSimpleToolbarChange(!simpleToolbar)}
                aria-pressed={!simpleToolbar}
                aria-label={simpleToolbar ? '展開完整工具列' : '切換至簡易工具列'}
                data-mobile-label={simpleToolbar ? '完整工具列' : '簡易工具列'}
                variant={!simpleToolbar ? 'primary' : 'ghost'}
                title={simpleToolbar ? '完整工具列' : '簡易工具列'}
              >
                <Settings2 className="w-5 h-5" aria-hidden="true" />
              </IconButton>
            )}
          </div>

          {onDeleteCurrent && (
            <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--danger fullscreen-viewer__toolbar-danger" role="group" aria-label="刪除圖片">
              <span className="fullscreen-viewer__mobile-group-heading" aria-hidden="true">
                <Trash2 className="h-4 w-4" />
                <span>刪除圖片</span>
              </span>
              <IconButton
                type="button"
                onClick={() => onDeleteCurrent(currentItem.image_id)}
                aria-label="將圖片移至回收區"
                data-mobile-label="刪除圖片"
                variant="danger"
                title="移至回收區 (Delete)"
              >
                <Trash2 className="w-5 h-5" aria-hidden="true" />
              </IconButton>
            </div>
          )}
        </div>

        {!showToolbar && (
          <div className="fullscreen-viewer__hidden-toolbar-actions" role="group" aria-label="全螢幕工具列">
            <IconButton
              ref={toolbarRestoreButtonRef}
              type="button"
              onClick={handleShowToolbar}
              aria-label="顯示工具列"
              variant="ghost"
              title="顯示工具列 (T)"
            >
              <PanelTopDashed className="w-5 h-5" aria-hidden="true" />
            </IconButton>
          </div>
        )}

        <IconButton
          type="button"
          onClick={onClose}
          aria-label="關閉全螢幕檢視"
          variant="ghost"
          className="fullscreen-viewer__close-button"
          title="關閉 (Esc)"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </IconButton>
      </div>

      {/* Main Display Area */}
      <div
        className="fullscreen-viewer__stage"
        onClick={handleStageClick}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerEnd}
        onPointerCancel={handleStagePointerEnd}
      >
        {/* Navigation Buttons */}
        {currentIndex > 0 && (
          <IconButton
            type="button"
            onClick={handlePrev}
            aria-label="Previous image"
            variant="secondary"
            size="lg"
            className="viewer-nav-button viewer-nav-button--previous"
            title="上一張 (←)"
          >
            <ChevronLeft className="w-8 h-8" aria-hidden="true" />
          </IconButton>
        )}

        {currentIndex < images.length - 1 && (
          <IconButton
            type="button"
            onClick={handleNext}
            aria-label="Next image"
            variant="secondary"
            size="lg"
            className="viewer-nav-button viewer-nav-button--next"
            title="下一張 (→)"
          >
            <ChevronRight className="w-8 h-8" aria-hidden="true" />
          </IconButton>
        )}

        {/* Media Rendering */}
        {currentItem.media_status ? (
          <div className="fullscreen-viewer__issue-frame">
            <MediaIssuePlaceholder message={currentItem.media_error} />
          </div>
        ) : currentItemIsVideo ? (
          <div
            ref={videoFrameRef}
            className={`fullscreen-viewer__video-frame notranslate${demoMode ? ' fullscreen-viewer__video-frame--demo' : ''}`}
            translate="no"
          >
            <div className="fullscreen-viewer__video-background" aria-hidden="true" />
            {demoMode ? (
              <DemoMediaBlock dominantColor={currentItem.dominant_color} />
            ) : (
              <>
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
                      className="fullscreen-viewer__media is-video-ready fullscreen-viewer__video--outgoing"
                    />
                  </div>
                )}
                <div className="fullscreen-viewer__video-surface" style={videoDisplayStyle}>
                  <video
                    key={currentMediaUrl}
                    ref={videoRef}
                    src={mediaUrl}
                    autoPlay={shouldAutoplayVideo}
                    loop
                    preload="metadata"
                    playsInline
                    muted={videoMuted || videoVolume <= 0}
                    controls={isVideoReady}
                    aria-label={currentItem.title || '影片'}
                    onLoadedMetadata={handleVideoLoadedMetadata}
                    onLoadedData={handleVideoLoadedData}
                    onVolumeChange={handleVideoVolumeChange}
                    onClick={handleVideoClick}
                    onPointerDown={handleVideoPointerDown}
                    onPointerUp={handleVideoPointerEnd}
                    onPointerCancel={handleVideoPointerEnd}
                    onLostPointerCapture={handleVideoPointerEnd}
                    className={`fullscreen-viewer__media${isVideoReady ? ' is-video-ready' : ''} ${blurEnabled ? 'blur-media blur-media--viewer' : ''}`}
                  />
                </div>
              </>
            )}
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
          <div
            ref={mediaStackRef}
            className={`fullscreen-viewer__media-stack${demoMode ? ' fullscreen-viewer__media-stack--demo' : ''}${isPannable ? ' is-pannable' : ''}${isPanning ? ' is-panning' : ''}${zoomMode === 'lock' ? ' is-zoom-locked' : ''}${suppressMediaTransitions ? ' is-media-transition-suppressed' : ''}`}
            onPointerDown={handlePanPointerDown}
            onPointerMove={handlePanPointerMove}
            onPointerUp={endPanGesture}
            onPointerCancel={endPanGesture}
          >
            {demoMode ? (
              <DemoMediaBlock
                dominantColor={currentItem.dominant_color}
                className="fullscreen-viewer__media fullscreen-viewer__media--demo"
              />
            ) : (
              <div
                className={`fullscreen-viewer__media-frame${showThumbnailPreview && !blurEnabled ? ' is-thumbnail-preview' : ''}`}
                style={mediaFrameStyle}
              >
                {showThumbnailPreview && (
                  <img
                    src={currentThumbnailUrl}
                    alt=""
                    aria-hidden="true"
                    loading="eager"
                    decoding="async"
                    {...{ fetchpriority: 'high' }}
                    onLoad={markThumbnailLoaded}
                    onError={() => {
                      markThumbnailError();
                      setThumbnailFailed(true);
                    }}
                    draggable={false}
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
                      setNaturalSize({
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight,
                      });
                      setNaturalSizeMediaUrl(currentMediaUrl);
                      imageLoadScheduler.markLoaded(event.currentTarget.currentSrc || mediaUrl);
                    }}
                    onError={event => {
                      imageLoadScheduler.markFinished(event.currentTarget.currentSrc || mediaUrl, false);
                      setOriginalLoadFailed(true);
                      if (displayedImagePathRef.current === currentItem?.save_name) {
                        displayedImageUrlRef.current = null;
                        displayedImagePathRef.current = null;
                        setDisplayedImageUrl(null);
                      }
                    }}
                    draggable={false}
                    className={`fullscreen-viewer__media fullscreen-viewer__media--original is-visible ${blurEnabled ? 'blur-media blur-media--viewer' : ''}`}
                  />
                )}
              </div>
            )}
            {originalLoadFailed && !demoMode && (
              <p className="fullscreen-viewer__load-error" role="status">
                原圖載入失敗，保留縮圖預覽。
              </p>
            )}
          </div>
        )}

        {/* Details Panel Overlay */}
        {showDetails && (
          <div id="fullscreen-details-panel" className="fullscreen-viewer__details">
            <div>
              <div className="fullscreen-viewer__details-header">
                <h4 className="font-bold text-base text-white">{currentItem.title || '無題'}</h4>
                <IconButton
                  type="button"
                  onClick={() => setShowDetails(false)}
                  aria-label="關閉圖片詳細資訊"
                  variant={isMobileViewport ? 'plain' : 'ghost'}
                  size="sm"
                  className="fullscreen-viewer__details-close"
                  title="關閉圖片詳細資訊"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </IconButton>
              </div>
              <div className="fullscreen-viewer__details-body">
                <p><span className="fullscreen-viewer__details-label">作品 ID:</span> {currentItem.image_id}</p>
                <p><span className="fullscreen-viewer__details-label">繪師:</span> {currentItem.artist_name || currentItem.member_id}</p>
                <p><span className="fullscreen-viewer__details-label">繪師 ID:</span> {currentItem.member_id}</p>
                <p><span className="fullscreen-viewer__details-label">發布時間:</span> {currentItem.created_date || '未知'}</p>
                <p className="fullscreen-viewer__details-path-row">
                  <span className="fullscreen-viewer__details-label">儲存路徑:</span>
                  <span className="fullscreen-viewer__details-path" title={currentItem.save_name}>{currentItem.save_name}</span>
                  <IconButton
                    type="button"
                    onClick={() => void handleCopyPath('file')}
                    disabled={!canCopyFilePath || copyAction !== null || openAction !== null}
                    aria-busy={copyAction === 'file'}
                    aria-label="複製檔案路徑"
                    className="fullscreen-viewer__details-path-copy"
                    size="sm"
                    variant="ghost"
                    title="複製檔案路徑"
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  </IconButton>
                </p>
                {copyFeedback && (
                  <p className="fullscreen-viewer__copy-feedback" role="status" aria-live="polite">
                    {copyFeedback}
                  </p>
                )}
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
                  <p className="fullscreen-viewer__details-warning"><span className="fullscreen-viewer__details-label">狀態:</span> {currentItem.media_error}</p>
                )}
              </div>
            </div>
            <div className="viewer-details-actions">
              <div className="viewer-file-actions">
              <Button
                type="button"
                onClick={() => handleOpenLocalMedia('file')}
                variant="secondary"
                className="viewer-secondary-action"
                disabled={!canOpenLocalMedia || openAction !== null || copyAction !== null}
                aria-busy={openAction === 'file'}
                title={`${openMediaLabel}（使用 Windows 預設程式）`}
              >
                <ImageIcon className="h-4 w-4" aria-hidden="true" />
                {openMediaLabel}
              </Button>
              <Button
                type="button"
                onClick={() => handleOpenLocalMedia('folder')}
                variant="secondary"
                className="viewer-secondary-action"
                disabled={!canOpenLocalMedia || openAction !== null || copyAction !== null}
                aria-busy={openAction === 'folder'}
                title="開啟所在資料夾（使用檔案總管）"
              >
                <FolderOpen className="h-4 w-4" aria-hidden="true" />
                開啟資料夾
              </Button>
              <Button
                type="button"
                onClick={() => void handleCopyPath('folder')}
                variant="secondary"
                className="viewer-secondary-action viewer-copy-folder-action"
                disabled={!canCopyFolderPath || copyAction !== null || openAction !== null}
                aria-busy={copyAction === 'folder'}
                title="複製所在資料夾路徑"
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                複製資料夾路徑
              </Button>
              </div>
            {openActionError && (
              <p className="viewer-file-action-error" role="alert">{openActionError}</p>
            )}
            {copyActionError && (
              <p className="viewer-file-action-error" role="alert">{copyActionError}</p>
            )}
            <Button
              type="button"
              onClick={() => window.open(mediaUrl, '_blank')}
              variant="primary"
              className="viewer-primary-action"
            >
              <Download className="w-4 h-4" /> 下載 / 開啟原檔
            </Button>
            </div>
          </div>
        )}
      </div>

      {showShortcutHelp && (
        <section
          id="fullscreen-shortcut-help"
          className="fullscreen-viewer__shortcut-help"
          aria-label="全螢幕快捷鍵"
        >
          <div className="fullscreen-viewer__shortcut-help-header">
            <h4>全螢幕快捷鍵</h4>
            <IconButton
              type="button"
              onClick={() => setShowShortcutHelp(false)}
              aria-label="關閉快捷鍵說明"
              variant="ghost"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </IconButton>
          </div>
          <p className="fullscreen-viewer__shortcut-help-intro">
            影片內的操作會顯示短暫提示；影片外點擊仍用於切換上一部／下一部作品。
          </p>
          <dl className="fullscreen-viewer__shortcut-list">
            <div><dt>上一張／下一張</dt><dd>← ↑ J / → ↓ K</dd></div>
            <div><dt>第一張／最後一張</dt><dd>Home / End</dd></div>
            <div><dt>放大／縮小</dt><dd>+ / −（含數字鍵盤）、Ctrl + 滾輪</dd></div>
            <div><dt>原始大小／適合視窗</dt><dd>Ctrl + 0 / Ctrl + M</dd></div>
            <div><dt>六種縮放模式</dt><dd>1–6 或 Num1–Num6：自動 · 鎖定 · 寬度 · 高度 · 適合 · 填滿</dd></div>
            <div><dt>向左／向右旋轉</dt><dd>Ctrl + ← / Ctrl + →</dd></div>
            <div><dt>水平／垂直翻轉</dt><dd>Ctrl + H / Ctrl + V</dd></div>
            <div><dt>移動放大的圖片</dt><dd>按住滑鼠拖曳</dd></div>
            <div><dt>工具列／圖庫面板／詳細資訊</dt><dd>T / G / I</dd></div>
            <div><dt>重新載入／棋盤背景</dt><dd>R / B</dd></div>
            <div><dt>瀏覽器全螢幕／幻燈片</dt><dd>F / S</dd></div>
            <div className="fullscreen-viewer__shortcut-list-heading"><dt>影片播放器</dt><dd>僅在影片範圍內生效</dd></div>
            <div><dt>播放／暫停</dt><dd>Space／點擊影片本體</dd></div>
            <div><dt>倒轉／快轉 {videoSeekSeconds} 秒</dt><dd>影片左／右半部雙擊</dd></div>
            <div><dt>暫時 {videoHoldPlaybackRate} 倍速</dt><dd>按住影片左／右半部，放開恢復</dd></div>
            <div><dt>快捷鍵／關閉</dt><dd>F1 / Esc</dd></div>
          </dl>
        </section>
      )}

      {/* Bottom Gallery Panel */}
      {images.length > 1 && showFilmstrip && (
        <div className={`fullscreen-viewer__filmstrip${isFilmstripPositioned ? '' : ' is-positioning'}`}>
          <div
            ref={filmstripScrollRef}
            className="fullscreen-viewer__filmstrip-scroll"
            onScroll={handleFilmstripScroll}
          >
            <div
              className="fullscreen-viewer__filmstrip-track"
              style={{
                width: `${Math.max(filmstripLayout.totalWidth, filmstripViewportWidth)}px`,
                height: `${FILMSTRIP_ITEM_SIZE}px`,
              }}
            >
              {images.slice(filmstripStartIndex, filmstripEndIndex).map((item, offset) => {
                const idx = filmstripStartIndex + offset;
                const pageNumber = pageNumberState.pageNumbers[idx] ?? idx + 1;
                const itemLeft = filmstripLayout.itemOffsets[idx] ?? 0;
                const boundaryLeft = filmstripLayout.boundaryOffsets[idx];
                const isActive = idx === currentIndex;
                const isVisible = itemLeft < filmstripLoadEnd
                  && itemLeft + FILMSTRIP_ITEM_SIZE > filmstripLoadStart;

                return (
                  <React.Fragment key={item.image_id || idx}>
                    {/* Work Boundary Vertical Separator Line */}
                    {boundaryLeft !== null && boundaryLeft !== undefined && (
                      <div
                        className="fullscreen-viewer__boundary"
                        style={{ left: `${boundaryLeft}px` }}
                        title={`作品分界: ${item.title || '下一作品'}`}
                      />
                    )}

                    <button
                      type="button"
                      data-filmstrip-index={idx}
                      onClick={() => onNavigate(idx)}
                      aria-label={`Preview group page ${pageNumber}`}
                      aria-current={isActive ? 'true' : undefined}
                      className={`fullscreen-viewer__thumbnail ${isActive ? 'is-active' : ''}`}
                      style={{ left: `${itemLeft}px` }}
                    >
                      {item.media_status ? (
                        <MediaIssuePlaceholder message={item.media_error} compact />
                      ) : (
                        <FilmstripThumbnail
                          item={item}
                          pageNumber={pageNumber}
                          isNearCurrent={Math.abs(idx - currentIndex) <= 3}
                          isVisible={isVisible}
                          thumbnailSize={thumbnailSize}
                          blurEnabled={blurEnabled}
                          demoMode={demoMode}
                        />
                      )}
                      <span className="fullscreen-viewer__thumbnail-index">
                        {pageNumber}
                      </span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {images.length > 1 && showFilmstrip && (
        <div className="fullscreen-viewer__footer">
          <span>方向鍵切換 · + / − 縮放 · 1–6／Num1–Num6 切換縮放模式 · F1 查看全部快捷鍵</span>
        </div>
      )}
    </div>
  );
};
