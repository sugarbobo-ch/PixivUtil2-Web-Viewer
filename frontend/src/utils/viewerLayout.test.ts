import { describe, expect, it } from 'vitest';
import { ImageItem } from '../types';
import {
  buildFilmstripLayout,
  buildWebtoonMetrics,
  buildWebtoonThumbnailLayout,
  findIndexAtOffset,
  getVirtualRange,
} from './viewerLayout';

const image = (id: string, group: string): ImageItem => ({
  image_id: id,
  title: group,
  save_name: group === 'one'
    ? `Work_p${id === 'a' ? 0 : 1}.jpg`
    : `Other_p${id}.jpg`,
  group_id: group,
  media_status: null,
} as unknown as ImageItem);

describe('viewer layout helpers', () => {
  it('finds the item at or before an offset', () => {
    expect(findIndexAtOffset([], 10)).toBe(0);
    expect(findIndexAtOffset([0, 60, 120], -1)).toBe(0);
    expect(findIndexAtOffset([0, 60, 120], 59)).toBe(0);
    expect(findIndexAtOffset([0, 60, 120], 120)).toBe(2);
    expect(findIndexAtOffset([0, 60, 120], 999)).toBe(2);
  });

  it('adds filmstrip boundaries only between groups', () => {
    const layout = buildFilmstripLayout(
      [image('a', 'one'), image('b', 'one'), image('c', 'two')],
      { itemSize: 56, gap: 6, edgePadding: 4, boundaryWidth: 2, boundaryMargin: 4 },
    );
    expect(layout.itemOffsets).toEqual([4, 66, 138]);
    expect(layout.boundaryOffsets).toEqual([null, null, 132]);
    expect(layout.totalWidth).toBe(198);
  });

  it('keeps measured webtoon heights and removes the final gap', () => {
    const metrics = buildWebtoonMetrics({
      imageCount: 3,
      estimatedHeight: 200,
      imageGap: 12,
      measuredHeights: new Map([[1, 240]]),
      minItemHeight: 180,
    });
    expect(metrics.offsets).toEqual([0, 212, 464]);
    expect(metrics.heights).toEqual([200, 240, 200]);
    expect(metrics.totalHeight).toBe(664);
  });

  it('builds thumbnail offsets with group separators', () => {
    const layout = buildWebtoonThumbnailLayout({
      images: [image('0', 'one'), image('0', 'two')],
      railWidth: 128,
      aspectRatios: new Map(),
      defaultAspectRatio: 0.8,
      edgePadding: 8,
      gap: 4,
      boundaryWidth: 2,
      boundaryMargin: 4,
      widthInset: 16,
      minHeight: 44,
    });
    expect(layout.offsets).toEqual([8, 162]);
    expect(layout.heights).toEqual([140, 140]);
    expect(layout.boundaryOffsets).toEqual([null, 156]);
    expect(layout.totalHeight).toBe(310);
  });

  it('returns a bounded virtual range for empty and populated tracks', () => {
    expect(getVirtualRange({ offsets: [], itemCount: 0, viewportStart: 0, viewportEnd: 100, overscan: 20 })).toEqual({ start: 0, end: 0 });
    expect(getVirtualRange({ offsets: [0, 100, 200, 300], itemCount: 4, viewportStart: 110, viewportEnd: 210, overscan: 0 })).toEqual({ start: 1, end: 3 });
  });
});
