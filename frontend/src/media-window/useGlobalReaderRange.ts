import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ImageItem } from '../types';
import type { MediaRange, MediaWindowController } from './types';

export interface GlobalReaderRangeState {
  range: MediaRange;
  images: ImageItem[];
  currentIndex: number;
  total: number;
  isReady: boolean;
  isLoading: boolean;
}

export const getBoundedReaderRange = (
  index: number,
  total: number,
  maxItems = 160,
): MediaRange => {
  const safeTotal = Math.max(0, Number.isFinite(total) ? Math.floor(total) : 0);
  if (safeTotal === 0) return { start: 0, end: 0 };
  const safeIndex = Math.max(0, Math.min(safeTotal - 1, Math.floor(index)));
  const size = Math.max(2, Math.min(safeTotal, Math.floor(maxItems)));
  const half = Math.floor(size / 2);
  // Keep one predecessor in the bounded window so spread pairing can resolve
  // a page-2/page-3 pair when the active page is exactly at the window edge.
  const start = Math.max(0, Math.min(safeTotal - size, safeIndex - half - 1));
  return { start, end: start + size };
};

export interface UseGlobalReaderRangeOptions {
  controller: MediaWindowController;
  index: number | null;
  active?: boolean;
  maxItems?: number;
}

export const useGlobalReaderRange = ({
  controller,
  index,
  active = true,
  maxItems = 160,
}: UseGlobalReaderRangeOptions): GlobalReaderRangeState => {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const range = useMemo(
    () => getBoundedReaderRange(index ?? 0, snapshot.total, maxItems),
    [index, maxItems, snapshot.total],
  );
  const isReady = active
    && index !== null
    && range.end > range.start
    && snapshot.isRangeReady(range);

  useEffect(() => {
    if (!active || index === null || range.end <= range.start) return undefined;
    const release = controller.pin('reader', range);
    void controller.ensure(range, 'reader-neighbor').catch(() => undefined);
    return release;
  }, [active, controller, index, range]);

  const images = useMemo(() => {
    if (!isReady) return [];
    const next: ImageItem[] = [];
    for (let current = range.start; current < range.end; current += 1) {
      const slot = snapshot.get(current);
      if (slot.status !== 'ready' || !slot.item) return [];
      next.push(slot.item);
    }
    return next;
  }, [isReady, range, snapshot]);

  return {
    range,
    images,
    currentIndex: index === null ? 0 : Math.max(0, index - range.start),
    total: snapshot.total,
    isReady: images.length > 0 && index !== null,
    isLoading: active && index !== null && !isReady,
  };
};
