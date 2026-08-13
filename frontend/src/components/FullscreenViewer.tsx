import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import '../styles/viewer.css';
import {
  FullscreenPageLayout,
  FullscreenReadingDirection,
  FullscreenZoomMode,
  ImageItem,
  SourceLink,
  VideoPreferencePatch,
  ViewerMode,
} from '../types';
import { useI18n } from '../i18n';
import { getGroupPageNumbers } from '../utils/grouping';
import { buildMediaUrl, isVideoItem } from '../utils/media';
import { buildThumbnailUrl } from '../utils/webConfig';
import { fetchSourceLink } from '../utils/sourceLinks';
import { LocalOpenTarget, openLocalMedia } from '../utils/localFileActions';
import { getOperationErrorMessage } from '../utils/operationError';
import { copyTextToClipboard, getParentPath } from '../utils/clipboard';
import { MediaIssuePlaceholder } from './MediaIssuePlaceholder';
import { DemoMediaBlock } from './DemoMediaBlock';
import { ViewerDetailsPanel } from './ViewerDetailsPanel';
import { ViewerShortcutDialog } from './ViewerShortcutDialog';
import { ViewerFilmstrip } from './ViewerFilmstrip';
import { ViewerToolbar } from './ViewerToolbar';
import { useViewerMediaAdmission } from '../hooks/useViewerMediaAdmission';
import { useViewerChrome } from '../hooks/useViewerChrome';
import { useViewerImage } from '../hooks/useViewerImage';
import {
  useViewerTransform,
  ViewerZoomMode,
} from '../hooks/useViewerTransform';
import { useViewerKeyboard } from '../hooks/useViewerKeyboard';
import { useViewerVideo } from '../hooks/useViewerVideo';
import { useViewerFilmstrip } from '../hooks/useViewerFilmstrip';
import { prefersReducedMotion } from '../utils/motion';
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

const SWIPE_MIN_DISTANCE = 48;
const SWIPE_MIN_VELOCITY = 0.28;
const SWIPE_MAX_DURATION = 750;
const SWIPE_DIRECTION_BIAS = 1.2;
const SWIPE_MOVE_TOLERANCE = 12;
const WHEEL_NAVIGATION_SETTLE_MS = 100;

type ZoomMode = ViewerZoomMode;

const ZOOM_MODE_SHORTCUTS: Array<{
  mode: Exclude<ZoomMode, 'custom'>;
  key: string;
  code: KeyboardEvent['code'];
  labelKey: string;
}> = [
  { mode: 'auto', key: '1', code: 'Numpad1', labelKey: 'viewer.zoomModeAuto' },
  { mode: 'lock', key: '2', code: 'Numpad2', labelKey: 'viewer.zoomModeLock' },
  { mode: 'width', key: '3', code: 'Numpad3', labelKey: 'viewer.zoomModeWidth' },
  { mode: 'height', key: '4', code: 'Numpad4', labelKey: 'viewer.zoomModeHeight' },
  { mode: 'fit', key: '5', code: 'Numpad5', labelKey: 'viewer.zoomModeFit' },
  { mode: 'fill', key: '6', code: 'Numpad6', labelKey: 'viewer.zoomModeFill' },
];

interface StageSwipeGesture {
  pointerId: number;
  startX: number;
  startY: number;
  startedAt: number;
  canSwipe: boolean;
  moved: boolean;
}

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
  fullscreenPageLayout?: FullscreenPageLayout;
  /** Persist page-layout changes made from the fullscreen toolbar. */
  onPageLayoutChange?: (layout: FullscreenPageLayout) => void;
  fullscreenReadingDirection?: FullscreenReadingDirection;
  /** Persist reading-direction changes made from the fullscreen toolbar. */
  onReadingDirectionChange?: (direction: FullscreenReadingDirection) => void;
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
  fullscreenPageLayout,
  onPageLayoutChange,
  fullscreenReadingDirection,
  onReadingDirectionChange,
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
  const { t, formatNumber } = useI18n();
  const localizedZoomModeShortcuts = React.useMemo(
    () => ZOOM_MODE_SHORTCUTS.map(item => ({ ...item, label: t(item.labelKey) })),
    [t],
  );
  const currentItem = images[currentIndex];
  const toolbarPageLayout = isMobileViewport ? 'single' : fullscreenPageLayout;
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
  const [openActionErrorTarget, setOpenActionErrorTarget] = useState<LocalOpenTarget | null>(null);
  const [copyAction, setCopyAction] = useState<LocalOpenTarget | null>(null);
  const [copyActionError, setCopyActionError] = useState<string | null>(null);
  const [copyActionErrorTarget, setCopyActionErrorTarget] = useState<LocalOpenTarget | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<LocalOpenTarget | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
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
    currentIndex,
    showFilmstrip,
  });
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [isSlideshowPlaying, setIsSlideshowPlaying] = useState(false);
  const mediaStackRef = useRef<HTMLDivElement>(null);
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
  const navigationDirectionRef = useRef<1 | -1>(1);
  const resetTransformRef = useRef<() => void>(() => undefined);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);
  const copyFeedbackTimerRef = useRef<number | null>(null);

  const canOpenLocalMedia = Boolean(
    currentItem?.save_name
    && currentItem.media_status !== 'missing'
    && currentItem.media_status !== 'internal',
  );
  const currentFilePath = currentItem?.save_name ?? '';
  const currentFolderPath = currentFilePath ? getParentPath(currentFilePath) : '';
  const canCopyFilePath = Boolean(currentFilePath);
  const canCopyFolderPath = Boolean(currentFolderPath);
  const handleMediaReset = useCallback(() => {
    resetTransformRef.current();
  }, []);
  const {
    displayedImageUrl,
    visibleOriginalUrl,
    displayedImagePathRef,
    thumbnailFailed,
    originalLoadFailed,
    naturalSize,
    naturalSizeMediaUrl,
    isMediaTransitionSuppressed,
    handleThumbnailError,
    handleDisplayedImageLoad,
    handleDisplayedImageError,
    reloadCurrentMedia: reloadCurrentImage,
  } = useViewerImage({
    images,
    currentIndex,
    navigationDirection: navigationDirectionRef.current,
    currentItem,
    currentItemIsVideo,
    currentMediaUrl,
    demoMode,
    preloadCount,
    onMediaReset: handleMediaReset,
  });

  // Keep the last decoded original visible while the next item is loading.
  // The navigation metadata can advance immediately, but the media surface
  // should not be cleared until the replacement is ready to paint.
  const isDisplayedMediaCurrent = Boolean(
    currentItem
    && displayedImagePathRef.current === currentItem.save_name,
  );
  const showThumbnailPreview = thumbnailAdmitted
    && !thumbnailFailed
    && !Boolean(visibleOriginalUrl);
  const {
    zoomMode,
    rotation,
    flipHorizontal,
    setFlipHorizontal,
    flipVertical,
    setFlipVertical,
    pan,
    setPan,
    isPanning,
    setIsPanning,
    transformReady,
    hasTransformableMedia,
    isMediaLoading,
    suppressMediaTransitions,
    effectiveZoomPercent,
    isPannable,
    clampPan,
    resetTransform,
    zoomIn,
    zoomOut,
    showActualSize,
    fitToViewer,
    applyZoomMode,
    rotateImage,
    mediaFrameStyle,
  } = useViewerTransform({
    fullscreenZoomMode,
    onZoomModeChange,
    hasCurrentItem: Boolean(currentItem),
    currentItemIsVideo,
    demoMode,
    currentMediaUrl,
    displayedImageUrl,
    naturalSize,
    naturalSizeMediaUrl,
    stageSize,
    isDisplayedMediaCurrent,
    isMediaTransitionSuppressed,
  });
  resetTransformRef.current = resetTransform;

  const {
    videoRef,
    videoFrameRef,
    outgoingVideoRef,
    videoNaturalSize,
    videoNaturalSizeMediaUrl,
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
    currentItem,
    currentItemIsVideo,
    currentMediaUrl,
    demoMode,
    showFilmstrip,
    showToolbar,
    shouldAutoplayVideo,
    videoMuted,
    videoVolume,
    videoSeekSeconds,
    videoHoldPlaybackRate,
    onVideoPreferenceChange,
  });

  const reloadCurrentMedia = useCallback(() => {
    if (demoMode || !currentItem || !currentMediaUrl) return;
    if (currentItemIsVideo) {
      videoRef.current?.load();
      void videoRef.current?.play().catch(() => undefined);
      return;
    }
    reloadCurrentImage();
  }, [currentItem, currentItemIsVideo, currentMediaUrl, demoMode, reloadCurrentImage, videoRef]);

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
    setOpenActionErrorTarget(null);
  }, [currentItem?.image_id]);

  useEffect(() => {
    setShowShortcutHelp(false);
    setIsMobileToolbarOpen(false);
    setCopyActionError(null);
    setCopyActionErrorTarget(null);
    setCopyFeedback(null);
    if (copyFeedbackTimerRef.current !== null) {
      window.clearTimeout(copyFeedbackTimerRef.current);
      copyFeedbackTimerRef.current = null;
    }
    panGestureRef.current = null;
    stageSwipeGestureRef.current = null;
    suppressStageClickUntilRef.current = 0;
  }, [currentItem?.save_name]);

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
    setOpenActionErrorTarget(null);
    try {
      await openLocalMedia({
        path: currentItem.save_name,
        imageId: currentItem.image_id,
        target,
      });
    } catch (error) {
      setOpenActionError(getOperationErrorMessage(error, t));
      setOpenActionErrorTarget(target);
    } finally {
      setOpenAction(null);
    }
  }, [canOpenLocalMedia, currentItem, t]);

  const handleCopyPath = useCallback(async (target: LocalOpenTarget) => {
    const path = target === 'file' ? currentFilePath : currentFolderPath;
    if (!path) {
      setCopyActionError(target === 'folder'
        ? t('viewer.noFolderPath')
        : t('viewer.noFilePath'));
      setCopyActionErrorTarget(target);
      setCopyFeedback(null);
      return;
    }

    setCopyAction(target);
    setCopyActionError(null);
    setCopyActionErrorTarget(null);
    try {
      await copyTextToClipboard(path);
      if (copyFeedbackTimerRef.current !== null) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }
      setCopyFeedback(target);
      copyFeedbackTimerRef.current = window.setTimeout(() => {
        setCopyFeedback(null);
        copyFeedbackTimerRef.current = null;
      }, 1800);
    } catch (error) {
      setCopyActionError(error instanceof Error ? error.message : t('viewer.copyPathError'));
      setCopyActionErrorTarget(target);
    } finally {
      setCopyAction(null);
    }
  }, [currentFilePath, currentFolderPath, t]);

  useEffect(() => () => {
    if (copyFeedbackTimerRef.current !== null) {
      window.clearTimeout(copyFeedbackTimerRef.current);
    }
  }, []);

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
      else if (onNavigateNextWork) onNavigateNextWork();
      else onNavigate(0);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [currentIndex, images.length, isSlideshowPlaying, onNavigate, onNavigateNextWork]);

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
    if (target?.closest('.fullscreen-viewer__details, button, input, select, textarea, video, [contenteditable="true"]')) return;

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
    if (target?.closest('.fullscreen-viewer__details')) return;
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
      if (target?.closest('.fullscreen-viewer__details')) return;
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

  const closeMobileToolbar = useCallback(() => {
    setIsMobileToolbarOpen(false);
  }, []);

  const toggleShortcutHelp = useCallback(() => {
    setShowShortcutHelp(open => !open);
  }, []);

  const closeShortcutHelp = useCallback(() => {
    setShowShortcutHelp(false);
  }, []);

  const toggleFlipHorizontal = useCallback(() => {
    if (transformReady) setFlipHorizontal(value => !value);
  }, [setFlipHorizontal, transformReady]);

  const toggleFlipVertical = useCallback(() => {
    if (transformReady) setFlipVertical(value => !value);
  }, [setFlipVertical, transformReady]);

  const toggleDetails = useCallback(() => {
    setShowDetails(value => !value);
  }, []);

  const toggleSlideshow = useCallback(() => {
    setIsSlideshowPlaying(value => !value);
  }, []);

  useViewerKeyboard({
    viewerRef,
    currentItem,
    imagesLength: images.length,
    transformReady,
    showShortcutHelp,
    isMobileToolbarOpen,
    zoomModeShortcuts: ZOOM_MODE_SHORTCUTS,
    onClose,
    onNavigate,
    onDeleteCurrent,
    onNext: handleNext,
    onPrevious: handlePrev,
    onToggleShortcutHelp: toggleShortcutHelp,
    onCloseShortcutHelp: closeShortcutHelp,
    onCloseMobileToolbar: closeMobileToolbar,
    onApplyZoomMode: applyZoomMode,
    onZoomIn: zoomIn,
    onZoomOut: zoomOut,
    onShowActualSize: showActualSize,
    onFitToViewer: fitToViewer,
    onRotate: rotateImage,
    onToggleFlipHorizontal: toggleFlipHorizontal,
    onToggleFlipVertical: toggleFlipVertical,
    onToggleDetails: toggleDetails,
    onToggleToolbar: toggleShowToolbar,
    onToggleFilmstrip: toggleShowFilmstrip,
    onReloadMedia: reloadCurrentMedia,
    onToggleCheckerboard: toggleCheckerboard,
    onToggleBrowserFullscreen: toggleBrowserFullscreen,
    onToggleSlideshow: toggleSlideshow,
    onToggleVideoPlayback: toggleVideoPlayback,
  });

  if (!currentItem) return null;

  const mediaUrl = currentMediaUrl;

  return (
    <div
      ref={viewerRef}
      role="dialog"
      aria-modal="true"
      aria-label={currentItem.title || t('viewer.imagePreview')}
      tabIndex={-1}
      className={`fullscreen-viewer animate-fadeIn${checkerboardEnabled ? ' is-checkerboard' : ''}${blurEnabled ? ' is-blur-enabled' : ''}${demoMode ? ' is-demo-mode' : ''}${showToolbar ? '' : ' is-toolbar-hidden'}${images.length > 1 && showFilmstrip ? ' has-filmstrip' : ''}`}
    >
      <ViewerToolbar
        currentItem={currentItem}
        counterLabel={`${formatNumber(pageNumberState.pageNumbers[currentIndex] ?? pageOffset + currentIndex + 1)} / ${formatNumber(currentPageTotal)}`}
        currentIndex={currentIndex}
        imageCount={images.length}
        activeMode={activeMode}
        fullscreenPageLayout={toolbarPageLayout}
        allowSpreadLayout={!isMobileViewport}
        fullscreenReadingDirection={fullscreenReadingDirection}
        simpleToolbar={simpleToolbar}
        isMediaLoading={isMediaLoading}
        showToolbar={showToolbar}
        showFilmstrip={showFilmstrip}
        showShortcutHelp={showShortcutHelp}
        isMobileToolbarOpen={isMobileToolbarOpen}
        showDetails={showDetails}
        hasTransformableMedia={hasTransformableMedia}
        zoomMode={zoomMode}
        effectiveZoomPercent={effectiveZoomPercent}
        zoomShortcuts={localizedZoomModeShortcuts}
        flipHorizontal={flipHorizontal}
        flipVertical={flipVertical}
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
        onPrevious={handlePrev}
        onNext={handleNext}
        onChangeMode={onChangeMode}
        onPageLayoutChange={onPageLayoutChange}
        onReadingDirectionChange={onReadingDirectionChange}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
        onShowActualSize={showActualSize}
        onFitToViewer={fitToViewer}
        onApplyZoomMode={applyZoomMode}
        onRotate={rotateImage}
        onToggleFlipHorizontal={toggleFlipHorizontal}
        onToggleFlipVertical={toggleFlipVertical}
        onReloadMedia={reloadCurrentMedia}
        onToggleCheckerboard={toggleCheckerboard}
        onToggleBrowserFullscreen={toggleBrowserFullscreen}
        onToggleSlideshow={toggleSlideshow}
        onHideToolbar={() => {
          handleShowToolbarChange(false);
          closeMobileToolbar();
        }}
        onToggleFilmstrip={toggleShowFilmstrip}
        onToggleGroupMangaPosts={onToggleGroupMangaPosts}
        onToggleBlur={onToggleBlur}
        onToggleShortcutHelp={toggleShortcutHelp}
        onSimpleToolbarChange={onSimpleToolbarChange}
        onDeleteCurrent={onDeleteCurrent}
        onShowToolbarAgain={showToolbarAgain}
        onClose={onClose}
      />

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
        {(currentIndex > 0 || onNavigatePrevWork) && (
          <IconButton
            type="button"
            onClick={handlePrev}
            aria-label={t('viewer.previousImage')}
            variant="secondary"
            size="lg"
            className="viewer-nav-button viewer-nav-button--previous"
            title={`${t('viewer.previousImage')} (←)`}
          >
            <ChevronLeft className="w-8 h-8" aria-hidden="true" />
          </IconButton>
        )}

        {(currentIndex < images.length - 1 || onNavigateNextWork) && (
          <IconButton
            type="button"
            onClick={handleNext}
            aria-label={t('viewer.nextImage')}
            variant="secondary"
            size="lg"
            className="viewer-nav-button viewer-nav-button--next"
            title={`${t('viewer.nextImage')} (→)`}
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
                    aria-label={currentItem.title || t('viewer.video')}
                    onLoadedMetadata={handleVideoLoadedMetadata}
                    onLoadedData={handleVideoLoadedData}
                    onVolumeChange={handleVideoVolumeChange}
                    className={`fullscreen-viewer__media${isVideoReady ? ' is-video-ready' : ''} ${blurEnabled ? 'blur-media blur-media--viewer' : ''}`}
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
                      handleThumbnailError();
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
                    onLoad={handleDisplayedImageLoad}
                    onError={handleDisplayedImageError}
                    draggable={false}
                    className={`fullscreen-viewer__media fullscreen-viewer__media--original is-visible ${blurEnabled ? 'blur-media blur-media--viewer' : ''}`}
                  />
                )}
              </div>
            )}
            {originalLoadFailed && !demoMode && (
              <p className="fullscreen-viewer__load-error" role="status">
                {t('viewer.mediaLoadFailed')}
              </p>
            )}
          </div>
        )}

        {/* Details Panel Overlay */}
        {showDetails && currentItem && (
          <ViewerDetailsPanel
            items={[{
              item: currentItem,
              dimensions: currentItemIsVideo
                ? videoNaturalSizeMediaUrl === currentMediaUrl
                  && videoNaturalSize.width > 0
                  && videoNaturalSize.height > 0
                  ? videoNaturalSize
                  : null
                : naturalSizeMediaUrl === currentMediaUrl
                  && naturalSize.width > 0
                  && naturalSize.height > 0
                  ? naturalSize
                  : null,
              currentItemIsVideo,
              mediaUrl,
              canOpenLocalMedia,
              openAction,
              openActionError,
              openActionErrorTarget,
              onOpenLocalMedia: handleOpenLocalMedia,
              canCopyFilePath,
              canCopyFolderPath,
              copyAction,
              copyActionError,
              copyActionErrorTarget,
              copyFeedback,
              onCopyPath: handleCopyPath,
              sourceLink,
              isSourceLoading,
            }]}
            isMobileViewport={isMobileViewport}
            primaryItemId={currentItem.image_id}
            onClose={() => setShowDetails(false)}
          />
        )}
      </div>

      {showShortcutHelp && (
        <ViewerShortcutDialog
          videoSeekSeconds={videoSeekSeconds}
          videoHoldPlaybackRate={videoHoldPlaybackRate}
          onClose={() => setShowShortcutHelp(false)}
        />
      )}

      {/* Bottom Gallery Panel */}
      {images.length > 1 && showFilmstrip && (
        <ViewerFilmstrip
          images={images}
          currentIndex={currentIndex}
          pageNumbers={pageNumberState.pageNumbers}
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
          onNavigate={onNavigate}
          thumbnailSize={thumbnailSize}
          blurEnabled={blurEnabled}
          demoMode={demoMode}
        />
      )}
    </div>
  );
};
