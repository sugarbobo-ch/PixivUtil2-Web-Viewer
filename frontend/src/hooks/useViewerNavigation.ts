import { useCallback, useRef, useState } from 'react';
import { ViewMode, ViewerMode } from '../types';

export interface ViewAnchorRequest {
  index: number;
  requestId: number;
}

interface UseViewerNavigationOptions {
  imageCount: number;
  initialMode?: ViewMode;
  preferredMode?: ViewerMode;
  isMobileViewport: boolean;
  getCurrentIndex: () => number | null;
  onExitEditMode?: () => void;
  onCancelNavigation?: () => void;
}

export interface ViewerNavigationController {
  viewMode: ViewMode;
  setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;
  fullscreenIndex: number | null;
  setFullscreenIndex: React.Dispatch<React.SetStateAction<number | null>>;
  gridRestoreAnchor: ViewAnchorRequest | null;
  webtoonStartAnchor: ViewAnchorRequest | null;
  normalizeIndex: (index: number | null) => number | null;
  requestGridRestore: (index: number | null) => void;
  requestWebtoonStart: (index: number | null) => void;
  openImage: (index: number) => void;
  changeMode: (requestedMode: ViewMode) => void;
  returnToGrid: () => void;
  closeFullscreen: () => void;
}

/**
 * Owns the cross-reader navigation contract while leaving DOM measurement and
 * reader-local state in their respective components.
 */
export const useViewerNavigation = ({
  imageCount,
  initialMode = 'grid',
  preferredMode = 'fullscreen',
  isMobileViewport,
  getCurrentIndex,
  onExitEditMode,
  onCancelNavigation,
}: UseViewerNavigationOptions): ViewerNavigationController => {
  const [viewMode, setViewMode] = useState<ViewMode>(initialMode);
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const [gridRestoreAnchor, setGridRestoreAnchor] = useState<ViewAnchorRequest | null>(null);
  const [webtoonStartAnchor, setWebtoonStartAnchor] = useState<ViewAnchorRequest | null>(null);
  const gridRestoreRequestIdRef = useRef(0);
  const webtoonStartRequestIdRef = useRef(0);

  const normalizeIndex = useCallback((index: number | null) => {
    if (imageCount === 0 || index === null || !Number.isFinite(index)) return null;
    return Math.max(0, Math.min(imageCount - 1, Math.floor(index)));
  }, [imageCount]);

  const requestGridRestore = useCallback((index: number | null) => {
    const safeIndex = normalizeIndex(index);
    if (safeIndex === null) return;
    setGridRestoreAnchor({ index: safeIndex, requestId: ++gridRestoreRequestIdRef.current });
  }, [normalizeIndex]);

  const requestWebtoonStart = useCallback((index: number | null) => {
    const safeIndex = normalizeIndex(index);
    if (safeIndex === null) return;
    setWebtoonStartAnchor({ index: safeIndex, requestId: ++webtoonStartRequestIdRef.current });
  }, [normalizeIndex]);

  const beginTransition = useCallback(() => {
    onCancelNavigation?.();
  }, [onCancelNavigation]);

  const openImage = useCallback((index: number) => {
    const safeIndex = normalizeIndex(index);
    if (safeIndex === null) return;

    beginTransition();
    if (preferredMode === 'webtoon') {
      onExitEditMode?.();
      requestWebtoonStart(safeIndex);
      setFullscreenIndex(null);
      setViewMode('webtoon');
      return;
    }

    setFullscreenIndex(safeIndex);
    setViewMode('fullscreen');
  }, [beginTransition, normalizeIndex, onExitEditMode, preferredMode, requestWebtoonStart]);

  const changeMode = useCallback((requestedMode: ViewMode) => {
    const nextMode = isMobileViewport && requestedMode === 'grid'
      ? preferredMode
      : requestedMode;
    const fullscreenActive = fullscreenIndex !== null;
    if (nextMode === viewMode && !fullscreenActive) return;

    const safeAnchorIndex = normalizeIndex(getCurrentIndex());
    beginTransition();

    if (nextMode === 'fullscreen') {
      setFullscreenIndex(safeAnchorIndex ?? (imageCount > 0 ? 0 : null));
    } else if (nextMode === 'webtoon') {
      onExitEditMode?.();
      requestWebtoonStart(safeAnchorIndex ?? (imageCount > 0 ? 0 : null));
      setFullscreenIndex(null);
    } else {
      requestGridRestore(safeAnchorIndex);
      setFullscreenIndex(null);
    }

    setViewMode(nextMode);
  }, [beginTransition, fullscreenIndex, getCurrentIndex, imageCount, isMobileViewport, normalizeIndex, onExitEditMode, preferredMode, requestGridRestore, requestWebtoonStart, viewMode]);

  const returnToGrid = useCallback(() => {
    const safeAnchorIndex = normalizeIndex(getCurrentIndex());
    beginTransition();
    requestGridRestore(safeAnchorIndex);
    setFullscreenIndex(null);
    setViewMode('grid');
  }, [beginTransition, getCurrentIndex, normalizeIndex, requestGridRestore]);

  const closeFullscreen = useCallback(() => {
    const safeAnchorIndex = normalizeIndex(fullscreenIndex);
    beginTransition();
    requestGridRestore(safeAnchorIndex);
    setFullscreenIndex(null);
    setViewMode('grid');
  }, [beginTransition, fullscreenIndex, normalizeIndex, requestGridRestore]);

  return {
    viewMode,
    setViewMode,
    fullscreenIndex,
    setFullscreenIndex,
    gridRestoreAnchor,
    webtoonStartAnchor,
    normalizeIndex,
    requestGridRestore,
    requestWebtoonStart,
    openImage,
    changeMode,
    returnToGrid,
    closeFullscreen,
  };
};
