import { getItemGroupKey } from '../utils/grouping';
import type { ImageItem } from '../types';
import type { MediaRange, MediaRangeAdapter, MediaQuery, MediaRangeResponse, MonthLayoutItem } from './types';

export interface InMemoryMediaRangeAdapterOptions {
  images: ImageItem[];
  revision?: string;
  revisionSequence?: string[];
  delayByStart?: Record<number, number>;
  deferredStarts?: Set<number>;
  onDeferred?: (release: () => void) => void;
  failStartsOnce?: Set<number>;
  months?: MonthLayoutItem[];
}

const abortError = () => {
  const error = new Error('The media range request was aborted.');
  error.name = 'AbortError';
  return error;
};

const wait = (delay: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) {
    reject(abortError());
    return;
  }
  const timer = delay > 0 ? window.setTimeout(resolve, delay) : undefined;
  const onAbort = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    reject(abortError());
  };
  signal.addEventListener('abort', onAbort, { once: true });
  if (timer === undefined) {
    signal.removeEventListener('abort', onAbort);
    resolve();
  }
});

const buildMonths = (images: ImageItem[]): MonthLayoutItem[] => {
  const byMonth = new Map<string, { offset: number; imageCount: number; groups: Set<string> }>();
  images.forEach((item, index) => {
    const key = item.created_date.slice(0, 7);
    const current = byMonth.get(key) ?? { offset: index, imageCount: 0, groups: new Set<string>() };
    current.imageCount += 1;
    current.groups.add(getItemGroupKey(item));
    byMonth.set(key, current);
  });
  return Array.from(byMonth, ([key, value]) => ({
    key,
    label: key,
    offset: value.offset,
    imageCount: value.imageCount,
    cardCount: value.imageCount,
  }));
};

export const createInMemoryMediaRangeAdapter = (options: InMemoryMediaRangeAdapterOptions) => {
  const images = [...options.images];
  const loadCounts = new Map<number, number>();
  const revisionSequence = [...(options.revisionSequence ?? [])];
  const failStartsOnce = new Set(options.failStartsOnce ?? []);
  const deferredStarts = new Set(options.deferredStarts ?? []);
  const months = options.months ?? buildMonths(images);

  const load = async (_query: MediaQuery, range: MediaRange, signal: AbortSignal): Promise<MediaRangeResponse> => {
    const count = (loadCounts.get(range.start) ?? 0) + 1;
    loadCounts.set(range.start, count);
    if (failStartsOnce.has(range.start)) {
      failStartsOnce.delete(range.start);
      throw new Error(`Synthetic range failure at ${range.start}.`);
    }

    if (deferredStarts.has(range.start)) {
      deferredStarts.delete(range.start);
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(abortError());
          return;
        }
        const onAbort = () => reject(abortError());
        signal.addEventListener('abort', onAbort, { once: true });
        options.onDeferred?.(() => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        });
      });
    }
    await wait(options.delayByStart?.[range.start] ?? 0, signal);

    const revision = revisionSequence.length > 0
      ? revisionSequence.shift()!
      : options.revision ?? 'in-memory-revision';
    const start = Math.min(range.start, images.length);
    const end = Math.min(range.end, images.length);
    return {
      revision,
      total: images.length,
      range: { start: range.start, end: range.end },
      images: images.slice(start, end),
      months,
    };
  };

  return {
    load,
    getLoadCount: (start: number) => loadCounts.get(start) ?? 0,
  } satisfies MediaRangeAdapter & { getLoadCount(start: number): number };
};
