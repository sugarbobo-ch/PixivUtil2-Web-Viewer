import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FullscreenZoomMode } from '../types';

export type ViewerZoomMode = FullscreenZoomMode | 'custom';

export const MIN_ZOOM_PERCENT = 10;
export const MAX_ZOOM_PERCENT = 800;
export const ZOOM_STEP = 10;

interface ViewerSize {
  width: number;
  height: number;
}

interface ViewerPoint {
  x: number;
  y: number;
}

interface UseViewerTransformOptions {
  fullscreenZoomMode: FullscreenZoomMode;
  onZoomModeChange?: (mode: FullscreenZoomMode) => void;
  hasCurrentItem: boolean;
  currentItemIsVideo: boolean;
  demoMode: boolean;
  currentMediaUrl: string;
  displayedImageUrl: string | null;
  naturalSize: ViewerSize;
  naturalSizeMediaUrl: string | null;
  stageSize: ViewerSize;
  isDisplayedMediaCurrent: boolean;
  isMediaTransitionSuppressed: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const useViewerTransform = ({
  fullscreenZoomMode,
  onZoomModeChange,
  hasCurrentItem,
  currentItemIsVideo,
  demoMode,
  currentMediaUrl,
  displayedImageUrl,
  naturalSize,
  naturalSizeMediaUrl,
  stageSize,
  isDisplayedMediaCurrent,
  isMediaTransitionSuppressed,
}: UseViewerTransformOptions) => {
  const [zoomMode, setZoomMode] = useState<ViewerZoomMode>(fullscreenZoomMode);
  const [customZoomPercent, setCustomZoomPercent] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);
  const [pan, setPan] = useState<ViewerPoint>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const zoomModeRef = useRef<ViewerZoomMode>(zoomMode);

  useEffect(() => {
    zoomModeRef.current = zoomMode;
  }, [zoomMode]);

  useEffect(() => {
    setZoomMode(fullscreenZoomMode);
    setCustomZoomPercent(100);
    setPan({ x: 0, y: 0 });
  }, [fullscreenZoomMode]);

  const transformReady = Boolean(
    hasCurrentItem
    && !demoMode
    && !currentItemIsVideo
    && naturalSizeMediaUrl === (displayedImageUrl || currentMediaUrl)
    && naturalSize.width > 0
    && naturalSize.height > 0
    && stageSize.width > 0
    && stageSize.height > 0,
  );
  const hasTransformableMedia = Boolean(
    hasCurrentItem
    && !demoMode
    && !currentItemIsVideo,
  );
  const isMediaLoading = Boolean(hasTransformableMedia && !isDisplayedMediaCurrent);
  const suppressMediaTransitions = isMediaLoading || isMediaTransitionSuppressed;
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const isQuarterTurn = normalizedRotation === 90 || normalizedRotation === 270;
  const orientedNaturalWidth = isQuarterTurn ? naturalSize.height : naturalSize.width;
  const orientedNaturalHeight = isQuarterTurn ? naturalSize.width : naturalSize.height;

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
  const autoZoomPercent = transformReady ? Math.min(100, fitZoomPercent) : 100;
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

  const clampPan = useCallback((nextPan: ViewerPoint, zoomPercent: number, nextRotation: number): ViewerPoint => {
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

  const resetTransform = useCallback(() => {
    if (zoomModeRef.current !== 'lock') {
      setZoomMode(fullscreenZoomMode);
      setCustomZoomPercent(100);
    }
    setRotation(0);
    setFlipHorizontal(false);
    setFlipVertical(false);
    setPan({ x: 0, y: 0 });
    setIsPanning(false);
  }, [fullscreenZoomMode]);

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

  const applyZoomMode = useCallback((mode: Exclude<ViewerZoomMode, 'custom'>) => {
    if (!transformReady) return;
    if (mode === 'lock') setCustomZoomPercent(Math.round(effectiveZoomPercent));
    zoomModeRef.current = mode;
    setZoomMode(mode);
    setPan({ x: 0, y: 0 });
    onZoomModeChange?.(mode);
  }, [effectiveZoomPercent, onZoomModeChange, transformReady]);

  const rotateImage = useCallback((degrees: number) => {
    if (!transformReady) return;
    setRotation(previous => (previous + degrees + 360) % 360);
    setPan({ x: 0, y: 0 });
  }, [transformReady]);

  useEffect(() => {
    setPan(previous => {
      const next = clampPan(previous, effectiveZoomPercent, rotation);
      return next.x === previous.x && next.y === previous.y ? previous : next;
    });
  }, [clampPan, effectiveZoomPercent, rotation]);

  const mediaFrameStyle = useMemo<React.CSSProperties>(() => ({
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

  return {
    zoomMode,
    setZoomMode,
    customZoomPercent,
    setCustomZoomPercent,
    rotation,
    setRotation,
    flipHorizontal,
    setFlipHorizontal,
    flipVertical,
    setFlipVertical,
    pan,
    setPan,
    isPanning,
    setIsPanning,
    zoomModeRef,
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
  };
};
