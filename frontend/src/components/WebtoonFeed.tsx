import React from 'react';
import { ImageItem } from '../types';

interface WebtoonFeedProps {
  images: ImageItem[];
}

export const WebtoonFeed: React.FC<WebtoonFeedProps> = ({ images }) => {
  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-zinc-500">
        <p className="text-base font-medium">沒有可連貫觀看的作品</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-8 select-none">
      {images.map((item, index) => {
        const isVideo = item.save_name.toLowerCase().endsWith('.mp4');
        const mediaUrl = `/api/file?path=${encodeURIComponent(item.save_name)}`;

        return (
          <div key={item.image_id} className="flex flex-col items-center bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="w-full p-4 border-b border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
              <span className="font-semibold text-zinc-200">#{index + 1} - {item.title || '無題'}</span>
              <span>{item.artist_name || `繪師 ID: ${item.member_id}`}</span>
            </div>

            <div className="w-full flex items-center justify-center bg-black/40 p-2">
              {isVideo ? (
                <video
                  src={mediaUrl}
                  controls
                  loop
                  className="max-h-[85vh] w-auto object-contain rounded-lg"
                />
              ) : (
                <img
                  src={mediaUrl}
                  alt={item.title}
                  loading="lazy"
                  className="max-h-[90vh] w-auto object-contain rounded-lg"
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
