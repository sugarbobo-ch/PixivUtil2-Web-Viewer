import { useCallback, useLayoutEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import { ImageItem } from '../types';
import {
  buildFilmstripLayout,
  findIndexAtOffset,
  FilmstripLayout,
} from '../utils/viewerLayout';

// Keep the compact fullscreen filmstrip geometry in sync with the legacy
// viewer rail: the edge inset is the same as the gap between thumbnails.
export const VIEWER_FILMSTRIP_ITEM_SIZE = 56;
export const VIEWER_FILMSTRIP_GAP = 6;
export const VIEWER_FILMSTRIP_EDGE_PADDING = VIEWER_FILMSTRIP_GAP;
export const VIEWER_FILMSTRIP_BOUNDARY_WIDTH = 2;
// A work separator occupies the same gap on both sides as a normal thumbnail.
export const VIEWER_FILMSTRIP_BOUNDARY_MARGIN = VIEWER_FILMSTRIP_GAP;
export const VIEWER_FILMSTRIP_VIRTUAL_OVERSCAN = 640;
export const VIEWER_FILMSTRIP_LOAD_OVERSCAN = 96;

interface UseViewerFilmstripOptions {
  images: readonly ImageItem[];
  currentIndex: number;
  showFilmstrip: boolean;
}

export const useViewerFilmstrip = ({
  images,
  currentIndex,
  showFilmstrip,
}: UseViewerFilmstripOptions) => {
  const filmstripScrollRef = useRef<HTMLDivElement>(null);
  const hasPositionedFilmstrip = useRef(false);
  const filmstripScrollFrameRef = useRef<number | null>(null);
  const pendingFilmstripScrollLeftRef = useRef(0);
  const [isFilmstripPositioned, setIsFilmstripPositioned] = useState(false);
  const [filmstripScrollLeft, setFilmstripScrollLeft] = useState(0);
  const [filmstripViewportWidth, setFilmstripViewportWidth] = useState(720);

  const filmstripLayout = useMemo<FilmstripLayout>(() => buildFilmstripLayout(images, {
    itemSize: VIEWER_FILMSTRIP_ITEM_SIZE,
    gap: VIEWER_FILMSTRIP_GAP,
    edgePadding: VIEWER_FILMSTRIP_EDGE_PADDING,
    boundaryWidth: VIEWER_FILMSTRIP_BOUNDARY_WIDTH,
    boundaryMargin: VIEWER_FILMSTRIP_BOUNDARY_MARGIN,
  }), [images]);

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

  useLayoutEffect(() => {
    const container = filmstripScrollRef.current;
    if (!container || images.length <= 1) return;

    const itemLeft = filmstripLayout.itemOffsets[currentIndex] ?? 0;
    const targetLeft = itemLeft - Math.max(0, (container.clientWidth - VIEWER_FILMSTRIP_ITEM_SIZE) / 2);
    const maxScrollLeft = Math.max(0, filmstripLayout.totalWidth - container.clientWidth);
    const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, targetLeft));

    if (Math.abs(container.scrollLeft - nextScrollLeft) > 0.5) {
      if (typeof container.scrollTo === 'function') {
        container.scrollTo({ left: nextScrollLeft, behavior: 'auto' });
      } else {
        container.scrollLeft = nextScrollLeft;
      }
    }
    setFilmstripScrollLeft(previous => Math.abs(previous - nextScrollLeft) < 0.5 ? previous : nextScrollLeft);

    if (!hasPositionedFilmstrip.current) {
      hasPositionedFilmstrip.current = true;
      setIsFilmstripPositioned(true);
    }
  }, [currentIndex, filmstripLayout, filmstripViewportWidth, images.length, showFilmstrip]);

  const handleFilmstripScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    pendingFilmstripScrollLeftRef.current = event.currentTarget.scrollLeft;
    if (filmstripScrollFrameRef.current !== null) return;

    filmstripScrollFrameRef.current = window.requestAnimationFrame(() => {
      filmstripScrollFrameRef.current = null;
      const nextScrollLeft = pendingFilmstripScrollLeftRef.current;
      setFilmstripScrollLeft(previous => Math.abs(previous - nextScrollLeft) < 0.5 ? previous : nextScrollLeft);
    });
  }, []);

  useLayoutEffect(() => () => {
    if (filmstripScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(filmstripScrollFrameRef.current);
    }
  }, []);

  const filmstripStartIndex = images.length > 0
    ? Math.max(
      0,
      findIndexAtOffset(
        filmstripLayout.itemOffsets,
        Math.max(0, filmstripScrollLeft - VIEWER_FILMSTRIP_VIRTUAL_OVERSCAN),
      ),
    )
    : 0;
  const filmstripEndIndex = images.length > 0
    ? Math.min(
      images.length,
      findIndexAtOffset(
        filmstripLayout.itemOffsets,
        filmstripScrollLeft + filmstripViewportWidth + VIEWER_FILMSTRIP_VIRTUAL_OVERSCAN,
      ) + 1,
    )
    : 0;

  return {
    filmstripLayout,
    filmstripStartIndex,
    filmstripEndIndex,
    filmstripLoadStart: filmstripScrollLeft - VIEWER_FILMSTRIP_LOAD_OVERSCAN,
    filmstripLoadEnd: filmstripScrollLeft + filmstripViewportWidth + VIEWER_FILMSTRIP_LOAD_OVERSCAN,
    filmstripViewportWidth,
    filmstripItemSize: VIEWER_FILMSTRIP_ITEM_SIZE,
    isFilmstripPositioned,
    filmstripScrollRef,
    handleFilmstripScroll,
  };
};
