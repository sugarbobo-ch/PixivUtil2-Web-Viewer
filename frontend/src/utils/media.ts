import { ImageItem } from '../types';

export const buildMediaUrl = (
  item: Pick<ImageItem, 'save_name' | 'image_id'>,
): string => (
  `/api/file?path=${encodeURIComponent(item.save_name || '')}&image_id=${item.image_id}`
);

/** Preserve the viewer's current video support boundary in one place. */
export const isVideoItem = (item: Pick<ImageItem, 'save_name'>): boolean => (
  item.save_name.toLowerCase().endsWith('.mp4')
);
