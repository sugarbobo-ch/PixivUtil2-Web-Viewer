import React, { useEffect, useRef, useState } from 'react';
import { SourceLink, WorkGroup } from '../types';
import { buildThumbnailUrl } from '../utils/webConfig';
import { fetchFirstSourceLink } from '../utils/sourceLinks';
import { MediaIssuePlaceholder } from './MediaIssuePlaceholder';
import { X, Play, Images, Film, ExternalLink } from 'lucide-react';

interface MangaGroupModalProps {
  workGroup: WorkGroup | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectImage: (pageIndex: number) => void;
  thumbnailSize: number;
  blurEnabled?: boolean;
}

export const MangaGroupModal: React.FC<MangaGroupModalProps> = ({
  workGroup,
  isOpen,
  onClose,
  onSelectImage,
  thumbnailSize,
  blurEnabled = false,
}) => {
  const [sourceLink, setSourceLink] = useState<SourceLink | null>(null);
  const [isSourceLoading, setIsSourceLoading] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocusedElement.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus({ preventScroll: true });

    return () => {
      previouslyFocusedElement.current?.focus({ preventScroll: true });
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    let cancelled = false;
    setSourceLink(null);
    setIsSourceLoading(false);

    const paths = workGroup?.items.map(item => item.save_name).filter(Boolean) ?? [];
    if (!isOpen || paths.length === 0) return undefined;

    setIsSourceLoading(true);
    fetchFirstSourceLink(paths).then(link => {
      if (cancelled) return;
      setSourceLink(link);
      setIsSourceLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, workGroup?.group_id]);

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  if (!isOpen || !workGroup) return null;

  return (
    <div
      role="presentation"
      onClick={handleBackdropClick}
      className="manga-group-modal fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn select-none"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="manga-group-modal-title"
        className="manga-group-modal__panel bg-zinc-900 border border-zinc-800 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Header Bar */}
        <div className="manga-group-modal__header flex items-center justify-between py-4 border-b border-zinc-800 bg-zinc-900/90">
          <div className="flex items-center gap-3 min-w-0 pr-4">
            <div className="manga-group-modal__title-icon p-2 rounded-xl shrink-0">
              <Images className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="manga-group-modal__heading min-w-0">
              <div className="manga-group-modal__title-row flex items-center gap-2">
                <h3 id="manga-group-modal-title" className="manga-group-modal__title font-bold text-base text-zinc-100 truncate">
                  {workGroup.title || '無題作品'}
                </h3>
                <span className="manga-group-modal__count viewer-group-badge text-xs px-2 py-0.5 rounded-full font-semibold shrink-0">
                  {workGroup.items.length} 頁圖包
                </span>
              </div>
              <p className="manga-group-modal__meta text-xs text-zinc-400 truncate mt-0.5">
                繪師: <span className="text-zinc-300">{workGroup.artist_name || workGroup.member_id}</span>
                {workGroup.created_date && <span className="ml-3 text-zinc-500">‧ {workGroup.created_date}</span>}
              </p>
              <div className="manga-group-source" aria-live="polite">
                {isSourceLoading ? (
                  <span className="manga-group-source__pending">正在確認來源…</span>
                ) : sourceLink ? (
                  <a
                    href={sourceLink.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="manga-group-source__link"
                  >
                    {sourceLink.platform === 'fanbox' ? '在 FANBOX 查看此圖包' : '在 Pixiv 查看此作品'}
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                ) : null}
              </div>
            </div>
          </div>

          <div className="manga-group-modal__actions">
            <button
              type="button"
              onClick={() => onSelectImage(0)}
              className="manga-group-modal__play-button"
              aria-label="從第 1 頁開始播放圖包"
              title="從第 1 頁開始播放圖包"
            >
              <span className="manga-group-modal__play-icon" aria-hidden="true">
                <Play className="h-5 w-5 fill-current" />
              </span>
              <span className="manga-group-modal__play-label">播放圖包</span>
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="manga-group-modal__close-button"
              aria-label="關閉圖包預覽"
              title="關閉圖包預覽 (Esc)"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Thumbnail Grid Area */}
        <div className="manga-group-modal__content p-5 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-zinc-700">
          <div className="manga-group-modal__grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
            {workGroup.items.map((item, idx) => {
              const isVideo = item.save_name.toLowerCase().endsWith('.mp4');
              return (
                <button
                  type="button"
                  key={item.image_id}
                  onClick={() => onSelectImage(idx)}
                  aria-label={`開啟第 ${idx + 1} 頁`}
                  className="manga-group-card group relative block aspect-square w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 p-0 text-left transition-[border-color,box-shadow,transform] duration-200"
                >
                  {item.media_status ? (
                    <MediaIssuePlaceholder message={item.media_error} compact />
                  ) : (
                    <img
                      src={buildThumbnailUrl(item, thumbnailSize)}
                      alt={item.title || `P${idx + 1}`}
                      loading="lazy"
                      className={`w-full h-full object-cover ${blurEnabled ? 'blur-media blur-media--thumbnail' : 'transition-transform duration-300 group-hover:scale-105'}`}
                    />
                  )}

                  {/* Page Badge */}
                  <div className="manga-group-card__page-badge viewer-group-badge absolute top-2 left-2 px-2 py-0.5 rounded-md text-[11px] font-bold">
                    P{idx + 1}
                  </div>

                  {/* Video Badge */}
                  {isVideo && (
                    <div className="manga-group-card__video-badge absolute top-2 right-2 p-1 rounded-full bg-black/70 backdrop-blur-md text-white">
                      <Film className="w-3 h-3" aria-hidden="true" />
                    </div>
                  )}

                  {/* Hover Overlay */}
                  <div className="manga-group-card__hover-overlay pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-black/80 text-white backdrop-blur-md">
                      點擊看大圖
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
