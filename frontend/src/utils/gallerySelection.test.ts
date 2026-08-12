import { describe, expect, it } from 'vitest';
import {
  getImageSelectionKey,
  getWorkSelectionKey,
  replaceSelectionForRange,
} from './gallerySelection';
import type { GallerySelectionCard } from './gallerySelection';

const cards = (first: number, last: number): GallerySelectionCard[] => (
  Array.from({ length: last - first + 1 }, (_, offset) => {
    const index = first + offset;
    return {
      key: `image:${index}:image-${index}.jpg`,
      ids: [index],
      startIndex: index,
      endIndex: index,
    };
  })
);

describe('gallery selection ranges', () => {
  it('shares stable keys between image and work cards', () => {
    const item = { image_id: 4, save_name: 'image-4.jpg' };
    expect(getImageSelectionKey(item)).toBe('image:4:image-4.jpg');
    expect(getWorkSelectionKey('2026-08', 'pixiv_4', item)).toBe('work:2026-08:pixiv_4:image-4.jpg');
  });

  it('selects and reverses an inclusive range from the pointer anchor', () => {
    const pageCards = cards(4, 28);
    const selected = replaceSelectionForRange(new Set(), pageCards, 4, 28, true);
    expect(Array.from(selected)).toEqual(Array.from({ length: 25 }, (_, index) => index + 4));

    const reverseSelected = replaceSelectionForRange(new Set(), pageCards, 28, 4, true);
    expect(Array.from(reverseSelected)).toEqual(Array.from({ length: 25 }, (_, index) => index + 4));

    const inverted = replaceSelectionForRange(selected, pageCards, 8, 12, false);
    expect(Array.from(inverted)).toEqual([
      4, 5, 6, 7,
      13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
    ]);
  });

  it('keeps a range continuous across page models', () => {
    const selected = replaceSelectionForRange(
      new Set(),
      [...cards(0, 5), ...cards(6, 11)],
      3,
      8,
      true,
    );
    expect(Array.from(selected)).toEqual([3, 4, 5, 6, 7, 8]);
  });
});
