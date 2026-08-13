import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { createGlobalMediaWindow, type GlobalMediaWindowOptions } from './GlobalMediaWindow';
import type { LoadIntent, MediaQuery, MediaRange, MediaRangeAdapter, MediaWindowController } from './types';

export interface UseGlobalMediaWindowOptions extends Omit<GlobalMediaWindowOptions, 'query'> {
  query: GlobalMediaWindowOptions['query'];
}

const queryKeyFor = (query: GlobalMediaWindowOptions['query']) => JSON.stringify({
  selectedMonths: [...query.selectedMonths].sort(),
  selectedArtist: query.selectedArtist,
  searchQuery: query.searchQuery,
  sortMode: query.sortMode,
  grouping: query.grouping,
});

const MAX_QUERY_CONTROLLERS = 8;
const controllerCache = new WeakMap<MediaRangeAdapter, Map<string, MediaWindowController>>();

const getCachedController = (
  adapter: MediaRangeAdapter,
  query: MediaQuery,
  chunkSize?: number,
  maxChunks?: number,
) => {
  const cache = controllerCache.get(adapter) ?? new Map<string, MediaWindowController>();
  controllerCache.set(adapter, cache);
  const key = queryKeyFor(query);
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const controller = createGlobalMediaWindow({ adapter, query, chunkSize, maxChunks });
  cache.set(key, controller);
  while (cache.size > MAX_QUERY_CONTROLLERS) cache.delete(cache.keys().next().value!);
  return controller;
};

export const useGlobalMediaWindow = ({ adapter, query, chunkSize, maxChunks }: UseGlobalMediaWindowOptions) => {
  const queryKey = queryKeyFor(query);
  const controller = useMemo(
    () => getCachedController(adapter, query, chunkSize, maxChunks),
    [adapter, chunkSize, maxChunks, queryKey],
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  const prefetch = useCallback((
    targetQuery: MediaQuery,
    range: MediaRange,
    intent: LoadIntent = 'scrub-preview',
  ) => getCachedController(adapter, targetQuery, chunkSize, maxChunks).ensure(range, intent), [adapter, chunkSize, maxChunks]);

  return { controller, snapshot, prefetch };
};
