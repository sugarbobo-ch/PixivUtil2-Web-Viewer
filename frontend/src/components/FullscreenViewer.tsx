import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { ImageItem, SourceLink, ViewerMode } from '../types';
import { getGroupPageNumbers, getItemGroupKey } from '../utils/grouping';
import { buildThumbnailUrl } from '../utils/webConfig';
import { fetchSourceLink } from '../utils/sourceLinks';
import { LocalOpenTarget, openLocalMedia } from '../utils/localFileActions';
import { MediaIssuePlaceholder } from './MediaIssuePlaceholder';
import { DemoMediaBlock } from './DemoMediaBlock';
import { imageLoadScheduler, useImageLoadPermission } from '../utils/imageLoadScheduler';
import { Button, IconButton } from './ui/Button';
import {
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  Expand,
  ExternalLink,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  FolderOpen,
  GalleryHorizontal,
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
  Plus,
  Presentation,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Scan,
  ScanSearch,
  ScrollText,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';

const buildMediaUrl = (item: ImageItem): string => (
  `/api/file?path=${encodeURIComponent(item.save_name || '')}&image_id=${item.image_id}`
);

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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface FilmstripLayout {
  itemOffsets: number[];
  boundaryOffsets: Array<number | null>;
  totalWidth: number;
}

const findFilmstripIndexAtOffset = (offsets: number[], offset: number) => {
  if (offsets.length === 0) return 0;
  let low = 0;
  let high = offsets.length - 1;
  let result = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle] <= offset) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return result;
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
  workTitle?: string;
  artistName?: string;
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
  /** Persistent preference for the initial visibility of the horizontal rail. */
  showFilmstripByDefault?: boolean;
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
  workTitle,
  artistName,
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
  showFilmstripByDefault = true,
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
  const currentItemIsVideo = currentItem?.save_name.toLowerCase().endsWith('.mp4') ?? false;
  const thumbnailAdmitted = useImageLoadPermission({
    url: currentThumbnailUrl,
    priority: 0,
    kind: 'thumbnail',
    owner: 'fullscreen',
    enabled: Boolean(currentItem && !demoMode && !currentItemIsVideo && !currentItem.media_status),
  });
  const [showDetails, setShowDetails] = useState(false);
  const [sourceLink, setSourceLink] = useState<SourceLink | null>(null);
  const [isSourceLoading, setIsSourceLoading] = useState(false);
  const [openAction, setOpenAction] = useState<LocalOpenTarget | null>(null);
  const [openActionError, setOpenActionError] = useState<string | null>(null);
  const [displayedImageUrl, setDisplayedImageUrl] = useState<string | null>(null);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [originalLoadFailed, setOriginalLoadFailed] = useState(false);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('auto');
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
  const [showFilmstrip, setShowFilmstrip] = useState(showFilmstripByDefault);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [isMobileToolbarOpen, setIsMobileToolbarOpen] = useState(false);
  const [checkerboardEnabled, setCheckerboardEnabled] = useState(false);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [isSlideshowPlaying, setIsSlideshowPlaying] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);
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
  const wheelGestureActive = useRef(false);
  const wheelGestureResetTimer = useRef<number | null>(null);
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

  useEffect(() => {
    setShowFilmstrip(showFilmstripByDefault);
  }, [showFilmstripByDefault]);

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
  const openMediaLabel = currentItemIsVideo ? '開啟影片' : '開啟圖片';
  const visibleOriginalUrl = displayedImagePathRef.current === currentItem?.save_name
    ? displayedImageUrl
    : null;
  const showThumbnailPreview = thumbnailAdmitted
    && !thumbnailFailed
    && !Boolean(visibleOriginalUrl);
  const transformReady = Boolean(
    currentItem
    && !demoMode
    && !currentItemIsVideo
    && !currentItem.media_status
    && naturalSizeMediaUrl === currentMediaUrl
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
    && !visibleOriginalUrl
  );
  const suppressMediaTransitions = isMediaLoading || isMediaTransitionSuppressed;
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const isQuarterTurn = normalizedRotation === 90 || normalizedRotation === 270;
  const orientedNaturalWidth = isQuarterTurn ? naturalSize.height : naturalSize.width;
  const orientedNaturalHeight = isQuarterTurn ? naturalSize.width : naturalSize.height;
  const baseFitZoomPercent = transformReady
    ? Math.min(stageSize.width / naturalSize.width, stageSize.height / naturalSize.height) * 100
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
  const renderScale = transformReady && baseFitZoomPercent > 0
    ? effectiveZoomPercent / baseFitZoomPercent
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
  }, []);

  const applyZoomMode = useCallback((mode: Exclude<ZoomMode, 'custom'>) => {
    if (!transformReady) return;
    if (mode === 'lock') setCustomZoomPercent(Math.round(effectiveZoomPercent));
    setZoomMode(mode);
    setPan({ x: 0, y: 0 });
  }, [effectiveZoomPercent, transformReady]);

  const rotateImage = useCallback((degrees: number) => {
    if (!transformReady) return;
    setRotation(previous => (previous + degrees + 360) % 360);
    setPan({ x: 0, y: 0 });
  }, [transformReady]);

  const mediaTransformStyle = React.useMemo<React.CSSProperties>(() => ({
    transform: `translate3d(${pan.x}px, ${pan.y}px, 0) rotate(${normalizedRotation}deg) scale(${renderScale * (flipHorizontal ? -1 : 1)}, ${renderScale * (flipVertical ? -1 : 1)})`,
  }), [flipHorizontal, flipVertical, normalizedRotation, pan.x, pan.y, renderScale]);

  const filmstripLayout = React.useMemo<FilmstripLayout>(() => {
    const itemOffsets: number[] = [];
    const boundaryOffsets: Array<number | null> = [];
    let offset = FILMSTRIP_EDGE_PADDING;

    images.forEach((item, index) => {
      if (index > 0) {
        offset += FILMSTRIP_GAP;
        const previousItem = images[index - 1];
        const isWorkBoundary = getItemGroupKey(item) !== getItemGroupKey(previousItem);
        if (isWorkBoundary) {
          boundaryOffsets[index] = offset + FILMSTRIP_BOUNDARY_MARGIN;
          offset += FILMSTRIP_BOUNDARY_WIDTH + FILMSTRIP_BOUNDARY_MARGIN * 2;
        } else {
          boundaryOffsets[index] = null;
        }
      } else {
        boundaryOffsets[index] = null;
      }

      itemOffsets[index] = offset;
      offset += FILMSTRIP_ITEM_SIZE;
    });

    return {
      itemOffsets,
      boundaryOffsets,
      totalWidth: offset + FILMSTRIP_EDGE_PADDING,
    };
  }, [images]);

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
    displayedImageUrlRef.current = null;
    displayedImagePathRef.current = null;
    setDisplayedImageUrl(null);
    setThumbnailFailed(false);
    setOriginalLoadFailed(false);
    if (zoomModeRef.current !== 'lock') {
      setZoomMode('auto');
      setCustomZoomPercent(100);
    }
    setRotation(0);
    setFlipHorizontal(false);
    setFlipVertical(false);
    setPan({ x: 0, y: 0 });
    setIsPanning(false);
    setNaturalSize({ width: 0, height: 0 });
    setNaturalSizeMediaUrl(null);
    setShowShortcutHelp(false);
    setIsMobileToolbarOpen(false);
    panGestureRef.current = null;
    stageSwipeGestureRef.current = null;
    suppressStageClickUntilRef.current = 0;
  }, [currentItem?.save_name, currentMediaUrl]);

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
  }, [currentItem, currentItemIsVideo, currentMediaUrl, demoMode]);

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
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
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

  const toggleVideoPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused || video.ended) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, []);

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
    if (event.target === event.currentTarget) {
      onClose();
      return;
    }
    if (target?.closest('button, input, select, textarea, video, [contenteditable="true"]')) return;

    const mediaSurface = target?.closest<HTMLElement>('.fullscreen-viewer__media-stack, .fullscreen-viewer__issue-frame');
    if (!mediaSurface) return;

    const bounds = mediaSurface.getBoundingClientRect();
    if (event.clientX < bounds.left + bounds.width / 2) handlePrev();
    else handleNext();
  }, [handleNext, handlePrev, onClose]);

  // Wheel over the filmstrip pans its native horizontal scroller. Wheel Up /
  // Wheel Down elsewhere uses the same navigation callbacks as the arrow keys.
  // A short same-direction cooldown filters trackpad inertia without adding the
  // noticeable pause caused by the previous 250ms debounce.
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
    [handleNext, handlePrev, transformReady, zoomIn, zoomOut]
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

  // Keyboard shortcuts follow the ImageGlass conventions where they do not
  // conflict with the viewer's established J/K and arrow navigation.
  // Consume navigation events so the page behind the dialog cannot scroll.
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!(e.target instanceof Node) || !viewerRef.current?.contains(e.target)) return;

    const target = e.target instanceof Element ? e.target : null;
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

    if (isInteractiveTarget) return;

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
    } else if ((e.key === 't' || e.key === 'T') && images.length > 1) {
      e.preventDefault();
      e.stopPropagation();
      setShowFilmstrip(value => !value);
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      e.stopPropagation();
      reloadCurrentMedia();
    } else if (e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      e.stopPropagation();
      setCheckerboardEnabled(value => !value);
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
      findFilmstripIndexAtOffset(
        filmstripLayout.itemOffsets,
        Math.max(0, filmstripScrollLeft - FILMSTRIP_VIRTUAL_OVERSCAN),
      ),
    )
    : 0;
  const filmstripEndIndex = images.length > 0
    ? Math.min(
      images.length,
      findFilmstripIndexAtOffset(
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
      className={`fullscreen-viewer animate-fadeIn${checkerboardEnabled ? ' is-checkerboard' : ''}${blurEnabled ? ' is-blur-enabled' : ''}${demoMode ? ' is-demo-mode' : ''}${images.length > 1 && showFilmstrip ? ' has-filmstrip' : ''}`}
    >
      {/* Top Header Bar */}
      <div className="fullscreen-viewer__topbar">
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
            variant="plain"
            title={isMobileToolbarOpen ? '關閉工具列' : '開啟工具列'}
          >
            <Settings2 className="w-5 h-5" aria-hidden="true" />
          </IconButton>
        </div>

        <div className="fullscreen-viewer__mobile-details-toggle">
          <IconButton
            type="button"
            onClick={() => setShowDetails(value => !value)}
            aria-label="顯示圖片詳細資訊"
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
                <GalleryHorizontal className="h-4 w-4" />
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
              {images.length > 1 && (
                <IconButton
                  type="button"
                  onClick={() => setShowFilmstrip(value => !value)}
                  aria-pressed={showFilmstrip}
                  aria-label={showFilmstrip ? '隱藏縮圖列' : '顯示縮圖列'}
                  variant={showFilmstrip ? 'primary' : 'ghost'}
                  title="縮圖列 (T)"
                >
                  <GalleryHorizontal className="w-5 h-5" aria-hidden="true" />
                </IconButton>
              )}
              <IconButton
                type="button"
                onClick={() => setCheckerboardEnabled(value => !value)}
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

            {!simpleToolbar && (
            <div className="fullscreen-viewer__toolbar-group fullscreen-viewer__toolbar-group--content" role="group" aria-label="內容顯示設定">
              <span className="fullscreen-viewer__mobile-group-heading" aria-hidden="true">
                <Layers className="h-4 w-4" />
                <span>內容顯示設定</span>
              </span>
              {onToggleGroupMangaPosts && (
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
              {onToggleBlur && (
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
                aria-label="顯示圖片詳細資訊"
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
            )}
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

        <IconButton
          type="button"
          onClick={onClose}
          aria-label="關閉全螢幕檢視"
          variant={isMobileViewport ? 'plain' : 'ghost'}
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
          <div className={`fullscreen-viewer__video-frame${demoMode ? ' fullscreen-viewer__video-frame--demo' : ''}`}>
            {demoMode ? (
              <DemoMediaBlock dominantColor={currentItem.dominant_color} />
            ) : (
              <video
                ref={videoRef}
                src={mediaUrl}
                autoPlay
                loop
                controls
                className={`fullscreen-viewer__media ${blurEnabled ? 'blur-media blur-media--viewer' : ''}`}
              />
            )}
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
              <>
                {showThumbnailPreview && (
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
                    draggable={false}
                    style={mediaTransformStyle}
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
                      displayedImageUrlRef.current = null;
                      displayedImagePathRef.current = null;
                      setDisplayedImageUrl(null);
                    }}
                    draggable={false}
                    style={mediaTransformStyle}
                    className={`fullscreen-viewer__media fullscreen-viewer__media--original is-visible ${blurEnabled ? 'blur-media blur-media--viewer' : ''}`}
                  />
                )}
              </>
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
                <p className="break-all"><span className="fullscreen-viewer__details-label">儲存路徑:</span> {currentItem.save_name}</p>
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
                disabled={!canOpenLocalMedia || openAction !== null}
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
                disabled={!canOpenLocalMedia || openAction !== null}
                aria-busy={openAction === 'folder'}
                title="開啟所在資料夾（使用檔案總管）"
              >
                <FolderOpen className="h-4 w-4" aria-hidden="true" />
                開啟資料夾
              </Button>
              </div>
            {openActionError && (
              <p className="viewer-file-action-error" role="alert">{openActionError}</p>
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
          <dl className="fullscreen-viewer__shortcut-list">
            <div><dt>上一張／下一張</dt><dd>← ↑ J / → ↓ K</dd></div>
            <div><dt>第一張／最後一張</dt><dd>Home / End</dd></div>
            <div><dt>放大／縮小</dt><dd>+ / −（含數字鍵盤）、Ctrl + 滾輪</dd></div>
            <div><dt>原始大小／適合視窗</dt><dd>Ctrl + 0 / Ctrl + M</dd></div>
            <div><dt>六種縮放模式</dt><dd>1–6 或 Num1–Num6：自動 · 鎖定 · 寬度 · 高度 · 適合 · 填滿</dd></div>
            <div><dt>向左／向右旋轉</dt><dd>Ctrl + ← / Ctrl + →</dd></div>
            <div><dt>水平／垂直翻轉</dt><dd>Ctrl + H / Ctrl + V</dd></div>
            <div><dt>移動放大的圖片</dt><dd>按住滑鼠拖曳</dd></div>
            <div><dt>縮圖列／詳細資訊</dt><dd>T / I</dd></div>
            <div><dt>重新載入／棋盤背景</dt><dd>R / B</dd></div>
            <div><dt>瀏覽器全螢幕／幻燈片</dt><dd>F / S</dd></div>
            <div><dt>影片播放／暫停</dt><dd>Space</dd></div>
            <div><dt>快捷鍵／關閉</dt><dd>F1 / Esc</dd></div>
          </dl>
        </section>
      )}

      {/* Bottom Filmstrip Thumbnail Bar */}
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

      {/* Bottom Hint Footer */}
      <div className="fullscreen-viewer__footer">
        <span>方向鍵切換 · + / − 縮放 · 1–6／Num1–Num6 切換縮放模式 · F1 查看全部快捷鍵</span>
      </div>
    </div>
  );
};
