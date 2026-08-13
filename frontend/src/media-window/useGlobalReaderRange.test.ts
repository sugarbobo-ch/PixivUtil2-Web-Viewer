import { describe, expect, it } from 'vitest';
import { createGlobalMediaWindow } from './GlobalMediaWindow';
import { createInMemoryMediaRangeAdapter } from './inMemoryMediaRangeAdapter';
import { getBoundedReaderRange } from './useGlobalReaderRange';

const createImages = (count: number) => Array.from({ length: count }, (_, index) => ({
  image_id: index + 1,
  save_name: `image-${index + 1}.jpg`,
  title: `Image ${index + 1}`,
  created_date: '2024-01-01',
  last_update_date: '2024-01-01',
  member_id: 1,
}));

describe('bounded global reader range', () => {
  it('keeps the active image centered without exceeding the reader cap', () => {
    expect(getBoundedReaderRange(3, 1_000, 160)).toEqual({ start: 0, end: 160 });
    expect(getBoundedReaderRange(520, 1_000, 160)).toEqual({ start: 439, end: 599 });
    expect(getBoundedReaderRange(998, 1_000, 160)).toEqual({ start: 840, end: 1_000 });
  });

  it('loads both sides of an arbitrary chunk boundary before exposing a reader range', async () => {
    const adapter = createInMemoryMediaRangeAdapter({
      images: createImages(450),
      delayByStart: { 200: 2, 400: 1 },
    });
    const controller = createGlobalMediaWindow({
      adapter,
      query: {
        selectedMonths: [],
        selectedArtist: null,
        searchQuery: '',
        sortMode: 'newest_month',
        grouping: 'ungrouped',
      },
      chunkSize: 200,
      maxChunks: 5,
    });
    const range = getBoundedReaderRange(200, 450, 4);

    await controller.ensure(range, 'reader-neighbor');

    expect(range).toEqual({ start: 197, end: 201 });
    expect(controller.getSnapshot().isRangeReady(range)).toBe(true);
    expect(controller.getSnapshot().get(199).item?.image_id).toBe(200);
    expect(controller.getSnapshot().get(200).item?.image_id).toBe(201);
  });
});
