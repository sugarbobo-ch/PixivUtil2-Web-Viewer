import { useCallback, useEffect } from 'react';
import { ImageItem } from '../types';
import { ViewerZoomMode } from './useViewerTransform';

export interface ViewerKeyboardShortcut {
  mode: Exclude<ViewerZoomMode, 'custom'>;
  key: string;
  code: KeyboardEvent['code'];
}

interface UseViewerKeyboardOptions {
  viewerRef: React.RefObject<HTMLElement | null>;
  currentItem: ImageItem | undefined;
  imagesLength: number;
  transformReady: boolean;
  showShortcutHelp: boolean;
  isMobileToolbarOpen: boolean;
  zoomModeShortcuts: readonly ViewerKeyboardShortcut[];
  onClose: () => void;
  onNavigate: (index: number) => void;
  onDeleteCurrent?: (imageId: number) => void;
  onNext: () => void;
  onPrevious: () => void;
  onToggleShortcutHelp: () => void;
  onCloseShortcutHelp: () => void;
  onCloseMobileToolbar: () => void;
  onApplyZoomMode: (mode: Exclude<ViewerZoomMode, 'custom'>) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onArrowRight?: () => void;
  onArrowLeft?: () => void;
  onShowActualSize: () => void;
  onFitToViewer: () => void;
  onRotate: (degrees: number) => void;
  onToggleFlipHorizontal: () => void;
  onToggleFlipVertical: () => void;
  onToggleDetails: () => void;
  onToggleToolbar: () => void;
  onToggleFilmstrip: () => void;
  onReloadMedia: () => void;
  onToggleCheckerboard: () => void;
  onToggleBrowserFullscreen: () => void;
  onToggleSlideshow: () => void;
  onToggleVideoPlayback: () => void;
}

export const useViewerKeyboard = ({
  viewerRef,
  currentItem,
  imagesLength,
  transformReady,
  showShortcutHelp,
  isMobileToolbarOpen,
  zoomModeShortcuts,
  onClose,
  onNavigate,
  onDeleteCurrent,
  onNext,
  onPrevious,
  onToggleShortcutHelp,
  onCloseShortcutHelp,
  onCloseMobileToolbar,
  onApplyZoomMode,
  onZoomIn,
  onZoomOut,
  onArrowRight,
  onArrowLeft,
  onShowActualSize,
  onFitToViewer,
  onRotate,
  onToggleFlipHorizontal,
  onToggleFlipVertical,
  onToggleDetails,
  onToggleToolbar,
  onToggleFilmstrip,
  onReloadMedia,
  onToggleCheckerboard,
  onToggleBrowserFullscreen,
  onToggleSlideshow,
  onToggleVideoPlayback,
}: UseViewerKeyboardOptions) => {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!(event.target instanceof Node) || !viewerRef.current) return;

    const target = event.target instanceof Element ? event.target : null;
    const isInsideViewer = viewerRef.current.contains(event.target);
    if (!isInsideViewer && event.target !== document.body && event.target !== document.documentElement) return;
    const isVideoTarget = Boolean(target?.closest('video'));
    const isTextEntryTarget = Boolean(target?.closest('input, textarea, select, [contenteditable="true"]'));
    const isButtonTarget = Boolean(target?.closest('button'));

    if (event.key === 'F1') {
      event.preventDefault();
      event.stopPropagation();
      onToggleShortcutHelp();
      return;
    }

    if (event.key === 'Escape' && showShortcutHelp) {
      event.preventDefault();
      event.stopPropagation();
      onCloseShortcutHelp();
      return;
    }

    if (event.key === 'Escape' && isMobileToolbarOpen) {
      event.preventDefault();
      event.stopPropagation();
      onCloseMobileToolbar();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }

    const isFilmstripTarget = Boolean(target?.closest('.fullscreen-viewer__thumbnail'));
    const isFilmstripNavigationKey = event.key === 'ArrowRight'
      || event.key === 'ArrowDown'
      || event.key === 'PageDown'
      || event.key === 'k'
      || event.key === 'K'
      || event.key === 'ArrowLeft'
      || event.key === 'ArrowUp'
      || event.key === 'PageUp'
      || event.key === 'j'
      || event.key === 'J';

    if (isFilmstripTarget && isFilmstripNavigationKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === 'k' || event.key === 'K') {
        onNext();
      } else {
        onPrevious();
      }
      viewerRef.current?.focus({ preventScroll: true });
      return;
    }

    // Preserve the browser's native timeline seeking when an unmodified
    // arrow key is focused on a video. Viewer shortcuts still work there.
    const shouldPreserveVideoTimelineControl = isVideoTarget
      && !event.ctrlKey
      && !event.altKey
      && !event.metaKey
      && !onArrowRight
      && !onArrowLeft
      && (event.key === 'ArrowLeft' || event.key === 'ArrowRight');

    const preservesNativeButtonActivation = isButtonTarget
      && (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar' || event.code === 'Space');
    if (shouldPreserveVideoTimelineControl || isTextEntryTarget || preservesNativeButtonActivation) return;

    const zoomModeShortcut = !event.ctrlKey && !event.altKey && !event.metaKey
      ? zoomModeShortcuts.find(item => item.key === event.key || item.code === event.code)
      : undefined;

    if (zoomModeShortcut) {
      event.preventDefault();
      event.stopPropagation();
      onApplyZoomMode(zoomModeShortcut.mode);
    } else if (!event.altKey && !event.metaKey && (event.key === '+' || event.code === 'NumpadAdd' || (event.ctrlKey && event.key === '='))) {
      event.preventDefault();
      event.stopPropagation();
      onZoomIn();
    } else if (!event.altKey && !event.metaKey && (event.key === '-' || event.code === 'NumpadSubtract')) {
      event.preventDefault();
      event.stopPropagation();
      onZoomOut();
    } else if (event.ctrlKey && event.key === '0') {
      event.preventDefault();
      event.stopPropagation();
      onShowActualSize();
    } else if (event.ctrlKey && (event.key === 'm' || event.key === 'M')) {
      event.preventDefault();
      event.stopPropagation();
      onFitToViewer();
    } else if (event.ctrlKey && event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      onRotate(90);
    } else if (event.ctrlKey && event.key === 'ArrowLeft') {
      event.preventDefault();
      event.stopPropagation();
      onRotate(-90);
    } else if (event.ctrlKey && (event.key === 'h' || event.key === 'H')) {
      event.preventDefault();
      event.stopPropagation();
      if (transformReady) onToggleFlipHorizontal();
    } else if (event.ctrlKey && (event.key === 'v' || event.key === 'V')) {
      event.preventDefault();
      event.stopPropagation();
      if (transformReady) onToggleFlipVertical();
    } else if (event.key === 'Home') {
      event.preventDefault();
      event.stopPropagation();
      onNavigate(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      onNavigate(Math.max(0, imagesLength - 1));
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === 'k' || event.key === 'K') {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'ArrowRight' && onArrowRight) onArrowRight();
      else onNext();
      viewerRef.current?.focus({ preventScroll: true });
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'j' || event.key === 'J') {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'ArrowLeft' && onArrowLeft) onArrowLeft();
      else onPrevious();
      viewerRef.current?.focus({ preventScroll: true });
    } else if (event.key === 'i' || event.key === 'I') {
      event.preventDefault();
      event.stopPropagation();
      onToggleDetails();
    } else if (event.key === 't' || event.key === 'T') {
      event.preventDefault();
      event.stopPropagation();
      onToggleToolbar();
      onCloseMobileToolbar();
    } else if ((event.key === 'g' || event.key === 'G') && imagesLength > 1) {
      event.preventDefault();
      event.stopPropagation();
      onToggleFilmstrip();
    } else if (event.key === 'r' || event.key === 'R') {
      event.preventDefault();
      event.stopPropagation();
      onReloadMedia();
    } else if (event.key === 'b' || event.key === 'B') {
      event.preventDefault();
      event.stopPropagation();
      onToggleCheckerboard();
    } else if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      event.stopPropagation();
      onToggleBrowserFullscreen();
    } else if ((event.key === 's' || event.key === 'S') && imagesLength > 1) {
      event.preventDefault();
      event.stopPropagation();
      onToggleSlideshow();
    } else if ((event.key === ' ' || event.key === 'Spacebar' || event.code === 'Space') && !event.repeat) {
      event.preventDefault();
      event.stopPropagation();
      onToggleVideoPlayback();
    } else if (event.key === 'Delete' && onDeleteCurrent && currentItem) {
      event.preventDefault();
      event.stopPropagation();
      onDeleteCurrent(currentItem.image_id);
    }
  }, [
    currentItem,
    imagesLength,
    isMobileToolbarOpen,
    onApplyZoomMode,
    onArrowLeft,
    onArrowRight,
    onClose,
    onCloseMobileToolbar,
    onCloseShortcutHelp,
    onDeleteCurrent,
    onFitToViewer,
    onNavigate,
    onNext,
    onPrevious,
    onReloadMedia,
    onRotate,
    onShowActualSize,
    onToggleBrowserFullscreen,
    onToggleCheckerboard,
    onToggleDetails,
    onToggleFilmstrip,
    onToggleFlipHorizontal,
    onToggleFlipVertical,
    onToggleShortcutHelp,
    onToggleSlideshow,
    onToggleToolbar,
    onToggleVideoPlayback,
    onZoomIn,
    onZoomOut,
    showShortcutHelp,
    transformReady,
    viewerRef,
    zoomModeShortcuts,
  ]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);
};
