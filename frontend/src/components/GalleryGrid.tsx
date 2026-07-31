import React from 'react';
import { ImageItem } from '../types';
import { Check, Film } from 'lucide-react';

interface GalleryGridProps {
  images: ImageItem[];
  isEditMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (imageId: number) => void;
  onOpenFullscreen: (index: number) => void;
}

export const GalleryGrid: React.FC<GalleryGridProps> = ({
  images,
  isEditMode,
  selectedIds,
  onToggleSelect,
  onOpenFullscreen,
}) => {
  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-zinc-500">
        <p className="text-base font-medium">沒有找到相符的作品</p>
        <p className="text-xs mt-1">請嘗試變更篩選條件或搜尋關鍵字</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 p-4">
      {images.map((item, index) => {
        const isSelected = selectedIds.has(item.image_id);
        const isVideo = item.save_name.toLowerCase().endsWith('.mp4');

        return (
          <div
            key={item.image_id}
            onClick={() => {
              if (isEditMode) {
                onToggleSelect(item.image_id);
              } else {
                onOpenFullscreen(index);
              }
            }}
            className={`group relative aspect-square rounded-xl overflow-hidden bg-zinc-900 border transition-all duration-200 cursor-pointer select-none ${
              isSelected
                ? 'border-indigo-500 ring-2 ring-indigo-500 ring-offset-2 ring-offset-zinc-950 scale-[0.98]'
                : 'border-zinc-800 hover:border-zinc-700 hover:shadow-lg hover:shadow-indigo-500/10'
            }`}
          >
            {/* Thumbnail Image */}
            <img
              src={`/api/thumbnail?path=${encodeURIComponent(item.save_name)}`}
              alt={item.title}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />

            {/* Video Badge */}
            {isVideo && (
              <div className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 backdrop-blur-md text-white">
                <Film className="w-3.5 h-3.5" />
              </div>
            )}

            {/* Selection Checkbox (Edit Mode) */}
            {isEditMode && (
              <div className="absolute top-2 left-2 z-10">
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-black/40 border border-white/40 text-transparent hover:border-white'
                  }`}
                >
                  <Check className="w-4 h-4" />
                </div>
              </div>
            )}

            {/* Gradient Overlay & Metadata Title */}
            <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              <p className="text-xs font-medium text-white truncate">{item.title || '無題'}</p>
              <p className="text-[10px] text-zinc-400 truncate">{item.artist_name || `繪師 ID: ${item.member_id}`}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
