import { describe, expect, it } from 'vitest';
import { ImageItem } from '../types';
import {
  buildReaderSpread,
  getNextReaderSpreadAnchor,
  getPhysicalSpreadIndexes,
  getPreviousReaderSpreadAnchor,
  getReaderSpreadProgression,
} from './readerSpread';

const makeImages = (count: number, group = 'work') => Array.from({ length: count }, (_, index): ImageItem => ({
  image_id: index + 1,
  member_id: 1,
  title: `${group} ${index + 1}`,
  save_name: `${group}_p${index + 1}.jpg`,
  created_date: '2026-08-12',
  last_update_date: '2026-08-12',
}));

const spreadOptions = {
  pageLayout: 'spread' as const,
  readingDirection: 'ltr' as const,
  spreadPairing: 'cover-single' as const,
};

describe('reader spread model', () => {
  it('keeps cover single and pairs subsequent pages', () => {
    const images = makeImages(5);
    expect(getReaderSpreadProgression(images, spreadOptions)).toEqual([0, 1, 3]);
    expect(buildReaderSpread(images, 0, spreadOptions)).toMatchObject({
      anchorIndex: 0,
      progressionIndexes: [0],
      isSinglePageFallback: true,
    });
    expect(buildReaderSpread(images, 2, spreadOptions)).toMatchObject({
      anchorIndex: 1,
      progressionIndexes: [1, 2],
      leadingIndex: 1,
      trailingIndex: 2,
    });
    expect(buildReaderSpread(images, 4, spreadOptions).progressionIndexes).toEqual([3, 4]);
  });

  it('does not pair across work boundaries or skip missing slots', () => {
    const first = makeImages(2, 'first');
    const second = makeImages(2, 'second').map((item, index) => ({
      ...item,
      image_id: index + 10,
      save_name: `second_p${index + 1}.jpg`,
    }));
    const images = [...first, ...second];

    expect(getReaderSpreadProgression(images, spreadOptions)).toEqual([0, 1, 2, 3]);
    expect(buildReaderSpread(images, 1, spreadOptions).progressionIndexes).toEqual([1]);
    expect(buildReaderSpread(images, 2, spreadOptions).progressionIndexes).toEqual([2]);
  });

  it('pairs adjacent video pages and preserves rtl physical order', () => {
    const images = makeImages(3).map(item => ({
      ...item,
      save_name: item.save_name.replace('.jpg', '.mp4'),
    }));
    expect(getReaderSpreadProgression(images, spreadOptions)).toEqual([0, 1]);
    expect(buildReaderSpread(images, 2, spreadOptions)).toMatchObject({
      progressionIndexes: [1, 2],
      isSinglePageFallback: false,
    });

    const rtl = buildReaderSpread(makeImages(4), 2, {
      pageLayout: 'spread',
      readingDirection: 'rtl',
      spreadPairing: 'cover-single',
    });
    expect(rtl.progressionIndexes).toEqual([1, 2]);
    expect(getPhysicalSpreadIndexes(rtl, 'rtl')).toEqual([2, 1]);
  });

  it('moves by spread anchors rather than raw item indexes', () => {
    const images = makeImages(5);
    expect(getNextReaderSpreadAnchor(images, 2, spreadOptions)).toBe(3);
    expect(getPreviousReaderSpreadAnchor(images, 4, spreadOptions)).toBe(1);
    expect(getNextReaderSpreadAnchor(images, 4, spreadOptions)).toBeNull();
    expect(getPreviousReaderSpreadAnchor(images, 0, spreadOptions)).toBeNull();
  });

  it('can pair from the first page and leaves an odd final page at the end boundary', () => {
    const firstPageOptions = { ...spreadOptions, spreadPairing: 'first-page' as const };
    const oddImages = makeImages(5);
    const evenImages = makeImages(6);

    expect(getReaderSpreadProgression(oddImages, firstPageOptions)).toEqual([0, 2, 4]);
    expect(buildReaderSpread(oddImages, 0, firstPageOptions).progressionIndexes).toEqual([0, 1]);
    expect(buildReaderSpread(oddImages, 3, firstPageOptions).progressionIndexes).toEqual([2, 3]);
    expect(buildReaderSpread(oddImages, 4, firstPageOptions)).toMatchObject({
      anchorIndex: 4,
      progressionIndexes: [4],
      isSinglePageFallback: true,
    });
    expect(getReaderSpreadProgression(evenImages, firstPageOptions)).toEqual([0, 2, 4]);
    expect(buildReaderSpread(evenImages, 5, firstPageOptions).progressionIndexes).toEqual([4, 5]);
  });

  it('resets first-page pairing at each work boundary', () => {
    const first = makeImages(3, 'first');
    const second = makeImages(2, 'second').map((item, index) => ({
      ...item,
      image_id: index + 10,
      save_name: `second_p${index + 1}.jpg`,
    }));
    const images = [...first, ...second];
    const firstPageOptions = { ...spreadOptions, spreadPairing: 'first-page' as const };

    expect(getReaderSpreadProgression(images, firstPageOptions)).toEqual([0, 2, 3]);
    expect(buildReaderSpread(images, 2, firstPageOptions).progressionIndexes).toEqual([2]);
    expect(buildReaderSpread(images, 3, firstPageOptions).progressionIndexes).toEqual([3, 4]);
  });

  it('keeps spread pairing parity across a bounded range boundary', () => {
    const images = makeImages(4).map((item, index) => ({
      ...item,
      group_page_index: index + 2,
      group_page_total: 5,
    }));
    const globalOptions = { ...spreadOptions, globalOffset: 10, globalTotal: 20 };

    expect(buildReaderSpread(images, 0, globalOptions).progressionIndexes).toEqual([0, 1]);
    expect(buildReaderSpread(images, 1, globalOptions).progressionIndexes).toEqual([0, 1]);
    expect(getReaderSpreadProgression(images, globalOptions)).toEqual([0, 2]);
    expect(getNextReaderSpreadAnchor(images, 1, globalOptions)).toBe(2);
    expect(getPreviousReaderSpreadAnchor(images, 2, globalOptions)).toBe(0);
  });
});
