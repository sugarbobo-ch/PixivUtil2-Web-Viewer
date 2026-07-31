import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ImageItem } from '../types';
import { ChevronLeft, ChevronRight, X, Play, Pause, Download, Trash2, Info } from 'lucide-react';

interface FullscreenViewerProps {
  images: ImageItem[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (newIndex: number) => void;
  onDeleteCurrent?: (imageId: number) => void;
}

export const FullscreenViewer: React.FC<FullscreenViewerProps> = ({
  images,
  currentIndex,
  onClose,
  onNavigate,
  onDeleteCurrent,
}) => {
  const currentItem = images[currentIndex];
  const [isPlaying, setIsPlaying] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastWheelTime = useRef<number>(0);

  // 0ms Buffer: Preload Next & Prev images into memory
  useEffect(() => {
    if (!images.length) return;
    const preloadIndexes = [currentIndex + 1, currentIndex - 1];
    preloadIndexes.forEach(idx => {
      if (idx >= 0 && idx < images.length) {
        const item = images[idx];
        if (!item.save_name.toLowerCase().endsWith('.mp4')) {
          const img = new Image();
          img.src = `/api/file?path=${encodeURIComponent(item.save_name)}`;
        }
      }
    });
  }, [currentIndex, images]);

  const handleNext = useCallback(() => {
    if (currentIndex < images.length - 1) {
      onNavigate(currentIndex + 1);
    }
  }, [currentIndex, images.length, onNavigate]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      onNavigate(currentIndex - 1);
    }
  }, [currentIndex, onNavigate]);

  // Wheel Up / Wheel Down Page Flip Handler with 250ms debounce
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheelTime.current < 250) return;
      lastWheelTime.current = now;

      if (e.deltaY > 0) {
        handleNext();
      } else if (e.deltaY < 0) {
        handlePrev();
      }
    },
    [handleNext, handlePrev]
  );

  useEffect(() => {
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Keyboard Shortcuts (Arrow Left/Right, J/K, Space, Esc, Delete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === 'k' || e.key === 'K') {
        handleNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
        handlePrev();
      } else if (e.key === ' ') {
        e.preventDefault();
        if (videoRef.current) {
          if (isPlaying) videoRef.current.pause();
          else videoRef.current.play();
          setIsPlaying(!isPlaying);
        }
      } else if (e.key === 'Delete' && onDeleteCurrent && currentItem) {
        onDeleteCurrent(currentItem.image_id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, handleNext, handlePrev, isPlaying, onDeleteCurrent, currentItem]);

  if (!currentItem) return null;

  const isVideo = currentItem.save_name.toLowerCase().endsWith('.mp4');
  const mediaUrl = `/api/file?path=${encodeURIComponent(currentItem.save_name || '')}&image_id=${currentItem.image_id}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between select-none animate-fadeIn">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/80 to-transparent z-10">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/10 text-white">
            {currentIndex + 1} / {images.length}
          </span>
          <h3 className="text-sm font-medium text-white truncate max-w-md">
            {currentItem.title || '無題'}
          </h3>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="詳細資訊"
          >
            <Info className="w-5 h-5" />
          </button>
          {onDeleteCurrent && (
            <button
              onClick={() => onDeleteCurrent(currentItem.image_id)}
              className="p-2 rounded-full bg-red-600/80 hover:bg-red-600 text-white transition-colors"
              title="刪除此作品 (Delete)"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="關閉 (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Display Area */}
      <div className="relative flex-1 flex items-center justify-center p-4 overflow-hidden">
        {/* Navigation Buttons */}
        {currentIndex > 0 && (
          <button
            onClick={handlePrev}
            className="absolute left-6 z-20 p-3 rounded-full bg-black/50 hover:bg-white/20 text-white transition-all backdrop-blur-md"
            title="上一張 (←)"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
        )}

        {currentIndex < images.length - 1 && (
          <button
            onClick={handleNext}
            className="absolute right-6 z-20 p-3 rounded-full bg-black/50 hover:bg-white/20 text-white transition-all backdrop-blur-md"
            title="下一張 (→)"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        )}

        {/* Media Rendering */}
        {isVideo ? (
          <div className="relative max-h-full max-w-full flex items-center justify-center">
            <video
              ref={videoRef}
              src={mediaUrl}
              autoPlay
              loop
              controls
              className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
            />
          </div>
        ) : (
          <img
            src={mediaUrl}
            alt={currentItem.title}
            className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl transition-opacity duration-200"
          />
        )}

        {/* Details Panel Overlay */}
        {showDetails && (
          <div className="absolute right-6 top-6 bottom-6 w-80 bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-xl p-5 text-zinc-200 z-30 shadow-2xl flex flex-col justify-between">
            <div>
              <h4 className="font-bold text-base text-white mb-2">{currentItem.title || '無題'}</h4>
              <div className="space-y-2 text-xs text-zinc-400">
                <p><span className="text-zinc-500">作品 ID:</span> {currentItem.image_id}</p>
                <p><span className="text-zinc-500">繪師:</span> {currentItem.artist_name || currentItem.member_id}</p>
                <p><span className="text-zinc-500">繪師 ID:</span> {currentItem.member_id}</p>
                <p><span className="text-zinc-500">發布時間:</span> {currentItem.created_date || '未知'}</p>
                <p className="break-all"><span className="text-zinc-500">儲存路徑:</span> {currentItem.save_name}</p>
              </div>
            </div>
            <button
              onClick={() => window.open(mediaUrl, '_blank')}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" /> 下載 / 開啟原檔
            </button>
          </div>
        )}
      </div>

      {/* Bottom Hint Footer */}
      <div className="px-6 py-3 text-center text-xs text-zinc-500 bg-gradient-to-t from-black/80 to-transparent">
        <span>滾輪上下 / 鍵盤左右鍵切換 ‧ 空白鍵暫停影片 ‧ Esc 退出 ‧ E 切換編輯</span>
      </div>
    </div>
  );
};
