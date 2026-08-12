import type { SortMode } from '../types';
import type { MonthJumpItem } from '../components/MonthQuickNav';
import { getTargetPageAndLocalIndex } from './galleryLayout';

export const sortMonthIndexItems = (
  items: readonly MonthJumpItem[],
  sortMode: SortMode,
): MonthJumpItem[] => {
  const shouldSortAscending = sortMode === 'oldest' || sortMode === 'oldest_month';
  return [...items].sort((a, b) => (
    shouldSortAscending ? a.key.localeCompare(b.key) : b.key.localeCompare(a.key)
  ));
};

export const resolveMonthTarget = (
  item: MonthJumpItem,
  monthIndexItems: readonly MonthJumpItem[],
  itemsPerPage: number,
) => {
  const fallbackIndex = monthIndexItems.findIndex(month => month.key === item.key);
  const fallbackOffset = fallbackIndex >= 0
    ? monthIndexItems.slice(0, fallbackIndex).reduce((total, month) => total + month.count, 0)
    : 0;
  const targetOffset = Number.isFinite(item.offset) && (item.offset ?? 0) >= 0
    ? item.offset ?? 0
    : fallbackOffset;

  return {
    offset: targetOffset,
    ...getTargetPageAndLocalIndex(targetOffset, itemsPerPage),
  };
};
