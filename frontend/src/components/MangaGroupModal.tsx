import React, { useEffect, useRef, useState } from 'react';
import { SourceLink, WorkGroup } from '../types';
import { buildThumbnailUrl } from '../utils/webConfig';
import { fetchFirstSourceLink } from '../utils/sourceLinks';
import { MediaIssuePlaceholder } from './MediaIssuePlaceholder';
import { Badge, Button, IconButton } from './ui';
import { DemoMediaBlock } from './DemoMediaBlock';
import { useModalFocusTrap } from '../utils/useModalFocusTrap';
import { X, Play, Images, Film, ExternalLink } from 'lucide-react';

interface MangaGroupModalProps {
  workGroup: WorkGroup | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectImage: (pageIndex: number) => void;
  thumbnailSize: number;
  blurEnabled?: boolean;
  demoMode?: boolean;
}

export const MangaGroupModal: React.FC<MangaGroupModalProps> = ({
  workGroup,
  isOpen,
  onClose,
  onSelectImage,
  thumbnailSize,
  blurEnabled = false,
  demoMode = false,
}) => {
  const [sourceLink, setSourceLink] = useState<SourceLink | null>(null);
  const [isSourceLoading, setIsSourceLoading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useModalFocusTrap({
    isOpen,
    dialogRef,
    initialFocusRef: closeButtonRef,
  });

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
      className="manga-group-modal fixed inset-0 z-50 flex items-center justify-center"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manga-group-modal-title"
        className="manga-group-modal__panel flex min-h-0 w-full flex-col overflow-hidden"
      >
        {/* Header Bar */}
        <div className="manga-group-modal__header flex items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-3 pe-4">
            <div className="manga-group-modal__title-icon shrink-0">
              <Images className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="manga-group-modal__heading min-w-0">
              <div className="manga-group-modal__title-row flex items-center gap-2">
                <h3
                  id="manga-group-modal-title"
                  className="manga-group-modal__title font-bold text-base truncate"
                  title={workGroup.title || '無題作品'}
                >
                  {workGroup.title || '無題作品'}
                </h3>
                <Badge variant="surface" size="sm" className="manga-group-modal__count shrink-0">
                  {workGroup.items.length} 頁圖包
                </Badge>
              </div>
              <p className="manga-group-modal__meta mt-0.5">
                繪師: <span className="manga-group-modal__meta-primary">{workGroup.artist_name || workGroup.member_id}</span>
                {workGroup.created_date && <span className="manga-group-modal__meta-secondary ms-3">‧ {workGroup.created_date}</span>}
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
            <Button
              type="button"
              onClick={() => onSelectImage(0)}
              variant="primary"
              className="manga-group-modal__play-button"
              aria-label="從第 1 頁開始播放圖包"
              title="從第 1 頁開始播放圖包"
            >
              <span className="manga-group-modal__play-icon" aria-hidden="true">
                <Play className="h-5 w-5 fill-current" />
              </span>
              <span className="manga-group-modal__play-label">播放圖包</span>
            </Button>
            <IconButton
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              variant="ghost"
              className="manga-group-modal__close-button"
              aria-label="關閉圖包預覽"
              title="關閉圖包預覽 (Esc)"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </IconButton>
          </div>
        </div>

        {/* Thumbnail Grid Area */}
        <div className="manga-group-modal__content flex-1 overflow-y-auto">
          <div className="manga-group-modal__grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
            {workGroup.items.map((item, idx) => {
              const isVideo = item.save_name.toLowerCase().endsWith('.mp4');
              return (
                <button
                  type="button"
                  key={item.image_id}
                  onClick={() => onSelectImage(idx)}
                  aria-label={`開啟第 ${idx + 1} 頁`}
                  className="manga-group-card group relative block aspect-square w-full overflow-hidden rounded-lg p-0 text-left"
                >
                  {item.media_status ? (
                    <MediaIssuePlaceholder message={item.media_error} compact />
                  ) : (
                    demoMode ? (
                      <DemoMediaBlock dominantColor={item.dominant_color} />
                    ) : (
                      <img
                        src={buildThumbnailUrl(item, thumbnailSize)}
                        alt={item.title || `P${idx + 1}`}
                        loading="lazy"
                        className={`w-full h-full object-cover ${blurEnabled ? 'blur-media blur-media--thumbnail' : 'transition-transform duration-300 group-hover:scale-105'}`}
                      />
                    )
                  )}

                  {/* Page Badge */}
                  <Badge variant="hud" size="xs" className="manga-group-card__page-badge">
                    P{idx + 1}
                  </Badge>

                  {/* Video Badge */}
                  {isVideo && (
                    <Badge variant="hud" size="sm" iconOnly className="manga-group-card__video-badge">
                      <Film className="w-3 h-3" aria-hidden="true" />
                    </Badge>
                  )}

                  {/* Hover Overlay */}
                  <div className="manga-group-card__hover-overlay pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="manga-group-card__hover-label text-xs font-semibold">
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
