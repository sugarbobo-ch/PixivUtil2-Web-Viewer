import { describe, expect, it } from 'vitest';
import {
  createGlobalMediaWindow,
  createInMemoryMediaRangeAdapter,
  type MediaQuery,
} from './index';
import type { ImageItem } from '../types';

const query: MediaQuery = {
  selectedMonths: [],
  selectedArtist: null,
  searchQuery: '',
  sortMode: 'newest_month',
  grouping: 'ungrouped',
};

const image = (index: number): ImageItem => ({
  image_id: index + 1,
  member_id: 1,
  title: `Image ${index}`,
  save_name: `artist/${index}.jpg`,
  created_date: '2026-08-01',
  last_update_date: '2026-08-01',
  dominant_color: index === 0 ? '#123456' : undefined,
});

const images = Array.from({ length: 12 }, (_, index) => image(index));

describe('GlobalMediaWindow interface', () => {
  it('merges overlapping ranges and deduplicates concurrent chunk requests', async () => {
    const adapter = createInMemoryMediaRangeAdapter({
      images,
      revision: 'revision-1',
      delayByStart: { 0: 20, 2: 0 },
    });
    const window = createGlobalMediaWindow({ adapter, query, chunkSize: 2 });

    await Promise.all([
      window.ensure({ start: 0, end: 4 }, 'viewport'),
      window.ensure({ start: 2, end: 6 }, 'reader-neighbor'),
      window.ensure({ start: 0, end: 2 }, 'viewport'),
    ]);

    expect(Array.from({ length: 6 }, (_, index) => window.getSnapshot().get(index).status))
      .toEqual(['ready', 'ready', 'ready', 'ready', 'ready', 'ready']);
    expect(adapter.getLoadCount(0)).toBe(1);
    expect(adapter.getLoadCount(2)).toBe(1);
  });

  it('keeps the month layout reference stable across repeated range responses', async () => {
    const adapter = createInMemoryMediaRangeAdapter({ images, revision: 'revision-1' });
    const window = createGlobalMediaWindow({ adapter, query, chunkSize: 2 });

    await window.ensure({ start: 0, end: 2 }, 'viewport');
    const months = window.getSnapshot().months;
    await window.ensure({ start: 2, end: 4 }, 'viewport');

    expect(window.getSnapshot().months).toBe(months);
  });

  it('does not allow an old query generation to publish its response', async () => {
    let releaseOld: (() => void) | undefined;
    const adapter = createInMemoryMediaRangeAdapter({
      images,
      revision: 'old',
      deferredStarts: new Set([0]),
      onDeferred: release => { releaseOld = release; },
    });
    const window = createGlobalMediaWindow({ adapter, query, chunkSize: 2 });
    const oldRequest = window.ensure({ start: 0, end: 2 }, 'viewport');

    window.reset({ ...query, searchQuery: 'new query' });
    releaseOld?.();
    await expect(oldRequest).rejects.toThrow(/stale|cancel/i);
    expect(window.getSnapshot().get(0).status).toBe('unloaded');
  });

  it('keeps only the latest non-overlapping scrub preview request active', async () => {
    const adapter = createInMemoryMediaRangeAdapter({
      images,
      revision: 'revision-1',
      deferredStarts: new Set([0]),
    });
    const window = createGlobalMediaWindow({ adapter, query, chunkSize: 2 });
    const oldPreview = window.ensure({ start: 0, end: 2 }, 'scrub-preview');

    await window.ensure({ start: 8, end: 10 }, 'scrub-preview');

    await expect(oldPreview).rejects.toThrow(/stale|abort/i);
    expect(window.getSnapshot().get(8).status).toBe('ready');
  });

  it('rejects mixed revisions and keeps the new snapshot isolated', async () => {
    const adapter = createInMemoryMediaRangeAdapter({
      images,
      revision: 'revision-1',
      revisionSequence: ['revision-1', 'revision-2'],
    });
    const window = createGlobalMediaWindow({ adapter, query, chunkSize: 2 });

    await window.ensure({ start: 0, end: 2 }, 'viewport');
    await window.ensure({ start: 2, end: 4 }, 'viewport');

    expect(window.getSnapshot().revision).toBe('revision-2');
    expect(window.getSnapshot().get(0).status).toBe('unloaded');
    expect(window.getSnapshot().get(2).status).toBe('ready');
  });

  it('keeps pinned chunks through the bounded LRU and retries error slots', async () => {
    const adapter = createInMemoryMediaRangeAdapter({
      images,
      revision: 'revision-1',
      failStartsOnce: new Set([10]),
    });
    const window = createGlobalMediaWindow({ adapter, query, chunkSize: 2, maxChunks: 5 });
    const unpin = window.pin('reader', { start: 0, end: 2 });

    await expect(window.ensure({ start: 10, end: 12 }, 'viewport')).rejects.toThrow();
    expect(window.getSnapshot().get(10).status).toBe('error');
    await window.ensure({ start: 10, end: 12 }, 'viewport');
    await window.ensure({ start: 0, end: 12 }, 'viewport');
    unpin();

    expect(adapter.getLoadCount(10)).toBeGreaterThanOrEqual(2);
    expect(adapter.getLoadCount(0)).toBe(1);
    expect(window.getDebugState().chunkStarts.length).toBeLessThanOrEqual(5);
  });

  it('retains lightweight dominant colors when an unpinned item chunk is evicted', async () => {
    const adapter = createInMemoryMediaRangeAdapter({ images, revision: 'revision-1' });
    const window = createGlobalMediaWindow({ adapter, query, chunkSize: 2, maxChunks: 1 });

    await window.ensure({ start: 0, end: 2 }, 'viewport');
    await window.ensure({ start: 2, end: 4 }, 'viewport');

    expect(window.getSnapshot().get(0).status).toBe('unloaded');
    expect(window.getSnapshot().getPlaceholderColor?.(0)).toBe('#123456');
  });

  it('treats a short terminal response as ready only for the actual result total', async () => {
    const adapter = createInMemoryMediaRangeAdapter({
      images: images.slice(0, 3),
      revision: 'revision-1',
    });
    const window = createGlobalMediaWindow({ adapter, query, chunkSize: 4 });

    await window.ensure({ start: 0, end: 4 }, 'viewport');

    expect(window.getSnapshot().total).toBe(3);
    expect(window.getSnapshot().isRangeReady({ start: 0, end: 3 })).toBe(true);
    expect(window.getSnapshot().get(3).status).toBe('unloaded');
  });
});
