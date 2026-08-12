import { ImageItem } from '../types';

export interface GallerySelectionCard {
  key: string;
  ids: number[];
  startIndex: number;
  endIndex: number;
}

export const getImageSelectionKey = (item: Pick<ImageItem, 'image_id' | 'save_name'>) => (
  `image:${item.image_id}:${item.save_name}`
);

export const getWorkSelectionKey = (
  monthKey: string,
  groupId: string,
  cover: Pick<ImageItem, 'save_name'>,
) => `work:${monthKey}:${groupId}:${cover.save_name}`;

export const collectSelectionRangeIds = (
  cards: readonly GallerySelectionCard[],
  rangeStart: number,
  rangeEnd: number,
) => {
  const normalizedStart = Math.min(rangeStart, rangeEnd);
  const normalizedEnd = Math.max(rangeStart, rangeEnd);
  const rangeIds = new Set<number>();
  cards.forEach(card => {
    if (card.endIndex < normalizedStart || card.startIndex > normalizedEnd) return;
    card.ids.forEach(imageId => rangeIds.add(imageId));
  });
  return rangeIds;
};

export const replaceSelectionForRange = (
  initialSelectedIds: ReadonlySet<number>,
  cards: readonly GallerySelectionCard[],
  rangeStart: number,
  rangeEnd: number,
  select: boolean,
) => {
  const nextSelectedIds = new Set(initialSelectedIds);
  const rangeIds = collectSelectionRangeIds(cards, rangeStart, rangeEnd);
  rangeIds.forEach(imageId => {
    if (select) nextSelectedIds.add(imageId);
    else nextSelectedIds.delete(imageId);
  });
  return nextSelectedIds;
};
